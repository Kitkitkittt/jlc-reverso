import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let url;
try {
  const base = new URL(process.argv[2] || 'http://127.0.0.1:8000');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error();
  url = new URL('model/check-playback.html', `${base.href.replace(/\/$/, '')}/`).href;
} catch {
  console.error('FAIL: Supply an HTTP(S) base URL without credentials.');
  process.exit(1);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), 'playback-check-'));
let child, socket, timedOut = false, exited = false, failure = '';
const deadline = setTimeout(() => { timedOut = true; socket?.close(); child?.kill('SIGKILL'); }, 90000);
try {
  let endpoint;
  for (const browser of ['chromium', 'google-chrome']) {
    try {
      endpoint = await new Promise((resolve, reject) => {
        child = spawn(browser, [
          '--headless', '--no-sandbox', '--enable-unsafe-swiftshader',
          '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1400,1100',
          '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows', url,
        ], { stdio: ['ignore', 'ignore', 'pipe'] });
        let log = '';
        child.stderr.on('data', chunk => {
          log = (log + chunk).slice(-8192);
          const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
          if (match) resolve(new URL(match[1]));
        });
        child.once('error', reject);
        child.once('exit', () => { exited = true; reject(new Error('Browser exited before debugging was ready.')); });
      });
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') { failure = 'Browser launch or early exit failed.'; throw error; }
      child = undefined;
    }
  }
  if (!endpoint) { failure = 'Install chromium or google-chrome to run this check.'; throw new Error(); }
  let page;
  while (!page && !timedOut && !exited) {
    const pages = await fetch(`http://${endpoint.host}/json/list`, { signal: AbortSignal.timeout(2000) }).then(response => response.json());
    page = pages.find(target => target.type === 'page' && target.url === url);
    if (!page) await sleep(100);
  }
  if (!page) throw new Error('Browser did not expose the regression page.');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Browser debugging connection failed.')), { once: true });
    socket.addEventListener('close', () => reject(new Error('Browser debugging connection closed.')), { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error('Browser evaluation failed.')) : request.resolve(message.result); }
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) request.reject(new Error('Browser debugging connection closed.'));
    pending.clear();
  });
  const evaluate = () => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: {
      expression: '(() => { const r = document.getElementById("result"); return r && { verdict: r.dataset.check, message: r.textContent }; })()', returnByValue: true,
    } }));
  });
  let outcome;
  while (!timedOut && !exited) {
    outcome = (await evaluate()).result?.value;
    if (outcome && outcome.verdict !== 'pending') break;
    await sleep(100);
  }
  if (timedOut || exited || !outcome || outcome.verdict !== 'pass') {
    failure = timedOut ? 'Browser timed out.' : exited ? 'Browser exited unsuccessfully.' : outcome?.verdict === 'fail' ? outcome.message : 'Playback regression did not finish with a verdict.';
    throw new Error();
  }
  console.log('PASS: Real reversal and calibre assembly playback, scrub holds, resume, stages, completion and recto reset.');
} catch {
  // Only the local check's assertion messages are returned, never browser logs or paths.
  console.error(`FAIL: ${failure || (timedOut ? 'Browser timed out.' : 'Browser launch or debugging failed.')}`);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  socket?.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = new Promise(resolve => child.once('close', resolve));
    child.kill('SIGKILL');
    await closed;
  }
  await rm(profile, { recursive: true, force: true }).catch(() => { console.error('FAIL: Browser profile cleanup failed.'); process.exitCode = 1; });
}
