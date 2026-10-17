# Seed/cleanup for iteration-6 vehicle-history popup UI tests: python seed_ui_iter6.py seed|clean
import os, sys, requests
from pymongo import MongoClient

BASE = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0].rstrip("/")
db = MongoClient("mongodb://localhost:27017")["test_database"]

if sys.argv[1] == "seed":
    s = requests.Session()
    tok = s.post(f"{BASE}/api/auth/login", json={"email": "ori@merkanic.nl", "password": "Merkanic1!"}).json()["token"]
    s.headers["Authorization"] = f"Bearer {tok}"
    veh = {"kenteken": "TESTH1", "merk": "TEST", "model": "Historie", "owner_name": "TEST Eigenaar"}
    r1 = s.post(f"{BASE}/api/workorders", json={"vehicle": veh, "km_stand": 100000, "template": "kleine_beurt", "status": "Gepland",
                                                "opmerking": "TEST eerste opmerking"})
    r2 = s.post(f"{BASE}/api/workorders", json={"vehicle": veh, "km_stand": 110000, "template": "grote_beurt", "status": "In behandeling"})
    r3 = s.post(f"{BASE}/api/vehicles", json={"kenteken": "TESTH0", "merk": "TEST", "model": "Leeg"})
    print(r1.status_code, r2.status_code, r3.status_code, r1.json().get("number"), r2.json().get("number"))
    print(s.get(f"{BASE}/api/vehicles/TESTH1").json()["orders"].__len__())
else:
    nums = [o["number"] for o in db.workorders.find({"kenteken": {"$regex": "^TEST"}})]
    db.workorders.delete_many({"kenteken": {"$regex": "^TEST"}})
    db.vehicles.delete_many({"kenteken": {"$regex": "^TEST"}})
    db.counters.delete_many({"_id": {"$regex": "TEST"}})
    # restore workorder counter to its pre-seed value (12 before iteration 6); pass it as argv[2] if different
    mx = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    db.counters.update_one({"_id": "workorder"}, {"$set": {"seq": mx}})
    print("cleaned", nums, "workorder seq ->", mx)
