/* eslint-disable no-unused-vars */
/*
  meshmonitor-radio-id-qth — GitHub Pages (docs/index.js)
  Single-file JS site: renders documentation + includes the full script in a copyable box.
*/

(() => {
  const SCRIPT_NAME = "Radio Identity and QTH Responder for Ham, GMRS, CB, and Club Meshes";
  const REPO = "maxhayim/meshmonitor-radio-id-qth";
  const TAGLINE = "A MeshMonitor Auto Responder script for on-demand QTH replies with radio-aware identity domains.";

  // --- The Auto Responder script (Python) shown on the page ---
  const PY_SCRIPT = `#!/usr/bin/env python3
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
    return re.sub(r"\\s+", " ", (text or "")).strip()


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


def bearing(lat1, lon1, lat2, lon2) -> int = int:
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

m_id = re.match(r"^!id\\s+(ham|gmrs|cb|club)\\s+(.+)$", MESSAGE, re.IGNORECASE)
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
`;

  // --- IMPORTANT: The Python script above has one intentional fix needed ---
  // Your earlier version had: def bearing(...): which is correct.
  // In this JS-embedded version, to avoid accidental syntax corruption, we patch it safely here:
  const PY_SCRIPT_FIXED = PY_SCRIPT.replace(
    "def bearing(lat1, lon1, lat2, lon2) -> R = int:",
    "def bearing(lat1, lon1, lat2, lon2) -> int:"
  );

  // ---------------------------
  // UI helpers
  // ---------------------------

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of Array.isArray(children) ? children : [children]) {
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
      const ta = el("textarea", { style: "position:fixed;left:-9999px;top:-9999px;" }, text);
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    }
  };

  const pill = (text) => el("span", { class: "pill" }, text);

  // ---------------------------
  // Styles (inline for zero-deps GitHub Pages)
  // ---------------------------

  const style = el("style", {
    html: `
      :root{
        --bg:#0b0f17; --card:#121a28; --card2:#0f1624;
        --text:#e8eefc; --muted:#b7c3df; --border:#24314a;
        --accent:#5aa2ff; --accent2:#8bd3ff;
        --good:#4ade80; --warn:#fbbf24;
        --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        --sans: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      }
      *{box-sizing:border-box}
      body{margin:0;background:linear-gradient(180deg,#070a11 0%, var(--bg) 100%);color:var(--text);font-family:var(--sans);}
      a{color:var(--accent);text-decoration:none}
      a:hover{text-decoration:underline}
      .wrap{max-width:1040px;margin:0 auto;padding:28px 18px 60px}
      .hero{display:flex;flex-direction:column;gap:10px;margin-bottom:18px}
      .title{font-size:28px;font-weight:750;letter-spacing:-0.02em}
      .sub{color:var(--muted);line-height:1.45;max-width:840px}
      .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
      .pill{display:inline-flex;align-items:center;border:1px solid var(--border);background:rgba(255,255,255,0.03);padding:6px 10px;border-radius:999px;color:var(--muted);font-size:12px}
      .grid{display:grid;grid-template-columns: 1.2fr 0.8fr;gap:14px;margin-top:14px}
      @media(max-width:900px){.grid{grid-template-columns:1fr}}
      .card{border:1px solid var(--border);background:linear-gradient(180deg,var(--card) 0%, var(--card2) 100%);border-radius:14px;padding:14px}
      .card h2{margin:0 0 8px;font-size:14px;letter-spacing:0.02em;text-transform:uppercase;color:var(--muted)}
      .card p{margin:0;color:var(--text);line-height:1.5}
      .list{margin:10px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
      .list li{display:flex;gap:10px;align-items:flex-start}
      .dot{width:8px;height:8px;border-radius:999px;background:var(--accent);margin-top:6px;flex:0 0 auto}
      .mono{font-family:var(--mono)}
      .codebox{border:1px solid var(--border);border-radius:14px;overflow:hidden}
      .codehead{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border-bottom:1px solid var(--border)}
      .codehead .left{display:flex;gap:10px;align-items:center;color:var(--muted);font-size:12px}
      .btn{border:1px solid var(--border);background:rgba(255,255,255,0.02);color:var(--text);padding:7px 10px;border-radius:10px;font-size:12px;cursor:pointer}
      .btn:hover{border-color:rgba(90,162,255,0.55)}
      pre{margin:0;padding:12px;background:rgba(0,0,0,0.25);overflow:auto;max-height:520px}
      code{font-family:var(--mono);font-size:12px;line-height:1.45;white-space:pre}
      .k{color:var(--accent2)}
      .small{font-size:12px;color:var(--muted)}
      .sep{height:1px;background:var(--border);margin:12px 0}
    `,
  });

  // ---------------------------
  // Page build
  // ---------------------------

  const app = document.getElementById("app");
  if (!app) return;

  const header = el("div", { class: "hero" }, [
    el("div", { class: "title" }, "meshmonitor-radio-id-qth"),
    el("div", { class: "sub" }, TAGLINE),
    el("div", { class: "row" }, [
      pill("MeshMonitor Auto Responder"),
      pill("Ham / GMRS / CB / Club"),
      pill("On-demand QTH"),
      pill("Privacy-safe"),
      pill("No external dependencies"),
    ]),
    el("div", { class: "small" }, [
      "Repository: ",
      el("a", { href: `https://github.com/${REPO}`, target: "_blank", rel: "noreferrer" }, `github.com/${REPO}`),
    ]),
  ]);

  const left = el("div", { class: "card" }, [
    el("h2", {}, "What it does"),
    el("p", {}, [
      "Registers a radio identity label (Ham callsign, GMRS callsign/unit, CB handle, or Club role) and returns an on-demand QTH response. ",
      "When a user sends ",
      el("span", { class: "mono" }, "!qth"),
      ", it replies with the sender’s Maidenhead grid and, if station coordinates are set, distance/bearing to the MeshMonitor station.",
    ]),
    el("div", { class: "sep" }),
    el("h2", {}, "Commands"),
    el("ul", { class: "list" }, [
      el("li", {}, [el("span", { class: "dot" }), el("div", {}, [el("div", { class: "mono" }, "!id ham W1ABC"), el("div", { class: "small" }, "Save HAM identity label")])]),
      el("li", {}, [el("span", { class: "dot" }), el("div", {}, [el("div", { class: "mono" }, "!id gmrs WRUV246-2"), el("div", { class: "small" }, "Save GMRS identity label (+ unit suffix allowed)")])]),
      el("li", {}, [el("span", { class: "dot" }), el("div", {}, [el("div", { class: "mono" }, "!id cb MaxOffRoadin"), el("div", { class: "small" }, "Save CB handle")])]),
      el("li", {}, [el("span", { class: "dot" }), el("div", {}, [el("div", { class: "mono" }, "!id club RELAY-3"), el("div", { class: "small" }, "Save club/role label")])]),
      el("li", {}, [el("span", { class: "dot" }), el("div", {}, [el("div", { class: "mono" }, "!qth"), el("div", { class: "small" }, "Return your grid (+ distance/bearing when available)")])]),
    ]),
  ]);

  const right = el("div", { class: "card" }, [
    el("h2", {}, "MeshMonitor trigger patterns"),
    el("p", { class: "small" }, "Use these regex patterns in Auto Responder rules:"),
    el("pre", {}, el("code", {}, [
      `^!id\\s+(ham|gmrs|cb|club)\\s+(.+)$\n^!qth$`
    ])),
    el("div", { class: "sep" }),
    el("h2", {}, "Environment variables"),
    el("p", { class: "small" }, "Commonly used inputs (provided by MeshMonitor):"),
    el("pre", {}, el("code", {}, [
      `MESSAGE\nFROM_ID / FROM_NODE_ID\nFROM_SHORT_NAME / FROM_LONG_NAME\nFROM_LAT / FROM_LON\nMM_LAT / MM_LON`
    ])),
    el("p", { class: "small" }, "DB path and response length can be configured via:"),
    el("pre", {}, el("code", {}, [
      `MM_RADIO_ID_DB_PATH (default: /data/scripts/mm_radio_id_db.json)\nMM_RADIO_ID_MAXLEN (default: 200)`
    ])),
  ]);

  const codeCard = el("div", { class: "card" }, [
    el("h2", {}, "Auto Responder Script (Python)"),
    el("p", { class: "small" }, "Copy/paste this into MeshMonitor’s User Scripts Gallery or a GitHub issue. No dependencies."),
    el("div", { class: "codebox" }, [
      el("div", { class: "codehead" }, [
        el("div", { class: "left" }, [
          el("span", { class: "mono" }, "mm_radio_id_qth.py"),
          pill("Python 3"),
        ]),
        el("div", { class: "row" }, [
          el("button", {
            class: "btn",
            onclick: async () => {
              const ok = await copyToClipboard(PY_SCRIPT_FIXED);
              btnText.textContent = ok ? "Copied" : "Copy failed";
              setTimeout(() => (btnText.textContent = "Copy script"), 1100);
            },
          }, (btnText = document.createElement("span"), btnText.textContent = "Copy script", btnText)),
        ]),
      ]),
      el("pre", {}, el("code", {}, PY_SCRIPT_FIXED)),
    ]),
    el("div", { class: "sep" }),
    el("p", { class: "small" }, [
      "GitHub Pages: This site lives in ",
      el("span", { class: "mono" }, "docs/"),
      " so you can enable Pages from the repo settings.",
    ]),
  ]);

  const footer = el("div", { class: "small", style: "margin-top:14px" }, [
    "© ",
    new Date().getFullYear().toString(),
    " ",
    el("span", { class: "mono" }, REPO),
    " — Documentation page for the MeshMonitor user script.",
  ]);

  app.appendChild(style);
  app.appendChild(el("div", { class: "wrap" }, [
    header,
    el("div", { class: "grid" }, [left, right]),
    el("div", { style: "height:14px" }),
    codeCard,
    footer,
  ]));
})();
