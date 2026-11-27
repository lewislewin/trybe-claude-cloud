---
name: trybe-run-app
description: Run the Trybe stack and drive the staff app in a real browser — QA a pull request end to end, reproduce a UI bug, check a change in the running app, take screenshots for a PR, or call the APIs with a real token. Covers the Docker stack a Claude Code cloud session starts by itself, logging in through auth's OIDC flow with Playwright, the app's UI quirks that trip up selectors, and getting screenshots to the user and into a GitHub comment.
---

# Run and drive the app (Claude Code cloud session)

Personal override of trybe's `run-app` for cloud sessions whose environment runs `.agents/setup`
(Docker mode). The upstream skill's `./bin/dev serve` is for native cloud mode and refuses to run
here. The driver is this override's own copy, `~/.claude/skills/run-app/drive.cjs` (it adds
`--video` and `--viewport` to trybe's); other supporting files stay upstream.

Work from `/home/user/trybe`. The containers mount that checkout, so code you want to see running
must be checked out there, not in a worktree.

## 1. The stack is already starting

- `cat ~/.trybe/mode` prints `docker`. If it prints anything else, this is native cloud mode:
  follow the upstream skill (`/home/user/trybe/.agents/skills/run-app/SKILL.md`) instead.
- The SessionStart hook starts `dockerd`, migrates, runs `./bin/dev up` and the app's dev server in
  the background. It is ready when `~/.trybe/session-stack.ready` exists; progress is in
  `~/.trybe/session-stack.log`. Don't start a second stack. If it isn't ready, wait for it with the
  Monitor tool (`until [ -f ~/.trybe/session-stack.ready ]; do sleep 5; done`), not a sleep loop.
- If the log ended in failure, run `./bin/dev doctor`, then `./bin/dev up`.
- Served:
  - the app at `https://app.trybe.test:8888`
  - the API gateway at `https://api.trybe.test` (`/shop`, `/customers`, `/inventory`, the rest to
    auth); each API also on `https://<auth|shop|customer|inventory>-api.trybe.test`
- `*.trybe.test` resolves to 127.0.0.1 on the host. Bypass the agent proxy for it:
  `curl -k --noproxy '*' …`.
