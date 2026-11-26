---
name: trybe-handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
---

# Handoff (Claude Code cloud session)

Personal override of trybe's `handoff`. Upstream saves to the OS temp directory, but a cloud
session's container is thrown away, and the next session starts in a fresh one. So the handoff goes
into this config repo, which every session clones, and to the user as a file.

Write a handoff document summarising the current conversation so a fresh agent can continue the work.

## Where it goes

1. Write it to `/home/user/trybe-claude-cloud/handoffs/<YYYY-MM-DD>-<short-slug>.md`.
2. Commit it in `/home/user/trybe-claude-cloud` and push to `main` there
   (`git -C /home/user/trybe-claude-cloud push origin HEAD:main`, retrying network errors with
   backoff). That repo is private and is the user's own; pushing handoffs to it is what this skill
   is for.
3. Send it with `SendUserFile`. Copy it into the scratchpad first if the app can't open that path.
4. Tell the user how to pick it up: start a new session with this repo attached and say
   "continue from handoffs/<file>".

Delete handoffs once their work has merged; say which older ones look finished.

## What goes in it

- The goal, current state, and the next concrete step.
- Branches, PRs (full URLs), commits, and which are pushed. Note anything uncommitted: it does not
  survive the container, so commit and push work in progress to the session's branch first, or say
  plainly that it will be lost.
- Environment facts the next session needs: which repos to attach, whether the Docker stack must be
  up, test commands that worked (`./bin/dev test <pkg> <path>`), and dead ends already ruled out.
- A "suggested skills" section naming the skills the next agent should invoke.

Do not duplicate content already captured in other artifacts (PRDs, plans, issues, commits, diffs).
Reference them by path or URL instead.

Redact sensitive information: API keys, passwords, tokens, email addresses and other personal data,
and customer data.

If feature flags were relevant, reference `guides/agents/feature-flags.md` and summarise any resolved
or unresolved flag-lifecycle decisions.

If public API request/response shapes were relevant, reference `guides/agents/public-api-docs.md` and
summarise the affected endpoints/schemas, whether `packages/docs` was updated, any docs validation
run, and any unresolved docs blockers or follow-ups.

If the user passed arguments, treat them as a description of what the next session will focus on and
tailor the doc accordingly.
