"""Adaptateur « façon Motor » au-dessus de Postgres (Supabase) — migration
MongoDB -> Supabase du 2026-11-05 (voir scripts/migrate_to_supabase.py).

But : que le reste du backend ne change pas. `db.leads.find(...)`,
`update_one`, `aggregate`... gardent la même forme et le même résultat ;
seule core/database.py choisit la base (DB_BACKEND=mongo|supabase).

Stockage : une table par collection, `<schema>."<collection>"` avec
  _id  text primary key  (ObjectId en texte, comme recopié par le script)
  doc  jsonb             (le document sans _id)
  seq  bigserial         (ordre d'insertion = « ordre naturel » de MongoDB)

Fonctionnement d'une lecture :
  1. le filtre est traduit en SQL quand c'est possible (égalité, $in, $ne,
     $exists, comparaisons, $or/$and...) pour ne lire que les bonnes lignes ;
  2. le filtre complet est revérifié en Python avec la sémantique MongoDB
     (champ tableau qui « contient » la valeur, chemins pointés, $regex...).
Quand la traduction SQL est exacte, le tri, le skip et la limite sont faits
par Postgres ; sinon tout est fait en Python sur les lignes présélectionnées.

Écriture : la ligne est verrouillée (SELECT ... FOR UPDATE), le filtre
revérifié sur la version à jour, la mise à jour appliquée en Python
($set, $inc, $push...), puis réécrite. Un update_one filtré sur l'état lu
juste avant (ex. services/formateur_placement._write_team) garde donc son
rôle de garde-fou contre deux écritures simultanées.

Limites connues (non utilisées par le code au 2026-11-05) : $where, $expr,
$text, opérateurs positionnels ($, $[]), array_filters, sessions/transactions
multi-documents, change streams. Un opérateur inconnu lève
NotImplementedError plutôt que de répondre faux sans prévenir.
"""
from __future__ import annotations

import asyncio
import base64
import copy
import json
import logging
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable, Optional

import asyncpg
from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)

_MISSING = object()

# ---------------------------------------------------------------------------
# Encodage JSON (types Python sans équivalent JSON)
# ---------------------------------------------------------------------------


def encode(value):
    if isinstance(value, dict):
        return {str(k): encode(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [encode(v) for v in value]
    if isinstance(value, datetime):
        return {"$date": value.isoformat()}
    if isinstance(value, date):
        return {"$date": value.isoformat()}
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, bytes):
        return {"$binary": base64.b64encode(value).decode()}
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, str):
        return value.replace("\x00", "")  # Postgres refuse \u0000 dans un jsonb
    return value


def decode(value):
    if isinstance(value, dict):
        if len(value) == 1:
            if "$date" in value and isinstance(value["$date"], str):
                try:
                    return datetime.fromisoformat(value["$date"])
                except ValueError:
                    return value
            if "$binary" in value and isinstance(value["$binary"], str):
                return base64.b64decode(value["$binary"])
        return {k: decode(v) for k, v in value.items()}
    if isinstance(value, list):
        return [decode(v) for v in value]
    return value


