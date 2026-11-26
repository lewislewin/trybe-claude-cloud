---
name: trybe-scope-qa
description: Decides what a QA run of a trybeapp/trybe pull request still has to check, by leaving out everything GitHub CI has already proved. Use whenever asked to QA a pull request, test it end to end, or check it in the running app, before starting the stack or driving the browser.
---

# Skip what CI proved (Claude Code cloud session)

Personal override of trybe's `scope-qa`: `gh` is not signed in here, so read GitHub through the
MCP tools (load with ToolSearch, e.g. `select:mcp__github__pull_request_read`).

QA covers only what CI cannot see. Before you look at the running app, work out what CI has already
proved, and leave it out of the QA run.

1. Read the checks on the PR's head commit: `mcp__github__pull_request_read` method
   `get_check_runs` (owner `trybeapp`, repo `trybe`). A green `Status` check means every job for
   the packages the PR changes passed. A job skipped on the latest push passed on an earlier head,
   because `ci.yml` only re-runs packages changed since the last green run, so count it as passed.
   A failed job is a finding: report it instead of testing that area by hand. While CI is still
   running, call `mcp__claude-code-remote__subscribe_pr_activity` for the PR so its results wake
   you, and carry on reading the diff. Don't poll, and don't check by hand what CI is about to
   prove.
2. Read the tests the PR adds or changes: `pull_request_read` method `get_files`, then the test
   files from the fetched branch (`git -C /home/user/trybe fetch origin <head-branch>`). A behavior
   one of them asserts is proven once its job is green, so don't re-check it with curl, artisan or
   the browser.
3. QA what is left: what no test asserts. Usually how the UI renders and responds, the app against
   the real APIs (the app's tests mock the API calls), flows across services, and acceptance
   criteria in the Linear issue (`mcp__Linear__get_issue`) that no test covers. If nothing is left,
   say so and don't drive the app.

In the QA report, list what CI proved, by job and test, separately from what you checked by hand.
