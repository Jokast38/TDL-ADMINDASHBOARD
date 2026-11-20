"""Extraction des 5 grilles officielles CACES® R.489 (V1 - 12/2024) depuis les
PDF fournis le 2026-11-19 (assets/caces_r489/templates/) :

- texte des questions, numérotées comme sur la grille (la numérotation
  repart à 1 à chaque thème), avec leur rubrique et les points de la rubrique ;
- réponse officielle (reponses.pdf) ;
- illustration de la question (image ou schéma), découpée telle quelle dans
  la grille → assets/caces_r489/images/g{grille}_t{theme}_q{numero}.png ;
- position de chaque question sur la page (pour cocher VRAI / FAUX par-dessus
  le PDF officiel : services/caces_r489_pdf.py).

Résultat : assets/caces_r489/grilles.json. Usage :
    python scripts/caces_r489_extract.py
"""
import json
import os
import re
import sys

import pymupdf as fitz

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "caces_r489")
TPL = os.path.join(BASE, "templates")
IMG = os.path.join(BASE, "images")

THEME_KEYS = {1: "generales", 2: "technologie", 3: "abaque", 4: "exploitation"}
# Colonnes de réponse de la grille officielle (points PDF) : VRAI puis FAUX.
COL_TEXT_MAX = 506
COL_VRAI = (506, 541)
COL_FAUX = (541, 576)


