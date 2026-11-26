# Personal Claude Code config for trybe cloud sessions

The trybe repo's agent guidance lives in `AGENTS.md`, which Claude Code doesn't load by itself:

@/home/user/trybe/AGENTS.md

## Where things are

- Cloud sessions can start in `/home/user` rather than in a repo. The trybe monorepo is at
  `/home/user/trybe`; work from there.
- This config comes from `/home/user/trybe-claude-cloud` (`lewislewin/trybe-claude-cloud`).

## This environment

- GitHub: the `gh` CLI isn't signed in. Use the GitHub MCP tools (load with ToolSearch); `gh` only
  for `gh api -X GET search/...`. Wait on CI with `subscribe_pr_activity`, never a polling loop.
- The Docker stack is started by the SessionStart hook (`~/.trybe/mode` is `docker`); it's ready
  when `~/.trybe/session-stack.ready` exists. App `https://app.trybe.test:8888`, APIs
  `https://api.trybe.test`. Use `curl -k --noproxy '*'` for `*.trybe.test`.
- The containers mount `/home/user/trybe`: code must be checked out there to run, not in a worktree.
- Only files under `/home/user/trybe` or the scratchpad open in the Claude app; send results with
  `SendUserFile`. Nobody else can reach this session's app, so show it with screenshots.
- The trybe skills `ci-watch`, `scope-qa`, `qa`, `run-app`, `review`, `investigate`, `handoff`,
  `cloud-box` and `scramble-migrate` are overridden by versions in this config repo for this
  environment. Fixes to them go in `/home/user/trybe-claude-cloud/skills/`, not trybe.

## Running PHP: always through `./bin/dev`

- The host `php` is 8.3 and cannot run this repo (it needs PHP 8.5). Never call `php`,
  `composer` or `vendor/bin/*` directly on the host.
- Use the Docker/cloud tooling from the trybe root:
  - Tests: `./bin/dev test <pkg> [paths…] [--filter=…]`, e.g.
    `./bin/dev test shop tests/Feature/Customers/Jobs/SendCampaignEmailTest.php`
  - Lint: `./bin/dev lint <pkg> --diff` for changed files. The full `lint` can hit
    Rector's 300s timeout; for a quick style check use
    `./bin/dev exec <pkg> vendor/bin/pint --test <files>`.
  - Anything else: `./bin/dev artisan <pkg> …` or `./bin/dev exec <pkg> …`.
- If something looks broken, run `./bin/dev doctor` before working around it.
- A "Your Composer dependencies require a PHP version" error means you used the host
  `php`: switch to `./bin/dev`. Don't fall back to `php -l` and call that verified.

## Verifying changes

- Run the tests you add or touch before pushing, and say which ones ran and their result.
- For a bug fix, check the new test fails without the fix, then passes with it.

## Pull requests

- When asked to address review comments (Bugbot, people) on an existing PR, commit and push
  to that PR's own head branch, not to a new branch or PR.
- Don't resolve review threads or reply on GitHub unless asked.
