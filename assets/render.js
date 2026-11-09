/* ============================================================
   render.js —— 幻灯片渲染引擎（window.PPT）
   舞台固定 1280×720，所有尺寸为舞台内像素，外部容器用 transform 缩放。

   对外 API（见 SPEC 第 3 节）：
     PPT.renderDeck(rootEl, deck, theme, opts)  -> .deck 元素
       opts.index        单页模式下显示第几页（0 起）
       opts.mode         'stack'（默认，竖向排列整份）| 'single'（只显示一页）
       opts.pageNumbers  是否显示页脚页码（默认 true）
       opts.animate      是否播放入场动画（默认 true）
     PPT.renderThumb(el, slide, deck, theme)    -> 单页（16:9，自适应 el 宽度）
     PPT.present(deck, theme, startIndex)       -> { overlay, close, goTo, next, prev }
     PPT.resolve(theme)                         -> { style, palette, font, anim }
     PPT.applyVars(el, theme)                   -> 在 el 上写入 --pp-* 主题变量

   依赖 window.PRESETS（presets.js）；缺失时使用内置兜底预设。
   ============================================================ */
(function (global) {
  'use strict';

  var STAGE_W = 1280;
  var STAGE_H = 720;

  var DEFAULT_THEME = { styleId: 'editorial', paletteId: 'ink', fontId: 'sans-cn', animId: 'fade-up' };

  var SLIDE_TYPES = ['cover', 'section', 'bullets', 'two-col', 'image', 'quote', 'stats', 'list', 'end'];

  // 兼容 presets.js 的 id 命名（wipe / reveal-wipe 都支持）
  var ANIM_MAP = {
    'fade-up': 'anim-fade-up',
    'fade': 'anim-fade',
    'slide-left': 'anim-slide-left',
    'zoom': 'anim-zoom',
    'wipe': 'anim-wipe',
    'reveal-wipe': 'anim-wipe',
    'none': 'anim-none'
  };

  var FONT_SANS = '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  var FONT_SERIF = '"Source Han Serif SC","Noto Serif SC","Songti SC","SimSun",Georgia,serif';

  /* ---------------- 内置兜底预设（PRESETS 缺失时仍可渲染） ---------------- */
  var FALLBACK_STYLES = [
    { id: 'editorial', name: '杂志极简' },
    { id: 'corporate', name: '商务深色' },
    { id: 'playful', name: '活泼儿童' },
    { id: 'tech', name: '科技渐变' },
    { id: 'warm', name: '温暖纸感' }
  ];

  var FALLBACK_PALETTES = [
    {
      id: 'ink', name: '墨黑蓝',
      colors: { bg: '#ffffff', surface: '#f4f6fa', text: '#0f172a', muted: '#64748b', primary: '#2563eb', accent: '#f59e0b', line: 'rgba(15,23,42,.10)' }
    },
    {
      id: 'paper', name: '纸感米',
      colors: { bg: '#fbf8f2', surface: '#f1eadd', text: '#2b2416', muted: '#7a6d57', primary: '#b45309', accent: '#0f766e', line: 'rgba(43,36,22,.12)' }
    }
  ];

  var FALLBACK_FONTS = [
    { id: 'sans-cn', name: '黑体（默认）', heading: FONT_SANS, body: FONT_SANS },
    { id: 'serif-cn', name: '宋体标题', heading: FONT_SERIF, body: FONT_SANS }
  ];

  var FALLBACK_ANIMS = [
    { id: 'fade-up', name: '淡入上浮', cssClass: 'anim-fade-up' },
    { id: 'fade', name: '纯淡入', cssClass: 'anim-fade' },
    { id: 'slide-left', name: '左侧滑入', cssClass: 'anim-slide-left' },
    { id: 'zoom', name: '缩放浮现', cssClass: 'anim-zoom' },
    { id: 'wipe', name: '擦除揭示', cssClass: 'anim-wipe' },
    { id: 'none', name: '无动画', cssClass: 'anim-none' }
  ];

  /* 要点图标（描边风格，颜色跟随 currentColor） */
  var ICONS = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><path d="M13 6l7 6-7 6"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3l4.2 8.8L12 21l-4.2-9.2z"/></svg>',
    '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7"/></svg>'
  ];

  var IMAGE_ICON = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="11" width="52" height="42" rx="7"/><circle cx="22" cy="26" r="5"/><path d="M10 47l13-13 9 9 7-6 15 14"/></svg>';

  var observerMap = typeof WeakMap === 'function' ? new WeakMap() : null;

  /* ============================================================
     基础工具
     ============================================================ */
  function text(v) {
    return v == null ? '' : String(v).trim();
  }

  function arr(v) {
    return Array.isArray(v) ? v.filter(function (x) { return x != null && x !== ''; }) : [];
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pad2(n) {
    n = Number(n) || 0;
    return (n < 10 ? '0' : '') + n;
  }

  function clamp(n, min, max) {
    n = Number(n);
    if (!isFinite(n)) n = min;
    return Math.max(min, Math.min(max, n));
  }

  function itemText(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') return text(v.text || v.label || v.title || v.value);
    return '';
  }

  function cleanItem(v) {
    return itemText(v)
      .replace(/^\s*(?:[-—–•·*●▪◦]|\d+\s*[.、)）:])\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitListItem(v) {
    var s = cleanItem(v);
    var m = /^([^：:]{2,14})[：:]\s*(.+)$/.exec(s);
    if (m) return { title: m[1].trim(), desc: m[2].trim() };
    return { title: '', desc: s };
  }

  function animClass(anim) {
    var id = (anim && anim.id) || 'fade-up';
    var cls = ANIM_MAP[id];
    if (cls) return cls;
    var custom = text(anim && anim.cssClass);
    if (/^anim-[a-z0-9-]+$/i.test(custom)) return custom;
    return 'anim-fade-up';
  }

  function styleIdOf(resolved) {
    var id = resolved && resolved.style && resolved.style.id;
    return SLIDE_TYPES && ['editorial', 'corporate', 'playful', 'tech', 'warm'].indexOf(id) >= 0 ? id : 'editorial';
  }

  function titleSizeClass(t, base) {
    var n = text(t).length;
    if (n > 34) return 'is-xs';
    if (n > 22) return 'is-sm';
    return '';
  }

  function coverTitleClass(t) {
    var n = text(t).length;
    if (n > 30) return 'is-xs';
    if (n > 18) return 'is-sm';
    if (n > 10) return 'is-md';
    return 'is-lg';
  }

  function endTitleClass(t) {
    var n = text(t).length;
    if (n > 16) return 'is-xs';
    if (n > 9) return 'is-sm';
    if (n > 5) return 'is-md';
    return '';
  }

  function quoteSizeClass(q) {
    var n = text(q).length;
    if (n > 110) return 'is-xs';
    if (n > 64) return 'is-sm';
    return '';
  }

  /* ============================================================
     PRESETS 解析 / 主题变量
     ============================================================ */
  function getPresets() {
    return global.PRESETS && typeof global.PRESETS === 'object' ? global.PRESETS : null;
  }

  function pickOne(got, list, id, fallbackList, fallbackId) {
    if (got && typeof got === 'object' && (got.id || got.colors || got.heading)) return got;
    var pool = arr(list);
    if (!pool.length) pool = fallbackList;
    if (id) {
      for (var i = 0; i < pool.length; i++) {
        if (pool[i] && pool[i].id === id) return pool[i];
      }
    }
    for (var j = 0; j < pool.length; j++) {
      if (pool[j] && pool[j].id === fallbackId) return pool[j];
    }
    return pool[0] || fallbackList[0];
  }

  function resolve(theme) {
    theme = theme || {};
    var P = getPresets();
    var got = null;
    if (P && typeof P.get === 'function') {
      try { got = P.get(theme) || null; } catch (e) { got = null; }
    }
    var style = pickOne(got && got.style, P && P.styles, theme.styleId, FALLBACK_STYLES, 'editorial');
    var palette = pickOne(got && got.palette, P && P.palettes, theme.paletteId, FALLBACK_PALETTES, 'ink');
    var font = pickOne(got && got.font, P && P.fonts, theme.fontId, FALLBACK_FONTS, 'sans-cn');
    var anim = pickOne(got && got.anim, P && P.anims, theme.animId, FALLBACK_ANIMS, 'fade-up');
    if (!style || !style.id) style = FALLBACK_STYLES[0];
    if (!palette || !palette.colors) palette = FALLBACK_PALETTES[0];
    if (!font || !font.heading) font = FALLBACK_FONTS[0];
    if (!anim || !anim.id) anim = FALLBACK_ANIMS[0];
    return { style: style, palette: palette, font: font, anim: anim };
  }

  function parseColor(v) {
    if (!v) return null;
    var s = String(v).trim();
    var m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) {
      return {
        r: parseInt(m[1][0] + m[1][0], 16),
        g: parseInt(m[1][1] + m[1][1], 16),
        b: parseInt(m[1][2] + m[1][2], 16)
      };
    }
    m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) {
      return {
        r: parseInt(m[1].slice(0, 2), 16),
        g: parseInt(m[1].slice(2, 4), 16),
        b: parseInt(m[1].slice(4, 6), 16)
      };
    }
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
    if (m) {
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    }
    return null;
  }

  function rgbToHex(c) {
    function h(n) {
      n = Math.max(0, Math.min(255, Math.round(n)));
      return (n < 16 ? '0' : '') + n.toString(16);
    }
    return '#' + h(c.r) + h(c.g) + h(c.b);
  }

  function rgba(c, a) {
    return 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + a + ')';
  }

  function mix(c1, c2, t) {
    t = clamp(t, 0, 1);
    return {
      r: c1.r + (c2.r - c1.r) * t,
      g: c1.g + (c2.g - c1.g) * t,
      b: c1.b + (c2.b - c1.b) * t
    };
  }

  function luminance(c) {
    function ch(v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  function schemeFor(styleId, colors) {
    var bg = parseColor(colors.bg) || { r: 255, g: 255, b: 255 };
    var textC = parseColor(colors.text) || { r: 17, g: 24, b: 39 };
    var primary = parseColor(colors.primary) || { r: 37, g: 99, b: 235 };
    var accent = parseColor(colors.accent) || { r: 245, g: 158, b: 11 };
    var darkStyle = styleId === 'corporate' || styleId === 'tech';

    // 商务深色 / 科技渐变：若用户选了浅色配色，自动推导一套深色方案，保证风格成立
    if (darkStyle && luminance(bg) > 0.42) {
      var base = mix(textC, primary, 0.22);
      var nbg = mix(base, { r: 4, g: 8, b: 16 }, 0.8);
      var ntext = mix({ r: 255, g: 255, b: 255 }, nbg, 0.1);
      return {
        bg: rgbToHex(nbg),
        surface: rgbToHex(mix(nbg, { r: 255, g: 255, b: 255 }, 0.07)),
        text: rgbToHex(ntext),
        muted: rgbToHex(mix(ntext, nbg, 0.48)),
        primary: rgbToHex(mix(primary, { r: 255, g: 255, b: 255 }, 0.34)),
        accent: rgbToHex(mix(accent, { r: 255, g: 255, b: 255 }, 0.2)),
        line: 'rgba(255,255,255,.14)',
        onPrimary: '#ffffff'
      };
    }

    var surface = parseColor(colors.surface) || mix(bg, textC, 0.04);
    var muted = parseColor(colors.muted) || mix(textC, bg, 0.42);
    return {
      bg: rgbToHex(bg),
      surface: rgbToHex(surface),
      text: rgbToHex(textC),
      muted: rgbToHex(muted),
      primary: rgbToHex(primary),
      accent: rgbToHex(accent),
      line: text(colors.line) || rgba(textC, 0.12),
      onPrimary: luminance(primary) > 0.58 ? '#0b1020' : '#ffffff'
    };
  }

  function applyVars(el, theme) {
    var resolved = resolve(theme);
    if (!el || !el.style) return resolved;
    var c = (resolved.palette && resolved.palette.colors) || {};
    var s = schemeFor(styleIdOf(resolved), c);
    var primary = parseColor(s.primary) || { r: 37, g: 99, b: 235 };
    var accent = parseColor(s.accent) || { r: 245, g: 158, b: 11 };
    var textC = parseColor(s.text) || { r: 17, g: 24, b: 39 };

    el.style.setProperty('--pp-bg', s.bg);
    el.style.setProperty('--pp-surface', s.surface);
    el.style.setProperty('--pp-text', s.text);
    el.style.setProperty('--pp-muted', s.muted);
    el.style.setProperty('--pp-primary', s.primary);
    el.style.setProperty('--pp-accent', s.accent);
    el.style.setProperty('--pp-line', s.line);
    el.style.setProperty('--pp-font-heading', text(resolved.font.heading) || FONT_SANS);
    el.style.setProperty('--pp-font-body', text(resolved.font.body) || FONT_SANS);
    el.style.setProperty('--pp-serif', FONT_SERIF);

    // 由主题色派生出的辅助变量（避免在 CSS 里硬编码主题色）
    el.style.setProperty('--pp-primary-soft', rgba(primary, 0.13));
    el.style.setProperty('--pp-primary-soft-2', rgba(primary, 0.22));
    el.style.setProperty('--pp-accent-soft', rgba(accent, 0.14));
    el.style.setProperty('--pp-line-strong', rgba(textC, 0.24));
    el.style.setProperty('--pp-shadow', 'rgba(3,7,18,.18)');
    el.style.setProperty('--pp-glow', rgba(primary, 0.34));
    el.style.setProperty('--pp-on-primary', s.onPrimary);
    el.setAttribute('data-pp-style', styleIdOf(resolved));
    return resolved;
  }

  /* ============================================================
     幻灯片内容（9 种版式）
     ============================================================ */
  function headHTML(title, sub, en, cn) {
    var out = '<header class="s-head">';
    out += '<div class="s-kicker anim" style="--i:0"><span class="k-en">' + esc(en) + '</span><span class="k-cn">' + esc(cn) + '</span></div>';
    out += '<h2 class="s-title ' + titleSizeClass(title) + ' anim" style="--i:1">' + esc(title) + '</h2>';
    if (sub) out += '<p class="s-sub anim" style="--i:2">' + esc(sub) + '</p>';
    out += '</header>';
    return out;
  }

  function buildCover(slide, deck, index, total) {
    var title = text(slide.title) || text(deck.title) || '未命名课件';
    var subtitle = text(slide.subtitle) || text(deck.subtitle);
    var meta = deck.meta || {};
    var bits = [];
    if (meta.grade) bits.push(meta.grade);
    if (meta.subject) bits.push(meta.subject);
    var kicker = bits.join(' · ') || '课堂课件';

    var chips = [];
    if (meta.minutes) chips.push('<span class="meta-chip"><b>' + esc(meta.minutes) + '</b> 分钟</span>');
    if (total) chips.push('<span class="meta-chip"><b>' + total + '</b> 页</span>');
    if (!chips.length && meta.grade) chips.push('<span class="meta-chip">' + esc(meta.grade) + '</span>');

    return '' +
      '<div class="s-inner cover">' +
        '<div class="cover-top anim" style="--i:0">' +
          '<span class="cover-kicker"><span class="ck-line" aria-hidden="true"></span>' + esc(kicker) + '</span>' +
          '<span class="cover-label">LESSON DECK</span>' +
        '</div>' +
        '<div class="cover-main">' +
          '<h1 class="cover-title ' + coverTitleClass(title) + ' anim" style="--i:1">' + esc(title) + '</h1>' +
          (subtitle ? '<p class="cover-sub anim" style="--i:2">' + esc(subtitle) + '</p>' : '') +
        '</div>' +
        '<div class="cover-foot anim" style="--i:3">' +
          '<span class="cover-rule" aria-hidden="true"></span>' +
          '<div class="cover-meta">' + chips.join('') + '</div>' +
        '</div>' +
        '<div class="cover-serial" aria-hidden="true"><span class="cs-num">' + pad2(index + 1) + '</span><span class="cs-txt">' + esc(meta.subject || 'DECK') + '</span></div>' +
      '</div>';
  }

  function buildSection(slide, deck, index) {
    var title = text(slide.title) || '新的章节';
    var sub = text(slide.subtitle);
    return '' +
      '<div class="s-inner section">' +
        '<div class="section-num anim" style="--i:0" aria-hidden="true"><b>' + pad2(index + 1) + '</b><span>CHAPTER</span></div>' +
        '<div class="section-body">' +
          '<div class="s-kicker anim" style="--i:1"><span class="k-en">CHAPTER</span><span class="k-cn">章节</span></div>' +
          '<h2 class="section-title ' + titleSizeClass(title) + ' anim" style="--i:2">' + esc(title) + '</h2>' +
          (sub ? '<p class="section-sub anim" style="--i:3">' + esc(sub) + '</p>' : '') +
        '</div>' +
        '<div class="section-side" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '</div>';
  }

  function buildBullets(slide, deck, index, total) {
    var raw = arr(slide.bullets).map(cleanItem).filter(Boolean);
    var shown = raw.slice(0, 12);
    var n = shown.length;
    var cols = n > 6 ? 2 : 1;
    var size = n <= 3 ? 'sz-l' : n <= 4 ? 'sz-m' : n <= 6 ? 'sz-s' : n <= 9 ? 'sz-xs' : 'sz-xxs';
    var title = text(slide.title) || '本节要点';
    var sub = text(slide.subtitle);
    var list = shown.length
      ? '<ul class="bullets cols-' + cols + ' ' + size + '"' + (cols === 2 ? ' style="--rows:' + Math.ceil(n / 2) + '"' : '') + '>' + shown.map(function (t, k) {
          return '<li class="anim" style="--i:' + (k + 3) + '">' +
            '<span class="b-badge" aria-hidden="true">' + ICONS[k % ICONS.length] + '</span>' +
            '<span class="b-text">' + esc(t) + '</span></li>';
        }).join('') + '</ul>'
      : '<div class="bullets-empty anim" style="--i:3">要点还没有填写</div>';
    var more = raw.length > 12 ? '<div class="bullets-more">还有 ' + (raw.length - 12) + ' 条要点</div>' : '';

    return '<div class="s-inner">' + headHTML(title, sub, 'KEY POINTS', '要点') + list + more + '</div>';
  }

  function buildTwoCol(slide, deck, index, total) {
    var cols = arr(slide.columns).slice(0, 2);
    var normalized = [];
    cols.forEach(function (c) {
      normalized.push({ title: text(c && c.title), items: arr(c && c.items).map(cleanItem).filter(Boolean), sub: text(c && c.subtitle) });
    });
    if (normalized.length < 2) {
      var b = arr(slide.bullets).map(cleanItem).filter(Boolean);
      var half = Math.ceil(b.length / 2);
      if (!normalized[0]) normalized[0] = { title: '方案 A', items: b.slice(0, half), sub: '' };
      if (!normalized[1]) normalized[1] = { title: '方案 B', items: b.slice(half), sub: '' };
    }
    var title = text(slide.title) || '对比分析';
    var sub = text(slide.subtitle);

    var html = '<div class="s-inner">' + headHTML(title, sub, 'COMPARE', '对比') + '<div class="cols">';
    normalized.slice(0, 2).forEach(function (c, k) {
      var items = c.items.slice(0, 7);
      html += '<div class="col col-' + (k === 0 ? 'a' : 'b') + ' anim" style="--i:' + (k + 3) + '">' +
        '<div class="col-head"><span class="col-badge">' + (k === 0 ? 'A' : 'B') + '</span><h3>' + esc(c.title || ('要点 ' + (k === 0 ? 'A' : 'B'))) + '</h3></div>' +
        (c.sub ? '<p class="col-sub">' + esc(c.sub) + '</p>' : '') +
        '<ul class="col-list ' + (items.length > 5 ? 'is-dense' : '') + '">' +
          items.map(function (t) {
            return '<li><span class="dot" aria-hidden="true"></span><span>' + esc(t) + '</span></li>';
          }).join('') +
        '</ul></div>';
      if (k === 0) html += '<div class="col-vs anim" style="--i:4" aria-hidden="true"><span>VS</span></div>';
    });
    html += '</div></div>';
    return html;
  }

  function buildImage(slide, deck, index, total) {
    var image = slide.image || {};
    var src = text(image.src);
    var caption = text(image.caption);
    var title = text(slide.title) || '图示';
    var sub = text(slide.subtitle);
    var bullets = arr(slide.bullets).map(cleanItem).filter(Boolean).slice(0, 4);

    var figure = src
      ? '<img src="' + esc(src) + '" alt="' + esc(caption || title) + '" loading="lazy">'
      : '<div class="image-ph" aria-hidden="true">' + IMAGE_ICON + '<b>图片占位</b><span>在编辑区上传 / 选择一张图片</span></div>';

    return '' +
      '<div class="s-inner">' +
        '<div class="image-layout">' +
          '<div class="image-text">' +
            headHTML(title, sub, 'VISUAL', '图示') +
            (bullets.length ? '<ul class="image-bullets">' + bullets.map(function (t, k) {
              return '<li class="anim" style="--i:' + (k + 4) + '"><span class="dot" aria-hidden="true"></span><span>' + esc(t) + '</span></li>';
            }).join('') + '</ul>' : '') +
          '</div>' +
          '<figure class="image-figure anim" style="--i:3">' +
            figure +
            (caption ? '<figcaption>' + esc(caption) + '</figcaption>' : '') +
          '</figure>' +
        '</div>' +
      '</div>';
  }

  function buildQuote(slide) {
    var q = text(slide.quote) || text(slide.title) || '把每一节课，都讲成一个好故事。';
    var author = text(slide.author) || text(slide.subtitle);
    return '' +
      '<div class="s-inner quote">' +
        '<div class="quote-label anim" style="--i:0"><span aria-hidden="true"></span>QUOTE<span aria-hidden="true"></span></div>' +
        '<div class="quote-mark anim" style="--i:1" aria-hidden="true">“</div>' +
        '<blockquote class="quote-text ' + quoteSizeClass(q) + ' anim" style="--i:2">' + esc(q) + '</blockquote>' +
        (author ? '<figcaption class="quote-author anim" style="--i:3"><span class="qa-line" aria-hidden="true"></span>' + esc(author) + '</figcaption>' : '') +
      '</div>';
  }

  function buildStats(slide, deck, index, total) {
    var stats = arr(slide.stats).slice(0, 4).map(function (s) {
      return { value: text(s && s.value), label: text(s && s.label), note: text(s && s.note) };
    }).filter(function (s) { return s.value || s.label; });
    var title = text(slide.title) || '关键数据';
    var sub = text(slide.subtitle);
    var body = stats.length
      ? '<div class="stats n-' + stats.length + '">' + stats.map(function (s, k) {
          return '<div class="stat anim" style="--i:' + (k + 3) + '">' +
            '<div class="stat-val ' + (s.value.length > 6 ? 'is-long' : '') + '">' + esc(s.value || '—') + '</div>' +
            '<div class="stat-label">' + esc(s.label) + '</div>' +
            (s.note ? '<div class="stat-note">' + esc(s.note) + '</div>' : '') +
            '<span class="stat-bar" aria-hidden="true"></span></div>';
        }).join('') + '</div>'
      : '<div class="bullets-empty anim" style="--i:3">数据还没有填写</div>';
    return '<div class="s-inner">' + headHTML(title, sub, 'BY THE NUMBERS', '数据') + body + '</div>';
  }

  function buildList(slide, deck, index, total) {
    var items = arr(slide.bullets).map(splitListItem).filter(function (x) { return x.title || x.desc; });
    var shown = items.slice(0, 10);
    var two = shown.length > 5;
    var title = text(slide.title) || '课堂流程';
    var sub = text(slide.subtitle);
    var body = shown.length
      ? '<ol class="timeline ' + (two ? 'cols-2" style="--rows:' + Math.ceil(shown.length / 2) : '') + '">' + shown.map(function (it, k) {
          return '<li class="anim" style="--i:' + (k + 3) + '">' +
            '<span class="tl-node"><b>' + pad2(k + 1) + '</b></span>' +
            '<div class="tl-body">' +
              (it.title ? '<b class="tl-title">' + esc(it.title) + '</b>' : '') +
              '<span class="tl-desc">' + esc(it.desc) + '</span>' +
            '</div></li>';
        }).join('') + '</ol>'
      : '<div class="bullets-empty anim" style="--i:3">清单还没有填写</div>';
    return '<div class="s-inner">' + headHTML(title, sub, 'CHECKLIST', '清单') + body + '</div>';
  }

  function buildEnd(slide, deck, index, total) {
    var title = text(slide.title) || '谢谢观看';
    var sub = text(slide.subtitle) || text(deck.subtitle);
    var contacts = arr(slide.bullets).map(cleanItem).filter(Boolean).slice(0, 4);
    var meta = deck.meta || {};
    var metaText = [meta.grade, meta.subject].filter(Boolean).join(' · ');

    return '' +
      '<div class="s-inner end">' +
        '<div class="end-kicker anim" style="--i:0"><span aria-hidden="true"></span>THANK YOU<span aria-hidden="true"></span></div>' +
        '<h1 class="end-title ' + endTitleClass(title) + ' anim" style="--i:1">' + esc(title) + '</h1>' +
        (sub ? '<p class="end-sub anim" style="--i:2">' + esc(sub) + '</p>' : '') +
        (contacts.length
          ? '<div class="end-contact anim" style="--i:3">' + contacts.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>'
          : (metaText ? '<div class="end-contact anim" style="--i:3"><span>' + esc(metaText) + '</span></div>' : '')) +
        '<div class="end-art" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '</div>';
  }

  function normalizeType(slide, index) {
    var t = text(slide && slide.type);
    if (SLIDE_TYPES.indexOf(t) >= 0) return t;
    if (slide && text(slide.quote)) return 'quote';
    if (slide && arr(slide.stats).length) return 'stats';
    if (slide && arr(slide.columns).length) return 'two-col';
    if (slide && slide.image && (text(slide.image.src) || text(slide.image.caption))) return 'image';
    if (slide && arr(slide.bullets).length) return 'bullets';
    return index === 0 ? 'cover' : 'bullets';
  }

  function buildBody(type, slide, deck, index, total) {
    switch (type) {
      case 'cover': return buildCover(slide, deck, index, total);
      case 'section': return buildSection(slide, deck, index);
      case 'bullets': return buildBullets(slide, deck, index, total);
      case 'two-col': return buildTwoCol(slide, deck, index, total);
      case 'image': return buildImage(slide, deck, index, total);
      case 'quote': return buildQuote(slide, deck, index);
      case 'stats': return buildStats(slide, deck, index, total);
      case 'list': return buildList(slide, deck, index, total);
      case 'end': return buildEnd(slide, deck, index, total);
      default: return buildBullets(slide, deck, index, total);
    }
  }

  function buildSlide(slide, deck, index, total, resolved, opts) {
    opts = opts || {};
    slide = slide || {};
    deck = deck || { slides: [] };
    total = Math.max(Number(total) || 0, index + 1);
    var type = normalizeType(slide, index);
    var styleId = styleIdOf(resolved);
    var el = document.createElement('section');
    el.className = 'slide slide-' + type + ' st-' + styleId + ' ' + animClass(resolved && resolved.anim) + (opts.static ? ' pp-static' : '');
    el.dataset.index = String(index);
    el.dataset.type = type;
    el.setAttribute('aria-label', '第 ' + (index + 1) + ' 页：' + (text(slide.title) || type || '幻灯片'));
    el.style.setProperty('--pp-i', String(index));

    var body = '';
    try {
      body = buildBody(type, slide, deck, index, total);
    } catch (err) {
      body = '<div class="s-inner"><div class="s-head"><h2 class="s-title">' + esc(text(slide.title) || '未命名页面') + '</h2></div></div>';
    }

    el.innerHTML =
      '<div class="s-bg" aria-hidden="true"></div>' +
      '<div class="s-deco" aria-hidden="true"><i class="d1"></i><i class="d2"></i><i class="d3"></i><b class="d-num">' + pad2(index + 1) + '</b></div>' +
      body +
      '<div class="s-mark" aria-hidden="true"><i></i><i></i><i></i></div>' +
      (opts.pageNumbers === false ? '' : '<div class="s-page">' + pad2(index + 1) + '<span>/ ' + pad2(total) + '</span></div>');

    return el;
  }

  /* ============================================================
     尺寸自适应
     ============================================================ */
  function stopWatch(el) {
    if (!el) return;
    if (observerMap) {
      var ro = observerMap.get(el);
      if (ro) { ro.disconnect(); observerMap.delete(el); }
    }
    if (el.__ppWinResize) {
      global.removeEventListener('resize', el.__ppWinResize);
      delete el.__ppWinResize;
    }
  }

  function watchSize(el, fn) {
    if (typeof global.ResizeObserver === 'function') {
      var ro = new global.ResizeObserver(function () { fn(); });
      ro.observe(el);
      if (observerMap) observerMap.set(el, ro);
    } else if (!el.__ppWinResize) {
      el.__ppWinResize = function () { fn(); };
      global.addEventListener('resize', el.__ppWinResize);
    }
    fn();
  }

  function fitDeck(rootEl) {
    var w = rootEl.clientWidth;
    if (!w) w = rootEl.getBoundingClientRect().width;
    if (!w) w = 960;
    var pad = 0;
    try {
      var cs = global.getComputedStyle(rootEl);
      if (cs) pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    } catch (e) { /* ignore */ }
    var avail = Math.max(160, w - pad);
    var scale = Math.min(2, avail / STAGE_W);
    rootEl.style.setProperty('--pp-scale', String(Math.round(scale * 10000) / 10000));
  }

  /* ============================================================
     renderDeck / renderThumb
     ============================================================ */
  function renderDeck(rootEl, deck, theme, opts) {
    if (!rootEl) return null;
    opts = opts || {};
    var resolved = applyVars(rootEl, theme);
    stopWatch(rootEl);
    rootEl.innerHTML = '';
    rootEl.classList.add('pp-deck-host');

    var deckEl = document.createElement('div');
    deckEl.className = 'deck';
    var slides = arr(deck && deck.slides);
    var total = slides.length;
    var single = opts.mode === 'single';
    if (single) deckEl.classList.add('deck--single');

    if (!total) {
      deckEl.innerHTML = '<div class="deck-empty"><b>还没有页面</b><span>先在左侧生成大纲，或手动添加一页吧。</span></div>';
      rootEl.appendChild(deckEl);
      return deckEl;
    }

    var focus = clamp(opts.index || 0, 0, total - 1);
    slides.forEach(function (slide, i) {
      var frame = document.createElement('div');
      frame.className = 'slide-frame' + (single ? (i === focus ? ' is-current' : ' is-hidden') : '');
      frame.dataset.index = String(i);
      var slideEl = buildSlide(slide, deck, i, total, resolved, {
        pageNumbers: opts.pageNumbers !== false,
        static: opts.animate === false
      });
      frame.appendChild(slideEl);
      deckEl.appendChild(frame);
    });

    rootEl.appendChild(deckEl);
    fitDeck(rootEl);

    // 同一帧内加上 is-active，避免首帧闪一下未动画状态
    if (opts.animate !== false) {
      if (single) {
        var current = deckEl.querySelector('.slide-frame.is-current .slide');
        if (current) current.classList.add('is-active');
      } else {
        deckEl.querySelectorAll('.slide').forEach(function (el) { el.classList.add('is-active'); });
      }
    }

    watchSize(rootEl, function () { fitDeck(rootEl); });
    return deckEl;
  }

  function renderThumb(el, slide, deck, theme) {
    if (!el) return null;
    var resolved = applyVars(el, theme);
    stopWatch(el);
    el.innerHTML = '';
    el.classList.add('pp-thumb-host');

    var slides = arr(deck && deck.slides);
    var index = slides.indexOf(slide);
    if (index < 0) index = 0;
    var total = Math.max(slides.length, index + 1);

    var inner = document.createElement('div');
    inner.className = 'pp-thumb-inner';
    var slideEl = buildSlide(slide || {}, deck || { slides: [] }, index, total, resolved, { static: true, pageNumbers: false });
    inner.appendChild(slideEl);
    el.appendChild(inner);

    if (!el.clientHeight) el.style.aspectRatio = '16 / 9';

    function fit() {
      var w = el.clientWidth;
      if (!w) w = el.getBoundingClientRect().width;
      if (!w) w = 320;
      el.style.setProperty('--pp-scale', String(Math.round((w / STAGE_W) * 10000) / 10000));
    }
    watchSize(el, fit);
    return slideEl;
  }

  /* ============================================================
     present —— 全屏放映层
     ============================================================ */
  var activePresenter = null;

  function present(deck, theme, startIndex) {
    if (activePresenter) activePresenter.close();
    var slides = arr(deck && deck.slides);
    if (!slides.length || !document.body) return null;

    var total = slides.length;
    var index = clamp(startIndex || 0, 0, total - 1);
    var closed = false;

    var overlay = document.createElement('div');
    overlay.className = 'pp-presenter';
    overlay.tabIndex = -1;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '幻灯片放映');
    var resolved = applyVars(overlay, theme);

    overlay.innerHTML =
      '<div class="pp-stage"><div class="pp-canvas"></div></div>' +
      '<div class="pp-zone pp-zone-prev" data-act="prev" aria-hidden="true"></div>' +
      '<div class="pp-zone pp-zone-next" data-act="next" aria-hidden="true"></div>' +
      '<button class="pp-arrow pp-arrow-prev" data-act="prev" type="button" aria-label="上一页">‹</button>' +
      '<button class="pp-arrow pp-arrow-next" data-act="next" type="button" aria-label="下一页">›</button>' +
      '<div class="pp-topbar">' +
        '<div class="pp-deck-title">' + esc(deck.title || '演示文稿') + '</div>' +
        '<div class="pp-tools">' +
          '<button class="pp-tool" data-act="notes" type="button" title="讲稿提示（N）">讲稿</button>' +
          '<button class="pp-tool" data-act="fullscreen" type="button" title="全屏（F）">全屏</button>' +
          '<button class="pp-tool pp-tool-close" data-act="close" type="button" title="退出放映（ESC）">✕ 退出</button>' +
        '</div>' +
      '</div>' +
      '<aside class="pp-notes" aria-label="讲稿提示">' +
        '<div class="pp-notes-h">讲稿提示<span>N</span></div>' +
        '<div class="pp-notes-body"></div>' +
      '</aside>' +
      '<div class="pp-bottom">' +
        '<div class="pp-bottom-row">' +
          '<span class="pp-hint">← → 翻页 · F 全屏 · N 讲稿 · ESC 退出</span>' +
          '<span class="pp-counter"><b>1</b><span>/ ' + total + '</span></span>' +
        '</div>' +
        '<div class="pp-progress"><i></i></div>' +
      '</div>';

    var canvas = overlay.querySelector('.pp-canvas');
    var slideEls = slides.map(function (slide, i) {
      var el = buildSlide(slide, deck, i, total, resolved, { pageNumbers: false });
      el.classList.add('pp-slide-item');
      if (i === index) el.classList.add('is-current');
      canvas.appendChild(el);
      return el;
    });

    var notesEl = overlay.querySelector('.pp-notes');
    var notesBody = overlay.querySelector('.pp-notes-body');
    var counterEl = overlay.querySelector('.pp-counter');
    var progressEl = overlay.querySelector('.pp-progress i');
    var notesOpen = false;

    function updateChrome() {
      counterEl.innerHTML = '<b>' + (index + 1) + '</b><span>/ ' + total + '</span>';
      progressEl.style.transform = 'scaleX(' + ((index + 1) / total) + ')';
      var slide = slides[index] || {};
      var note = text(slide.notes);
      notesBody.innerHTML = note
        ? '<p>' + esc(note) + '</p>'
        : '<p class="pp-notes-empty">本页没有讲稿提示，可在编辑区补充。</p>';
    }

    function update(next) {
      next = clamp(next, 0, total - 1);
      if (next === index) return;
      slideEls[index].classList.remove('is-active');
      slideEls[index].classList.remove('is-current');
      index = next;
      var cur = slideEls[index];
      cur.classList.add('is-current');
      // 强制 reflow 后重新触发入场动画
      cur.classList.remove('is-active');
      void cur.offsetWidth;
      cur.classList.add('is-active');
      updateChrome();
    }

    function fit() {
      var w = global.innerWidth || document.documentElement.clientWidth || STAGE_W;
      var h = global.innerHeight || document.documentElement.clientHeight || STAGE_H;
      // 讲稿面板占住右侧一条，舞台用剩余宽度，幻灯片整体缩小而不是被盖住
      var notesW = notesOpen ? Math.min(380, w * 0.34) : 0;
      var availW = Math.max(240, w - notesW);
      var scale = Math.min(availW / STAGE_W, h / STAGE_H);
      overlay.style.setProperty('--pp-scale', String(Math.round(scale * 10000) / 10000));
    }

    function toggleNotes(force) {
      notesOpen = typeof force === 'boolean' ? force : !notesOpen;
      notesEl.classList.toggle('is-open', notesOpen);
      overlay.classList.toggle('pp-notes-open', notesOpen);
      var btn = overlay.querySelector('[data-act="notes"]');
      if (btn) btn.classList.toggle('is-on', notesOpen);
      fit();
    }

    function toggleFullscreen() {
      try {
        if (!document.fullscreenElement) {
          var p = overlay.requestFullscreen ? overlay.requestFullscreen() : null;
          if (p && p.catch) p.catch(function () {});
        } else if (document.exitFullscreen) {
          var q = document.exitFullscreen();
          if (q && q.catch) q.catch(function () {});
        }
      } catch (e) { /* ignore */ }
    }

    function onFullscreenChange() {
      overlay.classList.toggle('is-fs', document.fullscreenElement === overlay);
    }

    function onKey(e) {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      var k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'Spacebar' || k === 'PageDown' || k === 'Enter') {
        e.preventDefault();
        update(index + (e.shiftKey ? -1 : 1));
      } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') {
        e.preventDefault();
        update(index - 1);
      } else if (k === 'Home') {
        e.preventDefault();
        update(0);
      } else if (k === 'End') {
        e.preventDefault();
        update(total - 1);
      } else if (k === 'Escape') {
        e.preventDefault();
        close();
      } else if (k === 'f' || k === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (k === 'n' || k === 'N') {
        e.preventDefault();
        toggleNotes();
      }
    }

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      global.removeEventListener('resize', fit);
      if (document.fullscreenElement === overlay && document.exitFullscreen) {
        try {
          var p = document.exitFullscreen();
          if (p && p.catch) p.catch(function () {});
        } catch (e) { /* ignore */ }
      }
      overlay.classList.add('is-closing');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 200);
      document.body.classList.remove('pp-presenting');
      if (activePresenter && activePresenter.overlay === overlay) activePresenter = null;
    }

    overlay.addEventListener('click', function (e) {
      var target = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!target) return;
      var act = target.getAttribute('data-act');
      if (act === 'next') update(index + 1);
      else if (act === 'prev') update(index - 1);
      else if (act === 'close') close();
      else if (act === 'notes') toggleNotes();
      else if (act === 'fullscreen') toggleFullscreen();
    });

    document.body.classList.add('pp-presenting');
    document.body.appendChild(overlay);
    fit();
    updateChrome();
    slideEls[index].classList.add('is-active');

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    global.addEventListener('resize', fit);

    try { overlay.focus({ preventScroll: true }); } catch (e) { try { overlay.focus(); } catch (e2) { /* ignore */ } }

    activePresenter = {
      overlay: overlay,
      close: close,
      goTo: function (i) { update(i); },
      next: function () { update(index + 1); },
      prev: function () { update(index - 1); }
    };
    return activePresenter;
  }

  /* ============================================================
     导出
     ============================================================ */
  global.PPT = {
    renderDeck: renderDeck,
    renderThumb: renderThumb,
    present: present,
    resolve: resolve,
    applyVars: applyVars,
    STAGE: { width: STAGE_W, height: STAGE_H },
    DEFAULT_THEME: DEFAULT_THEME,
    SLIDE_TYPES: SLIDE_TYPES.slice()
  };
})(window);
