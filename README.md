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

## Masked production data

Cloud sessions don't load MCP servers registered in `~/.claude.json`, so the investigation MCP
server (`https://api.try.be/shop/mcp/investigations`) is called over plain HTTP by
`bin/trybe-data`, and the `trybe-data` skill tells Claude when and how to use it.

The token is a personal access token stored as a **Network secret** for `api.try.be` in the
environment's settings: the proxy adds `Authorization: Bearer <token>`, so it never enters the
container. If Network secrets aren't offered, set `TRYBE_DATA_MCP_TOKEN` instead. Nothing secret
is in this repo. Revoke the token (its `oauth_access_tokens` row) once the OAuth flow works, then
use a claude.ai custom connector instead.

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

## Skill overrides

Each override is a full copy of trybe's skill, with the same name, changed for a Claude Code cloud
session running the Docker stack. Supporting files (`push-qa-assets.sh`, the investigate template
and generator) stay in trybe and are used from there. The exception is `run-app/drive.cjs`: this
repo has its own copy, at `~/.claude/skills/run-app/drive.cjs`, which adds `--video` (records a
scenario to MP4 without the login) and `--viewport` (for example `390x844`). It finds the trybe
checkout through `$TRYBE_ROOT`, which defaults to `/home/user/trybe`. The Quick Wins Proof
routine (lewislewin/quick-wins) records with it.

| Skill | What changes in a cloud session |
|-------|---------------------------------|
| `ci-watch` | GitHub MCP tools instead of `gh`; `subscribe_pr_activity` events instead of `gh pr checks --watch`; pushes to the PR's head branch |
| `scope-qa` | Checks and files through the GitHub MCP tools; waits on PR events, not `gh --watch` |
| `qa` | GitHub/Linear through MCP; QA in `/home/user/trybe` itself, not a worktree, because the containers mount it; stack already up; migrations and lockfile caveats; posts with the footer; screenshots sent to you |
| `run-app` | Its own `drive.cjs` with `--video` and `--viewport`; Docker-mode stack the hook starts (wait on `session-stack.ready`); `serve token` with a pre-#2680 fallback; `--noproxy` for `*.trybe.test`; screenshots via `SendUserFile` and the QA assets branch, not commits on the PR branch |
| `review` | Accepts a PR as the fixed point; specs from Linear/GitHub through MCP; sub-agents test with `./bin/dev`; nothing posted unless asked |
| `investigate` | Host `python3 -I` and `npx @mermaid-js/mermaid-cli` on the preinstalled Chromium instead of two Docker images this environment lacks; report sent with `SendUserFile` |
| `handoff` | Saved to `handoffs/` in this repo and pushed, since the container's temp dir doesn't survive; reminds you to push work in progress |
| `cloud-box` | Goes straight to "push the branch, give the laptop commands": the box isn't reachable, and upstream's `DEV_MODE=cloud` check misses Docker-mode sessions |
| `scramble-migrate` | Verification through `./bin/dev test/exec/artisan shop` instead of the host `vendor/bin/pest` and `php artisan` |

Not overridden, because nothing in them depends on the environment: `issues`, `prd`, `refine`,
`setup`, `tdd`, `sdk-migrate`. Copying them would only stop them getting trybe's updates.

### Keeping them in step with trybe

`skills/UPSTREAM` holds the trybe commit the overrides were last synced to. Run
`./check-drift.sh` to list trybe commits since then that touch an overridden skill, port what
matters, then record the new base as the script's header says.
