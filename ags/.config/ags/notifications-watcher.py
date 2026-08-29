#!/usr/bin/env python3
# Notifications watcher - gathers bar notifications into
# ~/.config/ags/notifications.json, which the notification bell polls.
#
# Sources: dotfiles update (update-check.sh), failed systemd user units,
# low disk on $HOME, calendar auth errors, recent screenshots (spool fed
# by take-screenshot.sh), and Hyprland config errors.
#
# Fired from start-bar.sh and re-run by the bar's 60s poll. Dismissed
# notifications live in dismissed-notifications.json (managed by the bar).
import json
import os
import subprocess
import time

AGS = os.path.expanduser("~/.config/ags")
OUT = os.path.join(AGS, "notifications.json")
SPOOL = os.path.join(AGS, "notification-spool.jsonl")
SPOOL_TTL = 86400  # prune screenshot notices after 24h

LOW_DISK_PCT = 90


def run(cmd, timeout=15):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout.strip()
    except Exception:
        return ""


def net_reachable():
    try:
        r = subprocess.run(
            ["curl", "-s", "--max-time", "4", "https://oauth2.googleapis.com", "-o", "/dev/null"],
            timeout=6,
        )
        return r.returncode == 0
    except Exception:
        return False


entries = []

# ── dotfiles update (delegates to update-check.sh and its 15min cache)
try:
    subprocess.run([os.path.join(AGS, "update-check.sh")], capture_output=True, timeout=60)
    with open(os.path.join(AGS, "update-check.json")) as f:
        u = json.load(f)
    if u.get("update_available"):
        entries.append({
            "id": "dotfiles-update",
            # sig = remote content hash: a dismissal sticks until the remote
            # actually changes (checked_at would defeat dismissal every run).
            "sig": u.get("remote_sha", ""),
            "title": "Dotfiles update available",
            "detail": "Your bar differs from the latest release (checked %s)." % u.get("checked_at", ""),
            "openUrl": "https://github.com/djstarlet/dotfiles/releases",
            "action": "update-dotfiles",
        })
except Exception:
    pass

# ── failed systemd user units
out = run(["systemctl", "--user", "--failed", "--no-legend", "--plain"])
units = [line.split()[0] for line in out.splitlines() if line.strip()]
if units:
    entries.append({
        "id": "user-units-failed",
        "sig": " ".join(sorted(units)),
        "title": "%d failed user unit%s" % (len(units), "s" if len(units) != 1 else ""),
        "detail": "\n".join(units),
    })

# ── low disk on $HOME
try:
    parts = run(["df", "-P", os.path.expanduser("~")]).splitlines()[1].split()
    pct = int(parts[4].rstrip("%"))
    if pct >= LOW_DISK_PCT:
        entries.append({
            "id": "low-disk",
            "sig": str(pct),
            "title": "Home disk almost full",
            "detail": "%d%% used on %s" % (pct, parts[5]),
            "openPath": os.path.expanduser("~"),
        })
except Exception:
    pass

# ── calendar auth errors (probe only when a cached login exists; a failed
# refresh is only reported when the network is actually reachable)
try:
    probe = (
        'source "%s/calendar-common.sh"; '
        'if [[ -f "$CACHE_FILE" ]]; then '
        "get_access_token >/dev/null 2>&1 && echo ok || echo fail; "
        "else echo unset; fi"
    ) % AGS
    status = run(["bash", "-c", probe], timeout=30)
    if status == "fail" and net_reachable():
        entries.append({
            "id": "calendar-auth",
            "sig": "1",
            "title": "Calendar sign-in expired",
            "detail": "Google Calendar token refresh failed. Re-login via Control Center > Settings.",
        })
except Exception:
    pass

# ── screenshots from the spool (written by take-screenshot.sh); prunes old lines
try:
    now = time.time()
    kept = []
    if os.path.exists(SPOOL):
        with open(SPOOL) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except Exception:
                    continue
                if now - ev.get("ts", 0) < SPOOL_TTL and ev.get("id"):
                    kept.append(line)
                    entries.append({
                        "id": ev["id"],
                        "sig": str(ev.get("ts", 0)),
                        "title": ev.get("title", "Screenshot saved"),
                        "detail": ev.get("detail", ""),
                        "openPath": ev.get("openPath", ""),
                    })
        tmp = SPOOL + ".tmp"
        with open(tmp, "w") as f:
            f.write("\n".join(kept) + ("\n" if kept else ""))
        os.replace(tmp, SPOOL)
except Exception:
    pass

# ── Hyprland config errors
out = run(["hyprctl", "configerrors"])
if out:
    entries.append({
        "id": "hypr-config-errors",
        "sig": out[:200],
        "title": "Hyprland config errors",
        "detail": out[:500],
        "openPath": os.path.expanduser("~/.config/hypr"),
    })

with open(OUT, "w") as f:
    json.dump(entries, f, indent=1)