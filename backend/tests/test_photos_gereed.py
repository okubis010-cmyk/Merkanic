# Merkanic iteration_2: werkfoto's upload + klantmail bij Gereed + iteration_1 regressions
import os
import io
import uuid
import bcrypt
import pytest
import requests
from datetime import datetime, timezone
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "ori@merkanic.nl", "password": "Merkanic1!"}
PLATE = "TEST11"       # has owner delivered@resend.dev
PLATE_NO = "TEST12"    # no owner email
PLATE_OTHER = "TEST13"  # other klant's car
KLANT = "delivered@resend.dev"
OTHER_KLANT = "test_other_klant@merkanic-test.nl"
MON = "test_monteur_photo@merkanic-test.nl"
PW = "Test1234!"
BRUTE = "test_brute2@merkanic-test.nl"

mdb = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "test_database")]
S = {}

# 1x1 PNG
PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


def hdr(t):
    return {"Authorization": f"Bearer {t}"}


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def seed_user(email, role, name):
    mdb.users.delete_many({"email": email})
    mdb.users.insert_one({"id": str(uuid.uuid4()), "email": email, "name": name, "phone": "",
                          "password_hash": bcrypt.hashpw(PW.encode(), bcrypt.gensalt()).decode(),
                          "role": role, "status": "active", "created_at": datetime.now(timezone.utc).isoformat()})


