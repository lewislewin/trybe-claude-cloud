#!/usr/bin/env node
// Log in to the served app (./bin/dev serve, ./bin/dev up or a named env's
// ./bin/dev env up) through auth's real OIDC flow, then hand the page to a
// scenario script. See SKILL.md next to this file.
//
// This copy lives in trybe-claude-cloud and is linked to ~/.claude/skills/run-app/drive.cjs. It
// adds --video and --viewport to trybe's .agents/skills/run-app/drive.cjs, and finds the trybe
// checkout through $TRYBE_ROOT (default /home/user/trybe) rather than its own location.
//
// Usage:
//   node ~/.claude/skills/run-app/drive.cjs <scenario.cjs> [--email lewis@try.be] [--out <dir>] [--url <app url>]
//     [--scale 2] [--viewport 390x844] [--video <name>]
//
// --video <name> records the scenario (not the login) to <out>/<name>.mp4, or
// <out>/<name>.webm when ffmpeg isn't installed.
//
// A scenario is a CommonJS module exporting `async (page, { shot, out, log, appUrl }) => {}`.
// The page's baseURL is the app URL, so page.goto('/settings') works.
// `shot(name, options)` writes <out>/<name>.png and prints the path.

const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const TRYBE_ROOT = process.env.TRYBE_ROOT || '/home/user/trybe'
// A global playwright where the image ships one, else the copy packages/app
// installs for its e2e suite.
const { chromium } = (() => {
  try {
    return require('playwright')
  } catch {
    return require(require.resolve('playwright', { paths: [path.join(TRYBE_ROOT, 'packages/app')] }))
  }
})()

const DEFAULT_APP_URL = 'https://app.trybe.test:8888'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}
const scenarioPath = args.find((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'))
if (!scenarioPath) {
  console.error('usage: node drive.cjs <scenario.cjs> [--email lewis@try.be] [--out <dir>] [--url <app url>] [--scale 2] [--viewport 390x844] [--video <name>]')
  process.exit(1)
}

// The app's URL: --url, then $TRYBE_APP_URL, then this checkout's named env
// (`./bin/dev env url`, which fails when the checkout is not one), then the
// single stack's and cloud mode's https://app.trybe.test:8888.
const envAppUrl = () => {
  try {
    const url = execFileSync(path.join(TRYBE_ROOT, 'bin/dev'), ['env', 'url'], {
      cwd: TRYBE_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30000,
    })
      .toString()
      .trim()
    return /^https:\/\/[^\s/]+$/.test(url) ? url : undefined
  } catch {
    return undefined
  }
}
const APP_URL = (option('url') || process.env.TRYBE_APP_URL || envAppUrl() || DEFAULT_APP_URL).replace(/\/+$/, '')
const APP_HOST = new URL(APP_URL).hostname
// A named env's app is <name>-app.trybe.test; its APIs are <name>-api and
// <name>-<pkg>-api. The single stack and cloud mode have none of these.
const ENV_NAME = APP_HOST.match(/^([a-z0-9]+)-app\.trybe\.test$/)?.[1]
// On a cloud dev box an env's app is https://<name>-app.<owner>.trybedev.com,
// with its APIs under /_api on the same host. That host resolves to Cloudflare,
// whose Access sign-in a script cannot pass, so the driver sends its requests
// to the tunnel's local router instead (dev/lib/envbox.sh), the same nginx
// cloudflared hands them to. TRYBE_TUNNEL_ROUTER overrides its address.
const BOX_HOST = /^[a-z0-9]+-app\.[a-z0-9-]+\.trybedev\.com$/.test(APP_HOST) ? APP_HOST : undefined
const BOX_ROUTER = (process.env.TRYBE_TUNNEL_ROUTER || 'http://127.0.0.1:8080').replace(/\/+$/, '')
const API_ORIGINS = [
  'http://localhost:8000',
  // The single docker stack's gateway (./bin/dev up).
  'https://api.trybe.test',
  ...(ENV_NAME ? [`https://${ENV_NAME}-api.trybe.test`] : []),
  ...(BOX_HOST ? [`https://${BOX_HOST}/_api`] : []),
]
// Every *.trybe.test host is this machine's. A workstation resolves them
// through dnsmasq, but a Linux sandbox (Linear's, in docker mode) has nothing
// that does, and there the app's login goes to auth-api.trybe.test.
const HOST_RULES = [`MAP ${APP_HOST} 127.0.0.1`, ...(BOX_HOST ? [] : ['MAP *.trybe.test 127.0.0.1'])]
const email = option('email', 'lewis@try.be')
const out = path.resolve(option('out', path.join(process.cwd(), '.scratch', 'screenshots')))
fs.mkdirSync(out, { recursive: true })

// The web container's agent proxy cannot reach app.trybe.test or localhost, and
// Chromium follows the proxy variables even with --no-proxy-server, so launch
// it without them.
const browserEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !/^(https?|all|no)_proxy$/i.test(name))
)

