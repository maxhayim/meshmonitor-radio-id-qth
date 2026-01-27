#!/usr/bin/env python3
# mm_meta:
#   name: Radio Identity + QTH
#   emoji: 📟
#   language: Python
__version__ = "1.1.0"

"""
Radio Identity + QTH responder for MeshMonitor (Ham / GMRS / CB / Club)

Commands:
  !id <ham|gmrs|cb|club> <IDENTIFIER>   Save your preferred identity label
  !qth                                  Reply with your label + Maidenhead grid
                                       (+ distance/bearing to MeshMonitor station if available)

Notes:
- Responds only to explicit commands (no beaconing).
- Privacy-safe: reports only the requester's own position.
"""

import json
import math
import os
import re
import sys

DB_PATH = os.getenv("MM_RADIO_ID_DB_PATH", "/data/scripts/mm_radio_id_db.json")
MAX_LEN = int(os.getenv("MM_RADIO_ID_MAXLEN", "200"))


def reply(text: str) -> None:
    print(json.dumps({"response": text[:MAX_LEN]}))
    sys.exit(0)


def fnum(val):
    try:
        return float(val) if val and str(val).strip() else None
    except Exception:
        return None


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def load_db() -> dict:
    try:
        with open(DB_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                data.setdefault("by_node", {})
                return data
    except Exception:
        pass
    return {"by_node": {}}


def save_db(db: dict) -> None:
    try:
        tmp = DB_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=2)
        os.replace(tmp, DB_PATH)
    except Exception:
        pass


def sanitize(kind: str, raw: str):
    raw = norm(raw)
    if not (2 <= len(raw) <= 24):
        return None

    if kind == "ham":
        if " " in raw or not re.fullmatch(r"[A-Za-z0-9/]{3,24}", raw):
            return None
        return raw.upper()

    if kind == "gmrs":
        x = raw.upper().replace(" ", "")
        if not re.fullmatch(r"[A-Z0-9]{4,10}(-[A-Z0-9]{1,4})?", x):
            return None
        return x

    if kind == "cb":
        if not re.fullmatch(r"[A-Za-z0-9 _-]{2,24}", raw):
            return None
        return raw

    if kind == "club":
        if not re.fullmatch(r"[A-Za-z0-9 _-]{2,24}", raw):
            return None
        return raw.upper()

    return None


def label(kind: str, ident: str) -> str:
    return f"{kind.upper()} {ident}"


def maidenhead(lat, lon):
    if lat is None or lon is None:
        return None

    lat = max(min(lat, 90.0), -90.0) + 90.0
    lon = max(min(lon, 180.0), -180.0) + 180.0

    A = ord("A")
    field_lon = int(lon // 20)
    field_lat = int(lat // 10)
    square_lon = int((lon % 20) // 2)
    square_lat = int((lat % 10) // 1)
    sub_lon = int(((lon % 2) / 2) * 24)
    sub_lat = int(((lat % 1) / 1) * 24)

    return (
        chr(A + field_lon)
        + chr(A + field_lat)
        + str(square_lon)
        + str(square_lat)
        + chr(ord("a") + sub_lon)
        + chr(ord("a") + sub_lat)
    )


def miles(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return (2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))) * 0.621371


def bearing(lat1, lon1, lat2, lon2) -> int:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return int(round((math.degrees(math.atan2(y, x)) + 360) % 360))


MESSAGE = norm(os.getenv("MESSAGE", ""))
NODE_ID = norm(os.getenv("FROM_ID") or os.getenv("FROM_NODE_ID") or "")
SHORT = norm(os.getenv("FROM_SHORT_NAME", ""))
LONG = norm(os.getenv("FROM_LONG_NAME", ""))

FROM_LAT = fnum(os.getenv("FROM_LAT"))
FROM_LON = fnum(os.getenv("FROM_LON"))
MM_LAT = fnum(os.getenv("MM_LAT"))
MM_LON = fnum(os.getenv("MM_LON"))

fallback = SHORT or LONG or NODE_ID or "Sender"
db = load_db()

m_id = re.match(r"^!id\s+(ham|gmrs|cb|club)\s+(.+)$", MESSAGE, re.IGNORECASE)
m_qth = re.match(r"^!qth$", MESSAGE, re.IGNORECASE)

if m_id:
    kind = m_id.group(1).lower()
    ident = sanitize(kind, m_id.group(2))

    if not NODE_ID:
        reply("Cannot save identity: sender node ID missing.")
    if not ident:
        reply(f"Invalid {kind} identifier.")

    db["by_node"][NODE_ID] = {"type": kind, "id": ident}
    save_db(db)
    reply(f"Saved identity: {label(kind, ident)}")


if m_qth:
    rec = db["by_node"].get(NODE_ID)
    who = label(rec["type"], rec["id"]) if rec else fallback

    grid = maidenhead(FROM_LAT, FROM_LON)
    if not grid:
        reply(f"{who}: no GPS location available")

    if MM_LAT is not None and MM_LON is not None:
        d = miles(FROM_LAT, FROM_LON, MM_LAT, MM_LON)
        b = bearing(FROM_LAT, FROM_LON, MM_LAT, MM_LON)
        reply(f"{who}: {grid} • {d:.1f} mi @ {b}°")

    reply(f"{who}: {grid}")


reply("Commands: !id <ham|gmrs|cb|club> <id>; !qth")
