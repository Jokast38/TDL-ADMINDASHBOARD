"""Blog module tests for TDL Formation backend.

Covers:
- Public blog endpoints (list, detail, view increment, 404)
- Admin blog endpoints (CRUD, role enforcement, slug uniqueness)
- AI generation via Claude Sonnet 4.5 (real API call - 10-30s)
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://tdl-admin-hub.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@tdlformation.fr"
ADMIN_PASSWORD = "admin123"


# ----------- Fixtures -----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def student_token():
    email = f"TEST_blogstudent_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "studentpass123",
                            "name": "Test Blog Student", "role": "etudiant"},
                      timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def student_headers(student_token):
    return {"Authorization": f"Bearer {student_token}",
            "Content-Type": "application/json"}


# Track created post ids for cleanup
_CREATED_IDS = []


@pytest.fixture(scope="module", autouse=True)
def cleanup_blog_posts(admin_headers):
    yield
    for pid in _CREATED_IDS:
        try:
            requests.delete(f"{API}/blog/posts/{pid}",
                            headers=admin_headers, timeout=15)
        except Exception:
            pass


# ----------- Public endpoints -----------
class TestBlogPublic:
    def test_public_list_returns_only_published(self):
        r = requests.get(f"{API}/blog/posts", timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # All items must have status published OR not include drafts
        for it in items:
            # status may be filtered server-side; if present must be 'published'
            if "status" in it:
                assert it["status"] == "published"
            # content should be projected out (excluded)
            assert "content" not in it
            assert "slug" in it
            assert "title" in it

    def test_public_get_seeded_post_and_increments_views(self):
        slug = "caces-r489-tout-savoir-en-2026"
        r1 = requests.get(f"{API}/blog/posts/{slug}", timeout=20)
        assert r1.status_code == 200, r1.text
        p1 = r1.json()
        assert p1["slug"] == slug
        assert "content" in p1
        assert p1.get("status") == "published"
        v1 = p1.get("views", 0)
        # second hit -> views should increase by at least 1
        r2 = requests.get(f"{API}/blog/posts/{slug}", timeout=20)
        assert r2.status_code == 200
        v2 = r2.json().get("views", 0)
        assert v2 >= v1 + 1, f"Views did not increment: {v1} -> {v2}"

    def test_public_get_unknown_slug_returns_404(self):
        r = requests.get(f"{API}/blog/posts/this-slug-does-not-exist-xyz", timeout=20)
        assert r.status_code == 404

    def test_public_list_excludes_drafts(self, admin_headers):
        # create a draft
        payload = {
            "title": f"TEST Draft Post {uuid.uuid4().hex[:6]}",
            "content": "Draft content body",
            "status": "draft",
        }
        c = requests.post(f"{API}/blog/posts", json=payload,
                          headers=admin_headers, timeout=20)
        assert c.status_code == 200, c.text
        post = c.json()
        _CREATED_IDS.append(post["id"])
        # public list shouldn't include this draft slug
        r = requests.get(f"{API}/blog/posts", timeout=20)
        assert r.status_code == 200
        slugs = [it["slug"] for it in r.json()]
        assert post["slug"] not in slugs
        # public detail of draft should 404
        r2 = requests.get(f"{API}/blog/posts/{post['slug']}", timeout=20)
        assert r2.status_code == 404


# ----------- Admin endpoints -----------
class TestBlogAdmin:
    def test_admin_list_includes_drafts(self, admin_headers):
        # ensure a draft exists
        payload = {
            "title": f"TEST Admin Draft {uuid.uuid4().hex[:6]}",
            "content": "Body",
            "status": "draft",
        }
        c = requests.post(f"{API}/blog/posts", json=payload,
                          headers=admin_headers, timeout=20)
        assert c.status_code == 200, c.text
        post = c.json()
        _CREATED_IDS.append(post["id"])

        r = requests.get(f"{API}/blog/admin/posts",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        ids = [it["id"] for it in r.json()]
        assert post["id"] in ids

    def test_admin_get_single_post_with_content(self, admin_headers):
        payload = {
            "title": f"TEST Single {uuid.uuid4().hex[:6]}",
            "content": "FULL_CONTENT_BODY_X",
            "status": "draft",
        }
        c = requests.post(f"{API}/blog/posts", json=payload,
                          headers=admin_headers, timeout=20)
        assert c.status_code == 200
        post = c.json()
        _CREATED_IDS.append(post["id"])

        r = requests.get(f"{API}/blog/admin/posts/{post['id']}",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == post["id"]
        assert body["content"] == "FULL_CONTENT_BODY_X"

    def test_create_post_auto_slug(self, admin_headers):
        payload = {
            "title": f"TEST Auto Slug Title {uuid.uuid4().hex[:6]}",
            "content": "Body",
            "status": "draft",
        }
        c = requests.post(f"{API}/blog/posts", json=payload,
                          headers=admin_headers, timeout=20)
        assert c.status_code == 200, c.text
        post = c.json()
        _CREATED_IDS.append(post["id"])
        assert post["slug"]
        # slug must be lowercased and hyphenated
        assert post["slug"] == post["slug"].lower()
        assert " " not in post["slug"]
        assert post["status"] == "draft"
        assert post["published_at"] is None
        assert post["views"] == 0
        assert post["author_id"]

    def test_create_post_slug_uniqueness(self, admin_headers):
        unique = f"unique-test-slug-{uuid.uuid4().hex[:8]}"
        p1 = requests.post(f"{API}/blog/posts",
                           json={"title": "T1", "slug": unique,
                                 "content": "c1", "status": "draft"},
                           headers=admin_headers, timeout=20)
        assert p1.status_code == 200
        post1 = p1.json()
        _CREATED_IDS.append(post1["id"])
        assert post1["slug"] == unique

        # Same slug requested -> server should append -2
        p2 = requests.post(f"{API}/blog/posts",
                           json={"title": "T2", "slug": unique,
                                 "content": "c2", "status": "draft"},
                           headers=admin_headers, timeout=20)
        assert p2.status_code == 200
        post2 = p2.json()
        _CREATED_IDS.append(post2["id"])
        assert post2["slug"] == f"{unique}-2"

        # Third time -> -3
        p3 = requests.post(f"{API}/blog/posts",
                           json={"title": "T3", "slug": unique,
                                 "content": "c3", "status": "draft"},
                           headers=admin_headers, timeout=20)
        assert p3.status_code == 200
        post3 = p3.json()
        _CREATED_IDS.append(post3["id"])
        assert post3["slug"] == f"{unique}-3"

    def test_update_post_publish_sets_published_at(self, admin_headers):
        # create draft
        payload = {
            "title": f"TEST Publish Flow {uuid.uuid4().hex[:6]}",
            "content": "Body",
            "status": "draft",
        }
        c = requests.post(f"{API}/blog/posts", json=payload,
                          headers=admin_headers, timeout=20)
        assert c.status_code == 200
        post = c.json()
        _CREATED_IDS.append(post["id"])
        assert post["published_at"] is None

        # Update to published
        upd = dict(payload)
        upd["status"] = "published"
        u = requests.put(f"{API}/blog/posts/{post['id']}", json=upd,
                        headers=admin_headers, timeout=20)
        assert u.status_code == 200, u.text
        updated = u.json()
        assert updated["status"] == "published"
        assert updated["published_at"] is not None

        # GET via public should now succeed
        pub = requests.get(f"{API}/blog/posts/{updated['slug']}", timeout=20)
        assert pub.status_code == 200

    def test_delete_post_admin_only(self, admin_headers):
        payload = {
            "title": f"TEST Delete {uuid.uuid4().hex[:6]}",
            "content": "Body",
            "status": "draft",
        }
        c = requests.post(f"{API}/blog/posts", json=payload,
                          headers=admin_headers, timeout=20)
        assert c.status_code == 200
        post = c.json()
        d = requests.delete(f"{API}/blog/posts/{post['id']}",
                            headers=admin_headers, timeout=20)
        assert d.status_code == 200
        # admin GET should 404
        g = requests.get(f"{API}/blog/admin/posts/{post['id']}",
                         headers=admin_headers, timeout=20)
        assert g.status_code == 404


# ----------- Role enforcement -----------
class TestBlogRoles:
    def test_student_cannot_create_post(self, student_headers):
        r = requests.post(f"{API}/blog/posts",
                          json={"title": "Nope", "content": "x",
                                "status": "draft"},
                          headers=student_headers, timeout=20)
        assert r.status_code == 403

    def test_student_cannot_list_admin_posts(self, student_headers):
        r = requests.get(f"{API}/blog/admin/posts",
                         headers=student_headers, timeout=20)
        assert r.status_code == 403

    def test_student_cannot_generate(self, student_headers):
        r = requests.post(f"{API}/blog/generate",
                          json={"topic": "anything", "category": "actualites"},
                          headers=student_headers, timeout=20)
        assert r.status_code == 403

    def test_unauthenticated_cannot_create(self):
        r = requests.post(f"{API}/blog/posts",
                          json={"title": "Nope", "content": "x",
                                "status": "draft"},
                          timeout=20)
        assert r.status_code == 401


# ----------- AI generation (Claude Sonnet 4.5) -----------
class TestBlogAI:
    def test_generate_post_via_claude(self, admin_headers):
        # Real call - timeout 90s
        r = requests.post(f"{API}/blog/generate",
                          json={"topic": "Le CACES R489 catégorie 3 en 2026",
                                "category": "formations",
                                "tone": "professionnel",
                                "keywords": "CACES, chariot, formation"},
                          headers=admin_headers, timeout=90)
        assert r.status_code == 200, f"AI generate failed: {r.status_code} {r.text[:500]}"
        data = r.json()
        # Required fields
        for key in ["title", "excerpt", "content", "tags",
                    "seo_title", "seo_description", "category", "status"]:
            assert key in data, f"Missing key: {key}"
        assert data["status"] == "draft"
        assert data["category"] == "formations"
        assert isinstance(data["tags"], list)
        assert len(data["seo_title"]) <= 60
        assert len(data["seo_description"]) <= 160
        # Content should be non-trivial
        assert len(data["content"]) > 100, \
            f"Content suspiciously short: {len(data['content'])}"
