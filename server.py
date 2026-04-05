#!/usr/bin/env python3
import argparse
import http.client
import json
import os
import re
import threading
import time
import uuid
from copy import deepcopy
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "database.json")
DB_LOCK = threading.Lock()
RED = "\x1b[31m"
RESET = "\x1b[0m"
MB_ALLOWED_ROLES = {"buyer", "seller", "admin"}
MB_ALLOWED_THEMES = {"night", "light", "mint"}
MB_ALLOWED_LANGUAGES = {"ru", "en"}
MDM_PROXY_PREFIX = "/api/mdm"
MDM_BACKEND_HOST = os.environ.get("MDM_BACKEND_HOST", "127.0.0.1")
try:
    MDM_BACKEND_PORT = int(os.environ.get("MDM_BACKEND_PORT", "4000"))
except Exception:
    MDM_BACKEND_PORT = 4000


def ensure_database_file() -> None:
    if os.path.exists(DB_FILE):
        return
    default_data = {
        "network": {"host": "192.168.1.65", "port": 8000},
        "gameTimeSeconds": 45,
        "themes": [],
        "baskets": [],
        "starSkins": [],
        "fieldSkins": [],
        "cartoons": [],
        "gameData": {
            "currentAccount": "",
            "accounts": {},
        },
    }
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(default_data, f, ensure_ascii=False, indent=2)


def default_player_data():
    return {
        "currentAccount": "Player",
        "accounts": {
            "Player": {
                "name": "Player",
                "pin": "",
                "coins": 0,
                "best": 0,
                "ownedBaskets": ["rose"],
                "activeBasket": "rose",
                "ownedStars": ["classic"],
                "activeStar": "classic",
                "ownedFields": ["blush"],
                "activeField": "blush",
                "ownedCartoons": [],
                "settings": {"theme": "pink", "accent": "#ff5fa2", "kidOnly": False},
            }
        },
    }


def default_mb_bank_data():
    return {
        "schemaVersion": 4,
        "revision": 0,
        "updatedAt": 0,
        "bankReserveCents": 500000,  # 5000 RUB hidden bank reserve
        "profiles": {
            "Goodog2013": {
                "username": "Goodog2013",
                "password": "Qw111111",
                "cardId": "100000000001",
                "balanceCents": 0,
                "isAdmin": True,
                "role": "admin",
                "createdAt": int(time.time()),
                "lastLoginAt": 0,
                "avatar": "",
                "settings": {"theme": "night", "language": "ru"},
            }
        },
        "sessions": {},
        "transfers": [],
    }


def mb_normalize_role(raw_role, is_admin_fallback=False):
    role = str(raw_role or "").strip().lower()
    if role not in MB_ALLOWED_ROLES:
        role = "admin" if is_admin_fallback else "buyer"
    return role


def mb_normalize_theme(raw_theme):
    theme = str(raw_theme or "").strip().lower()
    if theme not in MB_ALLOWED_THEMES:
        theme = "night"
    return theme


def mb_normalize_language(raw_language):
    language = str(raw_language or "").strip().lower()
    if language not in MB_ALLOWED_LANGUAGES:
        language = "ru"
    return language


def mb_sanitize_avatar(raw_avatar):
    avatar = str(raw_avatar or "").strip()
    if not avatar:
        return ""
    if not avatar.startswith("data:image/"):
        return ""
    if len(avatar) > 1_500_000:
        return ""
    return avatar


def mb_clean_text(raw_text, max_len=140):
    text = str(raw_text or "").strip()
    if len(text) > max_len:
        text = text[:max_len]
    return text


def mb_normalize_card_id(raw_card_id):
    card_id = re.sub(r"\D", "", str(raw_card_id or "").strip())
    if len(card_id) != 12:
        return ""
    return card_id


def mb_generate_card_id(used_ids):
    # 12-digit in-game card id.
    while True:
        candidate = str((uuid.uuid4().int % 900_000_000_000) + 100_000_000_000)
        if candidate not in used_ids:
            return candidate


def mb_ensure_profile_card_ids(profiles):
    if not isinstance(profiles, dict):
        return
    used_ids = set()
    for name in sorted(profiles.keys(), key=lambda x: str(x).lower()):
        profile = profiles.get(name)
        if not isinstance(profile, dict):
            continue
        card_id = mb_normalize_card_id(profile.get("cardId"))
        if not card_id or card_id in used_ids:
            card_id = mb_generate_card_id(used_ids)
        used_ids.add(card_id)
        profile["cardId"] = card_id


def normalize_mb_bank_data(raw):
    default_data = default_mb_bank_data()
    if not isinstance(raw, dict):
        return deepcopy(default_data)

    now_ts = int(time.time())
    reserve_cents = raw.get("bankReserveCents", default_data.get("bankReserveCents", 0))
    try:
        reserve_cents = int(reserve_cents)
    except Exception:
        reserve_cents = int(default_data.get("bankReserveCents", 0))
    if reserve_cents < 0:
        reserve_cents = 0

    mb = {
        "schemaVersion": 4,
        "revision": int(raw.get("revision") or 0),
        "updatedAt": int(raw.get("updatedAt") or 0),
        "bankReserveCents": reserve_cents,
        "profiles": {},
        "sessions": {},
        "transfers": [],
    }

    raw_profiles = raw.get("profiles")
    if not isinstance(raw_profiles, dict):
        # Optional migration from previous shape: mbBank.state.accounts -> profiles
        state = raw.get("state")
        if isinstance(state, dict):
            accounts = state.get("accounts", {})
            players = state.get("players", {})
            if isinstance(accounts, dict) and isinstance(players, dict):
                used_names = set()
                for account in accounts.values():
                    if not isinstance(account, dict):
                        continue
                    owner_id = account.get("ownerId")
                    player = players.get(owner_id, {}) if owner_id else {}
                    base_name = str(player.get("name") or account.get("id") or "").strip()
                    if not base_name:
                        continue
                    safe_base = re.sub(r"[^A-Za-z0-9_]", "", base_name) or "Player"
                    candidate = safe_base
                    suffix = 1
                    while candidate in used_names:
                        suffix += 1
                        candidate = f"{safe_base}{suffix}"
                    used_names.add(candidate)
                    mb["profiles"][candidate] = {
                        "username": candidate,
                        "password": "123456",
                        "cardId": "",
                        "balanceCents": int(account.get("balanceCents") or 0),
                        "isAdmin": False,
                        "role": "buyer",
                        "createdAt": now_ts,
                        "lastLoginAt": 0,
                        "avatar": "",
                        "settings": {"theme": "night", "language": "ru"},
                    }
    else:
        for username, profile in raw_profiles.items():
            if not isinstance(profile, dict):
                continue
            name = str(profile.get("username") or username).strip()
            if not name:
                continue
            role = mb_normalize_role(profile.get("role"), bool(profile.get("isAdmin", False)))
            theme = mb_normalize_theme((profile.get("settings", {}) or {}).get("theme"))
            language = mb_normalize_language((profile.get("settings", {}) or {}).get("language"))
            mb["profiles"][name] = {
                "username": name,
                "password": str(profile.get("password") or ""),
                "cardId": mb_normalize_card_id(profile.get("cardId")),
                "balanceCents": int(profile.get("balanceCents") or 0),
                "isAdmin": role == "admin",
                "role": role,
                "createdAt": int(profile.get("createdAt") or now_ts),
                "lastLoginAt": int(profile.get("lastLoginAt") or 0),
                "avatar": mb_sanitize_avatar(profile.get("avatar")),
                "settings": {"theme": theme, "language": language},
            }

    # Hard requirement: admin profile must always exist with requested credentials.
    raw_admin_balance = mb["profiles"].get("Goodog2013", {}).get("balanceCents")
    try:
        admin_balance_cents = int(raw_admin_balance)
    except Exception:
        admin_balance_cents = int(default_data["profiles"]["Goodog2013"]["balanceCents"])
    if admin_balance_cents < 0:
        admin_balance_cents = 0

    mb["profiles"]["Goodog2013"] = {
        "username": "Goodog2013",
        "password": "Qw111111",
        "cardId": mb_normalize_card_id(mb["profiles"].get("Goodog2013", {}).get("cardId")),
        "balanceCents": admin_balance_cents,
        "isAdmin": True,
        "role": "admin",
        "createdAt": int(mb["profiles"].get("Goodog2013", {}).get("createdAt") or now_ts),
        "lastLoginAt": int(mb["profiles"].get("Goodog2013", {}).get("lastLoginAt") or 0),
        "avatar": mb_sanitize_avatar(mb["profiles"].get("Goodog2013", {}).get("avatar")),
        "settings": {
            "theme": mb_normalize_theme((mb["profiles"].get("Goodog2013", {}).get("settings", {}) or {}).get("theme")),
            "language": mb_normalize_language(
                (mb["profiles"].get("Goodog2013", {}).get("settings", {}) or {}).get("language")
            ),
        },
    }

    mb_ensure_profile_card_ids(mb["profiles"])

    raw_sessions = raw.get("sessions", {})
    if isinstance(raw_sessions, dict):
        for token, session in raw_sessions.items():
            if not isinstance(session, dict):
                continue
            uname = str(session.get("username") or "").strip()
            if not uname or uname not in mb["profiles"]:
                continue
            mb["sessions"][str(token)] = {
                "username": uname,
                "createdAt": int(session.get("createdAt") or now_ts),
                "lastSeen": int(session.get("lastSeen") or now_ts),
                "ip": str(session.get("ip") or ""),
            }

    raw_transfers = raw.get("transfers", [])
    if isinstance(raw_transfers, list):
        for item in raw_transfers[-500:]:
            if not isinstance(item, dict):
                continue
            from_user = str(item.get("from") or "").strip()
            to_user = str(item.get("to") or "").strip()
            amount_cents = int(item.get("amountCents") or 0)
            if not from_user or not to_user or amount_cents <= 0:
                continue
            mb["transfers"].append(
                {
                    "id": str(item.get("id") or f"tr_{uuid.uuid4().hex[:12]}"),
                    "from": from_user,
                    "to": to_user,
                    "amountCents": amount_cents,
                    "timestamp": int(item.get("timestamp") or now_ts),
                    "status": str(item.get("status") or "Posted"),
                    "description": mb_clean_text(item.get("description"), 180),
                }
            )

    return mb


