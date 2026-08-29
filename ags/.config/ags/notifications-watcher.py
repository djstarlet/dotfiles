#!/usr/bin/env python3
# Notification watcher daemon - long-lived process fired once from
# start-bar.sh (flock-guarded). Every SWEEP_INTERVAL it checks system
# conditions and notify-sends ONLY when a condition is new or changed;
# when a condition resolves it dismisses its mako toast.
#
# Conditions: dotfiles update, failed systemd user units, low disk on
# $HOME, calendar auth errors, Hyprland config errors.
#
# Screenshots bypass this daemon entirely: take-screenshot.sh notify-sends
# directly. The bell reads mako over dbus, so toasts appear there
# instantly with no polling on the bar's side.
import json
import os
import subprocess
import time

AGS = os.path.expanduser("~/.config/ags")
STATE = os.path.join(AGS, "notifications-state.json")
SPOOL = os.path.join(AGS, "notification-spool.jsonl")
SWEEP_INTERVAL = 60

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


def load_state():
    try:
        with open(STATE) as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state):
    tmp = STATE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, STATE)


def send(state, cond, sig, summary, body):
    """(Re)send a condition toast and record its sig + mako id."""
    st = state.setdefault(cond, {})
    args = ["notify-send", "-a", "dotfiles-bar"]
    if st.get("mako_id"):
        args += ["-r", str(st["mako_id"])]
    args += ["-p", summary, body]  # -p prints the (possibly reused) mako id
    out = run(args, timeout=10)
    try:
        st["mako_id"] = int(out.strip().splitlines()[-1])
    except (ValueError, IndexError):
        st.pop("mako_id", None)
    st["sig"] = sig


def clear(state, cond):
    """Condition resolved: dismiss its toast and forget it."""
    st = state.pop(cond, None)
    if st and st.get("mako_id"):
        run(["makoctl", "dismiss", "-n", str(st["mako_id"])], timeout=5)


def sweep():
    state = load_state()

    def managed(cond, active, sig, summary, body):
        """Notify when a condition is new/changed, dismiss when resolved."""
        st = state.get(cond, {})
        if active:
            if st.get("sig") != sig:
                send(state, cond, sig, summary, body)
        elif "sig" in st:
            clear(state, cond)

    # ── dotfiles update (update-check.sh compares BAR_VERSION files)
    try:
        subprocess.run([os.path.join(AGS, "update-check.sh")], capture_output=True, timeout=60)
        with open(os.path.join(AGS, "update-check.json")) as f:
            u = json.load(f)
        managed(
            "dotfiles-update",
            bool(u.get("update_available")),
            str(u.get("remote_version", "")),
            "Dotfiles update available",
            "Version %s is out (you have %s)." % (u.get("remote_version", "?"), u.get("local_version", "?")),
        )
    except Exception:
        pass

    # ── failed systemd user units
    out = run(["systemctl", "--user", "--failed", "--no-legend", "--plain"])
    units = [line.split()[0] for line in out.splitlines() if line.strip()]
    managed(
        "user-units-failed",
        bool(units),
        " ".join(sorted(units)),
        "Failed user unit%s" % ("s" if len(units) != 1 else ""),
        "\n".join(units),
    )

    # ── low disk on $HOME
    try:
        parts = run(["df", "-P", os.path.expanduser("~")]).splitlines()[1].split()
        pct = int(parts[4].rstrip("%"))
        managed(
            "low-disk",
            pct >= LOW_DISK_PCT,
            str(pct),
            "Home disk almost full",
            "%d%% used on %s" % (pct, parts[5]),
        )
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
        managed(
            "calendar-auth",
            status == "fail" and net_reachable(),
            "1",
            "Calendar sign-in expired",
            "Google Calendar token refresh failed. Re-login via Control Center > Settings.",
        )
    except Exception:
        pass

    # ── Hyprland config errors
    out = run(["hyprctl", "configerrors"])
    managed(
        "hypr-config-errors",
        bool(out),
        out[:200],
        "Hyprland config errors",
        out[:500],
    )

    save_state(state)


def main():
    # One watcher at a time: flock releases automatically when the process
    # exits, so a stray watcher after a bar restart is impossible.
    lock = os.path.join(AGS, "notifications.lock")
    try:
        import fcntl
        handle = open(lock, "w")
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return  # another watcher already running
    except Exception:
        pass

    # Legacy files from the pre-mako architecture are obsolete.
    for stale in (SPOOL, os.path.join(AGS, "notifications.json"),
                  os.path.join(AGS, "dismissed-notifications.json")):
        try:
            os.unlink(stale)
        except OSError:
            pass

    while True:
        try:
            sweep()
        except Exception:
            pass
        time.sleep(SWEEP_INTERVAL)


if __name__ == "__main__":
    main()