def _norm(value):
    """Valeur d'un filtre ou d'une mise à jour ramenée aux types stockés
    (ObjectId -> str), sans toucher aux datetime (comparées en Python)."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {k: _norm(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_norm(v) for v in value]
    return value


# ---------------------------------------------------------------------------
# Sémantique MongoDB en Python
# ---------------------------------------------------------------------------


def _resolve(obj, parts: list) -> Iterable:
    """Valeurs atteintes par un chemin pointé, en traversant les tableaux
    comme MongoDB (a.b sur [{b: 1}, {b: 2}] -> 1, 2)."""
    if not parts:
        yield obj
        return
    head, rest = parts[0], parts[1:]
    if isinstance(obj, dict):
        if head in obj:
            yield from _resolve(obj[head], rest)
    elif isinstance(obj, list):
        if head.isdigit() and int(head) < len(obj):
            yield from _resolve(obj[int(head)], rest)
        for el in obj:
            if isinstance(el, dict):
                yield from _resolve(el, parts)


def _values(doc, path: str) -> list:
    return list(_resolve(doc, path.split(".")))


def _candidates(values: list) -> list:
    out = []
    for v in values:
        out.append(v)
        if isinstance(v, list):
            out.extend(v)
    return out


def _is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _eq(a, b) -> bool:
    if isinstance(a, ObjectId):
        a = str(a)
    if isinstance(b, ObjectId):
        b = str(b)
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if _is_num(a) and _is_num(b):
        return a == b
    if type(a) is not type(b) and not (isinstance(a, str) and isinstance(b, str)):
        return False
    return a == b


def _bracket(v):
    if v is None:
        return 0
    if _is_num(v):
        return 1
    if isinstance(v, str):
        return 2
    if isinstance(v, dict):
        return 3
    if isinstance(v, list):
        return 4
    if isinstance(v, bytes):
        return 5
    if isinstance(v, bool):
        return 8
    if isinstance(v, datetime):
        return 9
    return 10


def _cmp(a, b) -> Optional[int]:
    """Comparaison MongoDB entre deux valeurs du même type, None sinon."""
    if _bracket(a) != _bracket(b):
        return None
    try:
        return (a > b) - (a < b)
    except TypeError:
        return None


def _regex(pattern, options: str = ""):
    if isinstance(pattern, re.Pattern):
        return pattern
    flags = 0
    for o in options or "":
        flags |= {"i": re.I, "m": re.M, "s": re.S, "x": re.X}.get(o, 0)
    return re.compile(pattern, flags)


def _equals_cond(values: list, cond) -> bool:
    if isinstance(cond, re.Pattern):
        return any(isinstance(c, str) and cond.search(c) for c in _candidates(values))
    if cond is None:
        return not values or any(c is None for c in _candidates(values))
    return any(_eq(c, cond) for c in _candidates(values))


def _is_op_dict(cond) -> bool:
    return isinstance(cond, dict) and bool(cond) and all(isinstance(k, str) and k.startswith("$") for k in cond)


def _match_ops(values: list, ops: dict) -> bool:
    for op, arg in ops.items():
        if op == "$eq":
            ok = _equals_cond(values, arg)
        elif op == "$ne":
            ok = not _equals_cond(values, arg)
        elif op in ("$gt", "$gte", "$lt", "$lte"):
            ok = False
            for c in _candidates(values) if values else [None] if arg is None else []:
                r = _cmp(c, arg)
                if r is None:
                    continue
                if (op == "$gt" and r > 0) or (op == "$gte" and r >= 0) or (op == "$lt" and r < 0) or (op == "$lte" and r <= 0):
                    ok = True
                    break
        elif op == "$in":
            ok = any(_equals_cond(values, a) for a in arg)
        elif op == "$nin":
            ok = not any(_equals_cond(values, a) for a in arg)
        elif op == "$exists":
            ok = bool(values) == bool(arg)
        elif op == "$regex":
            rx = _regex(arg, ops.get("$options", ""))
            ok = any(isinstance(c, str) and rx.search(c) for c in _candidates(values))
        elif op == "$options":
            continue
        elif op == "$not":
            ok = not (_match_ops(values, arg) if _is_op_dict(arg) else _equals_cond(values, arg))
        elif op == "$size":
            ok = any(isinstance(v, list) and len(v) == arg for v in values)
        elif op == "$all":
            ok = all(_equals_cond(values, a) for a in arg)
        elif op == "$elemMatch":
            ok = False
            for v in values:
                if not isinstance(v, list):
                    continue
                for el in v:
                    if _is_op_dict(arg) and not any(k in ("$and", "$or", "$nor") for k in arg):
                        if _match_ops([el], arg):
                            ok = True
                    elif isinstance(el, dict) and match(el, arg):
                        ok = True
                    if ok:
                        break
                if ok:
                    break
        else:
            raise NotImplementedError(f"Opérateur de requête non géré : {op}")
        if not ok:
            return False
    return True


def match(doc: dict, query: Optional[dict]) -> bool:
    if not query:
        return True
    for key, cond in query.items():
        if key == "$or":
            if not any(match(doc, q) for q in cond):
                return False
        elif key == "$and":
            if not all(match(doc, q) for q in cond):
                return False
        elif key == "$nor":
            if any(match(doc, q) for q in cond):
                return False
        elif key == "$comment":
            continue
        elif key.startswith("$"):
            raise NotImplementedError(f"Opérateur de requête non géré : {key}")
        else:
            values = _values(doc, key)
            if _is_op_dict(cond):
                if not _match_ops(values, cond):
                    return False
            elif not _equals_cond(values, cond):
                return False
    return True


def _sort_key(v):
    if isinstance(v, list):
        v = min(v, key=_sort_key) if v else None  # simplification : MongoDB prend min/max selon le sens
    b = _bracket(v)
    if b in (3,):
        return (b, json.dumps(encode(v), sort_keys=True))
    if b in (0,):
        return (0, 0)
    return (b, v)


def sort_docs(docs: list, spec: list) -> list:
    for field, direction in reversed(spec):
        def key(d, f=field):
            vals = _values(d, f)
            return _sort_key(vals[0] if vals else None)
        docs.sort(key=key, reverse=direction < 0)
    return docs


def _normalize_sort(key_or_list, direction=None) -> list:
    if key_or_list is None:
        return []
    if isinstance(key_or_list, str):
        return [(key_or_list, direction if direction is not None else 1)]
    if isinstance(key_or_list, dict):
        return list(key_or_list.items())
    return [(k, d) for k, d in key_or_list]


def project(doc: dict, projection) -> dict:
    if projection is None:
        return doc
    if isinstance(projection, (list, tuple)):
        projection = {f: 1 for f in projection}
    if not projection:
        return doc
    fields = {k: v for k, v in projection.items() if k != "_id"}
    inclusion = any(bool(v) for v in fields.values())
    keep_id = bool(projection.get("_id", 1))
    if inclusion:
        out = {}
        if keep_id and "_id" in doc:
            out["_id"] = doc["_id"]
        for path, v in fields.items():
            if not v:
                continue
            _copy_path(doc, out, path.split("."))
        return out
    out = copy.deepcopy(doc)
    if not keep_id:
        out.pop("_id", None)
    for path in fields:
        _unset_path(out, path.split("."))
    return out


def _copy_path(src, dst, parts):
    head = parts[0]
    if isinstance(src, list):
        return
    if not isinstance(src, dict) or head not in src:
        return
    if len(parts) == 1:
        dst[head] = copy.deepcopy(src[head])
        return
    val = src[head]
    if isinstance(val, dict):
        sub = dst.setdefault(head, {})
        _copy_path(val, sub, parts[1:])
    elif isinstance(val, list):
        lst = dst.setdefault(head, [{} for _ in val])
        for i, el in enumerate(val):
            if isinstance(el, dict) and i < len(lst):
                _copy_path(el, lst[i], parts[1:])


# ---------------------------------------------------------------------------
# Mises à jour
# ---------------------------------------------------------------------------


def _get_path(doc, parts):
    cur = doc
    for p in parts:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        elif isinstance(cur, list) and p.isdigit() and int(p) < len(cur):
            cur = cur[int(p)]
        else:
            return _MISSING
    return cur


def _set_path(doc, parts, value):
    cur = doc
    for p in parts[:-1]:
        if isinstance(cur, list) and p.isdigit():
            i = int(p)
            while len(cur) <= i:
                cur.append(None)
            if not isinstance(cur[i], (dict, list)):
                cur[i] = {}
            cur = cur[i]
        else:
            if not isinstance(cur.get(p), (dict, list)):
                cur[p] = {}
            cur = cur[p]
    last = parts[-1]
    if isinstance(cur, list) and last.isdigit():
        i = int(last)
        while len(cur) <= i:
            cur.append(None)
        cur[i] = value
    else:
        cur[last] = value


def _unset_path(doc, parts):
    cur = doc
    for p in parts[:-1]:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        elif isinstance(cur, list) and p.isdigit() and int(p) < len(cur):
            cur = cur[int(p)]
        else:
            return
    if isinstance(cur, dict):
        cur.pop(parts[-1], None)
    elif isinstance(cur, list) and parts[-1].isdigit() and int(parts[-1]) < len(cur):
        cur[int(parts[-1])] = None


def _check_path(path: str):
    if "$" in path.split(".") or any(p.startswith("$[") for p in path.split(".")):
        raise NotImplementedError(f"Opérateur positionnel non géré : {path}")


def apply_update(doc: dict, update: dict, is_insert: bool = False) -> dict:
    update = _norm(update)
    if not any(k.startswith("$") for k in update):
        new = copy.deepcopy(update)
        if "_id" in doc:
            new["_id"] = doc["_id"]
        return new
    new = copy.deepcopy(doc)
    for op, fields in update.items():
        if op == "$setOnInsert" and not is_insert:
            continue
        for path, arg in fields.items():
            _check_path(path)
            parts = path.split(".")
            if op in ("$set", "$setOnInsert"):
                _set_path(new, parts, copy.deepcopy(arg))
            elif op == "$unset":
                _unset_path(new, parts)
            elif op == "$inc":
                cur = _get_path(new, parts)
                _set_path(new, parts, (0 if cur is _MISSING or cur is None else cur) + arg)
            elif op in ("$min", "$max"):
                cur = _get_path(new, parts)
                r = None if cur is _MISSING else _cmp(arg, cur)
                if cur is _MISSING or (r is not None and ((op == "$min" and r < 0) or (op == "$max" and r > 0))):
                    _set_path(new, parts, copy.deepcopy(arg))
            elif op in ("$push", "$addToSet"):
                cur = _get_path(new, parts)
                if cur is _MISSING or cur is None:
                    cur = []
                elif not isinstance(cur, list):
                    raise ValueError(f"{op} sur un champ qui n'est pas un tableau : {path}")
                else:
                    cur = list(cur)
                each = arg["$each"] if isinstance(arg, dict) and "$each" in arg else [arg]
                for item in each:
                    if op == "$addToSet" and any(_eq(x, item) for x in cur):
                        continue
                    cur.append(copy.deepcopy(item))
                if op == "$push" and isinstance(arg, dict) and "$slice" in arg:
                    n = arg["$slice"]
                    cur = cur[n:] if n < 0 else cur[:n]
                _set_path(new, parts, cur)
            elif op == "$pull":
                cur = _get_path(new, parts)
                if isinstance(cur, list):
                    if _is_op_dict(arg):
                        keep = [x for x in cur if not _match_ops([x], arg)]
                    elif isinstance(arg, dict):
                        keep = [x for x in cur if not (isinstance(x, dict) and match(x, arg))]
                    else:
                        keep = [x for x in cur if not _eq(x, arg)]
                    _set_path(new, parts, keep)
            else:
                raise NotImplementedError(f"Opérateur de mise à jour non géré : {op}")
    return new


def _upsert_seed(query: dict) -> dict:
    seed = {}

    def walk(q):
        for k, v in (q or {}).items():
            if k == "$and":
                for sub in v:
                    walk(sub)
            elif k.startswith("$"):
                continue
            elif _is_op_dict(v):
                if "$eq" in v:
                    _set_path(seed, k.split("."), copy.deepcopy(v["$eq"]))
            elif not isinstance(v, re.Pattern):
                _set_path(seed, k.split("."), copy.deepcopy(v))

    walk(_norm(query))
    return seed


# ---------------------------------------------------------------------------
# Agrégation (en Python, après un $match poussé en SQL)
# ---------------------------------------------------------------------------


def _truthy(v) -> bool:
    return not (v is None or v is False or v is _MISSING or (_is_num(v) and v == 0))


def _expr(doc, e):
    if isinstance(e, str) and e.startswith("$") and not e.startswith("$$"):
        vals = _values(doc, e[1:])
        if not vals:
            return _MISSING
        return vals[0] if len(vals) == 1 else vals
    if isinstance(e, dict):
        if len(e) == 1 and next(iter(e)).startswith("$"):
            op, arg = next(iter(e.items()))
            if op == "$cond":
                if isinstance(arg, dict):
                    c, t, f = arg["if"], arg["then"], arg["else"]
                else:
                    c, t, f = arg
                return _expr(doc, t) if _truthy(_expr(doc, c)) else _expr(doc, f)
            if op == "$in":
                x, arr = _expr(doc, arg[0]), _expr(doc, arg[1])
                return any(_eq(x, a) for a in (arr if isinstance(arr, list) else []))
            if op in ("$eq", "$ne", "$gt", "$gte", "$lt", "$lte"):
                a, b = (None if v is _MISSING else v for v in (_expr(doc, arg[0]), _expr(doc, arg[1])))
                if op == "$eq":
                    return _eq(a, b)
                if op == "$ne":
                    return not _eq(a, b)
                ka, kb = _sort_key(a), _sort_key(b)
                return {"$gt": ka > kb, "$gte": ka >= kb, "$lt": ka < kb, "$lte": ka <= kb}[op]
            if op in ("$substrCP", "$substr", "$substrBytes"):
                s = _expr(doc, arg[0])
                s = "" if s is _MISSING or s is None else str(s)
                start, length = int(arg[1]), int(arg[2])
                return s[start:start + length] if length >= 0 else s[start:]
            if op == "$ifNull":
                for a in arg:
                    v = _expr(doc, a)
                    if v is not _MISSING and v is not None:
                        return v
                return None
            if op == "$and":
                return all(_truthy(_expr(doc, a)) for a in arg)
            if op == "$or":
                return any(_truthy(_expr(doc, a)) for a in arg)
            if op == "$not":
                return not _truthy(_expr(doc, arg[0] if isinstance(arg, list) else arg))
            if op == "$toLower":
                v = _expr(doc, arg)
                return "" if v in (None, _MISSING) else str(v).lower()
            if op == "$literal":
                return arg
            raise NotImplementedError(f"Expression d'agrégation non gérée : {op}")
        return {k: (None if (v := _expr(doc, x)) is _MISSING else v) for k, x in e.items()}
    if isinstance(e, list):
        return [_expr(doc, x) for x in e]
    return e


def _group(docs: list, spec: dict) -> list:
    groups: dict = {}
    order = []
    for d in docs:
        gid = _expr(d, spec["_id"])
        gid = None if gid is _MISSING else gid
        k = json.dumps(encode(gid), sort_keys=False, default=str)
        if k not in groups:
            groups[k] = {"_id": gid, "_acc": {f: [] for f in spec if f != "_id"}}
            order.append(k)
        for field, acc in spec.items():
            if field == "_id":
                continue
            (op, arg), = acc.items()
            groups[k]["_acc"][field].append(_expr(d, arg))
    out = []
    for k in order:
        g = groups[k]
        row = {"_id": g["_id"]}
        for field, acc in spec.items():
            if field == "_id":
                continue
            op = next(iter(acc))
            vals = g["_acc"][field]
            present = [v for v in vals if v is not _MISSING and v is not None]
            if op == "$sum":
                row[field] = sum(v for v in present if _is_num(v))
            elif op == "$avg":
                nums = [v for v in present if _is_num(v)]
                row[field] = sum(nums) / len(nums) if nums else None
            elif op == "$min":
                row[field] = min(present, key=_sort_key) if present else None
            elif op == "$max":
                row[field] = max(present, key=_sort_key) if present else None
            elif op == "$addToSet":
                uniq = []
                for v in present:
                    if not any(_eq(v, u) for u in uniq):
                        uniq.append(v)
                row[field] = uniq
            elif op == "$push":
                row[field] = present
            elif op == "$first":
                row[field] = None if not vals or vals[0] is _MISSING else vals[0]
            elif op == "$last":
                row[field] = None if not vals or vals[-1] is _MISSING else vals[-1]
            elif op == "$count":
                row[field] = len(vals)
            else:
                raise NotImplementedError(f"Accumulateur non géré : {op}")
        out.append(row)
    return out


def run_pipeline(docs: list, pipeline: list) -> list:
    for stage in pipeline:
        (op, arg), = stage.items()
        if op == "$match":
            docs = [d for d in docs if match(d, _norm(arg))]
        elif op == "$group":
            docs = _group(docs, arg)
        elif op == "$sort":
            docs = sort_docs(docs, list(arg.items()))
        elif op == "$limit":
            docs = docs[:arg]
        elif op == "$skip":
            docs = docs[arg:]
        elif op == "$count":
            docs = [{arg: len(docs)}]
        elif op == "$project":
            docs = [project(d, arg) for d in docs]
        elif op == "$unwind":
            path = (arg if isinstance(arg, str) else arg["path"])[1:]
            keep_empty = isinstance(arg, dict) and arg.get("preserveNullAndEmptyArrays")
            out = []
            for d in docs:
                v = _get_path(d, path.split("."))
                if isinstance(v, list) and v:
                    for el in v:
                        nd = copy.deepcopy(d)
                        _set_path(nd, path.split("."), el)
                        out.append(nd)
                elif keep_empty or (v is not _MISSING and v is not None and not isinstance(v, list)):
                    out.append(d)
            docs = out
        else:
            raise NotImplementedError(f"Étape d'agrégation non gérée : {op}")
    return docs


def _refs(obj, acc: set):
    """Champs de premier niveau utilisés par un filtre ou un pipeline."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(k, str) and not k.startswith("$"):
                acc.add(k.split(".")[0])
            _refs(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            _refs(v, acc)
    elif isinstance(obj, str) and obj.startswith("$") and not obj.startswith("$$") and len(obj) > 1:
        acc.add(obj[1:].split(".")[0])


# ---------------------------------------------------------------------------
# Traduction SQL (présélection)
# ---------------------------------------------------------------------------


def _lit(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def _rank(f: str) -> str:
    return (f"(CASE jsonb_typeof(doc->{_lit(f)}) WHEN 'number' THEN 1 WHEN 'string' THEN 2 "
            f"WHEN 'object' THEN 3 WHEN 'array' THEN 4 WHEN 'boolean' THEN 5 ELSE 0 END)")


def _num(f: str) -> str:
    return f"(CASE WHEN jsonb_typeof(doc->{_lit(f)}) = 'number' THEN (doc->>{_lit(f)})::numeric END)"


def _txt(f: str) -> str:
    return f"((doc->>{_lit(f)}) COLLATE \"C\")"


def sort_exprs(f: str) -> list:
    return [_rank(f), _num(f), _txt(f)]


_SCALARS = (str, int, float, bool)


class _Sql:
    def __init__(self):
        self.params: list = []

    def p(self, value, cast: str = "") -> str:
        self.params.append(value)
        return f"${len(self.params)}{cast}"


def _sql_eq(f: str, v, q: _Sql):
    if f == "_id":
        if isinstance(v, str):
            return f"_id = {q.p(v)}", True
        return "TRUE", False
    if v is None:
        return f"(NOT (doc ? {_lit(f)}) OR doc->{_lit(f)} = 'null'::jsonb OR doc->{_lit(f)} @> '[null]'::jsonb)", True
    if isinstance(v, _SCALARS):
        return f"(doc @> {q.p({f: v}, '::jsonb')} OR doc @> {q.p({f: [v]}, '::jsonb')})", True
    return "TRUE", False


def _sql_in(f: str, vals, q: _Sql):
    vals = list(vals)
    if f == "_id":
        if all(isinstance(v, str) for v in vals):
            return f"_id = ANY({q.p(vals, '::text[]')})", True
        return "TRUE", False
    if not all(v is None or isinstance(v, _SCALARS) for v in vals):
        return "TRUE", False
    scal = [v for v in vals if v is not None]
    parts = []
    if scal:
        arr = q.p(scal, "::jsonb[]")
        parts.append(f"doc->{_lit(f)} = ANY({arr})")
        parts.append(f"(jsonb_typeof(doc->{_lit(f)}) = 'array' AND EXISTS "
                     f"(SELECT 1 FROM jsonb_array_elements(doc->{_lit(f)}) e WHERE e = ANY({arr})))")
    if len(scal) != len(vals):
        parts.append(_sql_eq(f, None, q)[0])
    return ("(" + " OR ".join(parts) + ")") if parts else "FALSE", True


def _sql_range(f: str, op: str, v, q: _Sql):
    sym = {"$gt": ">", "$gte": ">=", "$lt": "<", "$lte": "<="}[op]
    # Les champs comparés par plage (dates, prix) ne sont jamais des tableaux
    # dans ce code : la présélection les traite comme des valeurs simples, et
    # reste revérifiée en Python.
    if isinstance(v, str):
        return f"({_rank(f)} = 2 AND {_num(f)} IS NULL AND {_txt(f)} {sym} {q.p(v)})", True
    if _is_num(v):
        return f"({_rank(f)} = 1 AND {_num(f)} {sym} {q.p(Decimal(str(v)), '::numeric')})", True
    return "TRUE", False


def _sql_field(f: str, cond, q: _Sql):
    if "." in f:
        return "TRUE", False
    if not _is_op_dict(cond):
        if isinstance(cond, (dict, list, re.Pattern)):
            return "TRUE", False
        return _sql_eq(f, cond, q)
    parts, exact = [], True
    for op, arg in cond.items():
        if op == "$eq":
            s, e = _sql_eq(f, arg, q) if not isinstance(arg, (dict, list)) else ("TRUE", False)
        elif op == "$ne":
            s, e = _sql_eq(f, arg, q) if not isinstance(arg, (dict, list)) else ("TRUE", False)
            s, e = (f"NOT {s}", True) if e else ("TRUE", False)
        elif op == "$in":
            s, e = _sql_in(f, arg, q)
        elif op == "$nin":
            s, e = _sql_in(f, arg, q)
            s, e = (f"NOT {s}", True) if e else ("TRUE", False)
        elif op == "$exists" and f != "_id":
            s, e = (f"(doc ? {_lit(f)})" if arg else f"NOT (doc ? {_lit(f)})"), True
        elif op in ("$gt", "$gte", "$lt", "$lte") and f != "_id":
            s, e = _sql_range(f, op, arg, q)
        else:
            s, e = "TRUE", False
        parts.append(s)
        exact = exact and e
    return " AND ".join(parts) or "TRUE", exact


def sql_filter(query: Optional[dict], q: _Sql):
    """(condition SQL, exacte ?) — la condition renvoie toujours au moins les
    documents que MongoDB renverrait ; « exacte » si elle renvoie exactement
    ceux-là."""
    if not query:
        return "TRUE", True
    parts, exact = [], True
    for k, v in query.items():
        if k in ("$and", "$or", "$nor"):
            subs = [sql_filter(sub, q) for sub in v]
            ex = all(e for _, e in subs)
            joined = [f"({s})" for s, _ in subs]
            if k == "$and":
                s = " AND ".join(joined) or "TRUE"
            elif k == "$or":
                s = " OR ".join(joined) or "FALSE"
            else:
                s = f"NOT ({' OR '.join(joined)})" if ex and joined else "TRUE"
            parts.append(s)
            exact = exact and ex
        elif k == "$comment":
            continue
        elif k.startswith("$"):
            parts.append("TRUE")
            exact = False
        else:
            s, e = _sql_field(k, v, q)
            parts.append(s)
            exact = exact and e
    return " AND ".join(f"({p})" for p in parts) or "TRUE", exact


# ---------------------------------------------------------------------------
# Résultats (mêmes attributs que pymongo)
# ---------------------------------------------------------------------------


class InsertOneResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id
        self.acknowledged = True


class InsertManyResult:
    def __init__(self, inserted_ids):
        self.inserted_ids = inserted_ids
        self.acknowledged = True


class UpdateResult:
    def __init__(self, matched, modified, upserted_id=None):
        self.matched_count = matched
        self.modified_count = modified
        self.upserted_id = upserted_id
        self.acknowledged = True
        self.raw_result = {"n": matched + (1 if upserted_id else 0), "nModified": modified}


class DeleteResult:
    def __init__(self, deleted):
        self.deleted_count = deleted
        self.acknowledged = True


# ---------------------------------------------------------------------------
# Curseurs
# ---------------------------------------------------------------------------


class Cursor:
    def __init__(self, coll: "Collection", query, projection):
        self._coll = coll
        self._query = _norm(query or {})
        self._projection = projection
        self._sort: list = []
        self._skip = 0
        self._limit = 0
        self._buffer: Optional[list] = None

    def sort(self, key_or_list, direction=None):
        self._sort = _normalize_sort(key_or_list, direction)
        return self

    def skip(self, n: int):
        self._skip = int(n or 0)
        return self

    def limit(self, n: int):
        self._limit = int(n or 0)
        return self

    def batch_size(self, _n):
        return self

    async def to_list(self, length: Optional[int] = None):
        limit = self._limit
        if length:
            limit = min(limit, length) if limit else length
        return await self._coll._find_docs(self._query, self._projection, self._sort, self._skip, limit)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._buffer is None:
            self._buffer = await self.to_list(None)
        if not self._buffer:
            raise StopAsyncIteration
        return self._buffer.pop(0)


class AggCursor:
    def __init__(self, coll: "Collection", pipeline: list):
        self._coll = coll
        self._pipeline = pipeline
        self._buffer: Optional[list] = None

    async def to_list(self, length: Optional[int] = None):
        rows = await self._coll._aggregate(self._pipeline)
        return rows[:length] if length else rows

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._buffer is None:
            self._buffer = await self.to_list(None)
        if not self._buffer:
            raise StopAsyncIteration
        return self._buffer.pop(0)


# ---------------------------------------------------------------------------
# Collection / base / client
# ---------------------------------------------------------------------------


def _index_name(table: str, fields: list, unique: bool) -> str:
    import hashlib
    h = hashlib.sha1(("|".join(f"{f}:{d}" for f, d in fields) + str(unique)).encode()).hexdigest()[:10]
    return f"{table[:40]}_{'u' if unique else 'i'}_{h}"


class Collection:
    def __init__(self, database: "Database", name: str):
        self.database = database
        self.name = name
        self.table = f'{database.schema}."{name.replace(chr(34), chr(34) * 2)}"'

    def __getattr__(self, item):
        # db.collection.sub -> collection "collection.sub", comme Motor.
        if item.startswith("_"):
            raise AttributeError(item)
        return self.database[f"{self.name}.{item}"]

    async def _con(self):
        return await self.database.client._pool()

    async def _ensure(self):
        await self.database.client._ensure_table(self.name, self.table)

    # --- lecture -----------------------------------------------------------
    def _select_cols(self, needed: Optional[set], excluded: Optional[set] = None) -> str:
        if needed is not None:
            keys = sorted(needed - {"_id"})
            return f"_id, COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(doc) WHERE key = ANY({_lit_array(keys)})), '{{}}'::jsonb) AS doc"
        if excluded:
            return f"_id, doc - {_lit_array(sorted(excluded))} AS doc"
        return "_id, doc"

    def _fetch_plan(self, query, projection, sort):
        """Champs à ramener de Postgres : tout le document, ou seulement ceux
        nécessaires au filtre, au tri et à la projection (évite de transférer
        les gros champs, ex. le corps des emails de email_logs)."""
        if isinstance(projection, (list, tuple)):
            projection = {f: 1 for f in projection}
        if not projection:
            return None, None
        fields = {k: v for k, v in projection.items() if k != "_id"}
        refs: set = set()
        _refs(query, refs)
        refs |= {f.split(".")[0] for f, _ in sort}
        if any(bool(v) for v in fields.values()):
            return {k.split(".")[0] for k, v in fields.items() if v} | refs, None
        excluded = {k for k in fields if "." not in k} - refs
        return None, excluded

    async def _rows(self, where: str, params: list, order: str = "seq", skip: int = 0, limit: int = 0,
                    needed=None, excluded=None, for_update: bool = False, con=None) -> list:
        await self._ensure()
        sql = f"SELECT {self._select_cols(needed, excluded)} FROM {self.table} WHERE {where} ORDER BY {order}"
        if limit:
            sql += f" LIMIT {int(limit)}"
        if skip:
            sql += f" OFFSET {int(skip)}"
        if for_update:
            sql += " FOR UPDATE"
        if con is not None:
            rows = await con.fetch(sql, *params)
        else:
            pool = await self._con()
            rows = await pool.fetch(sql, *params)
        out = []
        for r in rows:
            d = decode(r["doc"])
            d["_id"] = r["_id"]
            out.append(d)
        return out

    def _order_sql(self, sort: list) -> Optional[str]:
        parts = []
        for f, d in sort:
            if "." in f:
                return None
            if f == "_id":
                parts.append(f"_id {'DESC' if d < 0 else 'ASC'}")
                continue
            parts.extend(f"{e} {'DESC' if d < 0 else 'ASC'}" for e in sort_exprs(f))
        parts.append("seq ASC")
        return ", ".join(parts)

    async def _find_docs(self, query, projection, sort, skip=0, limit=0) -> list:
        q = _Sql()
        where, exact = sql_filter(query, q)
        needed, excluded = self._fetch_plan(query, projection, sort)
        order = self._order_sql(sort) if sort else "seq ASC"
        if exact and order is not None:
            docs = await self._rows(where, q.params, order, skip, limit, needed, excluded)
            docs = [d for d in docs if match(d, query)]
            if sort:
                sort_docs(docs, sort)  # ex-æquo et types mélangés : ordre MongoDB
        else:
            docs = await self._rows(where, q.params, "seq ASC", needed=needed, excluded=excluded)
            docs = [d for d in docs if match(d, query)]
            if sort:
                sort_docs(docs, sort)
            if skip:
                docs = docs[skip:]
            if limit:
                docs = docs[:limit]
        return [project(d, projection) for d in docs]

    def find(self, filter=None, projection=None, sort=None, skip=0, limit=0, **_kw):
        c = Cursor(self, filter, projection)
        if sort:
            c.sort(sort)
        if skip:
            c.skip(skip)
        if limit:
            c.limit(limit)
        return c

    async def find_one(self, filter=None, projection=None, sort=None, **_kw):
        if filter is not None and not isinstance(filter, dict):
            filter = {"_id": filter}
        docs = await self._find_docs(_norm(filter or {}), projection, _normalize_sort(sort), 0, 1)
        return docs[0] if docs else None

    async def count_documents(self, filter=None, limit: int = 0, skip: int = 0, **_kw) -> int:
        query = _norm(filter or {})
        q = _Sql()
        where, exact = sql_filter(query, q)
        await self._ensure()
        pool = await self._con()
        if exact and not limit and not skip:
            return await pool.fetchval(f"SELECT count(*) FROM {self.table} WHERE {where}", *q.params)
        refs: set = set()
        _refs(query, refs)
        docs = await self._rows(where, q.params, needed=refs)
        n = sum(1 for d in docs if match(d, query))
        n = max(0, n - skip)
        return min(n, limit) if limit else n

    async def estimated_document_count(self, **_kw) -> int:
        return await self.count_documents({})

    async def distinct(self, key: str, filter=None, **_kw) -> list:
        query = _norm(filter or {})
        q = _Sql()
        where, _ = sql_filter(query, q)
        refs: set = {key.split(".")[0]}
        _refs(query, refs)
        docs = await self._rows(where, q.params, needed=refs)
        out = []
        for d in docs:
            if not match(d, query):
                continue
            for v in _values(d, key):
                for x in (v if isinstance(v, list) else [v]):
                    if not any(_eq(x, o) and type(x) is type(o) for o in out):
                        out.append(x)
        return out

    def aggregate(self, pipeline: list, **_kw):
        return AggCursor(self, pipeline)

    async def _aggregate(self, pipeline: list) -> list:
        pipeline = list(pipeline)
        query = {}
        if pipeline and "$match" in pipeline[0]:
            query = _norm(pipeline[0]["$match"])
        q = _Sql()
        where, _ = sql_filter(query, q)
        refs: set = set()
        _refs(pipeline, refs)
        docs = await self._rows(where, q.params, needed=refs or {"_id"})
        return run_pipeline(docs, pipeline)

    # --- écriture ----------------------------------------------------------
    async def _insert(self, con, doc: dict):
        if "_id" not in doc:
            doc["_id"] = ObjectId()  # comme pymongo : le dict inséré reçoit son _id
        body = encode({k: v for k, v in doc.items() if k != "_id"})
        try:
            await con.execute(f"INSERT INTO {self.table} (_id, doc) VALUES ($1, $2::jsonb)", str(doc["_id"]), body)
        except asyncpg.UniqueViolationError as e:
            raise DuplicateKeyError(f"E11000 duplicate key error collection: {self.name} — {e}") from e
        return doc["_id"]

    async def insert_one(self, document: dict, **_kw):
        await self._ensure()
        pool = await self._con()
        async with pool.acquire() as con:
            return InsertOneResult(await self._insert(con, document))

    async def insert_many(self, documents: list, ordered: bool = True, **_kw):
        await self._ensure()
        pool = await self._con()
        ids = []
        async with pool.acquire() as con:
            async with con.transaction():
                for d in documents:
                    ids.append(await self._insert(con, d))
        return InsertManyResult(ids)

    async def _write(self, con, _id, new: dict):
        body = encode({k: v for k, v in new.items() if k != "_id"})
        try:
            await con.execute(f"UPDATE {self.table} SET doc = $2::jsonb WHERE _id = $1", str(_id), body)
        except asyncpg.UniqueViolationError as e:
            raise DuplicateKeyError(f"E11000 duplicate key error collection: {self.name} — {e}") from e

    async def _locked_matches(self, con, query: dict, many: bool, sort: list = None) -> list:
        q = _Sql()
        where, exact = sql_filter(query, q)
        limit = 1 if (exact and not many and not sort) else 0
        docs = await self._rows(where, q.params, "seq ASC", limit=limit, for_update=True, con=con)
        docs = [d for d in docs if match(d, query)]
        if sort:
            sort_docs(docs, sort)
        return docs if many else docs[:1]

    async def _update(self, filter, update, upsert: bool, many: bool, sort=None, replacement=False):
        query = _norm(filter or {})
        if not replacement and update and not any(k.startswith("$") for k in update):
            raise ValueError("update only works with $ operators")
        await self._ensure()
        pool = await self._con()
        async with pool.acquire() as con:
            async with con.transaction():
                docs = await self._locked_matches(con, query, many, _normalize_sort(sort))
                modified, before, after = 0, None, None
                for d in docs:
                    new = apply_update(d, update)
                    if encode(new) != encode(d):
                        await self._write(con, d["_id"], new)
                        modified += 1
                    before, after = before or d, new if after is None else after
                if docs or not upsert:
                    return UpdateResult(len(docs), modified), before, after
                seed = _upsert_seed(query)
                new = apply_update(seed, update, is_insert=True) if not replacement else {**seed, **_norm(update)}
                if "_id" not in new:
                    new["_id"] = ObjectId()
                await self._insert(con, new)
                return UpdateResult(0, 0, new["_id"]), None, new

    async def update_one(self, filter, update, upsert: bool = False, **_kw):
        return (await self._update(filter, update, upsert, many=False, sort=_kw.get("sort")))[0]

    async def update_many(self, filter, update, upsert: bool = False, **_kw):
        return (await self._update(filter, update, upsert, many=True))[0]

    async def replace_one(self, filter, replacement, upsert: bool = False, **_kw):
        return (await self._update(filter, replacement, upsert, many=False, replacement=True))[0]

    async def find_one_and_update(self, filter, update, projection=None, sort=None, upsert: bool = False,
                                  return_document=ReturnDocument.BEFORE, **_kw):
        _, before, after = await self._update(filter, update, upsert, many=False, sort=sort)
        doc = after if return_document == ReturnDocument.AFTER else before
        return project(doc, projection) if doc is not None else None

    async def find_one_and_delete(self, filter, projection=None, sort=None, **_kw):
        query = _norm(filter or {})
        await self._ensure()
        pool = await self._con()
        async with pool.acquire() as con:
            async with con.transaction():
                docs = await self._locked_matches(con, query, False, _normalize_sort(sort))
                if not docs:
                    return None
                await con.execute(f"DELETE FROM {self.table} WHERE _id = $1", str(docs[0]["_id"]))
                return project(docs[0], projection)

    async def _delete(self, filter, many: bool):
        query = _norm(filter or {})
        await self._ensure()
        pool = await self._con()
        async with pool.acquire() as con:
            async with con.transaction():
                docs = await self._locked_matches(con, query, many)
                if docs:
                    await con.execute(f"DELETE FROM {self.table} WHERE _id = ANY($1::text[])", [str(d["_id"]) for d in docs])
                return DeleteResult(len(docs))

    async def delete_one(self, filter, **_kw):
        return await self._delete(filter, many=False)

    async def delete_many(self, filter, **_kw):
        return await self._delete(filter, many=True)

    # --- index -------------------------------------------------------------
    async def create_index(self, keys, unique: bool = False, name: Optional[str] = None, **_kw):
        fields = _normalize_sort(keys, 1)
        await self._ensure()
        pool = await self._con()
        idx = _index_name(self.name, fields, unique)
        if unique:
            cols = ", ".join(f"(doc->>{_lit(f)})" for f, _ in fields)
        else:
            cols = ", ".join(f"{e} {'DESC' if d < 0 else 'ASC'}" for f, d in fields if "." not in f for e in sort_exprs(f))
            if not cols:
                return name or idx
        try:
            await pool.execute(f'CREATE {"UNIQUE " if unique else ""}INDEX IF NOT EXISTS "{idx}" ON {self.table} ({cols})')
        except asyncpg.UniqueViolationError:
            logger.warning(f"Index unique {self.name}{[f for f, _ in fields]} non créé : doublons existants")
        except Exception as e:
            logger.warning(f"Index {self.name}{[f for f, _ in fields]} non créé : {e}")
        return name or idx

    async def create_indexes(self, indexes, **_kw):
        return [await self.create_index(i.document["key"].items() if hasattr(i, "document") else i) for i in indexes]

    async def drop_index(self, _name, **_kw):
        # Les noms d'index MongoDB n'existent pas côté Postgres : rien à faire.
        return None

    async def drop(self, **_kw):
        pool = await self._con()
        await pool.execute(f"DROP TABLE IF EXISTS {self.table}")
        self.database.client._known_tables.discard(self.name)


def _lit_array(values: list) -> str:
    return "ARRAY[" + ", ".join(_lit(v) for v in values) + "]::text[]" if values else "ARRAY[]::text[]"


class Database:
    def __init__(self, client: "PgClient", schema: str):
        self.client = client
        self.schema = schema
        self.name = schema
        self._collections: dict = {}

    def __getitem__(self, name: str) -> Collection:
        if name not in self._collections:
            self._collections[name] = Collection(self, name)
        return self._collections[name]

    def __getattr__(self, name: str) -> Collection:
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]

    def get_collection(self, name: str, **_kw) -> Collection:
        return self[name]

    async def list_collection_names(self, **_kw) -> list:
        pool = await self.client._pool()
        rows = await pool.fetch(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY 1",
            self.schema,
        )
        return [r["table_name"] for r in rows]

    async def command(self, cmd, *_a, **_kw):
        if cmd in ("ping", {"ping": 1}):
            pool = await self.client._pool()
            await pool.fetchval("SELECT 1")
            return {"ok": 1.0}
        raise NotImplementedError(f"Commande non gérée : {cmd}")


async def _init_connection(con):
    await con.set_type_codec("jsonb", encoder=lambda v: json.dumps(v, ensure_ascii=False), decoder=json.loads, schema="pg_catalog")


class PgClient:
    """Équivalent d'AsyncIOMotorClient : un pool de connexions par boucle
    asyncio (le serveur n'en a qu'une ; les scripts en créent une par
    asyncio.run)."""

    def __init__(self, dsn: str, schema: str = "tdl", min_size: int = 1, max_size: int = 10):
        self.dsn = dsn
        self.schema = schema
        self.min_size, self.max_size = min_size, max_size
        self._pools: dict = {}
        self._locks: dict = {}
        self._known_tables: set = set()

    def __getitem__(self, _name) -> Database:
        return Database(self, self.schema)

    async def _pool(self):
        loop = asyncio.get_running_loop()
        pool = self._pools.get(loop)
        if pool is not None:
            return pool
        lock = self._locks.setdefault(loop, asyncio.Lock())
        async with lock:
            if loop not in self._pools:
                # statement_cache_size=0 : compatible avec le pooler Supabase
                # (Supavisor), qui ne garde pas les requêtes préparées.
                pool = await asyncpg.create_pool(
                    self.dsn, min_size=self.min_size, max_size=self.max_size, init=_init_connection,
                    statement_cache_size=0, command_timeout=60,
                )
                await pool.execute(f"CREATE SCHEMA IF NOT EXISTS {self.schema}")
                rows = await pool.fetch(
                    "SELECT c.table_name, bool_or(c.column_name = 'seq') AS has_seq FROM information_schema.columns c "
                    "WHERE c.table_schema = $1 GROUP BY 1", self.schema,
                )
                # Une table sans colonne seq (recopiée par une ancienne version
                # du script) n'est pas « connue » : _ensure_table l'ajoute.
                self._known_tables = {r["table_name"] for r in rows if r["has_seq"]}
                self._pools[loop] = pool
        return self._pools[loop]

    async def _ensure_table(self, name: str, table: str):
        if name in self._known_tables:
            return
        pool = await self._pool()
        lock = self._locks.setdefault((asyncio.get_running_loop(), name), asyncio.Lock())
        async with lock:
            if name in self._known_tables:
                return
            await self._create_table(pool, name, table)

    async def _create_table(self, pool, name: str, table: str):
        short = name[:40]
        async with pool.acquire() as con:
            await con.execute(f"CREATE TABLE IF NOT EXISTS {table} (_id text PRIMARY KEY, doc jsonb NOT NULL, seq bigserial)")
            await con.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS seq bigserial")
            await con.execute(f'CREATE INDEX IF NOT EXISTS "{short}_seq_idx" ON {table} (seq)')
            await con.execute(f'CREATE INDEX IF NOT EXISTS "{short}_doc_gin" ON {table} USING gin (doc jsonb_path_ops)')
            await con.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
            await con.execute(f"REVOKE ALL ON {table} FROM anon, authenticated, public")
        self._known_tables.add(name)

    def close(self):
        for pool in self._pools.values():
            pool.terminate()
        self._pools.clear()
