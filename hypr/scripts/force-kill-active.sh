#!/usr/bin/env bash
pid=$(hyprctl activewindow -j | grep -o '"pid":[0-9]*' | grep -o '[0-9]*' | head -1)
[ -n "$pid" ] && kill -9 "$pid"
