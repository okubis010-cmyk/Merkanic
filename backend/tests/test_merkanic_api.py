# Merkanic workshop portal - backend API regression tests
import os
import re
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "ori@merkanic.nl", "password": "Merkanic1!"}
MON = {"name": "TEST_ Monteur Piet", "email": "test_monteur_api@merkanic-test.nl", "password": "Test1234!"}
KLANT = {"name": "TEST_ Klant Jan", "email": "test_klant_api@merkanic-test.nl", "password": "Test1234!"}
PLATE = "TEST01"
PLATE2 = "TEST02"

_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
mdb = _mongo[os.environ.get("DB_NAME", "test_database")]

S = {}  # shared state between ordered tests


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def login(email, password):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": password})


def seed_pending(u):
    """Mirror of /auth/register without sending a real email (email quota). Real register is covered once."""
    import uuid, secrets, bcrypt
    from datetime import datetime, timezone, timedelta
    uid = str(uuid.uuid4())
    mdb.users.insert_one({"id": uid, "email": u["email"], "name": u["name"], "phone": "",
                          "password_hash": bcrypt.hashpw(u["password"].encode(), bcrypt.gensalt()).decode(),
                          "role": None, "status": "pending", "created_at": datetime.now(timezone.utc).isoformat()})
    tok = secrets.token_urlsafe(32)
    mdb.approval_tokens.insert_one({"token": tok, "user_id": uid, "used": False,
                                    "expires_at": datetime.now(timezone.utc) + timedelta(days=14)})
    return uid


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    emails = [MON["email"], KLANT["email"], "test_brute@merkanic-test.nl"]
    ids = [u["id"] for u in mdb.users.find({"email": {"$in": emails}})]
    mdb.users.delete_many({"email": {"$in": emails}})
    mdb.approval_tokens.delete_many({"user_id": {"$in": ids}})
    mdb.vehicles.delete_many({"kenteken": {"$in": [PLATE, PLATE2]}})
    mdb.workorders.delete_many({"kenteken": {"$in": [PLATE, PLATE2]}})
    mdb.login_attempts.delete_many({"identifier": {"$regex": "test_brute"}})


# ---------- Auth ----------
def test_admin_login_and_cookie():
    r = login(**ADMIN)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["role"] == "beheerder" and d["user"]["status"] == "active"
    assert isinstance(d["token"], str) and d["token"]
    sc = r.headers.get("set-cookie", "")
    assert "access_token=" in sc and "HttpOnly" in sc
    S["admin"] = d["token"]
    me = requests.get(f"{API}/auth/me", headers=hdr(d["token"]))
    assert me.status_code == 200 and me.json()["email"] == ADMIN["email"]
    assert "password_hash" not in me.json()


def test_bcrypt_hash_format():
    u = mdb.users.find_one({"email": ADMIN["email"]})
    assert u["password_hash"].startswith("$2b$")


def test_unauth_401():
    assert requests.get(f"{API}/workorders").status_code == 401
    assert requests.get(f"{API}/auth/me", headers=hdr("garbage")).status_code == 401


def test_brute_force_lockout():
    mdb.login_attempts.delete_many({"identifier": {"$regex": "test_brute"}})
    codes = [login("test_brute@merkanic-test.nl", "wrong").status_code for _ in range(6)]
    assert codes[:5] == [401] * 5
    assert codes[5] == 429


