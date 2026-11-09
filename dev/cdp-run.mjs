/**
 * dev/cdp-run.mjs —— 用无头 Chrome + CDP 跑测试页并落盘结果
 *
 * 用法：
 *   node dev/cdp-run.mjs --url "file:///C:/.../dev/files-test.html"
 *   node dev/cdp-run.mjs --url "file:///C:/.../dev/export-test.html" --out dev/out --blob native=native.pptx --blob image=image.pptx
 *
 * 测试页约定：跑完后在 window.__RESULT 放 {state:'PASS'|'FAIL'|..., rows:[{name,ok,detail}], ...}
 * 导出页另有 window.__blobLen(key) / window.__chunk(key, i, n) 供分块取回 base64。
 *
 * 无第三方依赖：node 内置 http / WebSocket（node ≥ 22）。
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/* ------------------------------- 参数 ------------------------------- */
const argv = process.argv.slice(2);
function argOf(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
const URL_ = argOf('url');
if (!URL_) {
  console.error('缺少 --url');
  process.exit(2);
}
const OUT = resolve(argOf('out', join(HERE, 'out')));
const TIMEOUT = Number(argOf('timeout', '240')) * 1000;
const blobSpecs = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--blob' && argv[i + 1]) {
    const [key, file] = argv[i + 1].split('=');
    blobSpecs.push({ key, file: file || key + '.pptx' });
  }
}

/* ---------------------------- CDP 小客户端 ---------------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.closed = false;
    this.opened = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res());
      this.ws.addEventListener('error', (e) => rej(new Error('WS 连接失败: ' + (e.message || e))));
    });
    this.ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: r, reject: j } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? j(new Error(msg.error.message || JSON.stringify(msg.error))) : r(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
    this.ws.addEventListener('close', () => { this.closed = true; });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error('WS 已关闭'));
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression, { awaitPromise = false, timeout = 60000 } = {}) {
    const res = await this.send('Runtime.evaluate', {
      expression, awaitPromise, returnByValue: true, userGesture: true, timeout
    });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error('页面异常：' + (d.exception?.description || d.text || '未知'));
    }
    return res.result?.value;
  }
}

async function fetchJson(url, tries = 200) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch { /* chrome 还没起来 */ }
    await sleep(150);
  }
  throw new Error('CDP 端口无响应: ' + url);
}

/* ------------------------------ 主流程 ------------------------------ */
const port = 9300 + Math.floor(Math.random() * 500);
const profile = join(tmpdir(), 'dsh-cdp-' + Date.now());
mkdirSync(profile, { recursive: true });
mkdirSync(OUT, { recursive: true });

const chromeArgs = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--hide-scrollbars',
  '--mute-audio',
  '--window-size=1400,900',
  '--user-data-dir=' + profile,
  '--remote-debugging-port=' + port,
  URL_
];
const chrome = spawn(CHROME, chromeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
let chromeErr = '';
chrome.stderr.on('data', (d) => { chromeErr += String(d); });

let exitCode = 0;
try {
  const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find((t) => t.type === 'page') || targets[0];
  if (!page) throw new Error('没有可用的页面 target');

  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');

  /* 等测试页给出 __RESULT */
  const deadline = Date.now() + TIMEOUT;
  let result = null;
  while (Date.now() < deadline) {
    try {
      const raw = await cdp.evaluate(
        'window.__RESULT ? JSON.stringify(window.__RESULT) : ""', { timeout: 15000 });
      if (raw) {
        result = JSON.parse(raw);
        break;
      }
    } catch (e) {
      // 页面还在加载/刷新，忽略
      if (/WS 已关闭/.test(e.message)) throw e;
    }
    await sleep(400);
  }

  const errors = [];
  for (const ev of cdp.events) {
    if (ev.method === 'Runtime.exceptionThrown') {
      const d = ev.params.exceptionDetails;
      errors.push('EXCEPTION: ' + (d.exception?.description || d.text || ''));
    } else if (ev.method === 'Log.entryAdded') {
      const en = ev.params.entry;
      if (en.level === 'error' || en.level === 'warning') errors.push(en.level.toUpperCase() + ': ' + en.text + (en.url ? ' @' + en.url : ''));
    } else if (ev.method === 'Runtime.consoleAPICalled' && (ev.params.type === 'error' || ev.params.type === 'warning')) {
      errors.push(ev.params.type.toUpperCase() + '[console]: ' + ev.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
  }

  if (!result) {
    let diag = '(诊断不可用)';
    try {
      diag = await cdp.evaluate(
        'JSON.stringify({ready:document.readyState,title:document.title,' +
        'exp:typeof window.EXPORTER,ppt:typeof window.PPT,step:window.__STEP||null,' +
        'hasResult:!!window.__RESULT,state:(document.getElementById("state")||{}).textContent,' +
        'body:(document.body?document.body.innerText:"").slice(0,600)})');
    } catch { /* ignore */ }
    console.error('页面超时未产出 __RESULT。诊断: ' + diag);
    if (errors.length) console.error('页面错误:\n' + errors.slice(0, 20).join('\n'));
  }

  /* 取回 base64 blob 并落盘 */
  const saved = [];
  if (blobSpecs.length) {
    if (!result) throw new Error('页面没有产出 __RESULT，无法取 blob');
    const CH = 400000;
    for (const spec of blobSpecs) {
      const len = await cdp.evaluate(`window.__blobLen ? window.__blobLen(${JSON.stringify(spec.key)}) : 0`);
      if (!len) { saved.push({ key: spec.key, error: '页面没有该 blob' }); continue; }
      let b64 = '';
      for (let off = 0; off < len; off += CH) {
        const part = await cdp.evaluate(
          `window.__chunk(${JSON.stringify(spec.key)}, ${off / CH}, ${CH})`, { timeout: 60000 });
        b64 += part;
      }
      const buf = Buffer.from(b64, 'base64');
      const path = resolve(OUT, spec.file);
      writeFileSync(path, buf);
      const pk = buf.subarray(0, 4).toString('binary') === 'PK\x03\x04';
      saved.push({ key: spec.key, path, bytes: buf.length, isZip: pk });
    }
  }

  const summary = {
    url: URL_,
    browser: version.Browser,
    state: result ? result.state : 'NO_RESULT',
    total: result?.total, failed: result?.failed,
    stats: result?.stats, blobLens: result?.blobLens,
    rows: result?.rows,
    errors: errors.slice(0, 40),
    saved
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!result || result.state !== 'PASS' || (result.failed || 0) > 0) exitCode = 1;
  if (saved.some((s) => s.error || s.isZip === false)) exitCode = 1;

  try { await cdp.send('Browser.close'); } catch { /* ignore */ }
  cdp.ws.close();
} catch (e) {
  console.error('CDP 运行失败:', e.message);
  if (chromeErr) console.error('chrome stderr 尾部:\n' + chromeErr.slice(-3000));
  exitCode = 2;
} finally {
  try { chrome.kill('SIGKILL'); } catch { /* ignore */ }
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}

process.exit(exitCode);
