// 用 CDP 打印元素布局/动画状态：node dev/cdp-probe.js <url> <selector> [selector...]
const { spawn } = require('child_process');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9444;
const url = process.argv[2];
const selectors = process.argv.slice(3);

const profile = path.join(process.env.TEMP, 'pp-cdp1');
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1280,720',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  url
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  let targets = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
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

  await send('Runtime.enable');
  await sleep(1800); // 等动画跑完
  const expr = `(() => {
    const sels = ${JSON.stringify(selectors)};
    const out = sels.map(sel => {
      const el = document.querySelector(sel);
      if (!el) return { sel, missing: true };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        sel,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        opacity: cs.opacity,
        transform: cs.transform,
        animation: cs.animationName + ' / ' + cs.animationDuration + ' / ' + cs.animationDelay,
        visibility: cs.visibility,
        display: cs.display,
        color: cs.color,
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage.slice(0, 220),
        vars: ['--pp-bg', '--pp-surface', '--pp-text', '--pp-muted', '--pp-primary', '--pp-accent', '--pp-line'].map(k => k + '=' + cs.getPropertyValue(k).trim()).join(' | ')
      };
    });
    return { vw: innerWidth, vh: innerHeight, scrollY, href: location.href,
      hasPresets: !!window.PRESETS,
      presetPalettes: window.PRESETS ? window.PRESETS.palettes.map(p => p.id).join(',') : '-',
      pptKeys: window.PPT ? Object.keys(window.PPT).join(',') : '-',
      resolveTest: (() => {
        try {
          const r = window.PPT.resolve({ styleId: 'corporate', paletteId: 'ocean', fontId: 'sans-cn', animId: 'fade-up' });
          return { style: r.style.id, palette: r.palette.id, font: r.font.id, anim: r.anim.id, colors: r.palette.colors };
        } catch (e) { return 'ERR ' + e.message; }
      })(),
      nodes: out };
  })()`;
  const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(result.result.value, null, 2));
  ws.close();
  chrome.kill();
}

main().catch(e => { console.error('ERR', e.message); chrome.kill(); process.exit(1); });
