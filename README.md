# trybe-claude-cloud

Lewis's personal Claude Code config for cloud sessions on `trybeapp/trybe`: a user-level
`CLAUDE.md`, skills and agents, kept out of the trybe repo.

## Setup (once, per cloud environment)

1. In the cloud environment's settings (environment menu in the session's title bar → Edit),
   add `lewislewin/trybe-claude-cloud` under **Repositories**, alongside `trybeapp/trybe`.
2. Add this line to the environment's **Setup script**:

   ```bash
   bash /home/user/trybe-claude-cloud/setup.sh || true
   ```

3. Start a new session with both repos selected. Run `/context` and check that
   `/root/.claude/CLAUDE.md` is listed under Memory files.

## What goes where

| Path | Becomes | Precedence |
|------|---------|------------|
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | Loads in every session. Imports trybe's `AGENTS.md`. |
| `skills/<name>/SKILL.md` | `~/.claude/skills/<name>` | **Beats** a trybe skill with the same name, so you can override e.g. `review` or `qa`. |
| `agents/<name>.md` | `~/.claude/agents/<name>.md` | **Loses** to a trybe agent with the same name: use distinct names. |

Not covered: hooks and settings. Cloud sessions don't read `~/.claude/settings.json`, so
those stay in the trybe repo's `.claude/settings.json`.

Files are symlinked, so edits pushed here apply from the next session without touching the
setup script.
