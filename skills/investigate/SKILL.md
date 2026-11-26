---
name: trybe-investigate
description: Produce a HTML investigation report from a URL, curl request, browser path, error message, or support scenario. The HTML report contains embedded Mermaid diagram(s), redacted input, evidence, gaps, and verification notes under .scratch/investigations/.
---

# Trybe Investigate

> Personal override of trybe's `investigate` for Claude Code cloud sessions. The upstream helpers
> run in `python:3.12-alpine` and `minlag/mermaid-cli` containers, which aren't in this environment
> and can't be pulled from inside it. Here the generator runs on the host's `python3` (standard
> library only), Mermaid is checked with `npx @mermaid-js/mermaid-cli` on the preinstalled Chromium,
> and the report reaches the user with `SendUserFile`. Work from `/home/user/trybe`; the template and
> generator stay upstream under `.agents/skills/investigate/`.

Create an **Investigation Report**: a generated HTML support artifact that explains a support-shaped input, likely root cause or explanation, supporting evidence, one or more **Request Traces** when relevant, gaps, and verification notes.

Use this skill when the user asks to investigate or trace a request, explain what code path a production URL/curl/support report likely hits, or produce a diagnostic artifact from a support request.

Do not parse the helper scripts for investigation context. Follow this skill and inspect the implicated packages instead.

## Investigation Report Language

Use the canonical language from `context/engineering-workspace.md`:

- **Investigation Report** — the generated HTML support artifact.
- **Request Trace** — request-path analysis inside an investigation report when a URL, curl request, browser action, or described scenario can be traced through code/API paths.
- **Trybe Monorepo** — this repository, which owns the skill, the generated support artifacts, and the packages.
- **Package** — a `packages/*` unit such as `packages/app`, `packages/shop`, `packages/auth`, `packages/customer`, `packages/inventory`, and `packages/docs`.
- **Deployable Package** — an application/service package.
- **Docs Package** — the API documentation/OpenAPI/SDK package (`packages/docs`).

When actor or scope evidence is strong enough, prefer canonical product-domain terms such as **Staff User**, **Organisation**, **Site**, **Brand**, **Current Site**, **Staff-Facing**, and **Customer-Facing**. If evidence is not strong enough, use neutral labels like "request caller" or "browser user".

## Guardrails

- Do not execute production URLs or production curl requests.
- Treat production-specific values as shape clues, not traceable local data. Site IDs, Organisation/Brand identifiers, client/customer names or IDs, order numbers, basket IDs, booking IDs, payment references, and similar values are usually not available in local/development/staging data.
- Trace the generic code path for requests that look structurally similar to the support input. Do not try to find or replay exact production records unless the user explicitly provides approved environment-specific evidence.
- Treat the workflow as read-only against the packages unless the user explicitly asks for instrumentation or code changes.
- Save original support input only in redacted form inside the HTML report unless the user explicitly opts in to raw storage.
- Ask at most one blocking clarification, and only when there is no usable entrypoint evidence.
- Clearly separate observed evidence, inferred evidence, unresolved gaps, and contradictions.
- When the report includes Request Trace diagram(s), they must trace the request(s) being investigated. Do not diagram the Agent Skill, helper, artifact pipeline, report-generation process, or a generic "candidate code path" as the final answer.

## Output contract

The workflow creates exactly one generated report file:

```text
.scratch/investigations/<timestamp-slug>/report.html
```

Do not generate sibling Markdown, JSON, evidence, render-log, SVG, or PNG files unless the user explicitly asks for them. The HTML report is the single artifact and is rendered from `.agents/skills/investigate/report-template.html`. Mermaid diagram `.mmd` files may also be used while authoring and validating a diagram (see step 4).

The report structure is:

- highlighted root-cause section at the top
- summary
- investigation mode and generic request shape(s), when applicable
- embedded Mermaid diagram(s), rendered in-browser via `https://cdn.jsdelivr.net/npm/mermaid@11.4.1/+esm` (kept in step with the `check_diagram` validator engine)
- entrypoint evidence with support input
- evidence ledger with stable IDs (`E1`, `E2`, `E3`, ...)
- evidence IDs cited directly in root cause, summary, explanatory prose, Mermaid diagrams, gaps, and verification wherever those claims depend on ledger evidence
- gaps
- verification / how to improve confidence

