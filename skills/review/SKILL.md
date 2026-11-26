---
name: trybe-review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along three axes — Standards (does the code follow this repo's documented coding standards?), Spec (does the code match what the originating issue/PRD asked for?) and Tests (are any new tests tautological, passing whether or not the code works?). Runs the reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".
---

# Review

> Personal override of trybe's `review` for Claude Code cloud sessions. Differences: a PR URL or
> number works as the fixed point, GitHub and Linear are read through MCP tools (`gh` isn't signed
> in), and anything the sub-agents run goes through `./bin/dev`, never the host `php`. Work from
> `/home/user/trybe`.

Three-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / PRD / spec?
- **Tests** — is any test the diff adds or changes tautological: would it still pass if the code it covers broke?

All three axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

The issue tracker should have been provided to you — run `/trybe-setup` if `guides/agents/issue-tracker.md` is missing.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a jj change id or revset, commit SHA, branch name, tag, `main`, `HEAD~5`, etc. Don't be opinionated; pass it through. If they gave a PR (URL or number), read it with `mcp__github__pull_request_read` method `get` (owner `trybeapp`, repo `trybe`), `git fetch origin <base> <head-branch>`, and review `origin/<head-branch>` against `origin/<base>`: use those in place of `HEAD` and the fixed point below, without checking the branch out. If they didn't specify one, ask: "Review against what — a branch, a commit, or `main`?" Don't proceed until you have it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`. Some developers also use Jujutsu, so check for the existence of the `.jj` directory and use `jj log` instead if it exists.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages or the PR body (`TRY-1234`, Linear URLs, `Closes #45`) — fetch Linear issues with `mcp__Linear__get_issue` and `mcp__Linear__list_comments`, GitHub issues with `mcp__github__issue_read`, otherwise follow `guides/agents/issue-tracker.md`. The PR body itself is a secondary spec source.
2. A path the user passed as an argument.
3. A PRD/spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

### 3. Identify the standards sources

Anything in the monorepo — root-level or per-package — that documents how code should be written. Common locations:

- `AGENTS.md`
- `context/CONTEXT-MAP.md`
- `.editorconfig`, `eslint.config.*`, `biome.json`, `prettier.config.*`, `tsconfig.json` (machine-enforced standards — note them but don't re-check what tooling already checks)
- Any `STYLE.md`, `STANDARDS.md`, `STYLEGUIDE.md`, or similar at the repo root or in any of the child repos

Collect the list of files. The **Standards** sub-agent will read them.

If the diff or spec involves feature flags or flagged data/configuration, include `guides/agents/feature-flags.md` as an additional standards/spec source and check the lifecycle cases it defines.

If the diff or spec changes public API request/response shape, include `guides/agents/public-api-docs.md` and `packages/docs/AGENTS.md` as additional standards/spec sources and check that the matching `packages/docs` OpenAPI/SDK contract update is present, or that an explicit accepted blocker/follow-up exists.

### 4. Spawn the sub-agents in parallel

Send a single message with three `Agent` tool calls. Use the `general-purpose` subagent for each.

**Standards sub-agent prompt** — include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3.
- The brief: "Read the standards docs. Then read the diff. Report — per file/hunk where relevant — every place the diff violates a documented standard. Cite the standard (file + the rule). Distinguish hard violations from judgement calls. Skip anything tooling enforces. If public API request/response shape changes are present, verify matching `packages/docs` OpenAPI/SDK contract updates or flag the missing docs. Under 400 words."

**Spec sub-agent prompt** — include:

- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: "Read the spec. Then read the diff. Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong; (d) public API request/response shape changes that lack matching `packages/docs` OpenAPI/SDK contract updates. Quote the spec line for each finding where applicable. Under 400 words."

**Tests sub-agent prompt** — include:

- The diff command and commit list.
- The rule in the root `AGENTS.md` section "Tests: no tautological tests".
- The brief: "Read that rule. Then, for each test the diff adds or changes, name the line of non-test code in the diff whose removal or breakage would make it fail. Flag every test where there is none as tautological: it asserts on data the test supplied, computes the expected value with the code under test, asserts on a mock of the class under test or of the collaborator doing the work, or checks only that nothing threw or the status code. For each flagged test, say what it should assert instead. Also flag behaviour the diff changes that no test would catch. Where it is cheap, prove a finding by breaking the code and running the test from `/home/user/trybe` with `./bin/dev test <pkg> <path>` (never the host `php` or `vendor/bin`; restore the code afterwards with `git checkout -- <file>`); say which findings you ran and which you judged by reading. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report. If the diff adds or changes no tests, skip the Tests sub-agent unless the diff changes behaviour, and then report that no test covers it.

### 5. Aggregate

Present the reports under `## Standards`, `## Spec` and `## Tests` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings — the axes are deliberately separate so the user can see them independently. Manual testing guidance is a separate section, not a replacement for any review axis.

### 6. Manual Acceptance Testing Output

After the Standards, Spec and Tests reports, print a `## Manual acceptance testing` section to the terminal for the behavior changed by the reviewed diff. Derive it from the spec, commits, and actual code paths in the diff, using the shared format in [manual-acceptance-testing.md](guides/agents/manual-acceptance-testing.md). Do not invent credentials, URLs, object names, or test data; mark them as `TBD` or ask the user if they are required.

If manual acceptance testing is not meaningful for the reviewed change, still output the section and explain why, then give the closest practical verification path, such as a CLI command, API request, or automated test command.

Don't post the review on GitHub unless the user asks; if they do, use `mcp__github__pull_request_review_write` or `mcp__github__add_issue_comment` and end it with the `Generated by Claude Code` footer.

End the whole report with a one-line summary: total findings per axis, and the worst single issue (if any) flagged.

## Why separate axes

A change can pass one axis and fail another:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**
- Code that is right, with tests that would still pass if it were wrong → **Spec pass, Tests fail.**

Reporting them separately stops one axis from masking another.
