"""Sprint 3 backend tests: stages, emargement, doc-templates, generated docs, new roles.

Covers:
- New roles (animateur, responsable_admission, agent_admin) creation via /api/employees
- Animateur RBAC on dossiers (403) and stages (auto-filter)
- Stages CRUD + animateur update restrictions
- Emargement creation with signature → PDF + storage + generated_docs entry
- Doc templates listing/creation (3 seeded: attestation, convention, facture)
- Documents generated library download + delete
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://tdl-admin-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@tdlformation.fr"
ADMIN_PASSWORD = "admin123"

# 1x1 transparent PNG (data URL) — used for emargement signature
SIGNATURE_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


# --- Fixtures ---

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return _h(admin_token)


def _create_employee(admin_h, role: str, name: str = None):
    suffix = uuid.uuid4().hex[:8]
    email = f"test_{role}_{suffix}@tdl-qa.fr"
    payload = {
        "email": email,
        "name": name or f"TEST {role} {suffix}",
        "role": role,
        "password": "testpass123",
        "department": "QA",
    }
    r = requests.post(f"{API}/employees", json=payload, headers=admin_h, timeout=15)
    assert r.status_code == 200, f"Create employee role={role} failed: {r.status_code} {r.text}"
    return r.json(), email, "testpass123"


def _login(email: str, password: str):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    return r.json()["token"]


# --- Module-scope created entities for cross-test reuse ---
@pytest.fixture(scope="module")
def animateur_user(admin_h):
    user, email, pwd = _create_employee(admin_h, "animateur", "TEST Animateur One")
    token = _login(email, pwd)
    yield {"user": user, "email": email, "password": pwd, "token": token, "headers": _h(token)}
    # teardown
    requests.delete(f"{API}/employees/{user['id']}", headers=admin_h, timeout=10)


@pytest.fixture(scope="module")
def other_animateur(admin_h):
    user, email, pwd = _create_employee(admin_h, "animateur", "TEST Animateur Two")
    token = _login(email, pwd)
    yield {"user": user, "email": email, "password": pwd, "token": token, "headers": _h(token)}
    requests.delete(f"{API}/employees/{user['id']}", headers=admin_h, timeout=10)


@pytest.fixture(scope="module")
def respadm_user(admin_h):
    user, email, pwd = _create_employee(admin_h, "responsable_admission")
    token = _login(email, pwd)
    yield {"user": user, "email": email, "password": pwd, "token": token, "headers": _h(token)}
    requests.delete(f"{API}/employees/{user['id']}", headers=admin_h, timeout=10)


@pytest.fixture(scope="module")
def agentadm_user(admin_h):
    user, email, pwd = _create_employee(admin_h, "agent_admin")
    token = _login(email, pwd)
    yield {"user": user, "email": email, "password": pwd, "token": token, "headers": _h(token)}
    requests.delete(f"{API}/employees/{user['id']}", headers=admin_h, timeout=10)


@pytest.fixture(scope="module")
def a_formation(admin_h):
    r = requests.get(f"{API}/formations", timeout=10)
    assert r.status_code == 200
    formations = r.json()
    assert len(formations) > 0, "No seed formations"
    return formations[0]


@pytest.fixture(scope="module")
def stage_for_anim(admin_h, animateur_user, a_formation):
    payload = {
        "formation_id": a_formation["id"],
        "date_debut": "2026-03-15",
        "date_fin": "2026-03-20",
        "lieu_adresse": "12 rue Test",
        "lieu_ville": "Paris",
        "capacite_max": 10,
        "animateur_id": animateur_user["user"]["id"],
        "notes": "TEST stage sprint3",
    }
    r = requests.post(f"{API}/stages", json=payload, headers=admin_h, timeout=15)
    assert r.status_code == 200, f"create stage failed: {r.text}"
    stage = r.json()
    yield stage
    # cleanup not strictly needed (no DELETE endpoint), leave for ops


# --- Employees / roles ---

class TestEmployeeRoles:
    def test_create_animateur(self, admin_h):
        user, email, _ = _create_employee(admin_h, "animateur")
        assert user["role"] == "animateur"
        assert user["email"] == email.lower()
        assert "password_hash" not in user
        requests.delete(f"{API}/employees/{user['id']}", headers=admin_h, timeout=10)

    def test_create_responsable_admission(self, admin_h):
        user, _, _ = _create_employee(admin_h, "responsable_admission")
        assert user["role"] == "responsable_admission"
        requests.delete(f"{API}/employees/{user['id']}", headers=admin_h, timeout=10)

    def test_create_agent_admin(self, admin_h):
        user, _, _ = _create_employee(admin_h, "agent_admin")
        assert user["role"] == "agent_admin"
        requests.delete(f"{API}/employees/{user['id']}", headers=admin_h, timeout=10)


# --- Animateur RBAC ---

class TestAnimateurRBAC:
    def test_animateur_cannot_list_dossiers(self, animateur_user):
        r = requests.get(f"{API}/dossiers", headers=animateur_user["headers"], timeout=10)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_respadm_can_list_dossiers(self, respadm_user):
        r = requests.get(f"{API}/dossiers", headers=respadm_user["headers"], timeout=10)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_agentadm_can_list_dossiers(self, agentadm_user):
        r = requests.get(f"{API}/dossiers", headers=agentadm_user["headers"], timeout=10)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# --- Stages ---

class TestStages:
    def test_admin_can_create_stage(self, stage_for_anim, a_formation, animateur_user):
        # created by fixture - validate fields
        assert stage_for_anim["id"]
        assert stage_for_anim["formation_id"] == a_formation["id"]
        assert stage_for_anim["animateur_id"] == animateur_user["user"]["id"]
        assert stage_for_anim["statut"] == "planifie"
        assert stage_for_anim["formation_titre"]  # denormalized title

    def test_animateur_sees_own_stages_only(self, animateur_user, stage_for_anim):
        r = requests.get(f"{API}/stages", headers=animateur_user["headers"], timeout=10)
        assert r.status_code == 200
        items = r.json()
        ids = [s["id"] for s in items]
        assert stage_for_anim["id"] in ids
        # all returned stages must be assigned to this animateur
        for s in items:
            assert s.get("animateur_id") == animateur_user["user"]["id"]

    def test_other_animateur_cannot_see_this_stage(self, other_animateur, stage_for_anim):
        r = requests.get(f"{API}/stages", headers=other_animateur["headers"], timeout=10)
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert stage_for_anim["id"] not in ids

    def test_animateur_updates_own_stage_status_only(self, animateur_user, stage_for_anim):
        # allowed: statut + notes
        r = requests.put(
            f"{API}/stages/{stage_for_anim['id']}",
            json={"statut": "en_cours", "notes": "TEST update by animateur"},
            headers=animateur_user["headers"], timeout=10
        )
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["statut"] == "en_cours"
        assert updated["notes"] == "TEST update by animateur"

    def test_animateur_cannot_change_dates_on_own_stage(self, animateur_user, stage_for_anim):
        # attempt to mutate date_debut; server should silently drop it
        r = requests.put(
            f"{API}/stages/{stage_for_anim['id']}",
            json={"date_debut": "2099-01-01", "statut": "termine"},
            headers=animateur_user["headers"], timeout=10
        )
        assert r.status_code == 200
        updated = r.json()
        # date_debut must remain original (2026-03-15), only statut applied
        assert updated["date_debut"] == "2026-03-15"
        assert updated["statut"] == "termine"

    def test_animateur_cannot_update_others_stage(self, other_animateur, stage_for_anim):
        r = requests.put(
            f"{API}/stages/{stage_for_anim['id']}",
            json={"statut": "cloture"},
            headers=other_animateur["headers"], timeout=10
        )
        assert r.status_code == 403, r.text

    def test_stage_inscrits_returns_emarge_flag(self, admin_h, stage_for_anim):
        r = requests.get(f"{API}/stages/{stage_for_anim['id']}/inscrits", headers=admin_h, timeout=10)
        assert r.status_code == 200, r.text
        inscrits = r.json()
        assert isinstance(inscrits, list)
        for ins in inscrits:
            assert "emarge" in ins
            assert isinstance(ins["emarge"], bool)


# --- Emargement (creates an inscription first so we have a target) ---

@pytest.fixture(scope="module")
def an_inscription(a_formation):
    payload = {
        "formation_id": a_formation["id"],
        "student_name": "TEST Stagiaire Sprint3",
        "student_email": f"TEST_stud_{uuid.uuid4().hex[:8]}@tdl-qa.fr",
        "student_phone": "0600000000",
        "notes": "TEST inscription for emargement",
    }
    r = requests.post(f"{API}/inscriptions", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    return body["inscription"]  # the inscription dict (has id, student_id, student_name)


class TestEmargement:
    def test_animateur_creates_emargement_with_signature(self, animateur_user, stage_for_anim, an_inscription):
        # bring stage back to planifie so animateur can sign (no strict gate, but be safe)
        ins = an_inscription
        # find student_id: inscription should link a user (student auto-created on inscription)
        # If not present, just use a dummy uuid (server falls back to payload.student_name)
        student_id = ins.get("student_id") or ins.get("student", {}).get("id") or str(uuid.uuid4())
        payload = {
            "stage_id": stage_for_anim["id"],
            "inscription_id": ins["id"],
            "student_id": student_id,
            "student_name": ins.get("student_name", "TEST Stagiaire Sprint3"),
            "signature_data_url": SIGNATURE_DATA_URL,
            "present": True,
        }
        r = requests.post(f"{API}/emargements", json=payload, headers=animateur_user["headers"], timeout=60)
        assert r.status_code == 200, f"emargement failed: {r.status_code} {r.text}"
        data = r.json()
        assert "emargement" in data and "document" in data
        assert data["emargement"]["present"] is True
        assert data["document"]["type_doc"] == "attestation_presence"
        assert data["document"]["storage_path"]
        # save for download test
        TestEmargement._last_doc_id = data["document"]["id"]
        TestEmargement._last_stage_id = stage_for_anim["id"]
        TestEmargement._last_inscription_id = ins["id"]

    def test_emargement_absent_skips_signature(self, animateur_user, stage_for_anim, a_formation, admin_h):
        # create a 2nd inscription for absence test
        r = requests.post(f"{API}/inscriptions", json={
            "formation_id": a_formation["id"],
            "student_name": "TEST Absent",
            "student_email": f"TEST_abs_{uuid.uuid4().hex[:6]}@tdl-qa.fr",
        }, timeout=15)
        assert r.status_code == 200
        ins = r.json()["inscription"]
        payload = {
            "stage_id": stage_for_anim["id"],
            "inscription_id": ins["id"],
            "student_id": ins.get("student_id") or str(uuid.uuid4()),
            "student_name": "TEST Absent",
            "signature_data_url": "",  # empty allowed when absent
            "present": False,
        }
        r2 = requests.post(f"{API}/emargements", json=payload, headers=animateur_user["headers"], timeout=60)
        assert r2.status_code == 200, r2.text
        assert r2.json()["emargement"]["present"] is False

    def test_list_emargements_filtered_by_stage(self, admin_h, stage_for_anim):
        r = requests.get(f"{API}/emargements", params={"stage_id": stage_for_anim["id"]},
                         headers=admin_h, timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        for it in items:
            assert it["stage_id"] == stage_for_anim["id"]

    def test_inscrits_after_emargement_shows_emarge_true(self, admin_h):
        sid = getattr(TestEmargement, "_last_stage_id", None)
        iid = getattr(TestEmargement, "_last_inscription_id", None)
        if not sid or not iid:
            pytest.skip("Pre-req emargement test did not run")
        r = requests.get(f"{API}/stages/{sid}/inscrits", headers=admin_h, timeout=10)
        assert r.status_code == 200
        inscrits = r.json()
        match = [i for i in inscrits if i["id"] == iid]
        assert match, "Inscription not in stage inscrits"
        assert match[0]["emarge"] is True


# --- Doc templates ---

class TestDocTemplates:
    def test_seeded_templates_present(self, admin_h):
        r = requests.get(f"{API}/doc-templates", headers=admin_h, timeout=10)
        assert r.status_code == 200, r.text
        tpls = r.json()
        types = {t["type_doc"] for t in tpls}
        # 3 seeded types
        assert {"attestation", "convention", "facture"}.issubset(types), f"got {types}"
        assert len(tpls) >= 3

    def test_respadm_can_list_templates(self, respadm_user):
        r = requests.get(f"{API}/doc-templates", headers=respadm_user["headers"], timeout=10)
        assert r.status_code == 200

    def test_admin_create_template(self, admin_h):
        payload = {
            "nom": f"TEST tpl {uuid.uuid4().hex[:6]}",
            "type_doc": "autre",
            "description": "TEST template",
            "contenu_html": "<h1>{{ titre }}</h1><p>Bonjour {{ nom }}</p>",
            "variables": ["titre", "nom"],
            "actif": True,
        }
        r = requests.post(f"{API}/doc-templates", json=payload, headers=admin_h, timeout=10)
        assert r.status_code == 200, r.text
        tpl = r.json()
        assert tpl["id"]
        assert tpl["nom"] == payload["nom"]
        # cleanup
        requests.delete(f"{API}/doc-templates/{tpl['id']}", headers=admin_h, timeout=10)

    def test_non_admin_cannot_create_template(self, respadm_user):
        payload = {
            "nom": "TEST denied",
            "type_doc": "autre",
            "contenu_html": "<p>x</p>",
        }
        r = requests.post(f"{API}/doc-templates", json=payload, headers=respadm_user["headers"], timeout=10)
        assert r.status_code == 403, r.text


# --- Generated documents library ---

class TestGeneratedDocs:
    def test_respadm_can_generate_doc(self, admin_h, respadm_user):
        tpls = requests.get(f"{API}/doc-templates", headers=admin_h, timeout=10).json()
        att = next((t for t in tpls if t["type_doc"] == "attestation"), tpls[0])
        payload = {
            "template_id": att["id"],
            "context": {
                "animateur_nom": "TEST Animateur",
                "stagiaire_nom": "TEST Stagiaire",
                "formation_titre": "TEST Formation",
                "date_debut": "2026-03-15",
                "date_fin": "2026-03-20",
                "duree": "35",
                "ville": "Paris",
                "date_emission": "2026-03-21",
            },
            "nom_fichier": "TEST_attestation.pdf",
        }
        r = requests.post(f"{API}/documents-generated", json=payload, headers=respadm_user["headers"], timeout=60)
        assert r.status_code == 200, r.text
        meta = r.json()
        assert meta["nom_fichier"] == "TEST_attestation.pdf"
        assert meta["type_doc"] == "attestation"
        assert meta["storage_path"]
        TestGeneratedDocs._doc_id = meta["id"]

    def test_agentadm_can_list_generated(self, agentadm_user):
        r = requests.get(f"{API}/documents-generated", headers=agentadm_user["headers"], timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1

    def test_download_generated_pdf(self, admin_h):
        gid = getattr(TestGeneratedDocs, "_doc_id", None)
        if not gid:
            pytest.skip("Generation test did not run")
        r = requests.get(f"{API}/documents-generated/{gid}/download", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF"), "not a PDF"

    def test_non_admin_cannot_delete_generated(self, respadm_user):
        gid = getattr(TestGeneratedDocs, "_doc_id", None)
        if not gid:
            pytest.skip()
        r = requests.delete(f"{API}/documents-generated/{gid}", headers=respadm_user["headers"], timeout=10)
        assert r.status_code == 403, r.text

    def test_admin_delete_generated(self, admin_h):
        gid = getattr(TestGeneratedDocs, "_doc_id", None)
        if not gid:
            pytest.skip()
        r = requests.delete(f"{API}/documents-generated/{gid}", headers=admin_h, timeout=10)
        assert r.status_code == 200
        # verify gone
        r2 = requests.get(f"{API}/documents-generated/{gid}/download", headers=admin_h, timeout=10)
        assert r2.status_code == 404


# --- Existing regression smoke ---

class TestRegressionSmoke:
    def test_health(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_formations_list_public(self):
        r = requests.get(f"{API}/formations", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_blog_public_list(self):
        r = requests.get(f"{API}/blog/posts", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_sitemap(self):
        r = requests.get(f"{API}/sitemap.xml", timeout=10)
        assert r.status_code == 200
        assert "<urlset" in r.text

    def test_robots(self):
        r = requests.get(f"{API}/robots.txt", timeout=10)
        assert r.status_code == 200
        assert "User-agent" in r.text

    def test_admin_me(self, admin_h):
        r = requests.get(f"{API}/auth/me", headers=admin_h, timeout=10)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"