def mb_public_profile(profile):
    cents = int(profile.get("balanceCents") or 0)
    role = mb_normalize_role(profile.get("role"), bool(profile.get("isAdmin", False)))
    card_id = mb_normalize_card_id(profile.get("cardId"))
    return {
        "username": str(profile.get("username") or ""),
        "cardId": card_id,
        "balanceCents": cents,
        "balance": round(cents / 100.0, 2),
        "isAdmin": role == "admin",
        "role": role,
        "lastLoginAt": int(profile.get("lastLoginAt") or 0),
        "avatar": mb_sanitize_avatar(profile.get("avatar")),
    }


def mb_public_state(mb, me_username=None):
    profiles = mb.get("profiles", {})
    rows = []
    if isinstance(profiles, dict):
        for _, profile in profiles.items():
            if not isinstance(profile, dict):
                continue
            rows.append(mb_public_profile(profile))
    rows.sort(key=lambda x: (-int(x.get("balanceCents") or 0), str(x.get("username") or "").lower()))

    public_transfers = []
    for tx in list(mb.get("transfers", [])):
        if not isinstance(tx, dict):
            continue
        from_user = str(tx.get("from") or "")
        to_user = str(tx.get("to") or "")
        tx_status = str(tx.get("status") or "")
        if from_user == "BANK_RESERVE" or to_user == "BANK_RESERVE" or tx_status.startswith("Reserve"):
            continue
        public_transfers.append(tx)

    payload = {
        "revision": int(mb.get("revision") or 0),
        "updatedAt": int(mb.get("updatedAt") or 0),
        "profiles": rows,
        "transfers": public_transfers[-120:],
    }
    if me_username and isinstance(profiles, dict) and me_username in profiles:
        me_profile = profiles[me_username]
        payload["me"] = mb_public_profile(me_profile)
        payload["me"]["settings"] = {
            "theme": mb_normalize_theme((me_profile.get("settings", {}) or {}).get("theme")),
            "language": mb_normalize_language((me_profile.get("settings", {}) or {}).get("language")),
        }
        if bool(payload["me"].get("isAdmin", False)):
            reserve_cents = int(mb.get("bankReserveCents") or 0)
            payload["bankReserveCents"] = reserve_cents
            payload["bankReserve"] = round(reserve_cents / 100.0, 2)
    return payload


def mb_parse_amount_to_cents(raw_amount):
    try:
        amount = float(str(raw_amount).strip().replace(",", "."))
    except Exception:
        return None
    cents = int(round(amount * 100))
    if cents <= 0:
        return None
    return cents


def mb_parse_amount_to_cents_non_negative(raw_amount):
    try:
        amount = float(str(raw_amount).strip().replace(",", "."))
    except Exception:
        return None
    cents = int(round(amount * 100))
    if cents < 0:
        return None
    return cents


def mb_sanitize_username(raw_name):
    name = str(raw_name or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_]{3,24}", name):
        return ""
    return name


def mb_new_token():
    return uuid.uuid4().hex


def mb_auth_username(mb, token):
    sessions = mb.get("sessions", {})
    if not isinstance(sessions, dict):
        return ""
    token = str(token or "").strip()
    if not token:
        return ""
    session = sessions.get(token)
    if not isinstance(session, dict):
        return ""
    uname = str(session.get("username") or "").strip()
    profiles = mb.get("profiles", {})
    if not uname or not isinstance(profiles, dict) or uname not in profiles:
        sessions.pop(token, None)
        return ""
    session["lastSeen"] = int(time.time())
    return uname


def mb_bump_revision(mb):
    mb["revision"] = int(mb.get("revision") or 0) + 1
    mb["updatedAt"] = int(time.time())


def mb_trim_transfers(mb, keep=500):
    transfers = mb.get("transfers", [])
    if isinstance(transfers, list) and len(transfers) > keep:
        mb["transfers"] = transfers[-keep:]


def mb_create_transfer(mb, from_user, to_user, amount_cents, status="Posted", description=""):
    transfer = {
        "id": f"tr_{uuid.uuid4().hex[:12]}",
        "from": from_user,
        "to": to_user,
        "amountCents": int(amount_cents),
        "timestamp": int(time.time()),
        "status": str(status or "Posted"),
        "description": mb_clean_text(description, 180),
    }
    mb.setdefault("transfers", []).append(transfer)
    mb_trim_transfers(mb)
    return transfer


