#!/usr/bin/env bash
# Links this repo's personal Claude Code config into ~/.claude for cloud sessions.
# Call it from the cloud environment's setup script:
#
#   bash /home/user/trybe-claude-cloud/setup.sh || true
#
# Links rather than copies, so each session picks up the latest commit of this repo even
# though the environment caches what the setup script produces. Safe to run more than once.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.claude"
mkdir -p "$DEST/skills" "$DEST/agents"

# User-level memory: loaded in every session, whatever directory it starts in.
ln -sfn "$SRC/CLAUDE.md" "$DEST/CLAUDE.md"

# Skills one at a time: ~/.claude/skills already holds skills the cloud session installs itself.
# A personal skill with the same name as a trybe repo skill wins over the repo's.
for dir in "$SRC"/skills/*/; do
  [ -f "$dir/SKILL.md" ] || continue
  ln -sfn "${dir%/}" "$DEST/skills/$(basename "$dir")"
done

# Agents. A repo agent with the same name wins over these, so give them distinct names.
for file in "$SRC"/agents/*.md; do
  [ -f "$file" ] || continue
  ln -sfn "$file" "$DEST/agents/$(basename "$file")"
done

echo "trybe-claude-cloud: linked CLAUDE.md, $(find "$SRC/skills" -name SKILL.md | wc -l) skill(s), $(find "$SRC/agents" -name '*.md' | wc -l) agent(s)"