def mk_order(tok, plate, owner_email, km=87500, template="kleine_beurt"):
    r = requests.post(f"{API}/workorders", headers=hdr(tok), json={
        "vehicle": {"kenteken": plate, "merk": "TEST", "model": "Auto", "owner_name": "TEST_ Klant",
                    "owner_email": owner_email},
        "template": template, "km_stand": km, "status": "Gepland"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module", autouse=True)
def setup_cleanup():
    seed_user(KLANT, "klant", "TEST_ Klant Resend")
    seed_user(OTHER_KLANT, "klant", "TEST_ Other Klant")
    seed_user(MON, "monteur", "TEST_ Monteur Foto")
    S["admin"] = login(**ADMIN)
    S["klant"] = login(KLANT, PW)
    S["other"] = login(OTHER_KLANT, PW)
    S["mon"] = login(MON, PW)
    yield
    plates = [PLATE, PLATE_NO, PLATE_OTHER]
    mdb.users.delete_many({"email": {"$in": [KLANT, OTHER_KLANT, MON, BRUTE]}})
    mdb.vehicles.delete_many({"kenteken": {"$in": plates}})
    mdb.workorders.delete_many({"kenteken": {"$in": plates}})
    mdb.counters.delete_many({"_id": {"$in": [f"vehicle:{p}" for p in plates]}})
    mdb.login_attempts.delete_many({"identifier": {"$regex": "test_"}})


# ---------- Regression iteration_1 ----------
def test_created_event_text():
    o = mk_order(S["admin"], PLATE, KLANT)
    S["oid"] = o["id"]
    assert o["events"][0]["text"] == "Werkorder aangemaakt (Kleine beurt, 87.500 km)"


def test_volgnummer_unique_after_delete():
    a = mk_order(S["admin"], PLATE_NO, "")
    b = mk_order(S["admin"], PLATE_NO, "")
    assert (a["volgnummer"], b["volgnummer"]) == (1, 2)
    assert requests.delete(f"{API}/workorders/{a['id']}", headers=hdr(S["admin"])).status_code == 200
    c = mk_order(S["admin"], PLATE_NO, "")
    assert c["volgnummer"] == 3
    S["oid_no"] = b["id"]


def test_lockout_by_email():
    mdb.login_attempts.delete_many({"identifier": BRUTE})
    codes = [requests.post(f"{API}/auth/login", json={"email": BRUTE, "password": "x"}).status_code for _ in range(6)]
    assert codes == [401] * 5 + [429]


# ---------- Photos ----------
def test_upload_photo_staff():
    r = requests.post(f"{API}/workorders/{S['oid']}/photos", headers=hdr(S["admin"]),
                      files={"file": ("test.png", PNG, "image/png")}, data={"caption": "TEST_ remblokken"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["photos"]) == 1
    p = d["photos"][0]
    assert p["caption"] == "TEST_ remblokken" and p["content_type"] == "image/png"
    assert "storage_path" not in p and "is_deleted" not in p
    assert any(e["text"] == "Foto toegevoegd: TEST_ remblokken" for e in d["events"])
    S["pid"] = p["id"]


def test_upload_photo_monteur_no_caption():
    r = requests.post(f"{API}/workorders/{S['oid']}/photos", headers=hdr(S["mon"]),
                      files={"file": ("b.png", PNG, "image/png")})
    assert r.status_code == 200, r.text
    assert len(r.json()["photos"]) == 2
    S["pid2"] = r.json()["photos"][1]["id"]


def test_upload_non_image_400():
    r = requests.post(f"{API}/workorders/{S['oid']}/photos", headers=hdr(S["admin"]),
                      files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 400


def test_upload_klant_403():
    r = requests.post(f"{API}/workorders/{S['oid']}/photos", headers=hdr(S["klant"]),
                      files={"file": ("a.png", PNG, "image/png")})
    assert r.status_code == 403


def test_upload_unknown_order_404():
    r = requests.post(f"{API}/workorders/nope/photos", headers=hdr(S["admin"]),
                      files={"file": ("a.png", PNG, "image/png")})
    assert r.status_code == 404


def test_get_photo_staff_and_owner():
    for t in (S["admin"], S["klant"]):
        r = requests.get(f"{API}/workorders/{S['oid']}/photos/{S['pid']}", headers=hdr(t))
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/png")
        assert r.content == PNG


def test_get_photo_other_klant_404():
    mk_order(S["admin"], PLATE_OTHER, OTHER_KLANT)
    r = requests.get(f"{API}/workorders/{S['oid']}/photos/{S['pid']}", headers=hdr(S["other"]))
    assert r.status_code == 404


def test_get_photo_unauth_401():
    assert requests.get(f"{API}/workorders/{S['oid']}/photos/{S['pid']}").status_code == 401


def test_klant_sees_photos_in_order_and_folder():
    d = requests.get(f"{API}/workorders/{S['oid']}", headers=hdr(S["klant"])).json()
    assert {p["id"] for p in d["photos"]} == {S["pid"], S["pid2"]}
    lst = requests.get(f"{API}/workorders", headers=hdr(S["klant"])).json()
    assert any(o["id"] == S["oid"] and o["photo_count"] == 2 for o in lst)


def test_delete_photo_klant_403():
    r = requests.delete(f"{API}/workorders/{S['oid']}/photos/{S['pid2']}", headers=hdr(S["klant"]))
    assert r.status_code == 403


def test_delete_photo_soft():
    r = requests.delete(f"{API}/workorders/{S['oid']}/photos/{S['pid2']}", headers=hdr(S["admin"]))
    assert r.status_code == 200
    assert [p["id"] for p in r.json()["photos"]] == [S["pid"]]
    raw = mdb.workorders.find_one({"id": S["oid"]})
    assert any(p["id"] == S["pid2"] and p["is_deleted"] for p in raw["photos"])
    assert requests.get(f"{API}/workorders/{S['oid']}/photos/{S['pid2']}", headers=hdr(S["admin"])).status_code == 404
    assert requests.delete(f"{API}/workorders/{S['oid']}/photos/bogus", headers=hdr(S["admin"])).status_code == 404


# ---------- Gereed email ----------
def test_gereed_sends_email_event():
    r = requests.patch(f"{API}/workorders/{S['oid']}", headers=hdr(S["admin"]), json={"status": "Gereed"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "Gereed"
    last = d["events"][-1]
    assert last["type"] == "email" and last.get("internal") is True
    assert last["text"] == f"Klant per e-mail geïnformeerd ({KLANT})", last["text"]


def test_gereed_email_event_hidden_from_klant():
    d = requests.get(f"{API}/workorders/{S['oid']}", headers=hdr(S["klant"])).json()
    assert not any(e["type"] == "email" for e in d["events"])
    assert any("Gereed" in e["text"] for e in d["events"])
    v = requests.get(f"{API}/vehicles/{PLATE}", headers=hdr(S["klant"])).json()
    assert not any(h.get("type") == "email" for h in v["history"])


def test_gereed_no_owner_email():
    r = requests.patch(f"{API}/workorders/{S['oid_no']}", headers=hdr(S["admin"]), json={"status": "Gereed"})
    assert r.status_code == 200
    last = r.json()["events"][-1]
    assert last["type"] == "email" and last["internal"] is True
    assert last["text"].startswith("Geen klantmail verstuurd")


def test_non_gereed_status_no_email():
    r = requests.patch(f"{API}/workorders/{S['oid_no']}", headers=hdr(S["admin"]), json={"status": "Afgehaald"})
    assert r.json()["events"][-1]["type"] == "status"