def _lines(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            spans = [s for s in l["spans"] if s["text"].strip()]
            if not spans:
                continue
            out.append({"x0": l["bbox"][0], "y0": l["bbox"][1], "x1": l["bbox"][2], "y1": l["bbox"][3],
                        "text": "".join(s["text"] for s in l["spans"]).strip(),
                        "bold": any("Bold" in s["font"] for s in spans), "size": spans[0]["size"]})
    return out


def _separators(page):
    """Lignes pointillées qui séparent les lignes du tableau (petites images
    de 1 pt de haut à gauche de la zone de texte)."""
    ys = set()
    for b in page.get_text("dict")["blocks"]:
        if b["type"] == 1 and abs(b["bbox"][0] - 36) < 3:
            ys.add(round(b["bbox"][1], 1))
    return sorted(ys)


def _images(page):
    out = []
    for info in page.get_image_info(xrefs=True):
        x0, y0, x1, y1 = info["bbox"]
        if x1 - x0 > 20 and y1 - y0 > 15:
            out.append(fitz.Rect(x0, y0, x1, y1))
    return out


def parse_answers():
    """{grille: {theme: {numero: bool}}}"""
    doc = fitz.open(os.path.join(TPL, "reponses.pdf"))
    out = {}
    for page in doc:
        lines = _lines(page)
        m = next((re.search(r"Grille (\d)", l["text"]) for l in lines if "Grille" in l["text"]), None)
        g = int(m.group(1))
        res = {1: {}, 2: {}, 3: {}, 4: {}}
        for side in ("left", "right"):
            col = [l for l in lines if (l["x0"] < 300) == (side == "left")]
            theme = 4 if side == "right" else None
            for l in sorted(col, key=lambda l: l["y0"]):
                t = l["text"]
                mt = re.match(r"TH[ÈE]ME (\d)", t)
                if mt:
                    theme = int(mt.group(1))
                    continue
                mq = re.match(r"Question (\d+)\s*(VRAI|FAUX)?", t)
                if mq and theme:
                    val = mq.group(2)
                    if not val:  # réponse dans une autre « ligne » au même niveau
                        near = [x for x in col if abs(x["y0"] - l["y0"]) < 3 and x["text"] in ("VRAI", "FAUX")]
                        val = near[0]["text"] if near else None
                    if val:
                        res[theme][int(mq.group(1))] = val == "VRAI"
        out[g] = res
    return out


HEAD_RE = re.compile(r"^(Citer|Identifier|Connaître|Connaitre|Évaluer|Evaluer|Savoir lire)")


def parse_grille(g, answers):
    doc = fitz.open(os.path.join(TPL, f"grille_{g}.pdf"))
    questions, theme, rubrique, sous = [], None, None, None
    for pno, page in enumerate(doc):
        lines = _lines(page)
        seps = _separators(page)
        images = _images(page)
        bands = []  # (y, texte) des bandeaux de rubrique / thème
        points_at = {round(l["y0"]): l["text"] for l in lines if l["x0"] > COL_TEXT_MAX and re.search(r"points?$", l["text"], re.I)}
        qnums = []
        for l in lines:
            if l["y0"] < 35 or l["y0"] > 816:
                continue
            t = l["text"]
            mt = re.match(r"TH[ÈE]ME (\d) : (.+)", t)
            if mt:
                bands.append((l["y0"], "theme", int(mt.group(1)), mt.group(2).strip()))
                continue
            if l["x0"] > COL_TEXT_MAX:
                continue
            if t.startswith("●"):
                bands.append((l["y0"], "sous", t.lstrip("● ").strip(), l))
                continue
            if HEAD_RE.match(t) and l["bold"]:
                bands.append((l["y0"], "rubrique", t.rstrip(" :"), l))
                continue
            m = re.match(r"^(\d{1,2})(\s+(.*))?$", t)
            if m and l["x0"] < 32:
                qnums.append((l, int(m.group(1)), (m.group(3) or "").strip()))
        # Bandeaux et questions dans l'ordre de la page
        events = sorted([(b[0], "band", b) for b in bands] + [(q[0]["y0"], "q", q) for q in qnums], key=lambda e: e[0])
        for y, kind, ev in events:
            if kind == "band":
                if ev[1] == "theme":
                    theme, rubrique, sous = ev[2], None, None
                elif ev[1] == "rubrique":
                    rubrique, sous = ev[2], None
                else:
                    sous = {"label": ev[2], "points": _points_near(points_at, ev[0])}
                continue
            line, num, first_text = ev
            ymid = (line["y0"] + line["y1"]) / 2
            top = max([s for s in seps if s <= ymid + 1] or [line["y0"] - 4])
            bottom = min([s for s in seps if s > ymid + 1] or [818])
            row = fitz.Rect(36, top, COL_TEXT_MAX, bottom)
            txt = [l for l in lines if l["x0"] >= 36 and l["x1"] <= COL_TEXT_MAX + 2 and top - 1 <= l["y0"] and l["y1"] <= bottom + 1
                   and not l["text"].startswith("●") and not re.match(r"^Tableau n°", l["text"])
                   and not any(im.contains(fitz.Point((l["x0"] + l["x1"]) / 2, (l["y0"] + l["y1"]) / 2)) for im in images)]
            enonce = " ".join(l["text"] for l in sorted(txt, key=lambda l: (round(l["y0"]), l["x0"])))
            if first_text and not enonce.startswith(first_text):
                enonce = (first_text + " " + enonce).strip()
            enonce = re.sub(r"\s+", " ", enonce).strip()
            questions.append({
                "theme": THEME_KEYS[theme], "theme_num": theme, "numero": num, "page": pno,
                "row": [round(row.x0, 1), round(row.y0, 1), round(row.x1, 1), round(row.y1, 1)],
                "rubrique": rubrique, "sous_rubrique": (sous or {}).get("label"), "points": (sous or {}).get("points"),
                "enonce": enonce, "reponse": answers[g][theme].get(num),
            })
        _attach_images(doc, page, pno, g, questions, images, lines)
    return questions


def _points_near(points_at, y):
    for yy, t in points_at.items():
        if abs(yy - y) < 4:
            m = re.match(r"(\d+)", t)
            return int(m.group(1)) if m else None
    return None


_CROPS = {}


def _attach_images(doc, page, pno, g, questions, images, lines):
    on_page = [q for q in questions if q["page"] == pno]
    tableaux = sorted([l for l in lines if re.match(r"^Tableau n°(\d)", l["text"])], key=lambda l: l["y0"])
    for q in on_page:
        if q.get("illustration"):
            continue
        r = fitz.Rect(q["row"])
        hits = []
        if q["theme"] == "abaque":
            # Tableau 1 : Q1-4, tableau 2 : Q5-8, tableau 3 : Q9-10 — l'image est
            # la plus proche de son libellé « Tableau n°k ».
            k = 1 if q["numero"] <= 4 else 2 if q["numero"] <= 8 else 3
            lab = next((l for l in tableaux if l["text"].startswith(f"Tableau n°{k}")), None)
            if lab:
                lc = fitz.Point((lab["x0"] + lab["x1"]) / 2, (lab["y0"] + lab["y1"]) / 2)
                hits = [min(images, key=lambda im: abs(im.y0 - lc.y) + abs(im.y1 - lc.y) + 0.3 * abs((im.x0 + im.x1) / 2 - lc.x))] if images else []
        else:
            for im in images:
                ov = min(r.y1, im.y1) - max(r.y0, im.y0)
                if ov > 0.3 * min(r.height, im.height):
                    hits.append(im)
        if not hits:
            continue
        clip = fitz.Rect(hits[0])
        for h in hits[1:]:
            clip |= h
        clip = fitz.Rect(clip.x0 - 4, clip.y0 - 4, min(clip.x1 + 4, COL_TEXT_MAX), clip.y1 + 4)
        key = (g, pno, tuple(round(v) for v in clip))
        name = _CROPS.get(key)
        if not name:  # une même figure (tableau de charges, schéma) sert à plusieurs questions
            name = f"g{g}_t{q['theme_num']}_q{q['numero']}.png"
            page.get_pixmap(clip=clip, dpi=120).save(os.path.join(IMG, name))
            _CROPS[key] = name
        q["illustration"] = name


def main():
    os.makedirs(IMG, exist_ok=True)
    for f in os.listdir(IMG):
        os.remove(os.path.join(IMG, f))
    answers = parse_answers()
    data = {"version": "V1 - 12/2024", "grilles": {}}
    problems = []
    for g in range(1, 6):
        qs = parse_grille(g, answers)
        data["grilles"][str(g)] = qs
        counts = {t: sum(1 for q in qs if q["theme"] == t) for t in THEME_KEYS.values()}
        missing = [f"T{q['theme_num']}Q{q['numero']}" for q in qs if q["reponse"] is None or not q["enonce"]]
        print(f"Grille {g} : {len(qs)} questions {counts}, illustrations : {sum(1 for q in qs if q.get('illustration'))}"
              + (f", incomplètes : {missing}" if missing else ""))
        if counts != {"generales": 15, "technologie": 25, "abaque": 10, "exploitation": 50} or missing:
            problems.append(g)
    with open(os.path.join(BASE, "grilles.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    if problems:
        print("ATTENTION grilles à vérifier :", problems)
        sys.exit(1)


if __name__ == "__main__":
    main()
