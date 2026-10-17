# APK-herinneringen (iteration 5): cron endpoint auth/idempotency, reminder logic, overview + manual run, RBAC
# NOTE: sends REAL emails, only to delivered@resend.dev (2 expected: TESTAPK2 via cron, TESTAPK7 via manual run)
import time
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
SECRET = ENV["WEBHOOK_CRON_SECRET"]
OK_MAIL = "delivered@resend.dev"
PW = "Test123!x"
TODAY = datetime.now(timezone.utc).date()
PLATES = ["TESTAPK2", "TESTAPK3", "TESTAPK4", "TESTAPK5", "TESTAPK6", "TESTAPK7", "GZ123X"]
MON, KL = "test_apk_monteur@example.com", "test_apk_klant@example.com"


def d(n):
    return (TODAY + timedelta(days=n)).strftime("%d-%m-%Y")


def veh(k, days, email=OK_MAIL, **kw):
    v = {"kenteken": k, "merk": "Test", "model": "Apk", "bouwjaar": "2015", "kleur": "", "brandstof": "",
         "apk_vervaldatum": d(days), "owner_name": "TEST Eigenaar", "owner_email": email, "owner_phone": "",
         "created_at": datetime.now(timezone.utc).isoformat()}
    v.update(kw)
    db.vehicles.delete_many({"kenteken": k})
    db.vehicles.insert_one(v)


def seed_user(email, role):
    db.users.delete_many({"email": email})
    db.users.insert_one({"id": str(uuid.uuid4()), "email": email, "name": "TEST " + role, "phone": "",
                         "password_hash": bcrypt.hashpw(PW.encode(), bcrypt.gensalt()).decode(),
                         "role": role, "status": "active", "created_at": datetime.now(timezone.utc).isoformat()})


def login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def get(k):
    return db.vehicles.find_one({"kenteken": k}, {"_id": 0})


@pytest.fixture(scope="module")
def ctx():
    if not _s597_safe():
        pytest.skip("S597PJ would be mailed")
    veh("TESTAPK2", 10)                       # should be mailed
    veh("TESTAPK3", 45)                       # >30 days -> skip
    veh("TESTAPK4", -5)                       # expired -> skip
    veh("TESTAPK5", 10, email="")             # no email -> skip
    veh("TESTAPK6", 10, apk_reminders_off=True)  # off -> skip
    veh("GZ123X", 12)                         # real plate: RDW corrects date -> not mailed
    seed_user(MON, "monteur")
    seed_user(KL, "klant")
    c = {"staff": login("ori@merkanic.nl", "Merkanic1!"), "mon": login(MON, PW), "kl": login(KL, PW),
         "run_id": "TEST_" + str(uuid.uuid4())}
    yield c
    db.vehicles.delete_many({"kenteken": {"$in": PLATES + ["TESTAPK1"]}})
    db.users.delete_many({"email": {"$in": [MON, KL]}})
    db.apk_reminder_log.delete_many({})
    db.cron_runs.delete_many({})


def _s597_safe():
    v = get("S597PJ")
    if not v or not v.get("owner_email") or v.get("apk_reminders_off"):
        return True
    p = datetime.strptime(v["apk_vervaldatum"], "%d-%m-%Y").date()
    return not (0 <= (p - TODAY).days <= 30)


def test_s597_outside_window():
    assert _s597_safe(), "S597PJ would be mailed - abort"


def test_cron_no_auth(ctx):
    assert requests.post(f"{API}/cron/apk-reminders", timeout=20).status_code == 401
    r = requests.post(f"{API}/cron/apk-reminders", headers={"Authorization": "Bearer wrong"}, timeout=20)
    assert r.status_code == 401
    r = requests.post(f"{API}/cron/apk-reminders", headers={"Authorization": SECRET}, timeout=20)
    assert r.status_code == 401


def test_cron_accepted_and_background(ctx):
    h = {"Authorization": f"Bearer {SECRET}", "X-Webhook-Id": ctx["run_id"]}
    t = time.time()
    start = datetime.now(timezone.utc).isoformat()
    r = requests.post(f"{API}/cron/apk-reminders", headers=h, json={}, timeout=20)
    assert r.status_code == 200 and r.json() == {"status": "accepted"}
    assert time.time() - t < 5, "cron did not ack quickly"
    log = None
    for _ in range(30):
        log = db.apk_reminder_log.find_one({"trigger": "cron", "at": {"$gt": start}}, sort=[("at", -1)])
        if log:
            break
        time.sleep(1)
    assert log, "background run did not complete"
    ctx["cron_log"] = log
    assert "TESTAPK2" in log["sent"]
    for k in ["TESTAPK3", "TESTAPK4", "TESTAPK5", "TESTAPK6", "GZ123X", "TESTAPK1", "S597PJ"]:
        assert k not in log["sent"], k


