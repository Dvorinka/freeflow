"""FreeFlow IPC parity: every frontend invoke() must match a backend command."""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

api = open(f"{ROOT}/src/lib/api.ts").read()
invoked = set(re.findall(r'invoke<[^>]*>\("([a-z_0-9]+)"', api))

cmds = set()
for mod in ["commands"]:
    src = open(f"{ROOT}/src-tauri/src/{mod}.rs").read()
    cmds.update(re.findall(r"#\[tauri::command\]\s*\n(?:pub(?:\([^)]*\))?\s+async\s+fn|pub(?:\([^)]*\))?\s+fn)\s+([a-z_0-9]+)", src))

missing_backend = sorted(invoked - cmds)
# dictation_state is event-driven UI (phase via dictation:phase events);
# registered for future use, intentionally uncalled.
missing_frontend = sorted((cmds - invoked) - {"dictation_state"})

print(f"frontend invokes: {len(invoked)}, backend commands: {len(cmds)}")
ok = True
if missing_backend:
    ok = False
    print("FRONTEND CALLS WITH NO BACKEND COMMAND:", missing_backend)
if missing_frontend:
    ok = False
    print("BACKEND COMMANDS WITH NO FRONTEND CALLER:", missing_frontend)

# window labels
conf = json.load(open(f"{ROOT}/src-tauri/tauri.conf.json"))
labels = sorted(w["label"] for w in conf["app"]["windows"])
main_tsx = open(f"{ROOT}/src/main.tsx").read()
used = set(re.findall(r'label === "(\w+)"', main_tsx))
print("tauri windows:", labels, "| main.tsx branches:", sorted(used))
# main.tsx renders <Overlay/> for the overlay window, <App/> otherwise.
if not (set(labels) == {"main", "overlay"} and used == {"overlay"}):
    ok = False
    print("WINDOW LABEL MISMATCH")

cap = json.load(open(f"{ROOT}/src-tauri/capabilities/default.json"))
print("capability windows:", cap["windows"])
if sorted(cap["windows"]) != labels:
    ok = False
    print("CAPABILITY/WINDOW MISMATCH")

print("PARITY_OK" if ok else "PARITY_FAIL")
sys.exit(0 if ok else 1)
