#!/usr/bin/env bash
# Lists upstream changes to the trybe skills this repo overrides since the overrides were last
# synced (the commit in skills/UPSTREAM). Run it now and then; when it prints commits, port what
# matters into the override, then record the new base:
#
#   git -C /home/user/trybe log -1 --format=%H origin/main -- .agents/skills > skills/UPSTREAM
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRYBE="${TRYBE:-/home/user/trybe}"
base=$(cat "$SRC/skills/UPSTREAM")

git -C "$TRYBE" fetch -q --depth=200 origin main 2>/dev/null || true
git -C "$TRYBE" cat-file -e "$base" 2>/dev/null \
  || { echo "base $base isn't in $TRYBE's history; fetch deeper" >&2; exit 1; }

drift=0
for dir in "$SRC"/skills/*/; do
  name=$(basename "$dir")
  log=$(git -C "$TRYBE" log --oneline "$base"..origin/main -- ".agents/skills/$name" ".claude/skills/$name")
  if [ -n "$log" ]; then
    drift=1
    echo "== $name changed upstream:"
    echo "$log" | sed 's/^/   /'
  fi
done
[ "$drift" = 0 ] && echo "No upstream changes to overridden skills since ${base:0:9}."
exit 0
