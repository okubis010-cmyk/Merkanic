from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import uuid
import secrets
import logging
import ipaddress
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
import asyncio
import httpx
import requests
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Form, File, UploadFile
from fastapi.responses import HTMLResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
APP_URL = os.environ['APP_URL'].rstrip('/')
NOTIFY_EMAIL = os.environ['NOTIFY_EMAIL']
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ['EMERGENT_EMAIL_KEY']
EMAIL_FROM_NAME = os.environ['EMAIL_FROM_NAME']
EMAIL_REPLY_TO = os.environ.get('EMAIL_REPLY_TO')
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ['EMERGENT_LLM_KEY']
STORAGE_APP = "merkanic"
IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif"}
MAX_PHOTO_BYTES = 15 * 1024 * 1024
_storage_key = None


def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _storage_call(method: str, path: str, **kw):
    for attempt in (0, 1):
        resp = requests.request(method, f"{STORAGE_URL}/objects/{path}",
                                headers={"X-Storage-Key": init_storage(force=attempt == 1), **kw.pop("headers", {})}, **kw)
        if resp.status_code != 404 or attempt == 1:
            resp.raise_for_status()
            return resp


def put_object(path: str, data: bytes, content_type: str) -> dict:
    return _storage_call("PUT", path, headers={"Content-Type": content_type}, data=data, timeout=120).json()


def get_object(path: str) -> bytes:
    return _storage_call("GET", path, timeout=60).content

ROLES = ["klant", "monteur", "beheerder"]
STAFF = {"monteur", "beheerder"}
STATUSES = ["Gepland", "In behandeling", "Wacht op onderdelen", "Gereed", "Afgehaald"]
ROLE_LABELS = {"klant": "Klant", "monteur": "Monteur", "beheerder": "Beheerder"}

KLEINE = ["Motorolie verversen", "Oliefilter vervangen", "Vloeistoffen controleren en bijvullen",
          "Bandenspanning en profiel controleren", "Verlichting controleren", "Ruitenwissers controleren",
          "Remmen visueel controleren", "Service-indicator resetten"]
TEMPLATES = {
    "kleine_beurt": {"name": "Kleine beurt", "checklist": KLEINE},
    "grote_beurt": {"name": "Grote beurt", "checklist": KLEINE + [
        "Luchtfilter vervangen", "Interieurfilter vervangen", "Bougies controleren/vervangen",
        "Brandstoffilter controleren", "Remvloeistof testen", "Distributie- en aandrijfriem controleren",
        "Accu testen", "Ophanging en stuurinrichting controleren", "Uitlaatsysteem controleren", "Proefrit"]},
    "apk": {"name": "APK", "checklist": [
        "Verlichting en signalering", "Remtest", "Banden en profieldiepte", "Ophanging en stuurinrichting",
        "Uitlaatemissie meten", "Carrosserie en corrosie", "Ruiten en wissers", "Veiligheidsgordels",
        "Gereedmelding RDW"]},
    "banden_wissel": {"name": "Banden wissel", "checklist": [
        "Wielen demonteren", "Profiel en schade controleren", "Banden monteren", "Wielen balanceren",
        "Wielmoeren aandraaien op moment", "Bandenspanning instellen", "TPMS resetten", "Banden labelen en opslaan"]},
    "diagnose": {"name": "Diagnose", "checklist": [
        "Klacht van klant vastleggen", "Foutcodes uitlezen", "Storingsanalyse", "Proefrit",
        "Advies/offerte opstellen"]},
    "vrij": {"name": "Vrije werkorder", "checklist": []},
}

app = FastAPI()
api = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def norm_plate(k: str) -> str:
    return re.sub(r'[^A-Z0-9]', '', (k or '').upper())


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def check_pw(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())


def make_token(uid: str) -> str:
    payload = {"sub": uid, "type": "access", "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ["id", "email", "name", "phone", "role", "status", "created_at"]}


async def current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        raise HTTPException(401, "Niet ingelogd")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sessie verlopen")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Ongeldige sessie")
    u = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not u or u.get("status") != "active":
        raise HTTPException(401, "Account niet actief")
    return u


async def staff_user(u: dict = Depends(current_user)) -> dict:
    if u["role"] not in STAFF:
        raise HTTPException(403, "Alleen voor werkplaats")
    return u


async def admin_user(u: dict = Depends(current_user)) -> dict:
    if u["role"] != "beheerder":
        raise HTTPException(403, "Alleen voor beheerders")
    return u


# ---------------- Email (Emergent managed Resend) ----------------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            resp = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.warning(f"Email send failed: {e.response.status_code} {e.response.text}")
    except Exception as e:
        logger.error(f"Email send error: {e}")
    return None


