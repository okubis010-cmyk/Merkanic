# Public APK-check endpoint + env email config + regression login (iteration 3)
import os
import re
import pytest
import requests

BASE_URL = None
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL"):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")


# Public APK endpoint (no auth)
class TestPublicApk:
    def test_valid_plate_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/public/apk/GZ123X", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(d.keys()) == {"kenteken", "merk", "model", "apk_vervaldatum"}
        assert d["kenteken"] == "GZ123X"
        assert d["merk"] == "Renault"
        assert "Captur" in d["model"]
        assert d["apk_vervaldatum"] == "21-06-2027"

    def test_dashed_plate_normalized(self):
        r = requests.get(f"{BASE_URL}/api/public/apk/gz-123-x", timeout=20)
        assert r.status_code == 200
        assert r.json()["kenteken"] == "GZ123X"

    def test_unknown_plate_404(self):
        r = requests.get(f"{BASE_URL}/api/public/apk/ZZ999ZZ", timeout=20)
        assert r.status_code == 404
        assert "detail" in r.json()

    def test_too_long_plate_400(self):
        r = requests.get(f"{BASE_URL}/api/public/apk/ABCDEFGHIJ", timeout=20)
        assert r.status_code == 400

    def test_private_rdw_still_protected(self):
        r = requests.get(f"{BASE_URL}/api/rdw/GZ123X", timeout=20)
        assert r.status_code in (401, 403)


# Env email config
def test_env_emails():
    env = open("/app/backend/.env").read()
    assert re.search(r'^NOTIFY_EMAIL="?info@merkanic\.nl"?$', env, re.M)
    assert re.search(r'^EMAIL_REPLY_TO="?info@merkanic\.nl"?$', env, re.M)


# Regression: admin login
def test_admin_login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "ori@merkanic.nl", "password": "Merkanic1!"}, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["user"]["role"] == "beheerder"
    assert d["token"]
    assert "httponly" in r.headers.get("set-cookie", "").lower()
