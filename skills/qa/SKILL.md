---
name: trybe-qa
description: "QAs a trybeapp/trybe pull request end to end: scopes what CI already proved, reproduces the bug on main, verifies the change in the running staff app and APIs, and posts a QA report with screenshots on the PR. Use when asked to QA, test end to end, or verify a trybe PR, including runs started by a /qa comment, a factory brief or a Linear session. Not for reviewing code only."
---

# QA a trybe pull request (Claude Code cloud session)

Personal override of trybe's `qa` for cloud sessions running the Docker stack. Differences from
upstream: GitHub goes through the MCP tools (`gh` isn't signed in), the stack is already started
by the session hook, and QA happens in the main checkout because the containers mount it.
Supporting files stay upstream under `/home/user/trybe/.agents/skills/`.

The goal is evidence a reviewer can trust without re-running anything: the failure on `main`, the
same scenario passing with the PR, the edge cases around it, and screenshots, all posted on the PR.
QA covers what CI cannot see.

## Rules that are easy to get wrong

- **Never commit to the PR branch or open anything in trybeapp/trybe for QA.** Screenshots go to the
  orphan `<pr-branch>-qa-assets` branch through `.agents/skills/qa/scripts/push-qa-assets.sh`.
- **Test what would land, in `/home/user/trybe` itself.** Check out a local branch `qa/pr-<n>` from
  `origin/main` and merge the PR branch into it. Never push it. Don't use a worktree: the Docker
  stack serves `/home/user/trybe`, so a worktree's code never runs. If that checkout has
  uncommitted work, stop and ask before switching. Note the starting branch to return to.
- **Show the failure before the fix.** For each behavior the PR changes, run the scenario with the
  PR's files reverted to `main` (`git checkout origin/main -- <paths>`), then restore them
  (`git checkout HEAD -- <paths>`) and run it again. A pass you never saw fail proves nothing.
- **Never the host `php`.** Tests and lint through `./bin/dev test|lint <pkg>`; artisan through
  `./bin/dev artisan <pkg>`, which in Docker mode hits the dev databases the app serves.
- **Look at every screenshot** with the Read tool, with the expected result in mind. A blank frame,
  a login page or an error page is a failure, not evidence.
- **Keep output small.** Pipe output through `tail` or `rg`. When a step fails the same way twice,
  find out why; when the environment rather than the PR is the cause, note it and work around it once.
- **Never poll.** Long test runs go in the background (`run_in_background: true`); CI results come
  from `subscribe_pr_activity` events; a not-yet-ready stack is waited on with Monitor.
- **What authorizes the report.** When the run started from a `/qa` PR comment, a Linear session
  asked to QA the PR, or a brief saying the owner approved the plan, post the report and push the
  assets branch without asking. Otherwise ask the user once before pushing assets and posting.
  Approving, pushing code or editing the PR description always needs the user.

## Worth knowing: time zones

Sites have their own time zone, the apps run in UTC, and dates shift easily between database, API
and UI ("Time zones in bound dates" in `AGENTS.md`). When a change touches dates, times, schedules,
availability or anything grouped by day, test with a non-UTC site or times near midnight.

## Process

1. **Read the PR and its issue.** `mcp__github__pull_request_read` (owner `trybeapp`, repo `trybe`)
   with methods `get`, `get_files` and `get_diff`. Open the Linear issue the body references with
   `mcp__Linear__get_issue` and `mcp__Linear__list_comments` for acceptance criteria. Note anything
   the `/qa` comment or brief added; it sets the focus.
2. **Scope with the `trybe-scope-qa` skill.** Load it with the Skill tool and follow it. Still run the
   PR's own new tests once against reverted source files, to confirm they fail without the change,
   when the PR claims they do.
3. **Prepare the checkout** in `/home/user/trybe`: `git fetch origin main <pr-branch>`,
   `git checkout -b qa/pr-<n> origin/main`, `git merge --no-edit origin/<pr-branch>`. Report merge
   conflicts as a finding and stop. Run `./bin/dev artisan <pkg> migrate` for each package whose
   migrations the PR adds. If the PR changes a lockfile, note that the stack runs `main`'s `vendor/`.
4. **Run the package checks the PR touches** (`./bin/dev test <pkg> <file>`,
   `./bin/dev lint <pkg> --diff`), only for what CI has not already run on the head commit.
5. **Use the running stack.** Load the `trybe-run-app` skill and follow it: wait for
   `~/.trybe/session-stack.ready`, then use `https://app.trybe.test:8888` and
   `https://api.trybe.test`. Skip the browser when the PR doesn't change what the app renders, such as
   a backend performance fix whose output must stay the same: compare API responses on `main` and
   the PR, and say in the report why there are no screenshots. Check `free -m` (about 2 GB) before
   launching Chromium.
6. **Seed the data the scenario needs.** When your brief names seed or benchmark scripts, rerun those
   and add only what they miss. Otherwise write a script under `.scratch/qa/pr-<n>/`, starting with
   `<?php`, tag seeded rows so a re-run replaces them, and make it print what it created. Copy it
   into the package's `storage/` and run it with
   `./bin/dev artisan <pkg> tinker --execute 'require "storage/<file>.php";'`. Piping a script into
   tinker's stdin fails on `use` statements.
7. **Reproduce on `main` code, then verify with the PR.** Drive the real UI flow with a scenario run
   through `node ~/.claude/skills/run-app/drive.cjs <scenario.cjs> --email <user> --out .scratch/qa/pr-<n> --scale 2`.
   Name the decisive frames `before-*.png` and `after-*.png`. Keep the non-GET API calls the driver
   prints that matter. PHP changes apply on the next request.
8. **Probe edge cases through the API** with a real token (run-app section 2), or from inside a
   logged-in page (run-app section 3). Pick inputs where a plausible wrong implementation gives a
   different answer: both sides of each boundary, each accepted input format, combined filters,
   invalid values (expect 422), pagination, and another site or user (expect no leak).
9. **Note findings outside the PR's scope** separately, with the ticket that covers them when the PR
   names one.

## Posting the report

1. Push the screenshots from `/home/user/trybe` and keep the printed URLs:

   ```bash
   bash .agents/skills/qa/scripts/push-qa-assets.sh <pr-branch> pr-<n> .scratch/qa/pr-<n>/*.png
   ```

   It downscales to JPEG when ImageMagick is installed, commits onto the orphan
   `<pr-branch>-qa-assets` branch without touching the working tree, and prints `<file> <url>` lines.
   That branch starts no CI. A second round adds a commit; old URLs keep working.
2. Write the comment to `.scratch/qa/pr-<n>/report.md`, then post its contents with
   `mcp__github__add_issue_comment` (PR number as `issue_number`), ending with:

   ```
   ---
   _Generated by [Claude Code](https://claude.ai/code)_
   ```

   Structure:
   - Heading with the verdict: `## QA ✅ <what now works>`, `## QA ❌ <what fails>`, or
     `## QA ⚠️ <works, with caveats>`.
   - **Environment:** a Claude Code cloud session running the Docker stack, the login, the site, and
     that it runs the PR merged into `main`. Say the environment isn't reachable by reviewers.
   - The data you seeded, in one line.
   - The main flow as a table of screenshots, before and after side by side
     (`<img src="<url>" width="300">`), with a caption row.
   - Tests and lint: what you ran and the decisive result, including how many new tests fail
     without the change. What CI proved and what you checked by hand, separately.
   - API checks in a `<details>` table: query, result.
   - Behavior changes a reviewer should expect, and out-of-scope findings.
3. Send the user the key screenshots with `SendUserFile`, and finish with the comment link, the
   verdict, and anything that needs them. When you are a subagent, that final message is all the
   orchestrator sees, so include each Done-when criterion's result.

## Cleanup

Leave the stack running (it belongs to the session). Remove temporary scripts outside
`.scratch/qa/` and any copied into a package's `storage/`. Switch `/home/user/trybe` back to the
branch you started on and delete `qa/pr-<n>`, then roll back any PR migrations only if they would
break that branch.
