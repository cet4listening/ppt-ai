/* ============================================================
   app.js —— 主流程：对话 / 联网检索 / 生成大纲 / 风格选择 / 成品
   ============================================================ */
(function () {
  'use strict';

  const LS_KEY = 'pptai.state.v1';
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /* ---------------- 身份（头像 / 名字） ---------------- */
  const AI_NAME = '峙翛';
  const AVATAR = {
    user: 'assets/img/avatar-girl-face.jpg',
    ai: 'assets/img/avatar-ai.jpg'
  };
  function avatarHTML(role) {
    const src = role === 'user' ? AVATAR.user : AVATAR.ai;
    return '<div class="avatar"><img src="' + src + '" alt="" draggable="false"></div>';
  }
  function welcomeHTML() {
    return '<div class="msg ai">' + avatarHTML('ai') +
      '<div class="bubble">你好，我是' + AI_NAME + '（zhì xiāo），你的课件搭子。' +
      '告诉我要做什么课件（年级、学科、课题），我可以先联网找资料，再自动拆分章节、配风格、生成可放映和导出的 PPT。</div></div>';
  }

  /* ---------- 安全：本地密钥存储与错误打码 ---------- */
  const KEY_SESSION = LS_KEY + '.key';
  const KEY_PAD = 'pptai-local-v1';

  // 只是「避免明文躺在 localStorage 里」的混淆，不是加密；
  // 真正的密钥保护要么不落盘（仅本会话），要么用后端代理。
  function obfuscate(s) {
    if (!s) return '';
    var out = '';
    for (var i = 0; i < s.length; i++) out += String.fromCharCode(s.charCodeAt(i) ^ KEY_PAD.charCodeAt(i % KEY_PAD.length));
    try { return 'v1:' + btoa(out); } catch (e) { return s; }
  }
  function deobfuscate(s) {
    if (!s) return '';
    if (s.indexOf('v1:') !== 0) return s;
    try {
      var raw = atob(s.slice(3)), out = '';
      for (var i = 0; i < raw.length; i++) out += String.fromCharCode(raw.charCodeAt(i) ^ KEY_PAD.charCodeAt(i % KEY_PAD.length));
      return out;
    } catch (e) { return ''; }
  }
  // 任何报错信息里都不允许出现真实密钥
  function scrub(text) {
    var s = String(text == null ? '' : text);
    var k = state.settings.apiKey;
    if (k && k.length > 6) s = s.split(k).join('sk-***');
    s = s.replace(/\bsk-[A-Za-z0-9_-]{6,}/g, 'sk-***');
    s = s.replace(/\bgh[posru]_[A-Za-z0-9]{20,}/g, '***');
    return s;
  }

  /* ---------------- 状态 ---------------- */
  const state = {
    settings: {
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-chat',
      searchProxy: '',
      rememberKey: true,
      stepReveal: true
    },
    messages: [],
    attachments: [],
    sources: [],
    searchProvider: '',
    searchTried: [],
    deck: null,
    theme: Object.assign({}, window.PRESETS.DEFAULT_THEME),
    step: 1,
    busy: false,
    lastRequest: ''
  };

  function save() {
    try {
      var remember = state.settings.rememberKey !== false;
      var settings = Object.assign({}, state.settings);
      if (remember) {
        try { sessionStorage.removeItem(KEY_SESSION); } catch (e) {}
        settings.apiKey = obfuscate(settings.apiKey || '');
      } else {
        // 不记住：密钥只放本标签页的 sessionStorage，关掉页面即失效
        try { sessionStorage.setItem(KEY_SESSION, settings.apiKey || ''); } catch (e) {}
        settings.apiKey = '';
      }
      localStorage.setItem(LS_KEY, JSON.stringify({
        settings: settings,
        messages: state.messages.slice(-40),
        deck: state.deck,
        theme: state.theme,
        step: state.step,
        lastRequest: state.lastRequest
      }));
    } catch (e) { /* quota */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.settings) {
        Object.assign(state.settings, data.settings);
        state.settings.apiKey = deobfuscate(data.settings.apiKey || '');
        try {
          var sk = sessionStorage.getItem(KEY_SESSION);
          if (sk) state.settings.apiKey = sk;
        } catch (e) {}
      }
      if (Array.isArray(data.messages)) state.messages = data.messages;
      if (data.deck) state.deck = data.deck;
      if (data.theme) state.theme = Object.assign(state.theme, data.theme);
      if (data.lastRequest) state.lastRequest = data.lastRequest;
      if (typeof data.step === 'number') state.step = data.step;
    } catch (e) { /* ignore */ }
  }

  /* ---------------- 小工具 ---------------- */
  function toast(msg, kind, ms) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; }, (ms || 3200) - 220);
    setTimeout(() => el.remove(), ms || 3200);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function icon(name) {
    const map = {
      up: '↑', down: '↓', del: '✕', add: '＋', eye: '👁', play: '▶', note: '📝', img: '🖼'
    };
    return map[name] || '·';
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function setStep(n) {
    state.step = n;
    $$('#steps li').forEach(li => {
      const v = Number(li.dataset.step);
      li.classList.toggle('is-current', v === n);
      li.classList.toggle('is-done', v < n);
    });
    const sendBtn = $('#btn-send');
    if (sendBtn) sendBtn.textContent = state.deck ? '继续修改' : '生成大纲';
    save();
  }

  function showPanel(name) {
    ['empty', 'outline', 'style', 'perpage', 'deck'].forEach(k => {
      const el = $('#panel-' + k) || (k === 'empty' ? $('#stage-empty') : null);
      if (!el) return;
      el.hidden = k !== name;
    });
  }

  /* ---------------- 设置 ---------------- */
  function openSettings() {
    $('#set-baseurl').value = state.settings.baseUrl || '';
    $('#set-apikey').value = state.settings.apiKey || '';
    $('#set-model').value = state.settings.model || '';
    $('#set-proxy').value = state.settings.searchProxy || '';
    if ($('#set-remember')) $('#set-remember').checked = state.settings.rememberKey !== false;
    if ($('#set-reveal')) $('#set-reveal').checked = state.settings.stepReveal !== false;
    $('#test-status').textContent = '';
    $('#test-status').className = 'dlg-status';
    $('#dlg-settings').showModal();
  }

  function applySettingsFromForm() {
    state.settings.baseUrl = ($('#set-baseurl').value || '').trim() || 'https://api.deepseek.com/v1';
    state.settings.apiKey = ($('#set-apikey').value || '').trim();
    state.settings.model = ($('#set-model').value || '').trim() || 'deepseek-chat';
    state.settings.searchProxy = ($('#set-proxy').value || '').trim();
    state.settings.rememberKey = $('#set-remember') ? !!$('#set-remember').checked : true;
    state.settings.stepReveal = $('#set-reveal') ? !!$('#set-reveal').checked : true;
    if (window.SEARCH && SEARCH.setCustomProxy) SEARCH.setCustomProxy(state.settings.searchProxy);
    save();
    renderModelChip();
  }

  function renderModelChip() {
    const chip = $('#model-chip');
    const has = !!state.settings.apiKey;
    chip.textContent = has ? (state.settings.model || 'deepseek-chat') : '未配置 API Key · 点击设置';
    chip.classList.toggle('is-warn', !has);
  }

  async function testConnection() {
    const st = $('#test-status');
    const tmp = {
      baseUrl: ($('#set-baseurl').value || '').trim() || 'https://api.deepseek.com/v1',
      apiKey: ($('#set-apikey').value || '').trim(),
      model: ($('#set-model').value || '').trim() || 'deepseek-chat'
    };
    if (!tmp.apiKey) { st.textContent = '请先填 API Key'; st.className = 'dlg-status err'; return; }
    st.textContent = '测试中…'; st.className = 'dlg-status';
    try {
      const t0 = Date.now();
      await callModel([{ role: 'user', content: '请回复"ok"两个字母' }], { maxTokens: 8, temperature: 0 }, tmp);
      st.textContent = '连接成功（' + (Date.now() - t0) + ' ms）';
      st.className = 'dlg-status ok';
    } catch (e) {
      st.textContent = '失败：' + scrub(e.message);
      st.className = 'dlg-status err';
    }
  }

  /* ---------------- 模型调用 ---------------- */
  async function callModel(messages, opts, override) {
    const s = override || state.settings;
    if (!s.apiKey) throw new Error('未配置 API Key，请点右上角「设置」填写');
    opts = opts || {};
    const url = (s.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions';
    const body = {
      model: s.model || 'deepseek-chat',
      messages,
      temperature: opts.temperature == null ? 0.7 : opts.temperature,
      max_tokens: opts.maxTokens || 3000,
      stream: false
    };
    if (opts.json) body.response_format = { type: 'json_object' };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.apiKey },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error(scrub('网络请求失败（可能是跨域或断网）：' + e.message));
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* keep raw */ }
    if (!res.ok) {
      const msg = data && data.error && data.error.message ? data.error.message : ('HTTP ' + res.status + ' ' + text.slice(0, 160));
      throw new Error(scrub(msg));
    }
    if (!data || !data.choices || !data.choices[0]) throw new Error(scrub('接口返回格式异常：' + text.slice(0, 160)));
    return data.choices[0].message.content || '';
  }

  /* ---------------- 消息渲染 ---------------- */
  function pushMessage(role, text, extra) {
    state.messages.push(Object.assign({ role, text, t: Date.now() }, extra || {}));
    renderMessages();
    save();
  }

  function renderMessages() {
    const box = $('#messages');
    box.innerHTML = '';
    const list = state.messages.slice(-40);
    if (!list.length) {
      box.innerHTML = welcomeHTML();
      return;
    }
    list.forEach(m => {
      const el = document.createElement('div');
      el.className = 'msg ' + (m.role === 'user' ? 'user' : 'ai');
      const avatar = avatarHTML(m.role === 'user' ? 'user' : 'ai');
      let inner = esc(m.text || '');
      if (m.searchProvider) inner = '<span class="tag">联网 · ' + esc(m.searchProvider) + '</span>' + inner;
      if (m.error) inner += '<div class="err">' + esc(m.error) + '</div>';
      el.innerHTML = avatar + '<div class="bubble">' + (inner || '') + '</div>';
      box.appendChild(el);
    });
    box.scrollTop = box.scrollHeight;
  }

  function renderTyping(label) {
    const box = $('#messages');
    const el = document.createElement('div');
    el.className = 'msg ai';
    el.id = 'typing-msg';
    el.innerHTML = avatarHTML('ai') + '<div class="bubble"><span class="typing"><i></i><i></i><i></i></span> ' + esc(label || '思考中…') + '</div>';
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }
  function clearTyping() { const t = $('#typing-msg'); if (t) t.remove(); }

  function renderSources() {
    const wrap = $('#sources');
    if (!state.sources.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    wrap.classList.remove('is-collapsed');
    $('#sources-body').innerHTML = state.sources.map((s, i) =>
      '<div class="source"><span class="idx">' + (i + 1) + '</span><div><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title || s.url) + '</a><span class="snip">' + esc((s.snippet || '').slice(0, 160)) + '</span></div></div>'
    ).join('');
  }

  /* ---------------- 附件 ---------------- */
  function renderAttachments() {
    const box = $('#attach-strip');
    box.innerHTML = state.attachments.map((a, i) => {
      const thumb = a.thumb || (a.kind === 'image' ? a.dataUrl : '');
      const ic = { image: '🖼', video: '🎬', audio: '🎵', pdf: '📄', docx: '📝', pptx: '📊', text: '📃' }[a.kind] || '📎';
      return '<div class="attach" title="' + esc(a.name) + '">' +
        (thumb ? '<img src="' + thumb + '" alt="">' : '<span>' + ic + '</span>') +
        '<span>' + esc(a.name.length > 18 ? a.name.slice(0, 16) + '…' : a.name) + '</span>' +
        '<span class="x" data-i="' + i + '">✕</span></div>';
    }).join('');
    box.querySelectorAll('.x').forEach(x => x.addEventListener('click', () => {
      state.attachments.splice(Number(x.dataset.i), 1);
      renderAttachments();
    }));
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!window.FILES || !FILES.read) { toast('文件解析模块未加载', 'err'); return; }
    toast('正在解析 ' + files.length + ' 个文件…');
    try {
      const parsed = await FILES.read(files);
      state.attachments = state.attachments.concat(parsed);
      renderAttachments();
      toast('已添加 ' + parsed.length + ' 个文件', 'ok');
    } catch (e) {
      toast('解析失败：' + e.message, 'err', 4200);
    }
  }

  /* ---------------- 提示词 ---------------- */
  function attachmentsText() {
    const parts = [];
    state.attachments.forEach(a => {
      if (a.text) parts.push('【文件：' + a.name + '】\n' + a.text.slice(0, 12000));
      else if (a.kind === 'image') parts.push('【图片：' + a.name + '】用户上传的图片素材（可用于插图页）');
      else if (a.kind === 'video') parts.push('【视频：' + a.name + '】用户上传的视频素材');
    });
    const joined = parts.join('\n\n');
    return joined.length > 30000 ? joined.slice(0, 30000) + '\n…（内容过长已截断）' : joined;
  }

  function sourcesText() {
    if (!state.sources.length) return '';
    return state.sources.map((s, i) => (i + 1) + '. ' + s.title + '\n' + (s.snippet || '') + '\n来源：' + s.url).join('\n\n').slice(0, 9000);
  }

  const DECK_SCHEMA = `{
  "title": "整套课件的标题（不含书名号）",
  "subtitle": "副标题，可空",
  "meta": { "grade": "学段年级", "subject": "学科", "minutes": 40 },
  "slides": [
    {
      "type": "cover | section | bullets | two-col | image | quote | stats | list | end",
      "title": "页面标题",
      "subtitle": "可选副标题",
      "bullets": ["要点1", "要点2"],
      "columns": [{ "title": "左栏标题", "items": ["…"] }, { "title": "右栏标题", "items": ["…"] }],
      "image": { "caption": "插图说明" },
      "quote": "引言内容",
      "author": "作者/出处",
      "stats": [{ "value": "26", "label": "说明文字" }],
      "notes": "讲稿提示：老师这一页该怎么讲（1-2 句）"
    }
  ]
}`;

  function hasImageMaterials() {
    return state.attachments.some(a => a && a.kind === 'image');
  }

  /* 把用户上传的图片素材按顺序填进「无图」的插图页 */
  function fillImageSlides(deck) {
    const imgs = state.attachments
      .filter(a => a && a.kind === 'image')
      .map(a => a.dataUrl || a.src || '')
      .filter(Boolean);
    if (!imgs.length || !deck || !Array.isArray(deck.slides)) return deck;
    let k = 0;
    deck.slides.forEach(s => {
      if (s.type === 'image' && !(s.image && s.image.src) && k < imgs.length) {
        s.image = Object.assign({}, s.image || {}, { src: imgs[k++] });
      }
    });
    return deck;
  }

  /* 用户用自然语言指定图片位置时，兜底保证版式正确（模型偶尔会漏） */
  function applyLayoutHint(deck, instruction) {
    if (!deck || !deck.slides || !instruction) return deck;
    const txt = String(instruction);
    let layout = '';
    if (/整页|满版|全屏图|大图铺满/.test(txt)) layout = 'full';
    else if (/背景|底图|铺底/.test(txt)) layout = 'bg';
    else if (/左边|左侧|放左|左图|图左/.test(txt)) layout = 'left';
    else if (/右边|右侧|放右|右图|图右/.test(txt)) layout = 'right';
    if (!layout) return deck;
    const mm = txt.match(/第\s*(\d+)\s*页/);
    const target = mm ? Number(mm[1]) - 1 : -1;
    deck.slides.forEach((sl, i) => {
      if (!sl || sl.type !== 'image') return;
      if (target >= 0 && i !== target) return;
      sl.image = Object.assign({}, sl.image || {}, { layout: layout });
    });
    return deck;
  }

  function systemPrompt() {
    return [
      '你叫' + AI_NAME + '，是一位资深教学设计专家 + PPT 设计师，为中英文课堂（尤其中国中小学）制作课件。',
      '输出必须是**严格合法的 JSON**，不要 Markdown 代码块、不要注释、不要多余文字。JSON 结构如下：',
      DECK_SCHEMA,
      '硬性要求：',
      '1) 整套 12–18 页；第一页 type 必须是 "cover"，最后一页必须是 "end"。',
      '2) 结构建议：cover → section（单元导入）→ 每个 section 之后 2–4 页支撑内容（知识点用 bullets/two-col/stats/list 混用，重要概念再补一页「为什么 / 怎么理解」的解释页或例题页）→ 练习/活动页 → 小结 section → end。',
      '3) bullets 每页 3–6 条；每条先给一句结论（≤22 字），需要时用「；」接一句解释或例子（整条 ≤44 字）；two-col 的 columns 恰好 2 项、每项 items 2–5 条。',
      '4) 面向小学生的内容要用词简单、可互动（提问、跟读、游戏）；面向初高中要有知识密度和例题。',
      '5) notes 必须写，40–80 字，写清怎么讲：先问什么、举什么例子、提醒什么易错点。',
      '6) 所有文本用简体中文（英语课可以有英文例句，但标题用中文）。',
      hasImageMaterials()
        ? '7) 用户已上传图片素材：需要插图的页面用 image 类型，caption 写图注，图片会由素材填充；不要在 JSON 里放图片链接。'
        : '7) 用户没有上传图片：不要放图片链接（放了也不会加载）。确实需要图才能讲清的地方，可以插入 1–3 页 image 页型：title 写这页讲什么，subtitle 写「建议配图：……」（说明画什么），caption 写图注；不要连续两页都是 image。',
      '8) 每个知识点要能自洽：标题是结论或问题，要点里给出依据、例子或步骤；不要只堆名词。',
      '9) 面向小学生的课件，每个 section 至少安排 1 个互动（提问 / 跟读 / 小游戏 / 动手做）。',
      '10) image 页型可带 image.layout：right（图在右，默认）/ left（图在左）/ full（整页大图）/ bg（图铺满背景、文字浮在上方）。用户说「图放右边 / 放左边 / 整页图 / 当背景」时必须据此设置 layout；如果没有可选 layout 就写 right。',
      '11) 可选字段 homework：给 2–4 页（优先知识点页与小结页）写一句「课后思考」，让学生带着问题回家想，一句话、不超过 30 字；其余页面不要写这个字段。'
    ].join('\n');
  }

  function planPrompt(userRequest) {
    const at = attachmentsText();
    const src = sourcesText();
    return [
      '用户需求：' + userRequest,
      at ? '\n【用户上传的资料（请提炼进课件）】\n' + at : '',
      src ? '\n【联网检索到的参考资料（择优使用，不要照抄）】\n' + src : '',
      '\n请生成这套课件的完整 JSON。'
    ].join('\n');
  }

  /* ---------------- 生成流程 ---------------- */
  function parseJsonLoose(text) {
    if (!text) throw new Error('模型没有返回内容');
    let t = text.trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(t); } catch (e) { /* fall through */ }
    const start = t.indexOf('{');
    if (start >= 0) {
      let depth = 0, inStr = false, esc2 = false;
      for (let i = start; i < t.length; i++) {
        const ch = t[i];
        if (inStr) {
          if (esc2) esc2 = false;
          else if (ch === '\\') esc2 = true;
          else if (ch === '"') inStr = false;
        } else if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(t.slice(start, i + 1)); } catch (e2) { break; } } }
      }
    }
    throw new Error('模型返回的不是合法 JSON');
  }

  function normalizeDeck(raw) {
    const deck = {
      title: String(raw.title || '未命名课件').trim(),
      subtitle: String(raw.subtitle || '').trim(),
      meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
      slides: Array.isArray(raw.slides) ? raw.slides : []
    };
    const allowed = ['cover', 'section', 'bullets', 'two-col', 'image', 'quote', 'stats', 'list', 'end'];
    deck.slides = deck.slides.filter(s => s && typeof s === 'object').map((s, i) => {
      const type = allowed.includes(s.type) ? s.type : (i === 0 ? 'cover' : 'bullets');
      const fallbackTitle = i === 0 ? deck.title : (type === 'end' ? '谢谢观看' : '');
      const out = {
        type,
        title: String(s.title || fallbackTitle).trim(),
        subtitle: s.subtitle ? String(s.subtitle).trim() : '',
        notes: s.notes ? String(s.notes).trim() : ''
      };
      if (Array.isArray(s.bullets)) out.bullets = s.bullets.map(b => String(b).trim()).filter(Boolean);
      if (Array.isArray(s.columns)) out.columns = s.columns.slice(0, 2).map(c => ({
        title: String((c && c.title) || '').trim(),
        items: Array.isArray(c && c.items) ? c.items.map(x => String(x).trim()).filter(Boolean) : []
      }));
      if (s.image && (s.image.caption || s.image.src)) {
        // 只接受本地素材 / data:image / blob: / https，防止模型塞进奇怪协议的地址
        var rawSrc = String(s.image.src || '');
        var okSrc = /^(data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,|blob:|https?:\/\/|assets\/|\.\.?\/)/i.test(rawSrc) ? rawSrc : '';
        var lay = String(s.image.layout || 'right');
        if (['right', 'left', 'full', 'bg'].indexOf(lay) < 0) lay = 'right';
        out.image = { caption: String(s.image.caption || '').trim(), src: okSrc, kind: String(s.image.kind || 'image'), layout: lay };
        if (s.image.useAttachment) out.image.useAttachment = true;
      }
      if (s.quote) out.quote = String(s.quote).trim();
      if (s.author) out.author = String(s.author).trim();
      if (s.image && (s.image.src || s.image.caption)) {
        var lay2 = String(s.image.layout || 'right');
        if (['right', 'left', 'full', 'bg'].indexOf(lay2) < 0) lay2 = 'right';
        out.image = {
          src: String(s.image.src || '').trim(),
          caption: String(s.image.caption || '').trim(),
          kind: String(s.image.kind || 'image'),
          layout: lay2
        };
        if (s.image.useAttachment) out.image.useAttachment = true;
      }
      if (s.homework) out.homework = String(s.homework).trim();
      if (Array.isArray(s.stats)) out.stats = s.stats.slice(0, 4).map(x => ({ value: String((x && x.value) || ''), label: String((x && x.label) || '') }));
      // 兜底：没有图片素材却给了 image 页型 → 降级成 section（避免空白占位框）
      if (out.type === 'image' && !(out.image && out.image.src) && !hasImageMaterials()
          && !out.subtitle && !(out.image && out.image.caption)) {
        out.type = (out.bullets && out.bullets.length) ? 'bullets' : 'section';
      }
      return out;
    });
    if (!deck.slides.length) throw new Error('模型返回的页面为空');
    if (deck.slides[0].type !== 'cover') deck.slides.unshift({ type: 'cover', title: deck.title, subtitle: deck.subtitle, notes: '' });
    if (deck.slides[deck.slides.length - 1].type !== 'end') deck.slides.push({ type: 'end', title: '谢谢观看', subtitle: '', notes: '' });
    return deck;
  }

  async function doSearch(query) {
    if (!window.SEARCH) return;
    renderTyping('正在联网检索资料…');
    try {
      const r = await SEARCH.run(query, { limit: 6 });
      if (r.ok && r.results.length) {
        state.sources = r.results;
        state.searchProvider = r.provider;
        state.searchTried = r.tried || [];
        renderSources();
      } else {
        state.sources = [];
        state.searchProvider = '';
        state.searchTried = r.tried || [];
        toast('联网检索没成功，改用模型自身知识生成（不影响使用）', '', 4000);
      }
    } catch (e) {
      state.sources = [];
      state.searchProvider = '';
    } finally {
      clearTyping();
    }
  }

  async function generateDeck(userRequest) {
    if (!state.settings.apiKey) {
      toast('请先配置 API Key', 'err');
      openSettings();
      return;
    }
    setBusy(true);
    try {
      state.lastRequest = userRequest;
      state.sources = [];
      renderSources();

      if ($('#opt-search').checked) {
        await doSearch(userRequest);
      }

      renderTyping('正在设计课件结构…');
      const messages = [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: planPrompt(userRequest) }
      ];
      let content;
      try {
        content = await callModel(messages, { json: true, temperature: 0.75, maxTokens: 6000 });
      } catch (e) {
        clearTyping();
        throw e;
      }
      clearTyping();

      let deck;
      try {
        deck = applyLayoutHint(fillImageSlides(normalizeDeck(parseJsonLoose(content))), userRequest);
      } catch (e) {
        // 让模型自我修复一次
        renderTyping('正在修复结构…');
        try {
          const fixed = await callModel([
            { role: 'system', content: '你是 JSON 修复器。把用户给的内容改写成严格合法的 JSON，只输出 JSON，不要解释。结构：{"title","subtitle","meta":{},"slides":[...]}' },
            { role: 'user', content: content.slice(0, 12000) }
          ], { json: true, temperature: 0.2, maxTokens: 6000 });
          deck = applyLayoutHint(fillImageSlides(normalizeDeck(parseJsonLoose(fixed))), userRequest);
        } finally { clearTyping(); }
      }

      state.deck = deck;
      pushMessage('ai', '已经拆成 ' + deck.slides.length + ' 页：' + deck.slides.map((s, i) => (i + 1) + '. ' + s.title).slice(0, 8).join('；') + (deck.slides.length > 8 ? ' …' : '') + '\n\n你可以在右侧直接改标题和要点，然后点「下一步：选风格」。', { searchProvider: state.searchProvider });
      renderOutline();
      showPanel('outline');
      setStep(2);
    } catch (e) {
      clearTyping();
      pushMessage('ai', '生成失败，请重试或检查设置。', { error: scrub(e.message) });
      toast('生成失败：' + e.message, 'err', 5000);
    } finally {
      setBusy(false);
    }
  }

  async function reviseDeck(userRequest) {
    if (!state.settings.apiKey) { toast('请先配置 API Key', 'err'); openSettings(); return; }
    setBusy(true);
    try {
      renderTyping('正在按你的要求调整…');
      const cur = JSON.stringify(state.deck).slice(0, 14000);
      const att = (state.attachments || []).filter(a => a && (a.kind === 'image' || a.kind === 'video' || a.kind === 'audio'));
      const attNote = att.length
        ? '\n\n用户当前可用素材（按上传顺序）：' + att.map((a, i) => (i + 1) + '. ' + a.kind + '「' + (a.name || '') + '」').join('；') +
          '。若用户要求「把图片/视频放到第 N 页右边/左边/整页/背景」，请把第 N 页改成 image 页型并设置 image.layout 对应值，同时把 image.useAttachment 设为 true 表示使用刚上传的素材，不要编造图片地址。'
        : '';
      const content = await callModel([
        { role: 'system', content: systemPrompt() + '\n\n现在用户会对已有课件提出修改，请输出修改后的**完整** JSON。' },
        { role: 'user', content: '当前课件 JSON：\n' + cur + attNote + '\n\n修改要求：' + userRequest }
      ], { json: true, temperature: 0.6, maxTokens: 6000 });
      clearTyping();
      state.deck = applyLayoutHint(fillImageSlides(normalizeDeck(parseJsonLoose(content))), userRequest);
      renderOutline();
      if (state.step >= 3) { renderDeckGrid(); }
      pushMessage('ai', '已更新，现在是 ' + state.deck.slides.length + ' 页。');
      showPanel(state.step >= 4 ? 'deck' : 'outline');
    } catch (e) {
      clearTyping();
      pushMessage('ai', '调整失败。', { error: scrub(e.message) });
    } finally { setBusy(false); }
  }

  function setBusy(v) {
    state.busy = v;
    $('#btn-send').disabled = v;
    $('#btn-replan').disabled = v;
  }

  /* ---------------- 发送 ---------------- */
  async function send() {
    const text = ($('#prompt').value || '').trim();
    if (!text) { toast('先说说要做什么课件'); return; }
    if (state.busy) return;
    // 防抖 + 频率限制：避免误触/连点把额度打光
    const now = Date.now();
    state.sendTimes = (state.sendTimes || []).filter(t => now - t < 60000);
    if (state.lastSendAt && now - state.lastSendAt < 2000) { toast('稍等一下，正在处理上一句…'); return; }
    if (state.sendTimes.length >= 8) { toast('一分钟内最多 8 次，歇一会儿再试'); return; }
    if (text.length > 2000) { toast('描述太长了，请精简到 2000 字以内'); return; }
    state.lastSendAt = now;
    state.sendTimes.push(now);
    pushMessage('user', text);
    $('#prompt').value = '';
    autosize();
    const hasDeck = !!state.deck;
    if (hasDeck) await reviseDeck(text);
    else await generateDeck(text);
  }

  /* ---------------- 大纲编辑 ---------------- */
  function renderOutline() {
    const deck = state.deck;
    if (!deck) return;
    const meta = deck.meta || {};
    $('#deck-meta').innerHTML =
      '<span class="mtitle">' + esc(deck.title) + '</span>' +
      (deck.subtitle ? '<span class="badge gray">' + esc(deck.subtitle) + '</span>' : '') +
      (meta.grade ? '<span class="badge">' + esc(meta.grade) + '</span>' : '') +
      (meta.subject ? '<span class="badge">' + esc(meta.subject) + '</span>' : '') +
      (meta.minutes ? '<span class="badge gray">' + esc(meta.minutes) + ' 分钟</span>' : '') +
      '<span class="badge ok">' + deck.slides.length + ' 页</span>';

    const box = $('#outline-list');
    box.innerHTML = '';
    deck.slides.forEach((s, i) => {
      const img = s.image || {};
      const hasImg = !!(img.src || img.caption);
      const card = document.createElement('div');
      card.className = 'slide-card';
      card.innerHTML =
        '<div class="num">' + (i + 1) + '</div>' +
        '<div class="body">' +
        '  <div class="row1">' +
        '    <select data-f="type">' + ['cover', 'section', 'bullets', 'two-col', 'image', 'quote', 'stats', 'list', 'end']
          .map(t => '<option value="' + t + '"' + (t === s.type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
        '    <input class="title" data-f="title" value="' + esc(s.title) + '">' +
        '  </div>' +
        '  <input class="sub" data-f="subtitle" placeholder="副标题 / 配图建议（如：建议配图：光从空气斜射入水中）" value="' + esc(s.subtitle || '') + '">' +
        '  <textarea data-f="bullets" placeholder="要点，一行一条；一条里可以用「；」接一句解释">' + esc((s.bullets || []).join('\n')) + '</textarea>' +
        '  <input class="hw-in" data-f="homework" placeholder="课后思考（可选）：留一句给学生的思考题，留空则这一页不显示" value="' + esc(s.homework || '') + '">' +
        '  <div class="img-slot' + (hasImg ? ' has' : '') + '">' +
        '    <span class="img-label">' + (img.kind === 'video' ? '视频' : img.kind === 'audio' ? '音频' : '配图') + '</span>' +
        '    <select class="img-layout" data-f="layout" title="图片位置">' +
        '      <option value="right"' + ((img.layout || 'right') === 'right' ? ' selected' : '') + '>图在右</option>' +
        '      <option value="left"' + (img.layout === 'left' ? ' selected' : '') + '>图在左</option>' +
        '      <option value="full"' + (img.layout === 'full' ? ' selected' : '') + '>整页图</option>' +
        '      <option value="bg"' + (img.layout === 'bg' ? ' selected' : '') + '>图作背景</option>' +
        '    </select>' +
        '    <button class="mini-btn" type="button" data-a="pick-img">选图</button>' +
        '    <button class="mini-btn" type="button" data-a="pick-video">视频</button>' +
        '    <button class="mini-btn" type="button" data-a="pick-audio">音频</button>' +
        '    <input class="img-url" data-f="imageUrl" placeholder="素材链接或 dataURL（可空）" value="' + esc(img.src || '') + '">' +
        '    <input class="img-cap" data-f="caption" placeholder="图注（显示在图片下方）" value="' + esc(img.caption || '') + '">' +
        (hasImg ? '<button class="icon-btn danger" type="button" data-a="clear-img" title="清除图片">✕</button>' : '') +
        '    <input type="file" accept="image/*" hidden data-media="image">' +
        '    <input type="file" accept="video/*" hidden data-media="video">' +
        '    <input type="file" accept="audio/*" hidden data-media="audio">' +
        '  </div>' +
        '  <input class="notes-in" data-f="notes" placeholder="讲稿备注：怎么讲、问什么、提醒什么易错点" value="' + esc(s.notes || '') + '">' +
        '</div>' +
        '<div class="tools">' +
        '  <button class="icon-btn" data-a="up" title="上移">↑</button>' +
        '  <button class="icon-btn" data-a="down" title="下移">↓</button>' +
        '  <button class="icon-btn danger" data-a="del" title="删除">✕</button>' +
        '</div>';

      const idx = i;
      card.querySelectorAll('[data-f]').forEach(inp => {
        inp.addEventListener('change', () => {
          const f = inp.dataset.f;
          if (f === 'type') s.type = inp.value;
          else if (f === 'title') s.title = inp.value;
          else if (f === 'subtitle') s.subtitle = inp.value;
          else if (f === 'bullets') s.bullets = inp.value.split('\n').map(x => x.trim()).filter(Boolean);
          else if (f === 'notes') s.notes = inp.value;
          else if (f === 'homework') {
            const hv = inp.value.trim();
            if (hv) s.homework = hv; else delete s.homework;
          }
          else if (f === 'layout') {
            s.image = Object.assign({}, s.image || {}, { layout: inp.value });
            save();
            if (state.step >= 3) { try { renderDeckGrid(); } catch (e) {} }
            return;
          }
          else if (f === 'imageUrl' || f === 'caption') {
            const next = Object.assign({}, s.image || {});
            if (f === 'imageUrl') next.src = inp.value.trim();
            else next.caption = inp.value.trim();
            if (next.src || next.caption) s.image = next; else delete s.image;
          }
          save();
          renderPreview();
        });
      });
      card.querySelectorAll('[data-a]').forEach(btn => {
        btn.addEventListener('click', () => {
          const a = btn.dataset.a;
          if (a === 'up' && idx > 0) { deck.slides.splice(idx - 1, 0, deck.slides.splice(idx, 1)[0]); }
          if (a === 'down' && idx < deck.slides.length - 1) { deck.slides.splice(idx + 1, 0, deck.slides.splice(idx, 1)[0]); }
          if (a === 'del') {
            if (deck.slides.length <= 2) { toast('至少保留 2 页'); return; }
            deck.slides.splice(idx, 1);
          }
          if (a === 'pick-video' || a === 'pick-audio') {
            const kind = a === 'pick-video' ? 'video' : 'audio';
            const input = card.querySelector('input[type=file][data-media="' + kind + '"]');
            input.onchange = () => {
              const f2 = input.files && input.files[0];
              if (!f2) return;
              const limitMb = kind === 'video' ? 6 : 8;
              if (f2.size > limitMb * 1024 * 1024) {
                toast((kind === 'video' ? '视频' : '音频') + '超过 ' + limitMb + 'MB，先压缩一下，或用上面的链接方式引用', 'err');
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                s.image = Object.assign({}, s.image || {}, { kind: kind, src: String(reader.result) });
                s.type = 'image';
                save(); renderOutline(); renderPreview();
                toast((kind === 'video' ? '视频' : '音频') + '已插入这一页');
              };
              reader.readAsDataURL(f2);
            };
            input.click();
            return;
          }
          if (a === 'pick-img') {
            const file = card.querySelector('input[type=file][data-media="image"]');
            file.onchange = () => {
              const f2 = file.files && file.files[0];
              if (!f2) return;
              readImageDataUrl(f2).then(dataUrl => {
                if (!dataUrl) { toast('这张图读不出来，换一张试试', 'err'); return; }
                s.image = Object.assign({}, s.image || {}, { kind: 'image', src: dataUrl });
                save(); renderOutline(); renderPreview();
                toast('图片已插入这一页');
              });
            };
            file.click();
            return;
          }
          if (a === 'clear-img') {
            delete s.image;
            save(); renderOutline(); renderPreview();
            return;
          }
          save(); renderOutline(); renderPreview();
        });
      });
      box.appendChild(card);
    });
    $('#outline-count').textContent = '共 ' + deck.slides.length + ' 页 · 改动会自动保存';
  }


  /* 图片读入并压缩成 dataURL（超出 localStorage 体积控制） */
  function readImageDataUrl(file, maxSide) {
    return new Promise(resolve => {
      if (!file || !/^image\//.test(file.type)) { resolve(''); return; }
      if (file.size > 12 * 1024 * 1024) { toast('图片太大（>12MB），先压缩一下', 'err'); resolve(''); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const max = maxSide || 1400;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', 0.82));
        } catch (e) { resolve(''); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
      img.src = url;
    });
  }

  /* ---------------- 风格选择 ---------------- */
  function renderStylePicker() {
    const P = window.PRESETS;
    $('#style-cards').innerHTML = P.styles.map(st => {
      const pal = P.get({ paletteId: state.theme.paletteId }).palette;
      return '<button class="style-card' + (st.id === state.theme.styleId ? ' is-active' : '') + '" data-style="' + st.id + '">' +
        '<div class="mini" style="background:' + pal.colors.bg + ';color:' + pal.colors.text + ';border-color:' + pal.colors.line + '">' +
        '<i style="width:70%;background:' + pal.colors.primary + '"></i>' +
        '<i style="width:46%;background:' + pal.colors.muted + ';opacity:.55"></i>' +
        '<i style="width:58%;background:' + pal.colors.accent + '"></i>' +
        '</div><b>' + esc(st.name) + '</b><span>' + esc(st.desc) + '</span></button>';
    }).join('');

    $('#palette-row').innerHTML = P.palettes.map(p =>
      '<button class="swatch' + (p.id === state.theme.paletteId ? ' is-active' : '') + '" data-pal="' + p.id + '">' +
      '<span class="dots"><i style="background:' + p.colors.primary + '"></i><i style="background:' + p.colors.accent + '"></i><i style="background:' + p.colors.bg + '"></i></span>' +
      esc(p.name) + '</button>'
    ).join('');

    $('#font-row').innerHTML = P.fonts.map(f =>
      '<button class="chip' + (f.id === state.theme.fontId ? ' is-active' : '') + '" data-font="' + f.id + '" style="font-family:' + f.heading + '">' + esc(f.name) + '</button>'
    ).join('');

    $('#anim-row').innerHTML = P.anims.map(a =>
      '<button class="chip' + (a.id === state.theme.animId ? ' is-active' : '') + '" data-anim="' + a.id + '">' + esc(a.name) + '</button>'
    ).join('');

    $('#style-cards').querySelectorAll('[data-style]').forEach(b => b.addEventListener('click', () => {
      state.theme.styleId = b.dataset.style; save(); renderStylePicker(); renderPreview();
    }));
    $('#palette-row').querySelectorAll('[data-pal]').forEach(b => b.addEventListener('click', () => {
      state.theme.paletteId = b.dataset.pal; save(); renderStylePicker(); renderPreview();
    }));
    $('#font-row').querySelectorAll('[data-font]').forEach(b => b.addEventListener('click', () => {
      state.theme.fontId = b.dataset.font; save(); renderStylePicker(); renderPreview();
    }));
    $('#anim-row').querySelectorAll('[data-anim]').forEach(b => b.addEventListener('click', () => {
      state.theme.animId = b.dataset.anim; save(); renderStylePicker(); renderPreview();
    }));
  }

  function renderPreview() {
    const stage = $('#preview-stage');
    if (!stage) return;
    if (!state.deck || !window.PPT) { stage.innerHTML = '<div style="padding:20px;color:#6b7280;font-size:13px">先生成大纲，这里会显示风格预览</div>'; return; }
    const P = window.PRESETS.get(state.theme);
    $('#preview-cap').textContent = P.style.name + ' · ' + P.palette.name + ' · ' + P.font.name + ' · ' + P.anim.name;
    const idx = Math.min(1, state.deck.slides.length - 1);
    const slide = state.deck.slides[idx] || state.deck.slides[0];
    stage.innerHTML = '';
    try {
      PPT.renderThumb(stage, slide, state.deck, state.theme);
    } catch (e) {
      stage.innerHTML = '<div style="padding:20px;color:#6b7280;font-size:13px">预览渲染失败：' + esc(e.message) + '</div>';
    }
  }

  /* ---------------- 成品 ---------------- */
  /* ---------------- 第 4 步：逐页定制 ---------------- */
  const SLIDE_FIELDS = [
    { key: 'styleId',  label: '风格', list: 'styles'  },
    { key: 'paletteId', label: '配色', list: 'palettes' },
    { key: 'fontId',   label: '字体', list: 'fonts'   },
    { key: 'animId',   label: '动画', list: 'anims'   }
  ];

  function slideThemeClean(slide) {
    const t = slide && slide.theme;
    if (!t) return null;
    const out = {};
    SLIDE_FIELDS.forEach(f => { if (t[f.key]) out[f.key] = t[f.key]; });
    return Object.keys(out).length ? out : null;
  }

  function effectiveTheme(slide) {
    const t = Object.assign({}, state.theme || {});
    const own = slide && slide.theme;
    if (own) {
      Object.keys(own).forEach(k => { if (own[k]) t[k] = own[k]; });
    }
    return t;
  }

  function setSlideThemeField(slide, key, val) {
    if (!val) {
      if (slide.theme) { delete slide.theme[key]; }
    } else {
      slide.theme = slide.theme || {};
      slide.theme[key] = val;
    }
    const clean = slideThemeClean(slide);
    if (clean) slide.theme = clean; else delete slide.theme;
  }

  function perPageCount() {
    if (!state.deck) return 0;
    return state.deck.slides.filter(s => !!slideThemeClean(s)).length;
  }

  function renderPerPage() {
    const deck = state.deck;
    const list = $('#perpage-list');
    if (!deck || !list) return;
    const info = $('#perpage-info');
    const n = perPageCount();
    if (info) info.textContent = '共 ' + deck.slides.length + ' 页 · ' + (n ? n + ' 页已单独定制' : '全部跟随全局');
    list.innerHTML = '';

    deck.slides.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'pp-row' + (slideThemeClean(s) ? ' is-custom' : '');

      const thumb = document.createElement('div');
      thumb.className = 'pp-thumb';
      thumb.title = '点击放大预览';
      thumb.addEventListener('click', () => openLightbox(i));

      const meta = document.createElement('div');
      meta.className = 'pp-meta';
      meta.innerHTML = '<b>' + (i + 1) + '. ' + esc(s.title || '未命名') + '</b>' +
        '<span>' + esc(s.type || 'bullets') + '</span>' +
        (slideThemeClean(s) ? '<em class="pp-tag">已定制</em>' : '');

      const ctrls = document.createElement('div');
      ctrls.className = 'pp-ctrls';
      SLIDE_FIELDS.forEach(f => {
        const wrap = document.createElement('label');
        wrap.className = 'pp-ctrl';
        const cur = (s.theme && s.theme[f.key]) || '';
        const globalItem = window.PRESETS.get(state.theme)[f.list === 'palettes' ? 'palette' : f.list === 'styles' ? 'style' : f.list === 'fonts' ? 'font' : 'anim'];
        let opts = '<option value="">跟随全局（' + esc(globalItem ? globalItem.name : '默认') + '）</option>';
        (PRESETS[f.list] || []).forEach(item => {
          opts += '<option value="' + esc(item.id) + '"' + (cur === item.id ? ' selected' : '') + '>' + esc(item.name) + '</option>';
        });
        wrap.innerHTML = '<span>' + f.label + '</span><select data-field="' + f.key + '">' + opts + '</select>';
        const sel = wrap.querySelector('select');
        sel.addEventListener('change', () => {
          setSlideThemeField(s, f.key, sel.value);
          save();
          row.classList.toggle('is-custom', !!slideThemeClean(s));
          const tag = row.querySelector('.pp-tag');
          if (tag) tag.remove();
          if (slideThemeClean(s)) {
            const em = document.createElement('em');
            em.className = 'pp-tag'; em.textContent = '已定制';
            meta.appendChild(em);
          }
          if (info) info.textContent = '共 ' + deck.slides.length + ' 页 · ' + (perPageCount() ? perPageCount() + ' 页已单独定制' : '全部跟随全局');
          try { PPT.renderThumb(thumb, s, deck, state.theme); } catch (e) { /* ignore */ }
        });
        ctrls.appendChild(wrap);
      });

      const quick = document.createElement('div');
      quick.className = 'pp-quick';
      quick.innerHTML = '<button class="mini-btn" type="button" data-a="apply-all" title="把这一页的风格/配色/字体/动画设为全局，全部页面统一">应用到全部</button>' +
        (slideThemeClean(s) ? '<button class="mini-btn" type="button" data-a="reset-one" title="取消这一页的单独设置">取消定制</button>' : '');
      quick.querySelector('[data-a="apply-all"]').addEventListener('click', () => {
        state.theme = Object.assign({}, state.theme, effectiveTheme(s));
        deck.slides.forEach(x => { delete x.theme; });
        save();
        renderPerPage();
        try { renderPreview(); } catch (e) { /* ignore */ }
        toast('已把第 ' + (i + 1) + ' 页的效果应用到全部页面');
      });
      const resetBtn = quick.querySelector('[data-a="reset-one"]');
      if (resetBtn) resetBtn.addEventListener('click', () => {
        delete s.theme;
        save();
        renderPerPage();
        toast('已恢复这一页跟随全局');
      });
      meta.appendChild(quick);

      row.appendChild(thumb);
      row.appendChild(meta);
      row.appendChild(ctrls);
      list.appendChild(row);
      try { PPT.renderThumb(thumb, s, deck, state.theme); } catch (e) { /* ignore */ }
    });
  }

  function renderDeckGrid() {
    const deck = state.deck;
    if (!deck) return;
    $('#deck-sub').textContent = '点击任意一页可放大查看；放映时用 ← → 翻页，ESC 退出。';
    $('#deck-info').textContent = deck.slides.length + ' 页 · ' + (window.PRESETS.get(state.theme).style.name) + ' · ' + (window.PRESETS.get(state.theme).palette.name);
    const grid = $('#deck-grid');
    grid.innerHTML = '';
    deck.slides.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'thumb-card';
      const frame = document.createElement('div');
      frame.className = 'frame';
      card.appendChild(frame);
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.innerHTML = '<b>' + (i + 1) + '. ' + esc(s.title || '') + '</b><span>' + esc(s.type) + '</span>';
      card.appendChild(cap);
      card.addEventListener('click', () => openLightbox(i));
      grid.appendChild(card);
      try {
        if (window.PPT && PPT.renderThumb) PPT.renderThumb(frame, s, deck, state.theme);
      } catch (e) { /* ignore single thumb error */ }
    });
  }

  function openLightbox(index) {
    const deck = state.deck;
    if (!deck) return;
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML =
      '<div class="stage-wrap" id="lb-stage"></div>' +
      '<div class="lb-bar"><span id="lb-idx"></span>' +
      '<button class="btn tiny" id="lb-prev">← 上一页</button>' +
      '<button class="btn tiny" id="lb-next">下一页 →</button>' +
      '<button class="btn tiny" id="lb-present">▶ 从这里放映</button>' +
      '<button class="btn tiny" id="lb-close">关闭</button></div>';
    document.body.appendChild(lb);
    let cur = index;
    const draw = () => {
      const st = lb.querySelector('#lb-stage');
      st.innerHTML = '';
      try { PPT.renderThumb(st, deck.slides[cur], deck, state.theme); } catch (e) { st.textContent = e.message; }
      lb.querySelector('#lb-idx').textContent = (cur + 1) + ' / ' + deck.slides.length;
    };
    lb.querySelector('#lb-prev').onclick = () => { cur = Math.max(0, cur - 1); draw(); };
    lb.querySelector('#lb-next').onclick = () => { cur = Math.min(deck.slides.length - 1, cur + 1); draw(); };
    lb.querySelector('#lb-present').onclick = () => { lb.remove(); present(cur); };
    lb.querySelector('#lb-close').onclick = () => lb.remove();
    lb.addEventListener('click', e => { if (e.target === lb) lb.remove(); });
    draw();
  }

  function present(start) {
    if (!window.PPT || !PPT.present) { toast('放映模块未加载', 'err'); return; }
    try {
      PPT.present(state.deck, state.theme, start || 0, { reveal: state.settings.stepReveal !== false });
    } catch (e) { toast('放映失败：' + e.message, 'err'); }
  }

  async function exportPptx(mode) {
    if (!state.deck) { toast('先生成演示文稿'); return; }
    if (!window.EXPORTER || !EXPORTER.toPptx) { toast('导出模块未加载', 'err'); return; }
    toast(mode === 'image' ? '正在渲染图片版（较慢）…' : '正在生成 PPTX…', '', 6000);
    try {
      const { blob, filename } = await EXPORTER.toPptx(state.deck, state.theme, { mode: mode || 'native' });
      downloadBlob(blob, filename || '课件.pptx');
      toast('已导出：' + (filename || '课件.pptx'), 'ok');
    } catch (e) {
      toast('导出失败：' + e.message, 'err', 5200);
    }
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------------- 事件绑定 ---------------- */
  function autosize() {
    const ta = $('#prompt');
    ta.style.height = 'auto';
    ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
  }

  function bind() {
    $('#btn-send').addEventListener('click', send);
    $('#prompt').addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); }
    });
    $('#prompt').addEventListener('input', autosize);

    $('#btn-attach').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });

    const chat = $('.chat');
    ['dragenter', 'dragover'].forEach(ev => chat.addEventListener(ev, e => { e.preventDefault(); chat.style.outline = '2px dashed #c7d2fe'; }));
    ['dragleave', 'drop'].forEach(ev => chat.addEventListener(ev, e => { e.preventDefault(); chat.style.outline = ''; }));
    chat.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files); });

    $('#btn-settings').addEventListener('click', openSettings);
    $('#model-chip').addEventListener('click', openSettings);
    $('#btn-test').addEventListener('click', testConnection);
    $('#settings-form').addEventListener('submit', () => { applySettingsFromForm(); });

    $('#btn-clear').addEventListener('click', () => {
      if (!confirm('清空当前对话和课件？')) return;
      state.messages = []; state.deck = null; state.sources = []; state.attachments = [];
      renderMessages(); renderAttachments(); renderSources();
      showPanel('empty'); setStep(1); save();
    });

    $('#btn-sources-toggle').addEventListener('click', () => $('#sources').classList.toggle('is-collapsed'));

    $$('.example').forEach(btn => btn.addEventListener('click', () => {
      $('#prompt').value = btn.dataset.prompt || '';
      autosize();
      $('#prompt').focus();
    }));

    $('#btn-replan').addEventListener('click', () => {
      if (state.lastRequest) generateDeck(state.lastRequest);
    });

    $('#btn-to-style').addEventListener('click', () => {
      renderStylePicker(); renderPreview(); showPanel('style'); setStep(3);
    });
    $('#btn-back-outline').addEventListener('click', () => { renderOutline(); showPanel('outline'); setStep(2); });
    $('#btn-to-perpage').addEventListener('click', () => { renderPerPage(); showPanel('perpage'); setStep(4); });
    $('#btn-to-deck').addEventListener('click', () => { renderDeckGrid(); showPanel('deck'); setStep(5); });
    $('#btn-back-style').addEventListener('click', () => { renderStylePicker(); renderPreview(); showPanel('style'); setStep(3); });
    $('#btn-back-perpage').addEventListener('click', () => { renderPerPage(); showPanel('perpage'); setStep(4); });
    $('#btn-perpage-reset').addEventListener('click', () => {
      if (!state.deck) return;
      state.deck.slides.forEach(s => { delete s.theme; });
      save(); renderPerPage(); toast('已全部恢复为跟随全局');
    });

    $('#btn-add-slide').addEventListener('click', () => {
      if (!state.deck) return;
      const last = state.deck.slides.length - 1;
      state.deck.slides.splice(last, 0, { type: 'bullets', title: '新的一页', subtitle: '', bullets: ['要点一', '要点二'], notes: '' });
      save(); renderOutline();
    });

    $('#btn-present').addEventListener('click', () => present(0));
    $('#btn-export-pptx').addEventListener('click', () => exportPptx('native'));
    $('#btn-export-img').addEventListener('click', () => exportPptx('image'));
    $('#btn-print').addEventListener('click', () => {
      if (window.EXPORTER && EXPORTER.printPdf) EXPORTER.printPdf();
      else window.print();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const lb = document.querySelector('.lightbox');
        if (lb) lb.remove();
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    load();
    renderModelChip();
    renderMessages();
    renderAttachments();
    renderSources();
    bind();
    if (window.SEARCH && SEARCH.setCustomProxy) SEARCH.setCustomProxy(state.settings.searchProxy);

    if (state.deck) {
      renderOutline();
      if (state.step >= 5) { renderStylePicker(); renderDeckGrid(); showPanel('deck'); setStep(5); }
      else if (state.step === 4) { renderStylePicker(); renderPerPage(); showPanel('perpage'); setStep(4); }
      else if (state.step === 3) { renderStylePicker(); renderPreview(); showPanel('style'); setStep(3); }
      else { showPanel('outline'); setStep(2); }
    } else {
      showPanel('empty');
      setStep(1);
    }
    if (!state.settings.apiKey) {
      setTimeout(() => toast('第一次使用：点右上角「设置」填入 API Key 就能开始生成', '', 6000), 700);
    }
    autosize();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