- After switching branches: PHP changes apply on the next request. New migrations need
  `./bin/dev artisan <pkg> migrate`. A branch that changes a lockfile still runs with `main`'s
  `vendor/` (containers can't install packages); say so if it matters.
- Nobody else can open this app: the session's network blocks Tailscale and cloudflared. People see
  it through your screenshots.

## 2. Call the APIs

Mint a token for a seeded user and call the gateway:

```bash
T=$(./bin/dev serve token standard@try.be)
curl -sk --noproxy '*' -H "Authorization: Bearer $T" -H "Accept: application/json" \
  https://api.trybe.test/shop/sites/00000000-0000-0000-0000-111111111111
```

`./bin/dev serve token` and `./bin/dev serve artisan <pkg> …` work in Docker mode since trybe#2680.
On a branch cut before that (they refuse with "serve is for cloud mode"), use plain
`./bin/dev artisan`, which in Docker mode also runs against the dev databases the stack serves:

```bash
T=$(./bin/dev artisan auth tinker --execute 'echo \App\User::where("email", "standard@try.be")->first()?->createToken("cli")->accessToken, PHP_EOL;' 2>/dev/null | grep -E '^eyJ' | tail -1)
```

Swap the email for the user the scenario needs. Run other artisan or tinker commands against the served data with `./bin/dev serve artisan <pkg> …`.
Tinker doesn't echo the last expression: `dump()` or `echo` what you want to see.

Seeded data:

| | |
| --- | --- |
| Organisation | `00000000-0000-0000-0000-000000000000` (Trybe Internal) |
| Sites | `00000000-0000-0000-0000-111111111111` (London Mayfair Spa) to `…115` |
| Internal staff (settings, internal tools) | Lewis's account and the other staff in `UserSeeder` (shared library) |
| No settings permissions | `standard@try.be` |
| One site only | `singlesite@try.be` |
| Password | `password` for everyone |

## 3. Drive the app

Write a scenario module under `.scratch/` (gitignored), then run it through the driver, which logs
in first:

```js
// .scratch/qa/onq.cjs
module.exports = async (page, { shot }) => {
  // Paths resolve against the app URL the driver chose (also passed as `appUrl`).
  await page.goto('/settings/integrations/onq', { waitUntil: 'networkidle' })
  await shot('onq-settings', { fullPage: true })
}
```

```bash
node ~/.claude/skills/run-app/drive.cjs .scratch/qa/onq.cjs --email standard@try.be --out .scratch/qa/shots
```

- The default URL, `https://app.trybe.test:8888`, is right here. The driver maps the host to
  127.0.0.1 and launches Chromium without the proxy variables.
- Chromium needs about 2 GB free next to the stack: check `free -m` first.
- The driver prints console errors and every non-GET API call with its request body. It stays quiet
  during login, so the password and OAuth code never reach the output.
- Screenshots land in `--out` (default `.scratch/screenshots`). `--scale 2` for images meant for
  people, 1 for ones only you look at.
- **Look at every screenshot** with the Read tool. A blank frame, login page or error page is a
  failure, not a result.

Selectors and quirks that cost time:

- **Login** has two steps: email then Enter, then password on the next screen. The driver handles it.
- **Modals** are Headless UI. The `role="dialog"` element reports as hidden to Playwright even while
  the modal is open, so wait on something inside it, such as
  `dialog.locator('input[name=…]').waitFor()`.
- **List rows** (`ResourceListItem`) carry `aria-label="<title>"`. Their actions sit behind a
  three-dots button, the row's last `button`, which opens a menu of plain text items:

  ```js
  const row = page.locator('[aria-label="Food"]').first().locator('xpath=..')
  await row.locator('button').last().click()
  await page.getByText('Update mapping', { exact: true }).last().click()
  ```

- **Capture a request body** with `page.waitForRequest`, started together with the click:

  ```js
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'PUT'),
    dialog.getByRole('button', { name: /update/i }).click(),
  ])
  console.log(request.postData())
  ```

- **Token from inside a logged-in page**:

  ```js
  const k = Object.keys(sessionStorage).concat(Object.keys(localStorage)).find((k) => k.startsWith('oidc.user'))
  const token = JSON.parse(sessionStorage.getItem(k) || localStorage.getItem(k)).access_token
  ```

- **Known noise:** auth's login page requests `/js/app.js` and gets a 404. Harmless.

`--viewport 390x844` drives a phone-sized page. `--video <name>` records the scenario, without the
login, to `<out>/<name>.mp4` (a `.webm` when ffmpeg is missing).

Running Playwright yourself? `require('playwright')` works from any directory with the preinstalled
Chromium; launch it without the `*_proxy` variables and with `ignoreHTTPSErrors: true`, as
`drive.cjs` does. Never run `playwright install`.

## 4. Show the user

Send the decisive screenshots with `SendUserFile` (`display: "render"`, a one-line caption each).
Only files under `/home/user/trybe` or the scratchpad can be opened in the app.

## 5. Put screenshots in a PR comment

GitHub's image upload isn't available from a session, and screenshots don't belong on the PR
branch. Use the QA assets script, which pushes them to an orphan `<pr-branch>-qa-assets` branch
without touching the working tree, and prints image URLs pinned to that commit:

```bash
bash .agents/skills/qa/scripts/push-qa-assets.sh <pr-branch> pr-<n> .scratch/qa/shots/*.png
```

That pushes a branch other than this session's, so ask the user first unless they already asked
for the screenshots on the PR. Embed with
`<img src="<printed url>" width="420">`. Post the comment only when asked, through
`mcp__github__add_issue_comment` (PR number as `issue_number`), ending with the
`Generated by Claude Code` footer. GitHub renders Mermaid, tables and `<details>` in comments.
