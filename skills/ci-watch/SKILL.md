---
name: trybe-ci-watch
description: Watch CI on the current branch's pull request after a push or PR creation, diagnose failures from the logs, fix them and push again, up to three attempts. Use when the user says a PR was pushed or created, asks to "watch CI", "babysit the PR", or "check the checks", or right after the agent itself pushes or opens a PR.
---

# CI watch (Claude Code cloud session)

Personal override of trybe's `ci-watch` for cloud sessions. `gh` is not signed in here: use the
GitHub MCP tools (load them with ToolSearch, e.g. `select:mcp__github__pull_request_read`), and
let PR events wake you instead of polling.

## 1. Find the PR and the run

- Branch: `git -C /home/user/trybe branch --show-current`. When the user gave a PR URL or number,
  use that PR and its head branch instead.
- Find the PR: `mcp__github__list_pull_requests` (owner `trybeapp`, repo `trybe`, `head:
  trybeapp:<branch>`, state `open`), or `mcp__github__pull_request_read` method `get` for a known
  number. Note `head.sha`.
- No PR yet: say so and stop. Do not create one unless asked.
- `.github/workflows/ci.yml` is the merge-blocking aggregate (`Status`); `trybe-cli.yml` also runs
  directly for `packages/trybe/**`, so include it when reporting.
- Jobs not selected by `ci.yml` are omitted, not skipped; only judge checks that appear.
- If `head.sha` doesn't match `git rev-parse HEAD`, or no checks exist yet, the push hasn't
  registered: wait for the event below rather than concluding anything.

## 2. Watch it without polling

1. Read the checks once: `mcp__github__pull_request_read` method `get_check_runs`.
2. If any are still running, call `mcp__claude-code-remote__subscribe_pr_activity` for the PR and
   end your turn. CI results arrive as events that wake you. Never `sleep` or loop on the API.
3. On each event, re-read `get_check_runs` for the latest head commit.

`concurrency` cancels in-progress runs on a new push, so a cancelled run after a second push is
expected. Always judge the run for the latest commit.

## 3. On green

Say which checks ran and that `Status` passed. Stop. Do not merge. Unsubscribe
(`unsubscribe_pr_activity`) if you subscribed only for this watch.

## 4. On failure

1. Find the run: `mcp__github__actions_list` method `list_workflow_runs`, `resource_id: ci.yml`,
   `workflow_runs_filter: {branch: <branch>}`, `perPage: 5`. Take the newest run for `head.sha`.
2. Read the failure: `mcp__github__get_job_logs` with `run_id`, `failed_only: true`,
   `return_content: true`, `tail_lines: 200`. Read the actual error before touching code.
3. Classify it:
   - **Real failure in this branch** (test, Pint, Rector, PHPStan, lint, type error, SDK/OpenAPI
     drift): fix it.
   - **Flaky or infrastructure** (runner lost, service container timeout, network error unrelated
     to the diff): `mcp__github__actions_run_trigger` method `rerun_failed_jobs` with the
     `run_id`, once. If it fails the same way again, treat it as real or report it.
   - **Also failing on `main`**, or unrelated to the diff: don't fix it here. Report it with the
     evidence.
4. Reproduce with the Docker tooling from `/home/user/trybe`, never the host `php`:
   `./bin/dev test <pkg> <path>`, `./bin/dev lint <pkg> --diff`, or for style only
   `./bin/dev exec <pkg> vendor/bin/pint --test <files>`. The Docker containers mount
   `/home/user/trybe`, so make the fix in that checkout, not a worktree.
5. Fix, then run the `trybe-review` skill against the pre-fix commit before pushing.
6. Commit with the repo's commit format and push to the PR's head branch
   (`git push origin HEAD:<branch>`, retrying network errors with backoff). Never force-push, never
   push to `main` or `production`, never skip hooks.
7. Back to step 2 for the new commit.

## 5. Limits

- Three fix-and-push cycles per invocation. After the third red run, stop and report.
- Never weaken a test, add a skip, loosen a PHPStan level or add a baseline entry to get green. If a
  check seems wrong, say so and ask.
- Don't edit workflow files unless the failure is in the workflow and the user agrees.
- Don't comment on the PR or resolve threads unless asked.

## 6. Report

- PR link (`https://github.com/trybeapp/trybe/pull/<n>`) and head commit.
- Per failing check: the cause, and what you changed or why not.
- Fix cycles used, and anything still red with the log excerpt that shows why.