def approval_email_html(user: dict, token: str) -> str:
    btn = ('display:inline-block;padding:12px 18px;margin:4px 6px 4px 0;border-radius:6px;'
           'font-weight:bold;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;')
    links = "".join(
        f'<a href="{APP_URL}/api/approve/{token}?role={r}" style="{btn}background:{c};color:#ffffff">{label}</a>'
        for r, label, c in [("monteur", "Goedkeuren als Monteur", "#C0474A"),
                            ("beheerder", "Goedkeuren als Beheerder", "#0F172A"),
                            ("klant", "Goedkeuren als Klant", "#475569"),
                            ("afwijzen", "Afwijzen", "#94A3B8")])
    return (
        '<table role="presentation" width="100%" style="background:#F8FAFC"><tr><td style="padding:32px;font-family:Arial,sans-serif;color:#0F172A">'
        '<p style="font-size:11px;letter-spacing:3px;color:#C0474A;font-weight:bold;margin:0 0 8px">MERKANIC / NIEUWE REGISTRATIE</p>'
        '<h1 style="font-size:22px;margin:0 0 16px">Nieuwe aanmelding wacht op goedkeuring</h1>'
        f'<p style="margin:0 0 4px"><strong>Naam:</strong> {escape(user["name"])}</p>'
        f'<p style="margin:0 0 4px"><strong>E-mail:</strong> {escape(user["email"])}</p>'
        f'<p style="margin:0 0 20px"><strong>Telefoon:</strong> {escape(user.get("phone") or "-")}</p>'
        '<p style="margin:0 0 12px">Kies met een klik welke rol deze gebruiker krijgt:</p>'
        f'<p>{links}</p>'
        '<p style="font-size:12px;color:#64748B;margin-top:24px">Je kunt rollen ook later aanpassen in het portaal onder Gebruikers. '
        f'Verzonden door {escape(EMAIL_FROM_NAME)}.</p></td></tr></table>')


# ---------------- Models ----------------
class RegisterIn(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=6)
    phone: Optional[str] = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserPatch(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None


class VehicleIn(BaseModel):
    kenteken: str
    merk: Optional[str] = ""
    model: Optional[str] = ""
    bouwjaar: Optional[str] = ""
    kleur: Optional[str] = ""
    brandstof: Optional[str] = ""
    apk_vervaldatum: Optional[str] = ""
    owner_name: Optional[str] = ""
    owner_email: Optional[str] = ""
    owner_phone: Optional[str] = ""


class VehiclePatch(BaseModel):
    merk: Optional[str] = None
    model: Optional[str] = None
    bouwjaar: Optional[str] = None
    kleur: Optional[str] = None
    brandstof: Optional[str] = None
    apk_vervaldatum: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    owner_phone: Optional[str] = None


class WorkorderIn(BaseModel):
    vehicle: VehicleIn
    km_stand: int = Field(ge=0)
    template: str
    title: Optional[str] = ""
    monteur_id: Optional[str] = ""
    status: str = "Gepland"
    planned_date: Optional[str] = ""
    opmerking: Optional[str] = ""
    opmerking_intern: bool = False
    extra_items: List[str] = []


class WorkorderPatch(BaseModel):
    status: Optional[str] = None
    monteur_id: Optional[str] = None
    km_stand: Optional[int] = Field(default=None, ge=0)
    title: Optional[str] = None
    planned_date: Optional[str] = None


class ChecklistPatch(BaseModel):
    done: Optional[bool] = None
    note: Optional[str] = None


class ChecklistAdd(BaseModel):
    label: str = Field(min_length=1)


class CommentIn(BaseModel):
    text: str = Field(min_length=1)
    internal: bool = False


# ---------------- Auth ----------------
def set_auth_cookie(resp: Response, token: str):
    resp.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=43200, path="/")


@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Dit e-mailadres is al geregistreerd")
    user = {"id": str(uuid.uuid4()), "email": email, "name": body.name.strip(), "phone": (body.phone or "").strip(),
            "password_hash": hash_pw(body.password), "role": None, "status": "pending", "created_at": now_iso()}
    await db.users.insert_one(user)
    token = secrets.token_urlsafe(32)
    await db.approval_tokens.insert_one({"token": token, "user_id": user["id"], "used": False,
                                         "expires_at": datetime.now(timezone.utc) + timedelta(days=14)})
    await send_email(to=NOTIFY_EMAIL, subject=f"Nieuwe registratie: {user['name']}",
                     html=approval_email_html(user, token))
    return {"status": "pending", "message": "Registratie ontvangen. Je account wacht op goedkeuring."}


