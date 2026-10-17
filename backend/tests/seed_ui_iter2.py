# Seed data for iteration_2 UI test (klant user + TEST21 order). Run with `cleanup` arg to remove.
import os, sys, uuid, bcrypt, requests
from datetime import datetime, timezone
from pymongo import MongoClient
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
mdb = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "test_database")]
K = "delivered@resend.dev"
if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
    mdb.users.delete_many({"email": K}); mdb.vehicles.delete_many({"kenteken": {"$regex": "^TEST"}})
    mdb.workorders.delete_many({"kenteken": {"$regex": "^TEST"}}); mdb.counters.delete_many({"_id": {"$regex": "^vehicle:TEST"}})
    mdb.login_attempts.delete_many({}); print("cleaned"); sys.exit()
mdb.users.delete_many({"email": K})
mdb.users.insert_one({"id": str(uuid.uuid4()), "email": K, "name": "TEST_ Klant UI", "phone": "",
                      "password_hash": bcrypt.hashpw(b"Test1234!", bcrypt.gensalt()).decode(), "role": "klant",
                      "status": "active", "created_at": datetime.now(timezone.utc).isoformat()})
t = requests.post(f"{API}/auth/login", json={"email": "ori@merkanic.nl", "password": "Merkanic1!"}).json()["token"]
o = requests.post(f"{API}/workorders", headers={"Authorization": f"Bearer {t}"}, json={
    "vehicle": {"kenteken": "TEST21", "merk": "TEST", "model": "UI", "owner_name": "TEST_ Klant UI", "owner_email": K},
    "template": "kleine_beurt", "km_stand": 12345, "status": "In behandeling"}).json()
print(o["id"])
