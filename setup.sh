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

# Masked production data MCP server, registered at user scope so it loads whatever directory
# the session starts in. Nothing secret lives in this repo:
#   TRYBE_DATA_MCP_URL    environment variable: the server's MCP endpoint (not a secret).
#   Token, either:
#     - a Network secret for the server's host (preferred): the proxy adds the header to each
#       request, so the token never enters the container and no header is configured here; or
#     - TRYBE_DATA_MCP_TOKEN environment variable, sent as "Authorization: Bearer <token>".
# Skipped when TRYBE_DATA_MCP_URL is unset.
if [ -n "${TRYBE_DATA_MCP_URL:-}" ] && command -v claude >/dev/null 2>&1; then
  config="$(python3 -c '
import json, os
c = {"type": "http", "url": os.environ["TRYBE_DATA_MCP_URL"]}
t = os.environ.get("TRYBE_DATA_MCP_TOKEN")
if t:
    c["headers"] = {"Authorization": "Bearer " + t}
print(json.dumps(c))
')"
  claude mcp remove --scope user trybe-data >/dev/null 2>&1 || true
  if claude mcp add-json --scope user trybe-data "$config" >/dev/null; then
    echo "trybe-claude-cloud: registered the trybe-data MCP server"
  else
    echo "trybe-claude-cloud: could not register the trybe-data MCP server" >&2
  fi
fi

echo "trybe-claude-cloud: linked CLAUDE.md, $(find "$SRC/skills" -name SKILL.md | wc -l) skill(s), $(find "$SRC/agents" -name '*.md' | wc -l) agent(s)"