def test_cors_credentials():
    r = requests.options(f"{API}/auth/login", headers={"Origin": BASE_URL, "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") == BASE_URL
    assert r.headers.get("access-control-allow-credentials") == "true"


# ---------- Registration / approval ----------
def test_register_monteur_pending_blocked():
    if os.environ.get("REAL_REGISTER") == "1":
        r = requests.post(f"{API}/auth/register", json=MON)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending"
    else:
        seed_pending(MON)
    dup = requests.post(f"{API}/auth/register", json=MON)
    assert dup.status_code == 400
    lr = login(MON["email"], MON["password"])
    assert lr.status_code == 403
    assert "wacht" in lr.json()["detail"].lower() and "goedkeuring" in lr.json()["detail"].lower()


def test_email_link_approval_single_use():
    u = mdb.users.find_one({"email": MON["email"]})
    tok = mdb.approval_tokens.find_one({"user_id": u["id"]})["token"]
    g = requests.get(f"{API}/approve/{tok}", params={"role": "monteur"})
    assert g.status_code == 200 and "text/html" in g.headers["content-type"]
    assert "Bevestig" in g.text and "Monteur" in g.text and "<form" in g.text
    # GET must not activate
    assert mdb.users.find_one({"email": MON["email"]})["status"] == "pending"
    bad = requests.get(f"{API}/approve/{tok}", params={"role": "hacker"})
    assert "Onbekende rol" in bad.text
    p = requests.post(f"{API}/approve/{tok}", data={"role": "monteur"})
    assert p.status_code == 200 and "Gelukt" in p.text
    db_u = mdb.users.find_one({"email": MON["email"]})
    assert db_u["status"] == "active" and db_u["role"] == "monteur"
    again = requests.post(f"{API}/approve/{tok}", data={"role": "beheerder"})
    assert "niet meer geldig" in again.text
    assert mdb.users.find_one({"email": MON["email"]})["role"] == "monteur"
    lr = login(MON["email"], MON["password"])
    assert lr.status_code == 200
    S["mon"] = lr.json()["token"]
    S["mon_id"] = lr.json()["user"]["id"]


def test_monteur_permissions():
    assert requests.get(f"{API}/users", headers=hdr(S["mon"])).status_code == 403
    assert requests.get(f"{API}/workorders", headers=hdr(S["mon"])).status_code == 200
    m = requests.get(f"{API}/monteurs", headers=hdr(S["admin"])).json()
    assert any(x["id"] == S["mon_id"] for x in m)


# ---------- RDW ----------
def test_rdw_lookup():
    r = requests.get(f"{API}/rdw/GZ-123-X", headers=hdr(S["admin"]), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["kenteken"] == "GZ123X" and d["merk"] == "Renault" and "Captur" in d["model"]
    nf = requests.get(f"{API}/rdw/ZZ999ZZ", headers=hdr(S["admin"]), timeout=30)
    assert nf.status_code == 404


# ---------- Werkorders ----------
def test_templates():
    t = {x["key"]: x for x in requests.get(f"{API}/templates", headers=hdr(S["admin"])).json()}
    assert len(t["grote_beurt"]["checklist"]) == 18
    assert {"kleine_beurt", "apk", "banden_wissel", "diagnose"} <= set(t)


def test_create_workorders_volgnummer():
    body = {"vehicle": {"kenteken": "test-01", "merk": "TEST_Merk", "model": "X", "owner_name": "TEST_ Owner"},
            "km_stand": 120000, "template": "grote_beurt", "status": "Gepland",
            "opmerking": "TEST_ interne opmerking", "opmerking_intern": True}
    r = requests.post(f"{API}/workorders", json=body, headers=hdr(S["admin"]))
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["kenteken"] == PLATE and o["volgnummer"] == 1 and len(o["checklist"]) == 18
    assert re.match(r"WO-\d{5}", o["number"]) and o["comments"][0]["internal"] is True
    S["o1"] = o
    body2 = {"vehicle": {"kenteken": PLATE}, "km_stand": 125000, "template": "banden_wissel",
             "monteur_id": S["mon_id"]}
    r2 = requests.post(f"{API}/workorders", json=body2, headers=hdr(S["mon"]))  # monteur may create
    assert r2.status_code == 200, r2.text
    o2 = r2.json()
    assert o2["volgnummer"] == 2 and o2["monteur_name"] == MON["name"]
    S["o2"] = o2
    v = requests.get(f"{API}/vehicles/{PLATE}", headers=hdr(S["admin"])).json()
    assert [x["volgnummer"] for x in v["orders"]] == [1, 2]
    assert v["vehicle"]["merk"] == "TEST_Merk"  # not wiped by second order
    assert v["vehicle"]["last_km"] == 125000 and len(v["history"]) >= 3


def test_create_workorder_validation():
    base = {"vehicle": {"kenteken": PLATE}, "km_stand": 1, "template": "nope"}
    assert requests.post(f"{API}/workorders", json=base, headers=hdr(S["admin"])).status_code == 400
    base["template"] = "apk"; base["status"] = "Bogus"
    assert requests.post(f"{API}/workorders", json=base, headers=hdr(S["admin"])).status_code == 400
    base["status"] = "Gepland"; base["km_stand"] = -5
    assert requests.post(f"{API}/workorders", json=base, headers=hdr(S["admin"])).status_code == 422


def test_patch_workorder_and_checklist_comments():
    oid = S["o1"]["id"]
    r = requests.patch(f"{API}/workorders/{oid}", json={"status": "In behandeling", "monteur_id": S["mon_id"],
                                                         "km_stand": 120500}, headers=hdr(S["admin"]))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "In behandeling" and d["monteur_name"] == MON["name"] and d["km_stand"] == 120500
    texts = " | ".join(e["text"] for e in d["events"])
    assert "Status gewijzigd" in texts and "Monteur toegewezen" in texts and "Km-stand" in texts
    assert requests.patch(f"{API}/workorders/{oid}", json={"status": "X"}, headers=hdr(S["admin"])).status_code == 400
    item = d["checklist"][0]["id"]
    c = requests.patch(f"{API}/workorders/{oid}/checklist/{item}", json={"done": True}, headers=hdr(S["mon"]))
    assert c.status_code == 200 and c.json()["checklist"][0]["done"] is True
    a = requests.post(f"{API}/workorders/{oid}/checklist", json={"label": "TEST_ extra taak"}, headers=hdr(S["mon"]))
    assert a.status_code == 200 and a.json()["checklist"][-1]["label"] == "TEST_ extra taak"
    p = requests.post(f"{API}/workorders/{oid}/comments", json={"text": "TEST_ publiek", "internal": False}, headers=hdr(S["mon"]))
    assert p.status_code == 200 and len(p.json()["comments"]) == 2
    g = requests.get(f"{API}/workorders/{oid}", headers=hdr(S["admin"])).json()
    assert g["checklist"][0]["done"] is True and len(g["checklist"]) == 19


def test_list_filter_search_stats():
    lst = requests.get(f"{API}/workorders", params={"status": "In behandeling"}, headers=hdr(S["admin"])).json()
    assert all(o["status"] == "In behandeling" for o in lst) and any(o["id"] == S["o1"]["id"] for o in lst)
    q = requests.get(f"{API}/workorders", params={"q": "test-01"}, headers=hdr(S["admin"])).json()
    assert len([o for o in q if o["kenteken"] == PLATE]) == 2
    vq = requests.get(f"{API}/vehicles", params={"q": "TEST_Merk"}, headers=hdr(S["admin"])).json()
    assert any(v["kenteken"] == PLATE and v["order_count"] == 2 for v in vq)
    st = requests.get(f"{API}/stats", headers=hdr(S["admin"])).json()
    assert st["by_status"]["In behandeling"] >= 1 and st["vehicles"] >= 1


# ---------- Klant ----------
def test_klant_scope():
    seed_pending(KLANT)
    kid = mdb.users.find_one({"email": KLANT["email"]})["id"]
    pr = requests.patch(f"{API}/users/{kid}", json={"role": "klant", "status": "active"}, headers=hdr(S["admin"]))
    assert pr.status_code == 200 and pr.json()["role"] == "klant"
    # second vehicle not owned by klant
    requests.post(f"{API}/workorders", json={"vehicle": {"kenteken": PLATE2}, "km_stand": 5, "template": "apk"},
                  headers=hdr(S["admin"]))
    pv = requests.patch(f"{API}/vehicles/{PLATE}", json={"owner_email": KLANT["email"].upper()}, headers=hdr(S["admin"]))
    assert pv.status_code == 200 and pv.json()["owner_email"] == KLANT["email"]
    tok = login(KLANT["email"], KLANT["password"]).json()["token"]
    S["klant"] = tok
    vs = requests.get(f"{API}/vehicles", headers=hdr(tok)).json()
    assert [v["kenteken"] for v in vs] == [PLATE]
    wos = requests.get(f"{API}/workorders", headers=hdr(tok)).json()
    assert {o["kenteken"] for o in wos} == {PLATE} and len(wos) == 2
    o1 = requests.get(f"{API}/workorders/{S['o1']['id']}", headers=hdr(tok)).json()
    assert all(not c["internal"] for c in o1["comments"]) and len(o1["comments"]) == 1
    v = requests.get(f"{API}/vehicles/{PLATE}", headers=hdr(tok)).json()
    assert all(not h.get("internal") for h in v["history"])
    assert "TEST_ interne opmerking" not in str(v)
    assert requests.get(f"{API}/vehicles/{PLATE2}", headers=hdr(tok)).status_code == 404
    other = mdb.workorders.find_one({"kenteken": PLATE2})["id"]
    assert requests.get(f"{API}/workorders/{other}", headers=hdr(tok)).status_code == 404
    assert requests.post(f"{API}/workorders", json={"vehicle": {"kenteken": PLATE}, "km_stand": 1, "template": "apk"},
                         headers=hdr(tok)).status_code == 403
    assert requests.get(f"{API}/stats", headers=hdr(tok)).status_code == 403
    assert requests.patch(f"{API}/workorders/{S['o1']['id']}", json={"status": "Gereed"}, headers=hdr(tok)).status_code == 403
    # klant can't post internal comment
    c = requests.post(f"{API}/workorders/{S['o1']['id']}/comments", json={"text": "TEST_ klantvraag", "internal": True}, headers=hdr(tok))
    assert c.status_code == 200 and c.json()["comments"][-1]["internal"] is False


# ---------- Delete ----------
def test_delete_permissions():
    oid = S["o2"]["id"]
    assert requests.delete(f"{API}/workorders/{oid}", headers=hdr(S["mon"])).status_code == 403
    assert requests.delete(f"{API}/workorders/{oid}", headers=hdr(S["admin"])).status_code == 200
    assert requests.get(f"{API}/workorders/{oid}", headers=hdr(S["admin"])).status_code == 404


def test_admin_cannot_demote_self():
    me = requests.get(f"{API}/auth/me", headers=hdr(S["admin"])).json()
    r = requests.patch(f"{API}/users/{me['id']}", json={"role": "klant"}, headers=hdr(S["admin"]))
    assert r.status_code == 400