;(async () => {
  const browser = await chromium.launch({
    env: browserEnv,
    args: ['--no-proxy-server', `--host-resolver-rules=${HOST_RULES.join(',')}`],
  })
  const [width, height] = option('viewport', '1440x1000').split('x').map(Number)
  const videoName = option('video', null)
  const videoDir = videoName ? fs.mkdtempSync(path.join(out, '.video-')) : null
  const recordingStarted = Date.now()
  let scenarioStarted = recordingStarted
  const context = await browser.newContext({
    // Lets a scenario goto('/path') on whichever app URL was resolved.
    baseURL: APP_URL,
    // The dev certificate for *.trybe.test is self-signed.
    ignoreHTTPSErrors: true,
    viewport: { width, height },
    deviceScaleFactor: Number(option('scale', 1)),
    ...(videoDir ? { recordVideo: { dir: videoDir, size: { width, height } } } : {}),
  })
  if (BOX_HOST) await routeThroughTunnel(context)
  const page = await context.newPage()

  // Surface what matters while a scenario runs: console errors and every
  // non-GET API call with its body. Off until login finishes, so the login
  // form's password and the OAuth code never reach the output.
  let reporting = false
  page.on('console', (message) => {
    if (reporting && message.type() === 'error') {
      console.log('  [console.error]', message.text().slice(0, 300))
    }
  })
  page.on('response', (response) => {
    const request = response.request()
    const origin = API_ORIGINS.find((candidate) => request.url().startsWith(`${candidate}/`))
    if (reporting && origin && !['GET', 'OPTIONS'].includes(request.method())) {
      console.log('  [api]', request.method(), request.url().replace(origin, ''), response.status(), request.postData() ?? '')
    }
  })

  const shot = async (name, options = {}) => {
    await page.waitForTimeout(300)
    const file = path.join(out, `${name}.png`)
    await page.screenshot({ path: file, ...options })
    console.log('  screenshot', file)
    return file
  }

  try {
    // auth's login is two steps: email, then password on the next screen.
    await page.goto(`${APP_URL}/`, { waitUntil: 'networkidle', timeout: 60000 })
    await page.fill('#email', email)
    await page.press('#email', 'Enter')
    await page.waitForSelector('input[type=password]', { timeout: 30000 })
    await page.fill('input[type=password]', 'password')
    await Promise.all([
      page.waitForURL((url) => url.href.startsWith(APP_URL), { timeout: 60000 }),
      page.press('input[type=password]', 'Enter'),
    ])
    await page.waitForLoadState('networkidle')
    console.log(`logged in as ${email} -> ${page.url()}`)
    reporting = true
    scenarioStarted = Date.now()

    await require(path.resolve(scenarioPath))(page, { shot, out, log: console.log, appUrl: APP_URL })
  } catch (error) {
    console.error('SCENARIO FAILED:', error.message.split('\n')[0])
    await shot(`failure-${Date.now()}`).catch(() => {})
    process.exitCode = 1
  } finally {
    await context.close()
    if (videoDir) await saveVideo(await page.video().path(), (scenarioStarted - recordingStarted) / 1000)
    await browser.close()
  }
})()

// Playwright records from the page's creation, so the login is cut off the
// front. ffmpeg also makes an MP4 that Linear and GitHub play inline.
async function saveVideo(webm, skipSeconds) {
  const videoName = option('video')
  try {
    const mp4 = path.join(out, `${videoName}.mp4`)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', skipSeconds.toFixed(2), '-i', webm,
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4])
    console.log('  video', mp4)
  } catch {
    const copy = path.join(out, `${videoName}.webm`)
    fs.copyFileSync(webm, copy)
    console.log('  video', copy, `(no ffmpeg: the first ${skipSeconds.toFixed(1)}s are the login)`)
  }
  fs.rmSync(path.dirname(webm), { recursive: true, force: true })
}

// Every request to the box env's host goes to the tunnel's local router, with
// the Host header cloudflared would send. Playwright does not route the
// request a redirect leads to, so a page's redirect (the OIDC round trip is
// several) is answered as a client-side one, whose request it does route.
// Vite's HMR websocket still goes to Cloudflare and fails, which only costs a
// console error: the page loads without it.
async function routeThroughTunnel(context) {
  await context.route(`https://${BOX_HOST}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const headers = { ...request.headers(), host: BOX_HOST, 'x-forwarded-proto': 'https' }
    let response
    try {
      response = await route.fetch({ url: `${BOX_ROUTER}${url.pathname}${url.search}`, headers, maxRedirects: 0 })
    } catch (error) {
      console.error(`  [tunnel] ${url.pathname}: ${error.message.split('\n')[0]} (is ${BOX_ROUTER} the box's tunnel router?)`)
      return route.abort()
    }
    const responseHeaders = response.headers()
    const location = responseHeaders.location
    if (location && response.status() >= 300 && response.status() < 400 && request.resourceType() === 'document') {
      const target = new URL(location.replace(BOX_ROUTER, `https://${BOX_HOST}`), request.url()).toString()
      delete responseHeaders.location
      delete responseHeaders['content-length']
      responseHeaders['content-type'] = 'text/html'
      return route.fulfill({
        status: 200,
        headers: responseHeaders,
        body: `<script>location.replace(${JSON.stringify(target)})</script>`,
      })
    }
    if (location) responseHeaders.location = location.replace(BOX_ROUTER, `https://${BOX_HOST}`)
    return route.fulfill({ response, headers: responseHeaders })
  })
}
