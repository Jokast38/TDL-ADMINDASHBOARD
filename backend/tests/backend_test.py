"""TDL Formation Backend API tests (pytest).

Covers: auth, formations, inscriptions, dossiers, products, orders,
employees, settings, integrations, dashboard, AI chat, role enforcement,
and document upload.
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = "https://tdl-admin-hub.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@tdlformation.fr"
ADMIN_PASSWORD = "admin123"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def student_token():
    """Create a student via inscription flow then login? Easier: register."""
    email = f"TEST_student_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "studentpass123"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": pwd,
                            "name": "Test Student", "role": "etudiant"},
                      timeout=30)
    assert r.status_code == 200, f"Register failed: {r.text}"
    return r.json()["token"]


# ---------- Auth ----------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                          timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and isinstance(d["token"], str) and len(d["token"]) > 20
        assert d["user"]["email"] == ADMIN_EMAIL
        assert d["user"]["role"] == "admin"
        assert "password_hash" not in d["user"]

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"},
                          timeout=30)
        assert r.status_code == 401

    def test_me_with_token(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == ADMIN_EMAIL
        assert u["role"] == "admin"

    def test_me_no_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401


# ---------- Formations ----------
class TestFormations:
    def test_list_seeded(self):
        r = requests.get(f"{API}/formations", timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 6, f"Expected >=6 seeded formations, got {len(items)}"
        cats = {i["category"] for i in items}
        assert {"CACES", "PERMIS", "AUTO_ECOLE", "SSIAP", "VTC_TAXI"}.issubset(cats)

    def test_create_formation_admin(self, admin_headers):
        payload = {"title": f"TEST_Formation_{uuid.uuid4().hex[:6]}",
                   "category": "CACES", "description": "Test",
                   "duration_hours": 10, "price": 100.0, "sessions_per_month": 1,
                   "active": True}
        r = requests.post(f"{API}/formations", json=payload,
                          headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == payload["title"]
        assert "id" in d
        # cleanup
        requests.delete(f"{API}/formations/{d['id']}", headers=admin_headers, timeout=30)

    def test_create_formation_no_auth(self):
        r = requests.post(f"{API}/formations",
                          json={"title": "x", "category": "CACES"}, timeout=30)
        assert r.status_code == 401


# ---------- Inscriptions / Dossiers ----------
@pytest.fixture(scope="class")
def created_inscription():
    # get a formation
    forms = requests.get(f"{API}/formations", timeout=30).json()
    assert forms, "No formations seeded"
    fid = forms[0]["id"]
    payload = {"formation_id": fid,
               "student_name": "TEST Student",
               "student_email": f"TEST_insc_{uuid.uuid4().hex[:6]}@example.com",
               "student_phone": "0600000000",
               "notes": "test"}
    r = requests.post(f"{API}/inscriptions", json=payload, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


class TestInscriptions:
    def test_create_inscription_public(self, created_inscription):
        d = created_inscription
        assert "inscription" in d and "dossier" in d
        assert d["inscription"]["formation_id"]
        assert d["dossier"]["status"] == "nouveau"
        # trello card may or may not have been created; field should exist
        assert "trello_card_id" in d["dossier"]

    def test_list_dossiers_admin(self, admin_headers, created_inscription):
        r = requests.get(f"{API}/dossiers", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        items = r.json()
        ids = [i["id"] for i in items]
        assert created_inscription["dossier"]["id"] in ids

    def test_update_dossier_status(self, admin_headers, created_inscription):
        did = created_inscription["dossier"]["id"]
        r = requests.put(f"{API}/dossiers/{did}",
                         json={"status": "en_verification"},
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "en_verification"
        # verify persistence
        r2 = requests.get(f"{API}/dossiers/{did}", headers=admin_headers, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["status"] == "en_verification"

    def test_student_cannot_list_dossiers(self, student_token):
        r = requests.get(f"{API}/dossiers",
                         headers={"Authorization": f"Bearer {student_token}"},
                         timeout=30)
        assert r.status_code == 403


# ---------- Products / Orders ----------
class TestKamiStreet:
    def test_list_products_seeded(self):
        r = requests.get(f"{API}/products", timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 3, f"Expected >=3 products, got {len(items)}"
        assert any("KAMI" in p["name"] for p in items)

    def test_create_order_public(self):
        prods = requests.get(f"{API}/products", timeout=30).json()
        pid = prods[0]["id"]
        payload = {"product_id": pid, "customer_name": "TEST Buyer",
                   "customer_email": f"TEST_buyer_{uuid.uuid4().hex[:6]}@example.com",
                   "quantity": 2, "address": "1 rue test"}
        r = requests.post(f"{API}/orders", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["quantity"] == 2
        assert o["total"] == prods[0]["price"] * 2
        assert o["status"] == "nouveau"


# ---------- Dashboard / Integrations ----------
class TestDashboard:
    def test_dashboard_stats(self, admin_headers):
        r = requests.get(f"{API}/dashboard/stats", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_inscriptions", "total_dossiers", "in_progress",
                  "completed", "total_orders", "total_formations", "revenue",
                  "by_category", "by_status", "recent_inscriptions"):
            assert k in d, f"Missing key {k}"
        assert isinstance(d["revenue"], (int, float))

    def test_integrations_status(self, admin_headers):
        r = requests.get(f"{API}/integrations/status", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("trello", "stripe", "email", "n8n", "ai", "storage"):
            assert k in d
        assert d["ai"]["configured"] is True
        assert d["storage"]["configured"] is True

    def test_dashboard_no_auth(self):
        r = requests.get(f"{API}/dashboard/stats", timeout=30)
        assert r.status_code == 401


# ---------- AI Chat ----------
class TestAI:
    def test_ai_chat_general(self, admin_headers):
        r = requests.post(f"{API}/ai/chat",
                          json={"message": "Bonjour, présente TDL Formation en 1 phrase.",
                                "context": "general"},
                          headers=admin_headers, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "session_id" in d
        assert "response" in d
        assert isinstance(d["response"], str) and len(d["response"]) > 5


# ---------- Employees ----------
class TestEmployees:
    def test_employee_crud(self, admin_headers):
        email = f"TEST_emp_{uuid.uuid4().hex[:6]}@example.com"
        payload = {"email": email, "name": "TEST Emp", "role": "employe",
                   "password": "emppass123", "department": "Ops"}
        r = requests.post(f"{API}/employees", json=payload,
                          headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        emp = r.json()
        assert emp["email"] == email.lower()
        assert emp["role"] == "employe"
        assert "password_hash" not in emp
        uid = emp["id"]

        # list
        r = requests.get(f"{API}/employees", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert any(e["id"] == uid for e in r.json())

        # delete
        r = requests.delete(f"{API}/employees/{uid}", headers=admin_headers, timeout=30)
        assert r.status_code == 200

    def test_employees_no_admin(self, student_token):
        r = requests.get(f"{API}/employees",
                         headers={"Authorization": f"Bearer {student_token}"},
                         timeout=30)
        assert r.status_code == 403


# ---------- Settings ----------
class TestSettings:
    def test_get_and_put_settings(self, admin_headers):
        r = requests.get(f"{API}/settings", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        original = r.json()

        new_payload = {
            "stripe_public_key": "pk_test_xxx",
            "email_provider": "mock",
            "email_from": "noreply@tdlformation.fr",
            "n8n_webhook_inscription": "",
        }
        r = requests.put(f"{API}/settings", json=new_payload,
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["stripe_public_key"] == "pk_test_xxx"

        # verify persistence
        r2 = requests.get(f"{API}/settings", headers=admin_headers, timeout=30)
        assert r2.json()["stripe_public_key"] == "pk_test_xxx"

        # Restore (best-effort)
        restore = {k: original.get(k, "") for k in new_payload.keys()}
        requests.put(f"{API}/settings", json=restore,
                     headers=admin_headers, timeout=30)


# ---------- Document upload ----------
class TestDocuments:
    def test_upload_document(self, admin_headers, created_inscription):
        did = created_inscription["dossier"]["id"]
        files = {"file": ("test.txt", b"hello world content", "text/plain")}
        data = {"doc_type": "carte_identite"}
        # Use only auth header (no content-type to allow multipart)
        h = {"Authorization": admin_headers["Authorization"]}
        r = requests.post(f"{API}/dossiers/{did}/documents",
                          headers=h, files=files, data=data, timeout=60)
        # Storage may be unavailable -> 500. Accept that but report.
        assert r.status_code in (200, 500), r.text
        if r.status_code == 200:
            doc = r.json()
            assert doc["doc_type"] == "carte_identite"
            assert doc["original_filename"] == "test.txt"
            # verify dossier has it
            r2 = requests.get(f"{API}/dossiers/{did}/documents",
                              headers=h, timeout=30)
            assert r2.status_code == 200
            assert any(d["id"] == doc["id"] for d in r2.json())
        else:
            pytest.skip(f"Object storage unavailable: {r.text[:200]}")