## Evidence IDs

Treat the Evidence ledger as the report's citation system, not as an appendix that only appears once.

- Assign stable IDs (`E1`, `E2`, `E3`, ...) to every observed, inferred, unresolved, or contradictory evidence item in the Evidence ledger.
- Reference those exact IDs wherever the evidence supports a claim: root cause, summary, investigation mode, request-shape table when applicable, gaps, verification steps, and explanatory prose. Use concise citations such as `(E3, E5)`.
- Mermaid diagrams must also carry evidence IDs on evidence-backed arrows, participant notes, and gap notes, for example `caller->>route: POST /orders/orderId (E1, E2)` or `Note over service: Posting stops before outbound call (E7)`.
- Do not cite an ID that is not present in the ledger. When a claim changes, update both the cited prose/diagram and the ledger row.
- Use unresolved evidence IDs for gaps too, so a support agent can see exactly which missing log, setting, or code link would raise confidence.

## Workflow

### 1. Gather input

Accept any support-shaped input:

- production or local URL
- curl command
- copied browser request
- API path
- support notes, error messages, or reproduction steps

If exact Site IDs, client/customer identifiers, order numbers, booking IDs, payment references, or similar values are present, keep them redacted and convert them into generic placeholders for analysis, such as `{siteId}`, `{orderNumber}`, or `{bookingId}`. Use the surrounding path, method, parameters, UI labels, and error text to identify the generic request path.

### 2. Create the HTML report shell

From the monorepo root, run one of:

```bash
python3 -I .agents/skills/investigate/create_trace.py --input-file .scratch/investigation-input.txt --title "Short support case title"
```

or:

```bash
python3 -I .agents/skills/investigate/create_trace.py --input-text "GET https://example.try.be/path?token=secret" --title "Short support case title"
```

In this environment, run the generator with the host's `python3 -I` as shown (it uses only the standard library); the Docker wrapper `create_trace` can't pull its image here. When using `--input-file`, keep the file inside the monorepo, e.g. under `.scratch/`. Prefer input text over input files when possible.

The generated HTML is rendered from `.agents/skills/investigate/report-template.html`: highlighted root cause first, summary, graph, evidence with redacted input, evidence ledger, gaps, and verification. The generated Mermaid request-shape diagram(s), when present, prove the report can render Mermaid in-browser, but they are not final support-quality request traces.

### 3. Investigate the request path and edit the HTML

Before reporting success, inspect the implicated packages and edit `report.html` so the highlighted root-cause section, summary, Mermaid diagram(s), redacted-input evidence, evidence ledger, gaps, and verification steps follow the actual request under investigation as far as evidence allows.

For Staff-facing app URLs, trace:

1. browser/user action or URL
2. frontend route and route module/screen
3. directly implicated component, container, API hook, SDK call, or fetch call
4. backend API request(s), if found
5. support-visible response, error, redirect, or UI state

For API/curl/browser-network requests, trace:

1. request caller or browser/tool
2. HTTP method and generic path with production identifiers replaced by placeholders
3. matching route definition
4. controller/action or handler
5. service/action classes, validators, policies/guards, models/collections/tables, events/jobs, and outbound calls when directly evidenced
6. response or error returned to the caller

Use file/function/class names in participant labels when known, cite those files in the evidence ledger, and reference the resulting `E#` IDs directly in the surrounding prose and Mermaid messages. Unknown hops are allowed, but they must be precise gaps attached to the request path, not the whole diagram.

If multiple requests appear in the support ticket, decide whether they are one flow or separate alternatives:

- one flow: show the causal order between requests, such as app page → API submit → response → app follow-up page;
- separate alternatives: include separate Mermaid diagrams with clear headings so a support agent can read each request independently.

### 4. Validate every Mermaid diagram before embedding it

Do not paste a hand-authored diagram straight into `report.html`. The in-browser renderer only shows "Syntax error in text" with no detail, so validate each diagram first against the Docker-based Mermaid engine.

For each diagram:

1. Write the diagram body to a standalone scratch file inside the repository, e.g. `.scratch/investigations/<timestamp-slug>/diagram.mmd`. Use the raw Mermaid source (un-escaped `>`, `&`, etc.) — not the HTML-escaped form.
2. Validate it:

   ```bash
   echo '{"executablePath":"/opt/pw-browsers/chromium","args":["--no-sandbox"]}' > .scratch/investigations/puppeteer.json
   npx -y @mermaid-js/mermaid-cli@11.4.2 -p .scratch/investigations/puppeteer.json \
     -i .scratch/investigations/<timestamp-slug>/diagram.mmd -o /tmp/diagram-check.svg && echo OK
   ```

   This runs `mmdc` on the host with the preinstalled Chromium (the upstream `check_diagram` wrapper
   needs a Docker image this environment doesn't have). It prints `OK` when valid, and exits
   non-zero with the Mermaid parse error (with the offending line) when not. Delete
   `puppeteer.json` with the `.mmd` files at the end.
3. If it fails, fix the `.mmd` and re-run until it passes. Common culprits in `Note`/message text: `;` (statement separator), literal `<br/>` tags, and stray `{ }` / `[ ]`. Prefer plain prose in notes.
4. Once it passes, embed the validated diagram into `report.html` inside `<pre class="mermaid">…</pre>`, HTML-escaping `&`, `<`, and `>` (e.g. `--&gt;&gt;`, `&amp;`). Do not reintroduce `<br/>` — keep note text on one line.
5. Delete the `.mmd` scratch file(s) so `report.html` is the only artifact (see Output contract).

### 5. Final diagram quality gate

Open `report.html` before returning. You are not done if the final diagram contains any of these as primary content:

- the Agent Skill, helper, artifact pipeline, report renderer, or Trybe Monorepo as participants;
- generic filler arrows like "match generic request shape", "candidate code path to verify", or "response behavior not observed";
- a single unresolved "packages" box instead of the request route/handler being investigated;
- only host/path normalization with no attempt to locate the route, screen, controller, hook, or handler;
- evidence-backed arrows, notes, or explanatory labels that omit the relevant `E#` citation from the Evidence ledger.

A useful final diagram should answer: "When a request like this arrives, what code path does it appear to follow, and where does evidence run out?" If evidence runs out early, the diagram should still show the request up to the precise missing link, with an evidence-backed gap note.

### 6. Final report quality gate

Before returning, check the whole `report.html` against the Trybe context language:

1. Read `context/CONTEXT-MAP.md` first to identify which context files own the terms used by the trace.
2. Read `context/shared-language.md`, then the relevant `context/*.md` files for the request domain. For monorepo, package, agent-workflow, or artifact terms, read `context/engineering-workspace.md`.
3. Review the highlighted root cause, summary, investigation mode, diagram participant labels and messages, redacted-input evidence, evidence ledger, gaps, and verification sections for ambiguous or non-canonical language and missing `E#` evidence citations.
4. Replace overloaded or conflicting words with the canonical terms from the owning context files. Pay particular attention to `customer`, `client`, `guest`, `booking`, `reservation`, `order`, `checkout`, `account`, `product`, `resource`, `label`, `site`, `organisation`, and `brand`.
5. If the evidence is not strong enough to choose a canonical product-domain term, use a neutral evidence-backed label such as "request caller" or "browser user" and record the ambiguity in the report's gaps or verification section. Do not invent a new domain term inside the report.
6. Preserve raw support wording only as redacted evidence; translate explanatory prose and diagram labels into the correct ubiquitous language.

You are not done until the final report can be read without ambiguity and uses the correct Trybe ubiquitous language for every supported claim.

### 7. Report back to the user

Send the report to the user with `SendUserFile` (`display: "render"`), so it opens in the Claude app;
files elsewhere than `/home/user/trybe` or the scratchpad can't be opened there. Then reply with only
the report path and the most useful next step:

```text
Created Investigation Report at `.scratch/investigations/20260530T123456Z-checkout-error/report.html`.
Next step: review the request trace in the report I sent; <the one check that would confirm the root cause>.
```

Don't publish the report as an Artifact or anywhere else unless the user asks: even redacted, it
describes a customer's support case.
