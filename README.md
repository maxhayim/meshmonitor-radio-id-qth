# meshmonitor-radio-id-qth

Radio Identity and QTH responder for **MeshMonitor**, supporting **Ham, GMRS, CB, and Club** meshes.

This repository contains:
- **mm_radio_id_qth.py** — the actual MeshMonitor Auto Responder script (runtime)
- **docs/** — GitHub Pages documentation (display only)

---

## What this does

This MeshMonitor Auto Responder script allows users to:

- Register a radio identity label:
  - **Ham** callsign
  - **GMRS** callsign (with optional unit suffix)
  - **CB** handle
  - **Club / role** identifier
- Request an **on-demand QTH response** via mesh message

When a user sends `!qth`, the script replies with:
- The sender’s saved identity label
- The sender’s **Maidenhead grid**
- Optional **distance and bearing** to the MeshMonitor station (if station coordinates are configured)

Design goals:
- On-demand only (no beaconing)
- Privacy-safe (only reports the requester’s own position)
- Works in mixed Ham / GMRS / CB environments

---

## Repository layout

```
.
├── mm_radio_id_qth.py      # Runtime script used by MeshMonitor
├── docs/                  # GitHub Pages documentation
│   ├── index.html
│   └── index.js
└── README.md
```

---

## IMPORTANT: Which file do I use?

### Use this file in MeshMonitor
```
mm_radio_id_qth.py
```

This is the **only file** MeshMonitor should execute.

### Do NOT run this file
```
docs/index.js
```

`index.js` only displays the script on a web page.

---

## Installing mm_radio_id_qth.py

The script must exist inside the MeshMonitor environment at:

```
/data/scripts/mm_radio_id_qth.py
```

Make it executable:

```bash
chmod +x mm_radio_id_qth.py
```

---

## MeshMonitor Auto Responder configuration

Create two Auto Responder rules.

### Rule 1 — Identity registration
Trigger regex:
```
^!id\s+(ham|gmrs|cb|club)\s+(.+)$
```

Action: Script  
Script path:
```
/data/scripts/mm_radio_id_qth.py
```

### Rule 2 — QTH response
Trigger regex:
```
^!qth$
```

Action: Script  
Script path:
```
/data/scripts/mm_radio_id_qth.py
```

---

## Example usage

```
!id ham W1ABC
!id gmrs WRUV246-2
!id cb MaxOffRoadin
!id club RELAY-3
!qth
```

---

## License

MIT
