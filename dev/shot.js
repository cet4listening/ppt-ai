// CDP 精确截图：node dev/shot.js <url> <out.png> [width] [height] [waitMs]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9445;
const [url, out] = process.argv.slice(2);
const W = parseInt(process.argv[4] || '1280', 10);
const H = parseInt(process.argv[5] || '720', 10);
const WAIT = parseInt(process.argv[6] || '2400', 10);
const profile = path.join(process.env.TEMP, 'pp-cdp-shot');

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  '--window-size=' + (W + 16) + ',' + (H + 120),
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  let targets = null;
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      if (res.ok) {
        targets = await res.json();
        if (targets.some(t => t.type === 'page')) break;
      }
    } catch (e) { /* retry */ }
  }
  if (!targets) throw new Error('CDP unavailable');
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 1, mobile: false
  });
  await send('Page.navigate', { url });
  await sleep(WAIT);

  let expr = process.argv[7];
  if (expr && expr[0] === '@') expr = fs.readFileSync(expr.slice(1), 'utf8');
  if (expr) {
    const r = await send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true
    });
    if (r.exceptionDetails) console.error('eval error', JSON.stringify(r.exceptionDetails).slice(0, 400));
    else console.log('eval:', JSON.stringify(r.result && r.result.value));
    await sleep(900);
  }

  const shot = await send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: false
  });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('saved ' + out + ' (' + fs.statSync(out).size + ' bytes)');

  ws.close();
  chrome.kill();
}

main().catch(e => { console.error('ERR', e.message); chrome.kill(); process.exit(1); });
