# Seed/cleanup for iteration-4 UI tests: python seed_ui_iter4.py seed|clean
import sys, uuid
from datetime import datetime, timedelta, timezone
import bcrypt
from pymongo import MongoClient

db = MongoClient("mongodb://localhost:27017")["test_database"]
now = lambda: datetime.now(timezone.utc).isoformat()
FUT = (datetime.now(timezone.utc) + timedelta(days=5)).date().isoformat()
EMAILS = ["delivered@resend.dev", "test_klantb@example.com"]

if sys.argv[1] == "seed":
    ids = {}
    for e, n in [(EMAILS[0], "TEST Klant A"), (EMAILS[1], "TEST Klant B")]:
        db.users.delete_many({"email": e})
        uid = str(uuid.uuid4()); ids[e] = uid
        db.users.insert_one({"id": uid, "email": e, "name": n, "phone": "0611111111", "role": "klant", "status": "active",
                             "password_hash": bcrypt.hashpw(b"Klant123!", bcrypt.gensalt()).decode(), "created_at": now()})
    def appt(aid, email, uid, kent, svc, svcn, name, phone, msg):
        db.appointments.insert_one({"id": aid, "name": name, "email": email, "phone": phone, "kenteken": kent, "service": svc,
            "service_name": svcn, "preferred_date": FUT, "dagdeel": "Middag", "message": msg, "status": "Aangevraagd",
            "confirmed_date": "", "confirmed_time": "", "staff_note": "", "user_id": uid, "created_at": now(), "updated_at": now()})
    appt("TEST_A1", EMAILS[0], ids[EMAILS[0]], "TESTA1", "kleine_beurt", "Kleine beurt", "TEST Klant A", "0611111111", "Piept bij remmen")
    appt("TEST_ANON", "test_anon2@example.com", None, "TESTAN", "apk", "APK", "TEST Anon Twee", "0622222222", "TEST anon opmerking")
    appt("TEST_B1", EMAILS[1], ids[EMAILS[1]], "TESTB1", "kleine_beurt", "Kleine beurt", "TEST Klant B", "", "B's own")
    print("seeded")
else:
    db.appointments.delete_many({"$or": [{"id": {"$regex": "^TEST_"}}, {"email": {"$in": EMAILS + ["test_anon2@example.com", "test_landing@example.com"]}},
                                         {"kenteken": {"$regex": "^TEST"}}]})
    db.users.delete_many({"email": {"$in": EMAILS}})
    print("cleaned")