@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    ident = email
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= 5 and att.get("locked_until", "") > now_iso():
        raise HTTPException(429, "Te veel pogingen. Probeer het over 15 minuten opnieuw.")
    u = await db.users.find_one({"email": email}, {"_id": 0})
    if not u or not check_pw(body.password, u["password_hash"]):
        cnt = (att.get("count", 0) if att else 0) + 1
        await db.login_attempts.update_one({"identifier": ident}, {"$set": {
            "count": cnt, "locked_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}}, upsert=True)
        raise HTTPException(401, "Onjuist e-mailadres of wachtwoord")
    await db.login_attempts.delete_one({"identifier": ident})
    if u["status"] == "pending":
        raise HTTPException(403, "Je account wacht nog op goedkeuring door Merkanic.")
    if u["status"] != "active":
        raise HTTPException(403, "Je account is niet actief.")
    token = make_token(u["id"])
    set_auth_cookie(response, token)
    return {"user": public_user(u), "token": token}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/", samesite="none", secure=True)
    return {"ok": True}


@api.get("/auth/me")
async def me(u: dict = Depends(current_user)):
    return public_user(u)


# ---------------- Approval via email link ----------------
def page(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(
        '<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>{escape(title)} | Merkanic</title></head>'
        '<body style="margin:0;background:#F8FAFC;font-family:Arial,sans-serif;color:#0F172A">'
        '<div style="max-width:520px;margin:64px auto;background:#fff;border:1px solid #E2E8F0;padding:32px">'
        '<p style="font-size:11px;letter-spacing:3px;color:#C0474A;font-weight:bold;margin:0 0 8px">MERKANIC / GEBRUIKERS</p>'
        f'<h1 style="font-size:22px;margin:0 0 16px">{escape(title)}</h1>{body}'
        f'<p style="margin-top:28px"><a href="{APP_URL}/portaal/gebruikers" style="color:#C0474A">Naar het portaal</a></p>'
        '</div></body></html>')


async def valid_approval(token: str):
    t = await db.approval_tokens.find_one({"token": token}, {"_id": 0})
    if not t or t["used"]:
        return None, None
    exp = t["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        return None, None
    u = await db.users.find_one({"id": t["user_id"]}, {"_id": 0})
    return t, u


@api.get("/approve/{token}", response_class=HTMLResponse)
async def approve_page(token: str, role: str):
    t, u = await valid_approval(token)
    if not u:
        return page("Link niet meer geldig", "<p>Deze link is al gebruikt of verlopen. Beheer de gebruiker via het portaal.</p>")
    if role not in ROLES + ["afwijzen"]:
        return page("Onbekende rol", "<p>Deze rol bestaat niet.</p>")
    action = "afwijzen" if role == "afwijzen" else f"goedkeuren als <strong>{ROLE_LABELS[role]}</strong>"
    return page("Bevestig gebruiker",
                f'<p>{escape(u["name"])} ({escape(u["email"])}) {action}?</p>'
                f'<form method="post" action="{APP_URL}/api/approve/{escape(token)}">'
                f'<input type="hidden" name="role" value="{escape(role)}">'
                '<button type="submit" style="background:#C0474A;color:#fff;border:0;padding:12px 20px;font-weight:bold;cursor:pointer">Bevestigen</button>'
                '</form>')


@api.post("/approve/{token}", response_class=HTMLResponse)
async def approve_do(token: str, role: str = Form(...)):
    t, u = await valid_approval(token)
    if not u:
        return page("Link niet meer geldig", "<p>Deze link is al gebruikt of verlopen.</p>")
    if role not in ROLES + ["afwijzen"]:
        return page("Onbekende rol", "<p>Deze rol bestaat niet.</p>")
    upd = {"status": "rejected"} if role == "afwijzen" else {"status": "active", "role": role}
    await db.users.update_one({"id": u["id"]}, {"$set": upd})
    await db.approval_tokens.update_one({"token": token}, {"$set": {"used": True}})
    msg = "is afgewezen." if role == "afwijzen" else f"is goedgekeurd als {ROLE_LABELS[role]}. Diegene kan nu inloggen."
    return page("Gelukt", f"<p>{escape(u['name'])} {msg}</p>")


# ---------------- Users ----------------
@api.get("/users")
async def list_users(_: dict = Depends(admin_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return [public_user(u) for u in users]


@api.patch("/users/{uid}")
async def patch_user(uid: str, body: UserPatch, admin: dict = Depends(admin_user)):
    u = await db.users.find_one({"id": uid}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Gebruiker niet gevonden")
    upd = {}
    if body.role is not None:
        if body.role not in ROLES:
            raise HTTPException(400, "Ongeldige rol")
        upd["role"] = body.role
    if body.status is not None:
        if body.status not in ["active", "rejected", "pending"]:
            raise HTTPException(400, "Ongeldige status")
        upd["status"] = body.status
    if uid == admin["id"] and (upd.get("role", "beheerder") != "beheerder" or upd.get("status", "active") != "active"):
        raise HTTPException(400, "Je kunt je eigen beheerdersaccount niet wijzigen")
    if upd.get("status") == "active" and not (upd.get("role") or u.get("role")):
        raise HTTPException(400, "Kies eerst een rol")
    if upd:
        await db.users.update_one({"id": uid}, {"$set": upd})
        await db.approval_tokens.update_many({"user_id": uid}, {"$set": {"used": True}})
    return public_user(await db.users.find_one({"id": uid}, {"_id": 0}))


@api.get("/monteurs")
async def list_monteurs(_: dict = Depends(staff_user)):
    us = await db.users.find({"role": {"$in": list(STAFF)}, "status": "active"}, {"_id": 0, "password_hash": 0}).to_list(500)
    return [{"id": u["id"], "name": u["name"], "role": u["role"]} for u in us]


# ---------------- RDW ----------------
@api.get("/rdw/{kenteken}")
async def rdw_lookup(kenteken: str, _: dict = Depends(staff_user)):
    k = norm_plate(kenteken)
    if not k:
        raise HTTPException(400, "Ongeldig kenteken")
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get("https://opendata.rdw.nl/resource/m9d7-ebf2.json", params={"kenteken": k})
            data = r.json()
            f = await c.get("https://opendata.rdw.nl/resource/8ys7-d773.json", params={"kenteken": k})
            fuel = f.json()
    except Exception as e:
        logger.error(f"RDW error {e}")
        raise HTTPException(502, "RDW is momenteel niet bereikbaar")
    if not data:
        raise HTTPException(404, "Kenteken niet gevonden bij de RDW")
    d = data[0]

    def fmt(s):
        return f"{s[6:8]}-{s[4:6]}-{s[0:4]}" if s and len(s) == 8 else ""
    return {"kenteken": k, "merk": d.get("merk", "").title(), "model": d.get("handelsbenaming", "").title(),
            "bouwjaar": (d.get("datum_eerste_toelating") or "")[:4], "kleur": d.get("eerste_kleur", "").title(),
            "brandstof": ", ".join(x.get("brandstof_omschrijving", "") for x in fuel if isinstance(x, dict)),
            "apk_vervaldatum": fmt(d.get("vervaldatum_apk", ""))}


# ---------------- Vehicles (mappen per kenteken) ----------------
def vehicle_scope(u: dict) -> dict:
    return {} if u["role"] in STAFF else {"owner_email": u["email"]}


def strip_internal(order: dict, u: dict) -> dict:
    order["photos"] = [{k: p[k] for k in ("id", "caption", "by", "at", "content_type")}
                       for p in order.get("photos", []) if not p.get("is_deleted")]
    if u["role"] not in STAFF:
        order["comments"] = [c for c in order.get("comments", []) if not c.get("internal")]
        order["events"] = [e for e in order.get("events", []) if not e.get("internal")]
    return order


async def upsert_vehicle(v: VehicleIn, u: dict) -> dict:
    k = norm_plate(v.kenteken)
    if len(k) < 4:
        raise HTTPException(400, "Ongeldig kenteken")
    data = v.model_dump()
    data["kenteken"] = k
    data["owner_email"] = (data.get("owner_email") or "").strip().lower()
    existing = await db.vehicles.find_one({"kenteken": k}, {"_id": 0})
    if existing:
        upd = {key: val for key, val in data.items() if val not in (None, "") and key != "kenteken"}
        if upd:
            await db.vehicles.update_one({"kenteken": k}, {"$set": upd})
        return await db.vehicles.find_one({"kenteken": k}, {"_id": 0})
    doc = {**data, "id": str(uuid.uuid4()), "created_at": now_iso(), "created_by": u["name"], "last_km": None}
    await db.vehicles.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/vehicles")
async def list_vehicles(q: str = "", u: dict = Depends(current_user)):
    filt = vehicle_scope(u)
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        filt = {**filt, "$or": [{"kenteken": {"$regex": re.escape(norm_plate(q)) or re.escape(q), "$options": "i"}},
                                {"merk": rx}, {"model": rx}, {"owner_name": rx}]}
    vs = await db.vehicles.find(filt, {"_id": 0}).sort("created_at", -1).to_list(2000)
    counts = {c["_id"]: c for c in await db.workorders.aggregate([
        {"$match": {"kenteken": {"$in": [v["kenteken"] for v in vs]}}},
        {"$group": {"_id": "$kenteken", "total": {"$sum": 1},
                    "open": {"$sum": {"$cond": [{"$in": ["$status", ["Gereed", "Afgehaald"]]}, 0, 1]}},
                    "last": {"$max": "$created_at"}}}]).to_list(2000)}
    for v in vs:
        c = counts.get(v["kenteken"], {})
        v["order_count"] = c.get("total", 0)
        v["open_count"] = c.get("open", 0)
        v["last_order_at"] = c.get("last")
    return vs


@api.post("/vehicles")
async def create_vehicle(body: VehicleIn, u: dict = Depends(staff_user)):
    return await upsert_vehicle(body, u)


@api.get("/vehicles/{kenteken}")
async def get_vehicle(kenteken: str, u: dict = Depends(current_user)):
    k = norm_plate(kenteken)
    v = await db.vehicles.find_one({"kenteken": k, **vehicle_scope(u)}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Voertuig niet gevonden")
    orders = await db.workorders.find({"kenteken": k}, {"_id": 0}).sort("volgnummer", 1).to_list(1000)
    orders = [strip_internal(o, u) for o in orders]
    history = []
    for o in orders:
        for e in o.get("events", []):
            history.append({**e, "order_id": o["id"], "order_number": o["number"], "volgnummer": o["volgnummer"],
                            "order_title": o["title"]})
        for c in o.get("comments", []):
            history.append({"type": "comment", "text": c["text"], "by": c["author_name"], "at": c["at"],
                            "internal": c.get("internal", False), "order_id": o["id"], "order_number": o["number"],
                            "volgnummer": o["volgnummer"], "order_title": o["title"]})
    history.sort(key=lambda h: h["at"], reverse=True)
    km = [{"km": o["km_stand"], "at": o["created_at"], "order_number": o["number"]} for o in orders]
    return {"vehicle": v, "orders": orders, "history": history, "km_history": km}


@api.patch("/vehicles/{kenteken}")
async def patch_vehicle(kenteken: str, body: VehiclePatch, _: dict = Depends(staff_user)):
    k = norm_plate(kenteken)
    upd = {key: val for key, val in body.model_dump().items() if val is not None}
    if "owner_email" in upd:
        upd["owner_email"] = upd["owner_email"].strip().lower()
    res = await db.vehicles.update_one({"kenteken": k}, {"$set": upd})
    if not res.matched_count:
        raise HTTPException(404, "Voertuig niet gevonden")
    return await db.vehicles.find_one({"kenteken": k}, {"_id": 0})


# ---------------- Werkorders ----------------
async def next_seq(name: str) -> int:
    r = await db.counters.find_one_and_update({"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    return r["seq"]


async def monteur_name(mid: str) -> str:
    if not mid:
        return ""
    m = await db.users.find_one({"id": mid, "role": {"$in": list(STAFF)}, "status": "active"}, {"_id": 0})
    if not m:
        raise HTTPException(400, "Monteur niet gevonden")
    return m["name"]


def event(text: str, u: dict, type_: str = "event") -> dict:
    return {"id": str(uuid.uuid4()), "type": type_, "text": text, "by": u["name"], "at": now_iso()}


@api.get("/templates")
async def get_templates(_: dict = Depends(current_user)):
    return [{"key": k, **v} for k, v in TEMPLATES.items()]


@api.get("/workorders")
async def list_workorders(status: str = "", monteur_id: str = "", q: str = "", u: dict = Depends(current_user)):
    filt = {}
    if u["role"] not in STAFF:
        plates = [v["kenteken"] for v in await db.vehicles.find({"owner_email": u["email"]}, {"_id": 0, "kenteken": 1}).to_list(500)]
        filt["kenteken"] = {"$in": plates}
    if status:
        filt["status"] = status
    if monteur_id:
        filt["monteur_id"] = monteur_id
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        filt["$or"] = [{"kenteken": {"$regex": re.escape(norm_plate(q)) or re.escape(q), "$options": "i"}},
                       {"title": rx}, {"number": rx}, {"vehicle_label": rx}, {"owner_name": rx}]
    orders = await db.workorders.find(filt, {"_id": 0, "events": 0}).sort("created_at", -1).to_list(2000)
    for o in orders:
        o["comment_count"] = len([c for c in o.get("comments", []) if u["role"] in STAFF or not c.get("internal")])
        o.pop("comments", None)
        o["checklist_done"] = len([c for c in o.get("checklist", []) if c["done"]])
        o["checklist_total"] = len(o.get("checklist", []))
        o.pop("checklist", None)
        o["photo_count"] = len([p for p in o.pop("photos", []) if not p.get("is_deleted")])
    return orders


@api.get("/stats")
async def stats(_: dict = Depends(staff_user)):
    pipeline = [{"$group": {"_id": "$status", "n": {"$sum": 1}}}]
    by = {r["_id"]: r["n"] for r in await db.workorders.aggregate(pipeline).to_list(20)}
    pending = await db.users.count_documents({"status": "pending"})
    return {"by_status": {s: by.get(s, 0) for s in STATUSES}, "vehicles": await db.vehicles.count_documents({}),
            "total": sum(by.values()), "pending_users": pending}


@api.post("/workorders")
async def create_workorder(body: WorkorderIn, u: dict = Depends(staff_user)):
    if body.template not in TEMPLATES:
        raise HTTPException(400, "Onbekend standaardformulier")
    if body.status not in STATUSES:
        raise HTTPException(400, "Ongeldige status")
    v = await upsert_vehicle(body.vehicle, u)
    mname = await monteur_name(body.monteur_id or "")
    tpl = TEMPLATES[body.template]
    last = await db.workorders.find_one({"kenteken": v["kenteken"]}, {"_id": 0, "volgnummer": 1}, sort=[("volgnummer", -1)])
    volg = max(await next_seq(f"vehicle:{v['kenteken']}"), (last or {}).get("volgnummer", 0) + 1)
    await db.counters.update_one({"_id": f"vehicle:{v['kenteken']}"}, {"$max": {"seq": volg}})
    num = await next_seq("workorder")
    items = tpl["checklist"] + [x.strip() for x in body.extra_items if x.strip()]
    order = {
        "id": str(uuid.uuid4()), "number": f"WO-{num:05d}", "volgnummer": volg,
        "kenteken": v["kenteken"], "vehicle_label": f"{v.get('merk', '')} {v.get('model', '')}".strip(),
        "owner_name": v.get("owner_name", ""), "km_stand": body.km_stand, "template": body.template,
        "template_name": tpl["name"], "title": (body.title or "").strip() or tpl["name"],
        "monteur_id": body.monteur_id or "", "monteur_name": mname, "status": body.status,
        "planned_date": body.planned_date or "",
        "checklist": [{"id": str(uuid.uuid4()), "label": x, "done": False, "note": ""} for x in items],
        "comments": [], "events": [event(f"Werkorder aangemaakt ({tpl['name']}, {body.km_stand:,} km)".replace(f"{body.km_stand:,}", f"{body.km_stand:,}".replace(",", ".")), u, "created")],
        "created_by": u["name"], "created_at": now_iso(), "updated_at": now_iso(),
    }
    if body.opmerking and body.opmerking.strip():
        order["comments"].append({"id": str(uuid.uuid4()), "text": body.opmerking.strip(), "internal": body.opmerking_intern,
                                  "author_name": u["name"], "author_role": u["role"], "at": now_iso()})
    await db.workorders.insert_one(order)
    await db.vehicles.update_one({"kenteken": v["kenteken"]}, {"$set": {"last_km": body.km_stand}})
    order.pop("_id", None)
    return order


async def load_order(oid: str, u: dict) -> dict:
    o = await db.workorders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Werkorder niet gevonden")
    if u["role"] not in STAFF:
        if not await db.vehicles.find_one({"kenteken": o["kenteken"], "owner_email": u["email"]}):
            raise HTTPException(404, "Werkorder niet gevonden")
    return o


@api.get("/workorders/{oid}")
async def get_workorder(oid: str, u: dict = Depends(current_user)):
    o = await load_order(oid, u)
    v = await db.vehicles.find_one({"kenteken": o["kenteken"]}, {"_id": 0})
    return {**strip_internal(o, u), "vehicle": v}


@api.patch("/workorders/{oid}")
async def patch_workorder(oid: str, body: WorkorderPatch, u: dict = Depends(staff_user)):
    o = await load_order(oid, u)
    upd, evs = {}, []
    if body.status is not None and body.status != o["status"]:
        if body.status not in STATUSES:
            raise HTTPException(400, "Ongeldige status")
        upd["status"] = body.status
        evs.append(event(f"Status gewijzigd: {o['status']} → {body.status}", u, "status"))
    if body.monteur_id is not None and body.monteur_id != o.get("monteur_id"):
        name = await monteur_name(body.monteur_id)
        upd.update({"monteur_id": body.monteur_id, "monteur_name": name})
        evs.append(event(f"Monteur toegewezen: {name}" if name else "Monteur verwijderd", u, "monteur"))
    if body.km_stand is not None and body.km_stand != o["km_stand"]:
        upd["km_stand"] = body.km_stand
        evs.append(event(f"Km-stand aangepast naar {body.km_stand:,} km".replace(",", "."), u, "km"))
        await db.vehicles.update_one({"kenteken": o["kenteken"]}, {"$set": {"last_km": body.km_stand}})
    if body.title is not None and body.title.strip():
        upd["title"] = body.title.strip()
    if body.planned_date is not None:
        upd["planned_date"] = body.planned_date
    if upd:
        upd["updated_at"] = now_iso()
        await db.workorders.update_one({"id": oid}, {"$set": upd, "$push": {"events": {"$each": evs}}})
        if upd.get("status") == "Gereed":
            await notify_gereed({**o, **upd}, u)
    return await get_workorder(oid, u)


def gereed_email_html(o: dict, v: dict) -> str:
    link = f"{APP_URL}/portaal/werkorders/{o['id']}"
    car = escape(f"{v.get('merk', '')} {v.get('model', '')}".strip() or "je auto")
    return (
        '<table role="presentation" width="100%" style="background:#F8FAFC"><tr><td style="padding:32px;font-family:Arial,sans-serif;color:#0F172A">'
        '<p style="font-size:11px;letter-spacing:3px;color:#C0474A;font-weight:bold;margin:0 0 8px">MERKANIC / WERKORDER GEREED</p>'
        f'<h1 style="font-size:22px;margin:0 0 16px">Je {car} staat klaar.</h1>'
        f'<p style="margin:0 0 6px">Beste {escape(v.get("owner_name") or "klant")},</p>'
        f'<p style="margin:0 0 6px">De werkzaamheden aan je auto met kenteken <strong>{escape(o["kenteken"])}</strong> zijn afgerond.</p>'
        f'<p style="margin:0 0 20px">Werkorder: <strong>{escape(o["number"])}</strong> &middot; {escape(o["title"])}</p>'
        f'<p><a href="{link}" style="display:inline-block;padding:12px 18px;background:#C0474A;color:#ffffff;font-weight:bold;text-decoration:none;border-radius:6px">Bekijk in het klantenportaal</a></p>'
        '<p style="margin-top:20px">Je kunt je auto ophalen tijdens onze openingstijden.</p>'
        f'<p style="font-size:12px;color:#64748B;margin-top:24px">Verzonden door {escape(EMAIL_FROM_NAME)}. Vragen? Beantwoord deze e-mail.</p>'
        '</td></tr></table>')


async def notify_gereed(o: dict, u: dict):
    v = await db.vehicles.find_one({"kenteken": o["kenteken"]}, {"_id": 0})
    to = (v or {}).get("owner_email")
    if not to:
        ev = {**event("Geen klantmail verstuurd: geen e-mailadres bij de auto", u, "email"), "internal": True}
    else:
        sent = await send_email(to=to, subject=f"Je auto ({o['kenteken']}) is gereed", html=gereed_email_html(o, v))
        txt = f"Klant per e-mail geïnformeerd ({to})" if sent else f"Klantmail naar {to} mislukt"
        ev = {**event(txt, u, "email"), "internal": True}
    await db.workorders.update_one({"id": o["id"]}, {"$push": {"events": ev}})


@api.post("/workorders/{oid}/photos")
async def upload_photo(oid: str, file: UploadFile = File(...), caption: str = Form(""), u: dict = Depends(staff_user)):
    await load_order(oid, u)
    ctype = (file.content_type or "").lower()
    if ctype not in IMAGE_TYPES:
        raise HTTPException(400, "Alleen foto's (JPG, PNG, WEBP, HEIC) toegestaan")
    data = await file.read()
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(400, "Foto is te groot (max 15 MB)")
    pid = str(uuid.uuid4())
    path = f"{STORAGE_APP}/workorders/{oid}/{pid}.{IMAGE_TYPES[ctype]}"
    try:
        res = await asyncio.to_thread(put_object, path, data, ctype)
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(502, "Uploaden mislukt, probeer het opnieuw")
    photo = {"id": pid, "storage_path": res["path"], "content_type": ctype, "caption": caption.strip()[:200],
             "original_filename": file.filename, "size": len(data), "by": u["name"], "at": now_iso(), "is_deleted": False}
    await db.workorders.update_one({"id": oid}, {"$push": {"photos": photo, "events": event(
        f"Foto toegevoegd{': ' + photo['caption'] if photo['caption'] else ''}", u, "photo")}})
    return await get_workorder(oid, u)


@api.get("/workorders/{oid}/photos/{pid}")
async def get_photo(oid: str, pid: str, u: dict = Depends(current_user)):
    o = await load_order(oid, u)
    p = next((p for p in o.get("photos", []) if p["id"] == pid and not p.get("is_deleted")), None)
    if not p:
        raise HTTPException(404, "Foto niet gevonden")
    try:
        data = await asyncio.to_thread(get_object, p["storage_path"])
    except Exception as e:
        logger.error(f"Download failed: {e}")
        raise HTTPException(502, "Foto kon niet worden geladen")
    return Response(content=data, media_type=p["content_type"], headers={"Cache-Control": "private, max-age=3600"})


@api.delete("/workorders/{oid}/photos/{pid}")
async def delete_photo(oid: str, pid: str, u: dict = Depends(staff_user)):
    await load_order(oid, u)
    res = await db.workorders.update_one({"id": oid, "photos.id": pid}, {"$set": {"photos.$.is_deleted": True},
                                         "$push": {"events": event("Foto verwijderd", u, "photo")}})
    if not res.matched_count:
        raise HTTPException(404, "Foto niet gevonden")
    return await get_workorder(oid, u)


@api.patch("/workorders/{oid}/checklist/{item_id}")
async def patch_check(oid: str, item_id: str, body: ChecklistPatch, u: dict = Depends(staff_user)):
    o = await load_order(oid, u)
    item = next((c for c in o["checklist"] if c["id"] == item_id), None)
    if not item:
        raise HTTPException(404, "Item niet gevonden")
    sets = {"updated_at": now_iso()}
    push = None
    if body.done is not None:
        sets["checklist.$[i].done"] = body.done
        if body.done != item["done"]:
            push = event(f"{'Afgevinkt' if body.done else 'Teruggezet'}: {item['label']}", u, "check")
    if body.note is not None:
        sets["checklist.$[i].note"] = body.note
    update = {"$set": sets}
    if push:
        update["$push"] = {"events": push}
    await db.workorders.update_one({"id": oid}, update, array_filters=[{"i.id": item_id}])
    return await get_workorder(oid, u)


@api.post("/workorders/{oid}/checklist")
async def add_check(oid: str, body: ChecklistAdd, u: dict = Depends(staff_user)):
    await load_order(oid, u)
    item = {"id": str(uuid.uuid4()), "label": body.label.strip(), "done": False, "note": ""}
    await db.workorders.update_one({"id": oid}, {"$push": {"checklist": item, "events": event(f"Taak toegevoegd: {item['label']}", u, "check")}})
    return await get_workorder(oid, u)


@api.post("/workorders/{oid}/comments")
async def add_comment(oid: str, body: CommentIn, u: dict = Depends(current_user)):
    await load_order(oid, u)
    internal = body.internal if u["role"] in STAFF else False
    c = {"id": str(uuid.uuid4()), "text": body.text.strip(), "internal": internal, "author_name": u["name"],
         "author_role": u["role"], "at": now_iso()}
    await db.workorders.update_one({"id": oid}, {"$push": {"comments": c}, "$set": {"updated_at": now_iso()}})
    return await get_workorder(oid, u)


@api.delete("/workorders/{oid}")
async def delete_workorder(oid: str, u: dict = Depends(admin_user)):
    await load_order(oid, u)
    await db.workorders.delete_one({"id": oid})
    return {"ok": True}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ['CORS_ORIGINS'].split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.vehicles.create_index("kenteken", unique=True)
    await db.workorders.create_index("id", unique=True)
    await db.workorders.create_index("kenteken")
    await db.login_attempts.create_index("identifier")
    await db.approval_tokens.create_index("token", unique=True)
    try:
        await asyncio.to_thread(init_storage)
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    email = os.environ['ADMIN_EMAIL'].lower()
    pw = os.environ['ADMIN_PASSWORD']
    ex = await db.users.find_one({"email": email})
    if not ex:
        await db.users.insert_one({"id": str(uuid.uuid4()), "email": email, "name": os.environ.get('ADMIN_NAME', 'Ori'),
                                   "phone": "", "password_hash": hash_pw(pw), "role": "beheerder", "status": "active",
                                   "created_at": now_iso()})
    else:
        upd = {"role": "beheerder", "status": "active"}
        if not check_pw(pw, ex["password_hash"]):
            upd["password_hash"] = hash_pw(pw)
        await db.users.update_one({"email": email}, {"$set": upd})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
