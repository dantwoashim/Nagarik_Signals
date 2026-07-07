import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { spawn } from 'child_process';

const root = process.cwd();
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const debugPort = Number(process.env.PHASE6_CDP_PORT || 9236);
const appPort = Number(process.env.PHASE6_APP_PORT || 3016);
const baseUrl = process.env.PHASE6_APP_URL || `http://127.0.0.1:${appPort}`;
const shouldStartServer = !process.env.PHASE6_APP_URL;
const routes = ['/', '/market/ward12-water-repair', '/participate/ward12-water-repair', '/verify/ward12-water-repair', '/ledger', '/demo'];
const sizes = [
  { name: 'mobile', width: 390, height: 900 },
  { name: 'desktop', width: 1440, height: 1100 },
];
const outDir = path.join(root, 'dist', 'phase6-mobile-screenshots');
mkdirSync(outDir, { recursive: true });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url) {
  for (let i = 0; i < 90; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await wait(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function spawnServer() {
  if (!shouldStartServer) return null;
  return spawn('npm', ['run', 'start', '--workspace', 'app', '--', '-p', String(appPort)], {
    cwd: root,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(appPort) },
  });
}

async function getWsUrl(port, stderrRef) {
  for (let i = 0; i < 75; i++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const page = pages.find((item) => item.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await wait(200);
  }
  throw new Error(`Chrome CDP did not start: ${stderrRef.value.slice(-1000)}`);
}

function safeName(route) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '');
}

const server = spawnServer();
let serverOutput = '';
server?.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server?.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

const profile = mkdtempSync(path.join(tmpdir(), 'phase6-cdp-'));
let chrome;

try {
  await waitForHttp(baseUrl);
  if (!existsSync(chromePath)) throw new Error(`Chrome not found at ${chromePath}`);

  const stderrRef = { value: '' };
  chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', (chunk) => { stderrRef.value += chunk.toString(); });

  const wsUrl = await getWsUrl(debugPort, stderrRef);
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const eventListeners = new Set();

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
    for (const listener of eventListeners) listener(message);
  };

  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  function send(method, params = {}) {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  function waitForLoad() {
    return new Promise((resolve) => {
      const listener = (message) => {
        if (message.method === 'Page.loadEventFired') {
          eventListeners.delete(listener);
          resolve();
        }
      };
      eventListeners.add(listener);
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  const results = [];

  for (const size of sizes) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: size.width,
      height: size.height,
      deviceScaleFactor: 1,
      mobile: size.name === 'mobile',
    });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

    for (const route of routes) {
      const load = waitForLoad();
      const started = Date.now();
      await send('Page.navigate', { url: new URL(route, baseUrl).toString() });
      await load;
      await wait(350);
      const expression = `(() => {
        const named = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim();
        const controls = [...document.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, summary')];
        const unnamedControls = controls.filter((el) => !named(el) && el.tagName !== 'INPUT').length;
        const inputsWithoutLabels = [...document.querySelectorAll('input:not([type="hidden"])')].filter((input) => {
          return !(input.id && document.querySelector('label[for="' + input.id + '"]')) && !input.closest('label') && !input.getAttribute('aria-label');
        }).length;
        const imagesWithoutAlt = [...document.images].filter((img) => !img.hasAttribute('alt')).length;
        const h1Count = document.querySelectorAll('h1').length;
        const text = document.body.textContent || '';
        return {
          bodyScrollWidth: document.body.scrollWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          focusable: controls.length,
          unnamedControls,
          inputsWithoutLabels,
          imagesWithoutAlt,
          h1Count,
          title: document.title,
          firstScreenCivicCopy: text.includes('Forecast civic outcomes') || text.includes('Ward 12 Water Repair Signal'),
          verifierCommand: text.includes('npm run civic:verify-receipt'),
          convictionSignal: text.includes('Conviction signal') || text.includes('conviction_signal'),
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
        };
      })()`;
      const value = await send('Runtime.evaluate', { expression, returnByValue: true }).then((result) => result.result.value);
      const ok =
        value.bodyScrollWidth <= value.clientWidth &&
        value.docScrollWidth <= value.clientWidth &&
        value.focusable > 0 &&
        value.unnamedControls === 0 &&
        value.inputsWithoutLabels === 0 &&
        value.imagesWithoutAlt === 0 &&
        value.h1Count >= 1 &&
        value.reducedMotion === true &&
        (route !== '/' || value.firstScreenCivicCopy === true) &&
        (route !== '/ledger' || value.verifierCommand === true) &&
        (route !== '/participate/ward12-water-repair' || value.convictionSignal === true);

      if (size.name === 'mobile' && ['/', '/participate/ward12-water-repair', '/verify/ward12-water-repair', '/ledger'].includes(route)) {
        const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
        writeFileSync(path.join(outDir, `${safeName(route)}-mobile.png`), Buffer.from(screenshot.data, 'base64'));
      }

      results.push({ route, size: size.name, ms: Date.now() - started, ...value, ok });
    }
  }

  socket.close();
  const output = {
    ok: results.every((result) => result.ok),
    baseUrl,
    screenshots: outDir,
    results,
  };
  mkdirSync(path.join(root, 'dist'), { recursive: true });
  writeFileSync(path.join(root, 'dist', 'phase6-browser-readiness.json'), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(1);
} finally {
  chrome?.kill();
  server?.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
