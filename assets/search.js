/* ============================================================
   search.js —— 浏览器端联网检索（无需后端）
   思路：静态站点无法直接请求搜索引擎（跨域），因此走公共 CORS 代理
        访问「Bing RSS / DuckDuckGo」等可解析结果页；全部失败时
        自动降级，由模型凭自身知识继续，界面上标注「未联网」。
   ============================================================ */
(function () {
  'use strict';

  const enc = u => encodeURIComponent(u);
  const TIMEOUT = 9000;

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
  }

  async function fetchText(url, headers) {
    return withTimeout(
      fetch(url, { headers: Object.assign({ Accept: '*/*' }, headers || {}), cache: 'no-store' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }),
      TIMEOUT
    );
  }

  /* ---------- 结果解析 ---------- */

  function parseBingRss(xmlText) {
    const out = [];
    try {
      const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
      doc.querySelectorAll('item').forEach(it => {
        const title = (it.querySelector('title') || {}).textContent || '';
        const link = (it.querySelector('link') || {}).textContent || '';
        const desc = (it.querySelector('description') || {}).textContent || '';
        if (title && link) out.push({ title: clean(title), url: link.trim(), snippet: clean(desc) });
      });
    } catch (e) { /* ignore */ }
    return out;
  }

  function parseDuckHtml(html) {
    const out = [];
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('.result, .web-result').forEach(node => {
        const a = node.querySelector('a.result__a, h2 a');
        const sn = node.querySelector('.result__snippet');
        if (a && a.href) {
          out.push({
            title: clean(a.textContent),
            url: decodeURIComponent(a.href.replace(/^.*uddg=/, '').split('&')[0]) || a.href,
            snippet: clean(sn ? sn.textContent : '')
          });
        }
      });
    } catch (e) { /* ignore */ }
    return out;
  }

  function parseJinaMarkdown(md) {
    const out = [];
    const lines = md.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*\d+\.\s*\[(.+?)\]\((https?:\/\/[^)]+)\)/);
      if (m) {
        const snippet = (lines[i + 1] || '').replace(/^\s*[-*]\s*/, '').slice(0, 260);
        out.push({ title: clean(m[1]), url: m[2], snippet: clean(snippet) });
      }
    }
    return out;
  }

  function clean(s) {
    return String(s || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* ---------- 提供商 ---------- */

  const bingRss = q => 'https://www.bing.com/search?q=' + enc(q) + '&format=rss&count=12';
  const ddgHtml = q => 'https://html.duckduckgo.com/html/?q=' + enc(q);

  const providers = [
    {
      id: 'bing-rss-allorigins',
      name: 'Bing · allorigins',
      run: async q => parseBingRss(await fetchText('https://api.allorigins.win/raw?url=' + enc(bingRss(q))))
    },
    {
      id: 'ddg-allorigins',
      name: 'DuckDuckGo · allorigins',
      run: async q => parseDuckHtml(await fetchText('https://api.allorigins.win/raw?url=' + enc(ddgHtml(q))))
    },
    {
      id: 'bing-rss-corsproxy',
      name: 'Bing · corsproxy',
      run: async q => parseBingRss(await fetchText('https://corsproxy.io/?url=' + enc(bingRss(q))))
    },
    {
      id: 'ddg-corsproxy',
      name: 'DuckDuckGo · corsproxy',
      run: async q => parseDuckHtml(await fetchText('https://corsproxy.io/?url=' + enc(ddgHtml(q))))
    },
    {
      id: 'jina-reader',
      name: 'Bing · Jina Reader',
      run: async q => parseJinaMarkdown(await fetchText('https://r.jina.ai/' + bingRss(q)))
    },
    {
      id: 'wiki-zh',
      name: '中文维基百科',
      run: async q => {
        const api = 'https://zh.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=8&srsearch=' + enc(q);
        const data = JSON.parse(await fetchText(api));
        return (data.query && data.query.search || []).map(r => ({
          title: r.title,
          url: 'https://zh.wikipedia.org/wiki/' + enc(r.title),
          snippet: clean(r.snippet)
        }));
      }
    }
  ];

  /* ---------- 对外接口 ---------- */

  const state = { customProxy: '', lastProvider: '', tried: [] };

  function setCustomProxy(urlTemplate) {
    state.customProxy = (urlTemplate || '').trim();
  }

  async function run(query, opts) {
    opts = opts || {};
    const limit = opts.limit || 6;
    state.tried = [];

    const list = providers.slice();
    if (state.customProxy) {
      list.unshift({
        id: 'custom',
        name: '自定义代理',
        run: async q => {
          const target = encodeURIComponent('https://www.bing.com/search?q=' + q + '&format=rss&count=12');
          const url = state.customProxy.replace('{url}', target).replace('{q}', enc(q));
          return parseBingRss(await fetchText(url));
        }
      });
    }

    // 并发竞速：任一通道先成功即用，整体预算 opts.budget（默认 12s），避免逐个串行等超时。
    const budget = opts.budget || 12000;
    return new Promise(resolve => {
      let done = false;
      let pending = list.length;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        state.lastProvider = '';
        resolve({ ok: false, error: '检索超时（当前网络无法访问检索通道）', tried: state.tried.slice(), results: [] });
      }, budget);

      const finishFail = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        state.lastProvider = '';
        resolve({ ok: false, error: '所有检索通道暂不可用', tried: state.tried.slice(), results: [] });
      };

      list.forEach(p => {
        Promise.resolve()
          .then(() => p.run(query))
          .then(results => {
            state.tried.push(p.id + ':ok(' + results.length + ')');
            if (!done && results && results.length) {
              done = true;
              clearTimeout(timer);
              state.lastProvider = p.name;
              resolve({ ok: true, provider: p.name, providerId: p.id, results: results.slice(0, limit) });
            }
          })
          .catch(e => {
            state.tried.push(p.id + ':fail(' + ((e && e.message) || 'err') + ')');
          })
          .then(() => {
            pending -= 1;
            if (pending === 0) finishFail();
          });
      });
      if (!list.length) finishFail();
    });
  }

  async function pageText(url) {
    // 抓取网页正文（去掉标签、截断），用于补充上下文
    const html = await fetchText('https://api.allorigins.win/raw?url=' + enc(url));
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,nav,footer,header,aside').forEach(n => n.remove());
    return clean(doc.body ? doc.body.textContent : '').slice(0, 6000);
  }

  window.SEARCH = { run, pageText, setCustomProxy, providers: providers.map(p => ({ id: p.id, name: p.name })) };
})();
