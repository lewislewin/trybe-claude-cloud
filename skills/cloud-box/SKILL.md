---
name: trybe-cloud-box
description: Spin up, update, seed, share or tear down a named environment for a branch on the developer's cloud dev box (an EC2 machine reached over Tailscale), and start or stop the box itself. Use when the user says "spin up a cloud dev environment", "spin up an env", "put this branch on my box", "deploy this to my cloud box", "give me a link I can share", "start my box", "stop my box", or mentions cloud-box, dev box or trybedev.com. Not for feature environments, the Laravel Cloud per-PR previews in packages/feature-environments.
---

# Cloud dev environments, from a Claude Code cloud session

Personal override of trybe's `cloud-box`. A cloud session can't reach the box: it's on Tailscale,
and this session's network blocks Tailscale and cloudflared. Upstream detects that case by
`DEV_MODE=cloud`, which a Docker-mode session doesn't set, so this override goes straight to the
hand-off. The full upstream skill, for reference on the box's commands, is
`/home/user/trybe/.agents/skills/cloud-box/SKILL.md`; the human guide is `docs/cloud-box.md`.

A **cloud dev environment** is a named env on the developer's box, at
`https://<name>-app.<owner>.trybedev.com`. A **feature environment** is a Laravel Cloud per-PR
environment (`packages/feature-environments`). If the user says "feature environment" and might mean
their box, ask.

## Spin up or update an env for a branch

1. **Commit the work** in `/home/user/trybe`. Ask first if there are uncommitted changes.
2. **Push the branch** so the box can build it: `git push -u origin <branch>` (retry network errors
   with backoff). Pushing a branch other than the session's needs the user's go-ahead: if this skill
   was invoked for this branch, that's it. Never push to `main` or `production`.
3. **Pick a name**: 1-12 characters of a-z and 0-9, starting with a letter. Reuse the name if the env
   already exists (updating it).
4. **Give the user the commands**, to run from their trybe checkout on the laptop. `env up` sends the
   branch of the checkout it runs in, so they need a worktree of this branch:

   ```bash
   git fetch origin <branch> && git worktree add --track -b <branch> ../<folder> origin/<branch> && cd ../<folder> && ./bin/dev cloud-box env up <name>
   ```

   To update an env that already exists, from that worktree:

   ```bash
   git pull && ./bin/dev cloud-box env up <name>
   ```

   Or: Create (or Update) in `./bin/dev cloud-box dash`, with the branch name.
5. **The link** will be `https://<name>-app.<owner>.trybedev.com`. The owner is their GitHub login
   on the box; if you don't know it, leave `<owner>` for them. Logins are the seeded accounts
   (password `password`); SSO doesn't work in an env.

## Anything else (start, stop, destroy, ssh, logs, seed)

All of it runs on the laptop. Give the user the command from the upstream skill's tables, in a
`bash` block, and say what it does. Commands that only the human may run (`env destroy`, `destroy`,
the first `up`) say so there. Never suggest `--yes` on `destroy`, or `--take-over`, `--force` or
`env disable`.

If the user wants to see the change working right now instead, the session's own Docker stack can
show it: use the `trybe-run-app` skill and send screenshots.
