# Afspraken (appointments) API + domain/base_url checks (iteration 4)
# NOTE: each successful POST /api/public/appointments sends a REAL email to info@merkanic.nl.
# This file performs exactly 2 successful creations. Other appointments are inserted directly in mongo.
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import pytest
import requests
from pymongo import MongoClient

BASE_URL = None
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL"):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
ENV = {}
with open("/app/backend/.env") as f:
    for line in f:
        if "=" in line:
            k, v = line.strip().split("=", 1)
            ENV[k] = v.strip('"')

db = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
API = f"{BASE_URL}/api"
FUTURE = (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat()
PAST = (datetime.now(timezone.utc) - timedelta(days=2)).date().isoformat()
KLANT_A = "delivered@resend.dev"
KLANT_B = "test_klantb@example.com"
PW = "Klant123!"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def seed_user(email, name, role="klant"):
    db.users.delete_many({"email": email})
    u = {"id": str(uuid.uuid4()), "email": email, "name": name, "phone": "0611111111",
         "password_hash": bcrypt.hashpw(PW.encode(), bcrypt.gensalt()).decode(),
         "role": role, "status": "active", "created_at": now_iso()}
    db.users.insert_one(u)
    return u["id"]


def seed_appt(email, user_id=None, status="Aangevraagd", kenteken="TEST01"):
    a = {"id": "TEST_" + str(uuid.uuid4()), "name": "TEST Seed", "email": email, "phone": "", "kenteken": kenteken,
         "service": "kleine_beurt", "service_name": "Kleine beurt", "preferred_date": FUTURE, "dagdeel": "Ochtend",
         "message": "seed", "status": status, "confirmed_date": "", "confirmed_time": "", "staff_note": "",
         "user_id": user_id, "created_at": now_iso(), "updated_at": now_iso()}
    db.appointments.insert_one(a)
    return a["id"]


def login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def ctx():
    a_id = seed_user(KLANT_A, "TEST Klant A")
    b_id = seed_user(KLANT_B, "TEST Klant B")
    c = {"a_id": a_id, "b_id": b_id, "staff": login("ori@merkanic.nl", "Merkanic1!"),
         "ka": login(KLANT_A, PW), "kb": login(KLANT_B, PW), "created": []}
    yield c
    db.appointments.delete_many({"$or": [{"id": {"$regex": "^TEST_"}}, {"id": {"$in": c["created"]}},
                                         {"email": {"$in": [KLANT_A, KLANT_B, "test_ratelimit@example.com", "test_anon@example.com"]}}]})
    db.users.delete_many({"email": {"$in": [KLANT_A, KLANT_B]}})


def payload(**kw):
    p = {"name": "TEST Anon", "email": "test_anon@example.com", "phone": "0612345678", "kenteken": "te-st-01",
         "service": "kleine_beurt", "preferred_date": FUTURE, "dagdeel": "Ochtend", "message": "TEST bericht"}
    p.update(kw)
    return p


# Public options
def test_options():
    r = requests.get(f"{API}/public/appointment-options", timeout=20)
    assert r.status_code == 200
    d = r.json()
    keys = [s["key"] for s in d["services"]]
    assert "kleine_beurt" in keys and "overig" in keys and "vrij" not in keys
    assert d["dagdelen"] == ["Geen voorkeur", "Ochtend", "Middag"]


# Validation (no email sent on 4xx)
@pytest.mark.parametrize("kw,code", [({"service": "bogus"}, 400), ({"dagdeel": "Nacht"}, 400),
                                     ({"preferred_date": PAST}, 400), ({"preferred_date": "31-12-2030"}, 400),
                                     ({"email": "notanemail"}, 422), ({"kenteken": "AB"}, 422), ({"name": "A"}, 422)])
def test_validation(ctx, kw, code):
    r = requests.post(f"{API}/public/appointments", json=payload(**kw), timeout=20)
    assert r.status_code == code, r.text


# Rate limit: 3 seeded docs -> 4th request 429
def test_rate_limit_429(ctx):
    for _ in range(3):
        seed_appt("test_ratelimit@example.com")
    r = requests.post(f"{API}/public/appointments", json=payload(email="TEST_RateLimit@example.com"), timeout=20)
    assert r.status_code == 429, r.text


# Anonymous creation (EMAIL #1 to info@)
def test_anonymous_create(ctx):
    r = requests.post(f"{API}/public/appointments", json=payload(), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "_id" not in d
    assert d["status"] == "Aangevraagd" and d["user_id"] is None and d["kenteken"] == "TEST01"
    assert d["service_name"] == "Kleine beurt"
    ctx["created"].append(d["id"])
    ctx["anon_id"] = d["id"]
    lst = requests.get(f"{API}/appointments", headers=ctx["staff"], timeout=20).json()
    assert any(x["id"] == d["id"] for x in lst)


# Logged-in klant creation stamps user_id + account email (EMAIL #2 to info@)
def test_klant_create_uses_account(ctx):
    r = requests.post(f"{API}/public/appointments", headers=ctx["ka"],
                      json=payload(name="TEST Klant A", email="spoof@example.com", kenteken="TEST02"), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user_id"] == ctx["a_id"] and d["email"] == KLANT_A
    ctx["created"].append(d["id"])
    ctx["ka_appt"] = d["id"]


def test_list_requires_auth():
    assert requests.get(f"{API}/appointments", timeout=20).status_code == 401


def test_klant_sees_only_own(ctx):
    other = seed_appt("someoneelse@example.com", kenteken="TEST03")
    la = requests.get(f"{API}/appointments", headers=ctx["ka"], timeout=20).json()
    ids = [x["id"] for x in la]
    assert ctx["ka_appt"] in ids and other not in ids and ctx["anon_id"] not in ids
    lb = requests.get(f"{API}/appointments", headers=ctx["kb"], timeout=20).json()
    assert ctx["ka_appt"] not in [x["id"] for x in lb]


def test_staff_filter(ctx):
    r = requests.get(f"{API}/appointments", params={"status": "Aangevraagd"}, headers=ctx["staff"], timeout=20)
    assert r.status_code == 200 and all(x["status"] == "Aangevraagd" for x in r.json())


def test_klant_cannot_patch(ctx):
    r = requests.patch(f"{API}/appointments/{ctx['ka_appt']}", json={"status": "Bevestigd"}, headers=ctx["ka"], timeout=20)
    assert r.status_code == 403


def test_klant_cannot_cancel_others(ctx):
    r = requests.post(f"{API}/appointments/{ctx['ka_appt']}/cancel", headers=ctx["kb"], timeout=20)
    assert r.status_code == 404


def test_staff_patch_invalid_status_and_404(ctx):
    assert requests.patch(f"{API}/appointments/{ctx['ka_appt']}", json={"status": "X"}, headers=ctx["staff"], timeout=20).status_code == 400
    assert requests.patch(f"{API}/appointments/nope", json={"status": "Bevestigd"}, headers=ctx["staff"], timeout=20).status_code == 404


# Confirm user appointment -> mail to klant account (delivered@resend.dev)
def test_confirm_sends_mail_to_klant(ctx):
    r = requests.patch(f"{API}/appointments/{ctx['ka_appt']}", headers={**ctx["staff"], "Origin": "https://merkanic.nl"},
                       json={"status": "Bevestigd", "confirmed_date": FUTURE, "confirmed_time": "09:30", "staff_note": "TEST tot dan"}, timeout=40)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "Bevestigd" and d["confirmed_time"] == "09:30" and d["mail_sent"] is True
    g = [x for x in requests.get(f"{API}/appointments", headers=ctx["ka"], timeout=20).json() if x["id"] == ctx["ka_appt"]][0]
    assert g["status"] == "Bevestigd" and g["staff_note"] == "TEST tot dan" and "mail_sent" not in g


def test_confirm_anonymous_no_mail(ctx):
    r = requests.patch(f"{API}/appointments/{ctx['anon_id']}", headers=ctx["staff"], json={"status": "Bevestigd"}, timeout=20)
    assert r.status_code == 200 and r.json()["mail_sent"] is None


def test_staff_afgerond(ctx):
    r = requests.patch(f"{API}/appointments/{ctx['anon_id']}", headers=ctx["staff"], json={"status": "Afgerond"}, timeout=20)
    assert r.status_code == 200 and r.json()["status"] == "Afgerond"
    # cannot cancel an Afgerond appointment
    assert requests.post(f"{API}/appointments/{ctx['anon_id']}/cancel", headers=ctx["staff"], timeout=20).status_code == 404


def test_klant_cancel_own(ctx):
    r = requests.post(f"{API}/appointments/{ctx['ka_appt']}/cancel", headers=ctx["ka"], timeout=20)
    assert r.status_code == 200 and r.json()["status"] == "Geannuleerd"


def test_dashboard_pending_count(ctx):
    seed_appt(KLANT_B, user_id=ctx["b_id"], kenteken="TEST04")
    r = requests.get(f"{API}/stats", headers=ctx["staff"], timeout=20)
    assert r.status_code == 200
    assert r.json()["pending_appointments"] == db.appointments.count_documents({"status": "Aangevraagd"}) >= 1


# Approval page form action relative
def test_approve_page_relative_action(ctx):
    tok = "TEST_" + uuid.uuid4().hex
    db.approval_tokens.insert_one({"token": tok, "user_id": ctx["b_id"], "used": False, "created_at": now_iso(),
                                   "expires_at": datetime.now(timezone.utc) + timedelta(days=1)})
    try:
        r = requests.get(f"{API}/approve/{tok}", params={"role": "klant"}, timeout=20)
        assert r.status_code == 200
        assert f'action="/api/approve/{tok}"' in r.text, r.text[:500]
        assert "http" not in r.text.split("<form")[1].split(">")[0]
    finally:
        db.approval_tokens.delete_many({"token": tok})