def mb_apply_mdm_checkout(mb, buyer_username, payouts_raw, order_ref):
    buyer_username = str(buyer_username or "").strip()
    if not buyer_username:
        return None, "buyerUsername is required", HTTPStatus.BAD_REQUEST
    if not isinstance(payouts_raw, list) or not payouts_raw:
        return None, "payouts must be a non-empty array", HTTPStatus.BAD_REQUEST
    if len(payouts_raw) > 100:
        return None, "too many payout rows", HTTPStatus.BAD_REQUEST

    profiles = mb.get("profiles", {})
    if not isinstance(profiles, dict):
        return None, "BANK_PROFILE_NOT_FOUND", HTTPStatus.NOT_FOUND

    buyer_profile = profiles.get(buyer_username)
    if not isinstance(buyer_profile, dict):
        return None, "BANK_PROFILE_NOT_FOUND", HTTPStatus.NOT_FOUND

    merged_payouts = {}
    total_cents = 0
    for row in payouts_raw:
        if not isinstance(row, dict):
            return None, "invalid payout row", HTTPStatus.BAD_REQUEST
        to_username = str(row.get("toUsername") or "").strip()
        amount_cents = mb_parse_amount_to_cents(row.get("amount"))
        if not to_username or amount_cents is None:
            return None, "invalid payout row", HTTPStatus.BAD_REQUEST
        if to_username == buyer_username:
            return None, "cannot transfer to yourself", HTTPStatus.BAD_REQUEST
        if not isinstance(profiles.get(to_username), dict):
            return None, "BANK_PROFILE_NOT_FOUND", HTTPStatus.NOT_FOUND
        merged_payouts[to_username] = int(merged_payouts.get(to_username) or 0) + int(amount_cents)
        total_cents += int(amount_cents)

    if total_cents <= 0:
        return None, "invalid amount", HTTPStatus.BAD_REQUEST

    buyer_balance = int(buyer_profile.get("balanceCents") or 0)
    if buyer_balance < total_cents:
        return None, "INSUFFICIENT_FUNDS", HTTPStatus.BAD_REQUEST

    buyer_profile["balanceCents"] = buyer_balance - total_cents
    transfers = []
    balances = {buyer_username: int(buyer_profile.get("balanceCents") or 0)}
    description = "MDM checkout"
    safe_order_ref = mb_clean_text(order_ref, 120)
    if safe_order_ref:
        description = f"MDM checkout {safe_order_ref}"

    for to_username in sorted(merged_payouts.keys(), key=lambda x: str(x).lower()):
        amount_cents = int(merged_payouts.get(to_username) or 0)
        if amount_cents <= 0:
            continue
        to_profile = profiles.get(to_username)
        to_profile["balanceCents"] = int(to_profile.get("balanceCents") or 0) + amount_cents
        balances[to_username] = int(to_profile.get("balanceCents") or 0)
        transfers.append(
            mb_create_transfer(
                mb,
                buyer_username,
                to_username,
                amount_cents,
                status="Posted",
                description=description,
            )
        )

    mb_bump_revision(mb)
    return {
        "totalCents": total_cents,
        "transfers": transfers,
        "balances": balances,
        "buyerUsername": buyer_username,
    }, "", HTTPStatus.OK


def mdm_bridge_post(upstream_path, payload):
    body_bytes = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
    conn = None
    try:
        conn = http.client.HTTPConnection(MDM_BACKEND_HOST, MDM_BACKEND_PORT, timeout=120)
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": str(len(body_bytes)),
            "Host": f"{MDM_BACKEND_HOST}:{MDM_BACKEND_PORT}",
        }
        bridge_secret = str(os.environ.get("MB_BANK_BRIDGE_SECRET") or "mdm_bridge_secret_2026")
        if bridge_secret:
            headers["x-mb-bank-bridge-secret"] = bridge_secret
        conn.request("POST", str(upstream_path or "/api/health"), body=body_bytes, headers=headers)
        response = conn.getresponse()
        raw = response.read()
        try:
            parsed = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            parsed = {"ok": False, "error": "invalid upstream response"}
        return int(response.status or 500), parsed
    except Exception as exc:
        return 502, {"ok": False, "error": f"MDM bridge unavailable: {exc}"}
    finally:
        try:
            if conn is not None:
                conn.close()
        except Exception:
            pass


def load_db():
    ensure_database_file()
    # Accept both UTF-8 and UTF-8 with BOM to avoid crashes after external edits.
    with open(DB_FILE, "r", encoding="utf-8-sig") as f:
        db = json.load(f)
    if not isinstance(db, dict):
        db = {}
    db.setdefault("online", {})
    db["online"].setdefault("byIp", {})
    db.setdefault("social", {})
    db["social"].setdefault("votes", {})
    db["social"].setdefault("presence", {})
    db["mbBank"] = normalize_mb_bank_data(db.get("mbBank"))
    return db


def save_db(db):
    db_to_write = deepcopy(db) if isinstance(db, dict) else {}
    if isinstance(db_to_write.get("mbBank"), dict):
        db_to_write["mbBank"] = normalize_mb_bank_data(db_to_write.get("mbBank"))
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(db_to_write, f, ensure_ascii=False, indent=2)


class GameHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        try:
            super().log_message(format, *args)
        except Exception:
            # Logging sink may be unavailable in detached/background launches.
            pass

    def log_error(self, format, *args):
        try:
            super().log_error(format, *args)
        except Exception:
            pass

    def end_headers(self):
        # Avoid stale hub/game UI after deployments: disable cache for text assets.
        try:
            raw_path = self.path.split("?", 1)[0].lower()
        except Exception:
            raw_path = ""
        if not raw_path.startswith("/api/") and raw_path.endswith((".html", ".json", ".js", ".css")):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def guess_type(self, path):
        ctype = super().guess_type(path)
        lower = path.lower()
        if lower.endswith(".html"):
            return "text/html; charset=utf-8"
        if lower.endswith(".json"):
            return "application/json; charset=utf-8"
        return ctype

    def _client_ip(self):
        forwarded = self.headers.get("X-Forwarded-For", "").strip()
        if forwarded:
            return forwarded.split(",")[0].strip()
        return self.client_address[0]

    def _public_payload_with_game_data(self, db, ip):
        # Config shared for all clients
        payload = {
            "network": db.get("network", {}),
            "gameTimeSeconds": db.get("gameTimeSeconds", 45),
            "themes": db.get("themes", []),
            "baskets": db.get("baskets", []),
            "starSkins": db.get("starSkins", []),
            "fieldSkins": db.get("fieldSkins", []),
            "cartoons": db.get("cartoons", []),
            "clientIp": ip,
        }

        by_ip = db["online"]["byIp"]
        if ip not in by_ip:
            legacy_game_data = db.get("gameData")
            if isinstance(legacy_game_data, dict) and legacy_game_data.get("accounts"):
                by_ip[ip] = deepcopy(legacy_game_data)
            else:
                by_ip[ip] = default_player_data()
            save_db(db)

        payload["gameData"] = deepcopy(by_ip[ip])
        return payload

    def _send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def _is_mdm_api_proxy_path(self, raw_path):
        return raw_path.startswith(f"{MDM_PROXY_PREFIX}/")

    def _is_mdm_upload_proxy_path(self, raw_path):
        return raw_path.startswith("/uploads/")

    def _to_mdm_upstream_path(self):
        if self.path.startswith(MDM_PROXY_PREFIX):
            return f"/api{self.path[len(MDM_PROXY_PREFIX):]}"
        return self.path

    def _proxy_to_mdm(self, upstream_path):
        method = str(self.command or "GET").upper()
        body = b""
        if method in ("POST", "PUT", "PATCH", "DELETE"):
            try:
                length = int(self.headers.get("Content-Length", "0") or 0)
            except Exception:
                length = 0
            if length > 0:
                body = self.rfile.read(length)

        conn = None
        try:
            conn = http.client.HTTPConnection(MDM_BACKEND_HOST, MDM_BACKEND_PORT, timeout=120)
            upstream_headers = {}
            for key, value in self.headers.items():
                lower = key.lower()
                if lower in {
                    "host",
                    "connection",
                    "proxy-connection",
                    "content-length",
                    "transfer-encoding",
                }:
                    continue
                upstream_headers[key] = value
            upstream_headers["Host"] = f"{MDM_BACKEND_HOST}:{MDM_BACKEND_PORT}"
            if body:
                upstream_headers["Content-Length"] = str(len(body))

            conn.request(method, upstream_path, body=body if body else None, headers=upstream_headers)
            response = conn.getresponse()

            self.send_response(response.status, response.reason)
            for key, value in response.getheaders():
                lower = key.lower()
                if lower in {
                    "connection",
                    "keep-alive",
                    "proxy-authenticate",
                    "proxy-authorization",
                    "te",
                    "trailer",
                    "trailers",
                    "transfer-encoding",
                    "upgrade",
                }:
                    continue
                self.send_header(key, value)
            self.end_headers()

            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
            return
        except Exception as exc:
            message = {"message": "MDM backend is unavailable", "details": str(exc)}
            self._send_json(message, HTTPStatus.BAD_GATEWAY)
            return
        finally:
            try:
                if conn is not None:
                    conn.close()
            except Exception:
                pass

    def _handle_mdm_qr_pay(self, payload):
        token = str(payload.get("token") or "").strip()
        qr_payload = str(payload.get("qrPayload") or payload.get("qrToken") or payload.get("code") or "").strip()
        if not token:
            self._send_json({"ok": False, "error": "token is required"}, HTTPStatus.BAD_REQUEST)
            return
        if not qr_payload:
            self._send_json({"ok": False, "error": "qrPayload is required"}, HTTPStatus.BAD_REQUEST)
            return

        with DB_LOCK:
            db = load_db()
            current = db.get("mbBank", default_mb_bank_data())
            username = mb_auth_username(current, token)
            if not username:
                self._send_json({"ok": False, "error": "NOT_AUTHORIZED"}, HTTPStatus.UNAUTHORIZED)
                return
            db["mbBank"] = current
            save_db(db)

        status_code, upstream = mdm_bridge_post(
            "/api/integrations/mb-bank/qr-pay",
            {
                "buyerUsername": username,
                "qrPayload": qr_payload,
                "secret": str(os.environ.get("MB_BANK_BRIDGE_SECRET") or "mdm_bridge_secret_2026"),
            },
        )
        if status_code >= 400 or not isinstance(upstream, dict) or upstream.get("ok") is False:
            message = "MDM QR payment failed"
            if isinstance(upstream, dict):
                message = str(upstream.get("message") or upstream.get("error") or message)
            self._send_json({"ok": False, "error": message}, HTTPStatus(status_code if status_code >= 400 else 500))
            return

        with DB_LOCK:
            db = load_db()
            current = db.get("mbBank", default_mb_bank_data())
            # Keep session alive for the user who just paid by QR.
            _ = mb_auth_username(current, token)
            db["mbBank"] = current
            save_db(db)
            self._send_json(
                {
                    "ok": True,
                    "paid": bool(upstream.get("paid", True)),
                    "alreadyPaid": bool(upstream.get("alreadyPaid", False)),
                    "order": upstream.get("order"),
                    "qrToken": upstream.get("qrToken", ""),
                    "appliedPromoCode": upstream.get("appliedPromoCode", ""),
                    "mbBank": mb_public_state(current, username),
                    "clientIp": self._client_ip(),
                },
                HTTPStatus.OK,
            )
            return

    def _build_leaderboard(self, db):
        merged = {}
        now_ts = time.time()
        by_ip = db.get("online", {}).get("byIp", {})
        for ip, game_data in by_ip.items():
            accounts = game_data.get("accounts", {})
            if not isinstance(accounts, dict):
                continue
            for name, prof in accounts.items():
                if not isinstance(prof, dict):
                    continue
                acc_name = str(prof.get("name") or name).strip() or str(name)
                best = float(prof.get("best") or 0)
                coins = int(prof.get("coins") or 0)
                # Hide empty accounts with zero progress from leaderboard.
                if best <= 0 and coins <= 0:
                    continue
                prev = merged.get(acc_name)
                if prev is None:
                    merged[acc_name] = {"name": acc_name, "best": best, "coins": coins, "ip": ip}
                else:
                    # Merge duplicate names from different devices/IPs into one row.
                    if best > prev["best"] or (best == prev["best"] and coins > prev["coins"]):
                        prev["best"] = best
                        prev["coins"] = coins
                        prev["ip"] = ip

        # Inject social data: status/avatar and reaction counters.
        presence = db.get("social", {}).get("presence", {})
        votes = db.get("social", {}).get("votes", {})
        for name, row in merged.items():
            p = presence.get(name, {}) if isinstance(presence, dict) else {}
            status = "offline"
            if isinstance(p, dict):
                last_seen = float(p.get("lastSeen") or 0)
                raw_status = str(p.get("status") or "online")
                if now_ts - last_seen <= 180:
                    status = raw_status if raw_status in ("playing", "online", "away", "offline") else "online"
                row["avatar"] = str(p.get("avatar") or "")
                row["profileCoins"] = int(p.get("coins") or row["coins"])
                row["profileBest"] = float(p.get("best") or row["best"])
            row["status"] = status

            like_count = 0
            dislike_count = 0
            target_votes = votes.get(name, {})
            if isinstance(target_votes, dict):
                for _, vote in target_votes.items():
                    if vote == "like":
                        like_count += 1
                    elif vote == "dislike":
                        dislike_count += 1
            row["likes"] = like_count
            row["dislikes"] = dislike_count
        rows = list(merged.values())
        rows.sort(key=lambda x: (-x["best"], -x["coins"], x["name"]))
        return rows[:100]

    def _delete_account_everywhere(self, db, account_name):
        removed = 0
        name = str(account_name or "").strip()
        if not name:
            return removed

        # Remove from legacy gameData if present
        legacy = db.get("gameData")
        if isinstance(legacy, dict):
            legacy_accounts = legacy.get("accounts")
            if isinstance(legacy_accounts, dict) and name in legacy_accounts:
                del legacy_accounts[name]
                removed += 1
                if legacy.get("currentAccount") == name:
                    legacy["currentAccount"] = next(iter(legacy_accounts.keys()), "")

        # Remove from all online-by-ip snapshots
        by_ip = db.get("online", {}).get("byIp", {})
        if isinstance(by_ip, dict):
            for _, game_data in by_ip.items():
                if not isinstance(game_data, dict):
                    continue
                accounts = game_data.get("accounts")
                if not isinstance(accounts, dict):
                    continue
                if name in accounts:
                    del accounts[name]
                    removed += 1
                    if game_data.get("currentAccount") == name:
                        game_data["currentAccount"] = next(iter(accounts.keys()), "")
        return removed

    def _log_timed_event_activations(self, old_game_data, new_game_data, ip):
        old_accounts = old_game_data.get("accounts", {}) if isinstance(old_game_data, dict) else {}
        new_accounts = new_game_data.get("accounts", {}) if isinstance(new_game_data, dict) else {}
        if not isinstance(old_accounts, dict) or not isinstance(new_accounts, dict):
            return

        for account_name, new_profile in new_accounts.items():
            if not isinstance(new_profile, dict):
                continue
            old_profile = old_accounts.get(account_name, {})
            if not isinstance(old_profile, dict):
                old_profile = {}
            old_count = int(old_profile.get("timedEventsTriggered") or 0)
            new_count = int(new_profile.get("timedEventsTriggered") or 0)
            if new_count > old_count:
                delta = new_count - old_count
                msg = (
                    f"[EVENT] Timed event activated: ip={ip} account={account_name} "
                    f"+{delta} (total={new_count})"
                )
                print(f"{RED}{msg}{RESET}")

    def _status_from_client(self, is_playing, auto_status, manual_status):
        if is_playing:
            return "playing"
        if auto_status:
            return "online"
        m = str(manual_status or "online")
        return m if m in ("online", "away", "offline") else "online"

    def _upsert_presence(self, db, account_name, profile_data, ip, client_state):
        name = str(account_name or "").strip()
        if not name or not isinstance(profile_data, dict):
            return
        settings = profile_data.get("settings", {}) if isinstance(profile_data.get("settings"), dict) else {}
        is_playing = bool(client_state.get("isPlaying", False))
        auto_status = settings.get("statusAuto", True) is not False
        manual_status = settings.get("manualStatus", "online")
        status = self._status_from_client(is_playing, auto_status, manual_status)
        db["social"]["presence"][name] = {
            "status": status,
            "lastSeen": time.time(),
            "avatar": str(profile_data.get("avatar") or ""),
            "coins": int(profile_data.get("coins") or 0),
            "best": float(profile_data.get("best") or 0),
            "ip": ip,
        }

    def do_GET(self):
        raw_path = self.path.split("?", 1)[0]
        if self._is_mdm_api_proxy_path(raw_path):
            self._proxy_to_mdm(self._to_mdm_upstream_path())
            return
        if self._is_mdm_upload_proxy_path(raw_path):
            self._proxy_to_mdm(self.path)
            return

        if self.path == "/api/database":
            with DB_LOCK:
                db = load_db()
                data = self._public_payload_with_game_data(db, self._client_ip())
            self._send_json(data, HTTPStatus.OK)
            return
        if self.path == "/api/mb-bank":
            with DB_LOCK:
                db = load_db()
                mb = db.get("mbBank", default_mb_bank_data())
                data = {
                    "ok": True,
                    "mbBank": mb_public_state(mb),
                    "clientIp": self._client_ip(),
                }
            self._send_json(data, HTTPStatus.OK)
            return
        if self.path == "/api/leaderboard":
            with DB_LOCK:
                db = load_db()
                data = {"rows": self._build_leaderboard(db)}
            self._send_json(data, HTTPStatus.OK)
            return
        return super().do_GET()

    def do_POST(self):
        raw_path = self.path.split("?", 1)[0]
        if self._is_mdm_api_proxy_path(raw_path):
            self._proxy_to_mdm(self._to_mdm_upstream_path())
            return
        if self._is_mdm_upload_proxy_path(raw_path):
            self._proxy_to_mdm(self.path)
            return

        if self.path in (
            "/api/database",
            "/api/game-data",
            "/api/mb-bank",
            "/api/delete-account",
            "/api/leaderboard-react",
            "/api/presence",
        ):
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            try:
                payload = json.loads(raw.decode("utf-8"))
                if not isinstance(payload, dict):
                    raise ValueError("Payload must be object")
            except Exception as exc:
                self._send_json({"ok": False, "error": f"Invalid JSON: {exc}"}, HTTPStatus.BAD_REQUEST)
                return

            if self.path == "/api/database":
                with DB_LOCK:
                    save_db(payload)
                self._send_json({"ok": True}, HTTPStatus.OK)
                return

            if self.path == "/api/mb-bank":
                action = str(payload.get("action") or "").strip().lower()
                if not action:
                    self._send_json({"ok": False, "error": "action is required"}, HTTPStatus.BAD_REQUEST)
                    return

                if action == "mdm_qr_pay":
                    self._handle_mdm_qr_pay(payload)
                    return

                with DB_LOCK:
                    db = load_db()
                    current = db.get("mbBank", default_mb_bank_data())

                    if action == "register":
                        username = mb_sanitize_username(payload.get("username"))
                        password = str(payload.get("password") or "")
                        if not username:
                            self._send_json(
                                {
                                    "ok": False,
                                    "error": "username must match [A-Za-z0-9_] and be 3..24 chars",
                                },
                                HTTPStatus.BAD_REQUEST,
                            )
                            return
                        if len(password) < 6:
                            self._send_json(
                                {"ok": False, "error": "password must be at least 6 characters"},
                                HTTPStatus.BAD_REQUEST,
                            )
                            return
                        profiles = current.setdefault("profiles", {})
                        if username in profiles:
                            self._send_json(
                                {"ok": False, "error": "username already exists"},
                                HTTPStatus.CONFLICT,
                            )
                            return
                        used_card_ids = set()
                        for profile in profiles.values():
                            if not isinstance(profile, dict):
                                continue
                            existing_id = mb_normalize_card_id(profile.get("cardId"))
                            if existing_id:
                                used_card_ids.add(existing_id)
                        card_id = mb_generate_card_id(used_card_ids)

                        profiles[username] = {
                            "username": username,
                            "password": password,
                            "cardId": card_id,
                            "balanceCents": 100000,
                            "isAdmin": False,
                            "role": "buyer",
                            "createdAt": int(time.time()),
                            "lastLoginAt": int(time.time()),
                            "avatar": "",
                            "settings": {"theme": "night", "language": "ru"},
                        }
                        token = mb_new_token()
                        current.setdefault("sessions", {})[token] = {
                            "username": username,
                            "createdAt": int(time.time()),
                            "lastSeen": int(time.time()),
                            "ip": self._client_ip(),
                        }
                        mb_bump_revision(current)
                        db["mbBank"] = current
                        save_db(db)
                        self._send_json(
                            {
                                "ok": True,
                                "token": token,
                                "mbBank": mb_public_state(current, username),
                                "clientIp": self._client_ip(),
                            },
                            HTTPStatus.OK,
                        )
                        return

                    if action == "login":
                        username = str(payload.get("username") or "").strip()
                        password = str(payload.get("password") or "")
                        profile = current.get("profiles", {}).get(username)
                        if not isinstance(profile, dict) or str(profile.get("password") or "") != password:
                            self._send_json(
                                {"ok": False, "error": "invalid username or password"},
                                HTTPStatus.UNAUTHORIZED,
                            )
                            return
                        profile["lastLoginAt"] = int(time.time())
                        token = mb_new_token()
                        current.setdefault("sessions", {})[token] = {
                            "username": username,
                            "createdAt": int(time.time()),
                            "lastSeen": int(time.time()),
                            "ip": self._client_ip(),
                        }
                        mb_bump_revision(current)
                        db["mbBank"] = current
                        save_db(db)
                        self._send_json(
                            {
                                "ok": True,
                                "token": token,
                                "mbBank": mb_public_state(current, username),
                                "clientIp": self._client_ip(),
                            },
                            HTTPStatus.OK,
                        )
                        return

                    if action == "logout":
                        token = str(payload.get("token") or "").strip()
                        if token:
                            current.setdefault("sessions", {}).pop(token, None)
                            db["mbBank"] = current
                            save_db(db)
                        self._send_json({"ok": True}, HTTPStatus.OK)
                        return

                    if action == "state":
                        token = str(payload.get("token") or "").strip()
                        username = mb_auth_username(current, token)
                        if not username:
                            self._send_json(
                                {"ok": False, "error": "NOT_AUTHORIZED"},
                                HTTPStatus.UNAUTHORIZED,
                            )
                            return
                        db["mbBank"] = current
                        save_db(db)
                        self._send_json(
                            {
                                "ok": True,
                                "mbBank": mb_public_state(current, username),
                                "clientIp": self._client_ip(),
                            },
                            HTTPStatus.OK,
                        )
                        return

                    if action == "transfer":
                        token = str(payload.get("token") or "").strip()
                        username = mb_auth_username(current, token)
                        if not username:
                            self._send_json(
                                {"ok": False, "error": "NOT_AUTHORIZED"},
                                HTTPStatus.UNAUTHORIZED,
                            )
                            return
                        to_username = str(payload.get("toUsername") or "").strip()
                        to_card_id = mb_normalize_card_id(payload.get("toCardId"))
                        amount_cents = mb_parse_amount_to_cents(payload.get("amount"))
                        description = mb_clean_text(payload.get("description"), 180)
                        if not to_username and not to_card_id:
                            self._send_json(
                                {"ok": False, "error": "toUsername or toCardId is required"},
                                HTTPStatus.BAD_REQUEST,
                            )
                            return
                        if amount_cents is None:
                            self._send_json(
                                {"ok": False, "error": "invalid amount"},
                                HTTPStatus.BAD_REQUEST,
                            )
                            return
                        profiles = current.get("profiles", {})
                        if not isinstance(profiles, dict):
                            profiles = {}
                        if not to_username and to_card_id:
                            for candidate_username, candidate_profile in profiles.items():
                                if not isinstance(candidate_profile, dict):
                                    continue
                                if mb_normalize_card_id(candidate_profile.get("cardId")) == to_card_id:
                                    to_username = str(candidate_username)
                                    break
                            if not to_username:
                                self._send_json(
                                    {"ok": False, "error": "card not found"},
                                    HTTPStatus.NOT_FOUND,
                                )
                                return
                        if to_username == username:
                            self._send_json(
                                {"ok": False, "error": "cannot transfer to yourself"},
                                HTTPStatus.BAD_REQUEST,
                            )
                            return
                        from_profile = profiles.get(username)
                        to_profile = profiles.get(to_username)
                        if not isinstance(from_profile, dict) or not isinstance(to_profile, dict):
                            self._send_json(
                                {"ok": False, "error": "profile not found"},
                                HTTPStatus.NOT_FOUND,
                            )
                            return
                        if int(from_profile.get("balanceCents") or 0) < amount_cents:
                            self._send_json(
                                {"ok": False, "error": "INSUFFICIENT_FUNDS"},
                                HTTPStatus.BAD_REQUEST,
                            )
                            return

                        from_profile["balanceCents"] = int(from_profile.get("balanceCents") or 0) - amount_cents
                        to_profile["balanceCents"] = int(to_profile.get("balanceCents") or 0) + amount_cents
                        transfer = mb_create_transfer(
                            current,
                            username,
                            to_username,
                            amount_cents,
                            status="Posted",
                            description=description,
                        )
                        mb_bump_revision(current)
                        db["mbBank"] = current
                        save_db(db)
                        self._send_json(
                            {
                                "ok": True,
                                "transfer": transfer,
                                "mbBank": mb_public_state(current, username),
                                "clientIp": self._client_ip(),
                            },
                            HTTPStatus.OK,
                        )
                        return

                    if action == "mdm_checkout":
                        bridge_secret = str(os.environ.get("MB_BANK_BRIDGE_SECRET") or "mdm_bridge_secret_2026")
                        provided_secret = str(payload.get("secret") or "")
                        if not bridge_secret or provided_secret != bridge_secret:
                            self._send_json(
                                {"ok": False, "error": "MDM_AUTH_REQUIRED"},
                                HTTPStatus.FORBIDDEN,
                            )
                            return

                        checkout_data, checkout_error, checkout_status = mb_apply_mdm_checkout(
                            current,
                            payload.get("buyerUsername"),
                            payload.get("payouts"),
                            payload.get("orderRef"),
                        )
                        if checkout_error:
                            self._send_json(
                                {"ok": False, "error": checkout_error},
                                checkout_status,
                            )
                            return

                        buyer_username = str((checkout_data or {}).get("buyerUsername") or "").strip()
                        db["mbBank"] = current
                        save_db(db)
                        self._send_json(
                            {
                                "ok": True,
                                "totalCents": int((checkout_data or {}).get("totalCents") or 0),
                                "transfers": list((checkout_data or {}).get("transfers") or []),
                                "balances": dict((checkout_data or {}).get("balances") or {}),
                                "mbBank": mb_public_state(current, buyer_username),
                                "clientIp": self._client_ip(),
                            },
                            HTTPStatus.OK,
                        )
                        return

                    if action == "mdm_checkout_card_auth":
                        bridge_secret = str(os.environ.get("MB_BANK_BRIDGE_SECRET") or "mdm_bridge_secret_2026")
                        provided_secret = str(payload.get("secret") or "")
                        if not bridge_secret or provided_secret != bridge_secret:
                            self._send_json(
                                {"ok": False, "error": "MDM_AUTH_REQUIRED"},
                                HTTPStatus.FORBIDDEN,
                            )
                            return

                        buyer_card_id = mb_normalize_card_id(payload.get("buyerCardId"))
                        buyer_password = str(payload.get("buyerPassword") or "")
                        expected_buyer_username = str(payload.get("expectedBuyerUsername") or "").strip()
                        if not buyer_password:
                            self._send_json({"ok": False, "error": "buyerPassword is required"}, HTTPStatus.BAD_REQUEST)
                            return

                        profiles = current.get("profiles", {})
                        if not isinstance(profiles, dict):
                            self._send_json({"ok": False, "error": "BANK_PROFILE_NOT_FOUND"}, HTTPStatus.NOT_FOUND)
                            return

                        buyer_username = ""
                        if buyer_card_id:
                            for candidate_username, candidate_profile in profiles.items():
                                if not isinstance(candidate_profile, dict):
                                    continue
                                if mb_normalize_card_id(candidate_profile.get("cardId")) != buyer_card_id:
                                    continue
                                if str(candidate_profile.get("password") or "") == buyer_password:
                                    buyer_username = str(candidate_username)
                                    break

                        if not buyer_username and expected_buyer_username:
                            expected_profile = profiles.get(expected_buyer_username)
                            if isinstance(expected_profile, dict) and str(expected_profile.get("password") or "") == buyer_password:
                                buyer_username = expected_buyer_username

                        if not buyer_username:
                            self._send_json({"ok": False, "error": "invalid card id or password"}, HTTPStatus.UNAUTHORIZED)
                            return
                        if expected_buyer_username and expected_buyer_username != buyer_username:
                            self._send_json({"ok": False, "error": "CARD_ACCOUNT_MISMATCH"}, HTTPStatus.FORBIDDEN)
                            return

                        checkout_data, checkout_error, checkout_status = mb_apply_mdm_checkout(
                            current,
                            buyer_username,
                            payload.get("payouts"),
                            payload.get("orderRef"),
                        )
                        if checkout_error:
                            self._send_json({"ok": False, "error": checkout_error}, checkout_status)
                            return

                        db["mbBank"] = current
                        save_db(db)
                        self._send_json(
                            {
                                "ok": True,
                                "buyerUsername": buyer_username,
                                "totalCents": int((checkout_data or {}).get("totalCents") or 0),
                                "transfers": list((checkout_data or {}).get("transfers") or []),
                                "balances": dict((checkout_data or {}).get("balances") or {}),
                                "mbBank": mb_public_state(current, buyer_username),
                                "clientIp": self._client_ip(),
                            },
                            HTTPStatus.OK,
                        )
                        return

                    if action == "admin_add_balance":
                        token = str(payload.get("token") or "").strip()
                        username = mb_auth_username(current, token)
                        if not username:
                            self._send_json(
                                {"ok": False, "error": "NOT_AUTHORIZED"},
                                HTTPStatus.UNAUTHORIZED,
                            )
                            return
                        profiles = current.get("profiles", {})
                        actor = profiles.get(username) if isinstance(profiles, dict) else None
                        actor_role = mb_normalize_role((actor or {}).get("role"), bool((actor or {}).get("isAdmin", False)))
                        if not isinstance(actor, dict) or actor_role != "admin":
                            self._send_json(
                                {"ok": False, "error": "ADMIN_REQUIRED"},
                                HTTPStatus.FORBIDDEN,
                            )
                            return
                        to_username = str(payload.get("toUsername") or "").strip()
                        amount_cents = mb_parse_amount_to_cents(payload.get("amount"))
                        description = mb_clean_text(payload.get("description"), 180)
                        if not to_username:
                            self._send_json(
                                {"ok": False, "error": "toUsername is required"},
                                HTTPStatus.BAD_REQUEST,
                            )
                            return
                        if amount_cents is None:
                            self._send_json(
                                {"ok": False, "error": "invalid amount"},
                                HTTPStatus.BAD_REQUEST,
                            )
                            return
                        to_profile = profiles.get(to_username) if isinstance(profiles, dict) else None
                        if not isinstance(to_profile, dict):
                            self._send_json(
                                {"ok": False, "error": "profile not found"},
                                HTTPStatus.NOT_FOUND,
                            )
                            return

                        reserve_cents = int(current.get("bankReserveCents") or 0)
                        if reserve_cents < amount_cents:
                            self._send_json(
                                {"ok": False, "error": "INSUFFICIENT_BANK_RESERVE"},
                                HTTPStatus.BAD_REQUEST,
                            )
                            return

                        current["bankReserveCents"] = reserve_cents - amount_cents
                        to_profile["balanceCents"] = int(to_profile.get("balanceCents") or 0) + amount_cents
                        credit = mb_create_transfer(
                            current,
                            "BANK_RESERVE",
                            to_username,
                            amount_cents,
                            status="ReserveTransferOut",
                            description=description,
                        )
                        mb_bump_revision(current)
                        db["mbBank"] = current
                        save_db(db)
                        self._send_json(
                            {
                                "ok": True,
                                "transfer": credit,
                                "mbBank": mb_public_state(current, username),
                                "clientIp": self._client_ip(),
                            },
                            HTTPStatus.OK,
                        )
                        return

                    if action == "admin_subtract_balance":
                        token = str(payload.get("token") or "").strip()
                        username = mb_auth_username(current, token)
                        if not username:
                            self._send_json(
                                {"ok": False, "error": "NOT_AUTHORIZED"},
                                HTTPStatus.UNAUTHORIZED,
                            )
                            return
                        profiles = current.get("profiles", {})
                        actor = profiles.get(username) if isinstance(profiles, dict) else None
                        actor_role = mb_normalize_role((actor or {}).get("role"), bool((actor or {}).get("isAdmin", False)))
                        if not isinstance(actor, dict) or actor_role != "admin":
                            self._send_json(
                                {"ok": False, "error": "ADMIN_REQUIRED"},
                                HTTPStatus.FORBIDDEN,
                            )
                            return
                        to_username = str(payload.get("toUsername") or "").strip()
                        amount_cents = mb_parse_amount_to_cents(payload.get("amount"))
                        description = mb_clean_text(payload.get("description"), 180)
                        if not to_username:
                            self._send_json(
                                {"ok": False, "error": "toUsername is required"},
                                HTTPStatus.BAD_REQUEST,
                            )
                            return
                        if amount_cents is None:
                            self._send_json(
                                {"ok": False, "error": "invalid amount"},
                                HTTPStatus.BAD_REQUEST,
                            )
                            return
                        to_profile = profiles.get(to_username) if isinstance(profiles, dict) else None
                        if not isinstance(to_profile, dict):
                            self._send_json(
                                {"ok": False, "error": "profile not found"},
                                HTTPStatus.NOT_FOUND,
                            )
                            return
                        if int(to_profile.get("balanceCents") or 0) < amount_cents:
                            self._send_json(
                                {"ok": False, "error": "INSUFFICIENT_FUNDS"},
                                HTTPStatus.BAD_REQUEST,
                            )
                            return

                        to_profile["balanceCents"] = int(to_profile.get("balanceCents") or 0) - amount_cents
                        current["bankReserveCents"] = int(current.get("bankReserveCents") or 0) + amount_cents
                        debit = mb_create_transfer(
                            current,
                            to_username,
                            "BANK_RESERVE",
                            amount_cents,
                            status="ReserveTransferIn",
                            description=description,
                        )
                        mb_bump_revision(current)
                        db["mbBank"] = current
                        save_db(db)
                        self._send_json(
                            {
                                "ok": True,
                                "transfer": debit,
                                "mbBank": mb_public_state(current, username),
                                "clientIp": self._client_ip(),
                            },
                            HTTPStatus.OK,
                        )
                        return

                    if action == "admin_set_bank_reserve":
                        token = str(payload.get("token") or "").strip()
                        username = mb_auth_username(current, token)
                        if not username:
                            self._send_json(
                                {"ok": False, "error": "NOT_AUTHORIZED"},
                                HTTPStatus.UNAUTHORIZED,
                            )
                            return
                        profiles = current.get("profiles", {})
                        actor = profiles.get(username) if isinstance(profiles, dict) else None
                        actor_role = mb_normalize_role((actor or {}).get("role"), bool((actor or {}).get("isAdmin", False)))
                        if not isinstance(actor, dict) or actor_role != "admin":
                            self._send_json(
                                {"ok": False, "error": "ADMIN_REQUIRED"},
                                HTTPStatus.FORBIDDEN,
                            )
                            return
                        amount_cents = mb_parse_amount_to_cents_non_negative(payload.get("amount"))
                        if amount_cents is None:
                            self._send_json(
                                {"ok": False, "error": "invalid amount"},
                                HTTPStatus.BAD_REQUEST,
                            )
                            return

                        old_reserve = int(current.get("bankReserveCents") or 0)
                        current["bankReserveCents"] = amount_cents
                        diff = abs(amount_cents - old_reserve)
                        if diff > 0:
                            mb_create_transfer(
                                current,
                                f"ADMIN:{username}",
                                "BANK_RESERVE",
                                diff,
                                status="ReserveSet",
                                description="manual reserve change",
                            )

                        mb_bump_revision(current)
                        db["mbBank"] = current
                        save_db(db)
                        self._send_json(
                            {
                                "ok": True,
                                "mbBank": mb_public_state(current, username),
                                "clientIp": self._client_ip(),
                            },
                            HTTPStatus.OK,
                        )
                        return

                    if action == "admin_set_user_role":
                        token = str(payload.get("token") or "").strip()
                        username = mb_auth_username(current, token)
                        if not username:
                            self._send_json({"ok": False, "error": "NOT_AUTHORIZED"}, HTTPStatus.UNAUTHORIZED)
                            return
                        profiles = current.get("profiles", {})
                        actor = profiles.get(username) if isinstance(profiles, dict) else None
                        actor_role = mb_normalize_role((actor or {}).get("role"), bool((actor or {}).get("isAdmin", False)))
                        if not isinstance(actor, dict) or actor_role != "admin":
                            self._send_json({"ok": False, "error": "ADMIN_REQUIRED"}, HTTPStatus.FORBIDDEN)
                            return
                        target_username = str(payload.get("toUsername") or "").strip()
                        new_role_raw = str(payload.get("role") or "").strip().lower()
                        if not target_username:
                            self._send_json({"ok": False, "error": "toUsername is required"}, HTTPStatus.BAD_REQUEST)
                            return
                        if new_role_raw not in MB_ALLOWED_ROLES:
                            self._send_json({"ok": False, "error": "invalid role"}, HTTPStatus.BAD_REQUEST)
                            return
                        target = profiles.get(target_username) if isinstance(profiles, dict) else None
                        if not isinstance(target, dict):
                            self._send_json({"ok": False, "error": "profile not found"}, HTTPStatus.NOT_FOUND)
                            return
                        if target_username == "Goodog2013" and new_role_raw != "admin":
                            self._send_json({"ok": False, "error": "ROOT_ADMIN_LOCKED"}, HTTPStatus.BAD_REQUEST)
                            return

                        target["role"] = new_role_raw
                        target["isAdmin"] = new_role_raw == "admin"
                        mb_bump_revision(current)
                        db["mbBank"] = current
                        save_db(db)
                        self._send_json(
                            {
                                "ok": True,
                                "mbBank": mb_public_state(current, username),
                                "clientIp": self._client_ip(),
                            },
                            HTTPStatus.OK,
                        )
                        return

                    if action == "admin_clear_transfers":
                        token = str(payload.get("token") or "").strip()
                        username = mb_auth_username(current, token)
                        if not username:
                            self._send_json({"ok": False, "error": "NOT_AUTHORIZED"}, HTTPStatus.UNAUTHORIZED)
                            return
                        profiles = current.get("profiles", {})
                        actor = profiles.get(username) if isinstance(profiles, dict) else None
                        actor_role = mb_normalize_role((actor or {}).get("role"), bool((actor or {}).get("isAdmin", False)))
                        if not isinstance(actor, dict) or actor_role != "admin":
                            self._send_json({"ok": False, "error": "ADMIN_REQUIRED"}, HTTPStatus.FORBIDDEN)
                            return
                        current["transfers"] = []
                        mb_bump_revision(current)
                        db["mbBank"] = current
                        save_db(db)
                        self._send_json(
                            {
                                "ok": True,
                                "mbBank": mb_public_state(current, username),
                                "clientIp": self._client_ip(),
                            },
                            HTTPStatus.OK,
                        )
                        return

                    if action == "update_profile":
                        token = str(payload.get("token") or "").strip()
                        username = mb_auth_username(current, token)
                        if not username:
                            self._send_json({"ok": False, "error": "NOT_AUTHORIZED"}, HTTPStatus.UNAUTHORIZED)
                            return
                        profiles = current.get("profiles", {})
                        profile = profiles.get(username) if isinstance(profiles, dict) else None
                        if not isinstance(profile, dict):
                            self._send_json({"ok": False, "error": "profile not found"}, HTTPStatus.NOT_FOUND)
                            return

                        changed = False
                        if "avatar" in payload:
                            raw_avatar = payload.get("avatar")
                            if raw_avatar in ("", None):
                                profile["avatar"] = ""
                                changed = True
                            else:
                                avatar = mb_sanitize_avatar(raw_avatar)
                                if not avatar:
                                    self._send_json({"ok": False, "error": "invalid avatar"}, HTTPStatus.BAD_REQUEST)
                                    return
                                profile["avatar"] = avatar
                                changed = True

                        if "theme" in payload:
                            theme = mb_normalize_theme(payload.get("theme"))
                            profile.setdefault("settings", {})
                            profile["settings"]["theme"] = theme
                            changed = True

                        if "language" in payload:
                            language = mb_normalize_language(payload.get("language"))
                            profile.setdefault("settings", {})
                            profile["settings"]["language"] = language
                            changed = True

                        if changed:
                            mb_bump_revision(current)
                            db["mbBank"] = current
                            save_db(db)

                        self._send_json(
                            {
                                "ok": True,
                                "mbBank": mb_public_state(current, username),
                                "clientIp": self._client_ip(),
                            },
                            HTTPStatus.OK,
                        )
                        return

                self._send_json(
                    {"ok": False, "error": f"unknown action: {action}"},
                    HTTPStatus.BAD_REQUEST,
                )
                return

            if self.path == "/api/delete-account":
                account_name = payload.get("name")
                if not isinstance(account_name, str) or not account_name.strip():
                    self._send_json({"ok": False, "error": "name is required"}, HTTPStatus.BAD_REQUEST)
                    return
                with DB_LOCK:
                    db = load_db()
                    removed = self._delete_account_everywhere(db, account_name)
                    save_db(db)
                self._send_json({"ok": True, "removed": removed, "name": account_name.strip()}, HTTPStatus.OK)
                return

            if self.path == "/api/leaderboard-react":
                target_name = str(payload.get("name") or "").strip()
                vote = str(payload.get("vote") or "").strip().lower()
                if not target_name:
                    self._send_json({"ok": False, "error": "name is required"}, HTTPStatus.BAD_REQUEST)
                    return
                if vote not in ("like", "dislike", "none"):
                    self._send_json({"ok": False, "error": "vote must be like/dislike/none"}, HTTPStatus.BAD_REQUEST)
                    return
                voter_ip = self._client_ip()
                with DB_LOCK:
                    db = load_db()
                    votes = db["social"]["votes"].setdefault(target_name, {})
                    if vote == "none":
                        votes.pop(voter_ip, None)
                    else:
                        votes[voter_ip] = vote
                    save_db(db)
                self._send_json({"ok": True}, HTTPStatus.OK)
                return

            if self.path == "/api/presence":
                account_name = str(payload.get("accountName") or "").strip()
                profile_data = payload.get("profile")
                client_state = payload.get("clientState", {}) if isinstance(payload.get("clientState"), dict) else {}
                if not account_name:
                    self._send_json({"ok": False, "error": "accountName is required"}, HTTPStatus.BAD_REQUEST)
                    return
                if not isinstance(profile_data, dict):
                    self._send_json({"ok": False, "error": "profile must be object"}, HTTPStatus.BAD_REQUEST)
                    return
                with DB_LOCK:
                    db = load_db()
                    ip = self._client_ip()
                    self._upsert_presence(db, account_name, profile_data, ip, client_state)
                    save_db(db)
                self._send_json({"ok": True}, HTTPStatus.OK)
                return

            game_data = payload.get("gameData")
            if not isinstance(game_data, dict):
                self._send_json({"ok": False, "error": "gameData must be object"}, HTTPStatus.BAD_REQUEST)
                return
            if not isinstance(game_data.get("accounts"), dict):
                self._send_json({"ok": False, "error": "gameData.accounts must be object"}, HTTPStatus.BAD_REQUEST)
                return
            if not game_data.get("currentAccount"):
                self._send_json({"ok": False, "error": "gameData.currentAccount is required"}, HTTPStatus.BAD_REQUEST)
                return

            with DB_LOCK:
                db = load_db()
                ip = self._client_ip()
                old_game_data = deepcopy(db["online"]["byIp"].get(ip, {}))
                db["online"]["byIp"][ip] = game_data
                # Presence for the current active account.
                client_state = payload.get("clientState", {}) if isinstance(payload.get("clientState"), dict) else {}
                current_name = str(game_data.get("currentAccount") or "").strip()
                current_profile = game_data.get("accounts", {}).get(current_name, {}) if current_name else {}
                self._upsert_presence(db, current_name, current_profile, ip, client_state)
                self._log_timed_event_activations(old_game_data, game_data, ip)
                save_db(db)

            self._send_json({"ok": True, "clientIp": self._client_ip()}, HTTPStatus.OK)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")

    def do_PUT(self):
        raw_path = self.path.split("?", 1)[0]
        if self._is_mdm_api_proxy_path(raw_path):
            self._proxy_to_mdm(self._to_mdm_upstream_path())
            return
        if self._is_mdm_upload_proxy_path(raw_path):
            self._proxy_to_mdm(self.path)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")

    def do_PATCH(self):
        raw_path = self.path.split("?", 1)[0]
        if self._is_mdm_api_proxy_path(raw_path):
            self._proxy_to_mdm(self._to_mdm_upstream_path())
            return
        if self._is_mdm_upload_proxy_path(raw_path):
            self._proxy_to_mdm(self.path)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")

    def do_DELETE(self):
        raw_path = self.path.split("?", 1)[0]
        if self._is_mdm_api_proxy_path(raw_path):
            self._proxy_to_mdm(self._to_mdm_upstream_path())
            return
        if self._is_mdm_upload_proxy_path(raw_path):
            self._proxy_to_mdm(self.path)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")

    def do_OPTIONS(self):
        raw_path = self.path.split("?", 1)[0]
        if self._is_mdm_api_proxy_path(raw_path) or self._is_mdm_upload_proxy_path(raw_path):
            self._proxy_to_mdm(self._to_mdm_upstream_path() if self._is_mdm_api_proxy_path(raw_path) else self.path)
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()


def main():
    parser = argparse.ArgumentParser(description="Star Game LAN server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    ensure_database_file()
    server = ThreadingHTTPServer((args.host, args.port), GameHandler)
    print(f"[INFO] Serving on http://{args.host}:{args.port}")
    print(
        "[INFO] API endpoints: /api/database, /api/game-data, /api/mb-bank, "
        "/api/leaderboard, /api/delete-account, /api/leaderboard-react, /api/presence, "
        "/api/mdm/* (proxy), /uploads/* (proxy)"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