def test_cron_duplicate(ctx):
    h = {"Authorization": f"Bearer {SECRET}", "X-Webhook-Id": ctx["run_id"]}
    r = requests.post(f"{API}/cron/apk-reminders", headers=h, timeout=20)
    assert r.status_code == 200 and r.json() == {"status": "duplicate"}


def test_vehicle_state_after_cron(ctx):
    v2 = get("TESTAPK2")
    assert v2["apk_reminder_for"] == d(10) and v2.get("apk_reminder_sent_at")
    for k in ["TESTAPK3", "TESTAPK4", "TESTAPK5", "TESTAPK6"]:
        assert not get(k).get("apk_reminder_for"), k
    gz = get("GZ123X")
    assert gz["apk_vervaldatum"] == "21-06-2027", gz
    assert not gz.get("apk_reminder_for")


def test_overview_staff(ctx):
    for who in ("staff", "mon"):
        r = requests.get(f"{API}/apk-reminders", headers=ctx[who], timeout=20)
        assert r.status_code == 200, r.text
    data = r.json()
    assert data["window_days"] == 30 and data["last_run"]["trigger"] in ("cron", "handmatig")
    rows = {x["kenteken"]: x for x in data["vehicles"]}
    assert rows["TESTAPK2"]["days_left"] == 10 and rows["TESTAPK2"]["reminder_sent_at"]
    assert rows["TESTAPK3"]["days_left"] == 45 and rows["TESTAPK3"]["reminder_sent_at"] is None
    assert rows["TESTAPK4"]["days_left"] == -5
    assert rows["TESTAPK6"]["reminders_off"] is True
    assert rows["TESTAPK5"]["owner_email"] == ""
    assert "GZ123X" not in rows  # corrected to 2027
    assert "_id" not in data["last_run"]
    days = [x["days_left"] for x in data["vehicles"]]
    assert days == sorted(days)


def test_overview_klant_forbidden(ctx):
    assert requests.get(f"{API}/apk-reminders", headers=ctx["kl"], timeout=20).status_code == 403
    assert requests.get(f"{API}/apk-reminders", timeout=20).status_code == 401


def test_run_rbac(ctx):
    assert requests.post(f"{API}/apk-reminders/run", headers=ctx["mon"], timeout=20).status_code == 403
    assert requests.post(f"{API}/apk-reminders/run", headers=ctx["kl"], timeout=20).status_code == 403
    assert requests.post(f"{API}/apk-reminders/run", timeout=20).status_code == 401


def test_run_manual_no_resend_and_new(ctx):
    assert _s597_safe()
    veh("TESTAPK7", 30)  # boundary day 30 -> should be mailed
    r = requests.post(f"{API}/apk-reminders/run", headers=ctx["staff"], timeout=90)
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["trigger"] == "handmatig"
    assert res["sent"] == ["TESTAPK7"], res
    assert get("TESTAPK7")["apk_reminder_for"] == d(30)


def test_new_apk_date_triggers_again(ctx):
    # change APK date on TESTAPK2 via PATCH -> new reminder status (not sent for new date yet)
    r = requests.patch(f"{API}/vehicles/TESTAPK2", headers=ctx["staff"], json={"apk_vervaldatum": d(50)}, timeout=20)
    assert r.status_code == 200
    rows = {x["kenteken"]: x for x in requests.get(f"{API}/apk-reminders", headers=ctx["staff"], timeout=20).json()["vehicles"]}
    assert rows["TESTAPK2"]["reminder_sent_at"] is None


def test_patch_reminders_off(ctx):
    r = requests.patch(f"{API}/vehicles/TESTAPK3", headers=ctx["staff"], json={"apk_reminders_off": True}, timeout=20)
    assert r.status_code == 200 and r.json()["apk_reminders_off"] is True
    assert get("TESTAPK3")["apk_reminders_off"] is True
    r = requests.patch(f"{API}/vehicles/TESTAPK3", headers=ctx["staff"], json={"apk_reminders_off": False}, timeout=20)
    assert get("TESTAPK3")["apk_reminders_off"] is False
