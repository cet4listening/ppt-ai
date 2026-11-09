/* =========================================================================
 * assets/export.js  ——  PPTX 导出模块（纯浏览器，无构建）
 *
 * 暴露：window.EXPORTER.toPptx(deck, theme, { mode:'native'|'image', filename })
 *         -> Promise<{ blob, filename, size, slides, mode }>
 *       window.EXPORTER.printPdf()   // 触发浏览器打印（横向样式由 themes.css 提供）
 *       window.EXPORTER.filenameFor(deck)
 *       window.EXPORTER.preload()    // 可选：提前把 pptxgenjs 加载好
 *
 * 依赖：PptxGenJS（vendor/pptxgen.js，回退 CDN）；图片版另需 html2canvas 与 PPT 渲染模块
 * 设计基准：1280 × 720 舞台坐标，换算成 10 × 5.625 英寸（16:9）
 * ========================================================================= */
(function (global) {
  'use strict';

  /* ------------------------------ 常量 ------------------------------ */
  var PAGE_W = 10;        // 英寸
  var PAGE_H = 5.625;     // 英寸（16:9）
  var STAGE_W = 1280;     // 设计稿宽
  var STAGE_H = 720;      // 设计稿高
  var K = PAGE_W / STAGE_W;                 // px -> 英寸
  var JPQ = 'image/jpeg';

  function px(v) { return Math.round(v * K * 10000) / 10000; }

  var ASSET_BASE = (function () {
    try {
      var s = document.currentScript && document.currentScript.src;
      if (s) return s.slice(0, s.lastIndexOf('/') + 1);
    } catch (e) { /* ignore */ }
    return String(global.location.href).replace(/[^/]*$/, '');
  })();

  function absUrl(rel) {
    try { return new URL(rel, ASSET_BASE).href; } catch (e) { return rel; }
  }

  var VENDOR = absUrl('../vendor/');
  var CDN_JS = 'https://cdn.jsdelivr.net/npm/';
  var CDN_UNPKG = 'https://unpkg.com/';

  var LIB_URLS = {
    pptxgen: [
      VENDOR + 'pptxgen.js',
      CDN_JS + 'pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
      CDN_UNPKG + 'pptxgenjs@3.12.0/dist/pptxgen.bundle.js'
    ],
    html2canvas: [
      VENDOR + 'html2canvas.min.js',
      CDN_JS + 'html2canvas@1.4.1/dist/html2canvas.min.js',
      CDN_UNPKG + 'html2canvas@1.4.1/dist/html2canvas.min.js'
    ]
  };

  /* --------------------------- 内置配色回退 -------------------------- */
  /* PRESETS 不存在时（或 PRESETS.get 出错时）用这套映射，保证导出永远可用 */
  var BASE = {
    bg: 'FFFFFF', surface: 'F4F6FA', text: '141A24', muted: '5D6779',
    primary: '2B5CE6', accent: 'F2A03D', line: 'DDE2EA'
  };

  var PALETTES = {
    ink:     { bg: 'FFFFFF', surface: 'F4F5F7', text: '111318', muted: '5C6270', primary: '1F2937', accent: 'E8B04B', line: 'DFE3E8' },
    mono:    { bg: 'FBFBFB', surface: 'F1F1F2', text: '141414', muted: '6B6B6B', primary: '2A2A2A', accent: '8C8C8C', line: 'E0E0E0' },
    ocean:   { bg: 'FFFFFF', surface: 'EFF6FB', text: '0F2432', muted: '5A7286', primary: '0E6BA8', accent: 'F2B24C', line: 'D6E6F2' },
    forest:  { bg: 'FCFDFB', surface: 'EFF5EE', text: '14251C', muted: '5B7164', primary: '2E7D5B', accent: 'D9A05B', line: 'DCE8DF' },
    sunset:  { bg: 'FFFDFA', surface: 'FDF1E7', text: '2B1A12', muted: '7A5A48', primary: 'D4552B', accent: 'F0A63C', line: 'F0DED0' },
    sand:    { bg: 'FDFBF6', surface: 'F5EFE3', text: '2A2419', muted: '776A55', primary: '9A7B4F', accent: 'C9702F', line: 'E8DFCC' },
    berry:   { bg: 'FFFFFF', surface: 'FAEFF5', text: '2A1220', muted: '75566A', primary: 'A32C63', accent: 'E58F4E', line: 'EEDAE5' },
    slate:   { bg: 'FFFFFF', surface: 'F1F4F8', text: '182029', muted: '5C6875', primary: '3D5A80', accent: 'EE964B', line: 'DCE3EA' },
    plum:    { bg: 'FFFFFF', surface: 'F5F0FA', text: '221628', muted: '6E5B78', primary: '6B3FA0', accent: 'E0715C', line: 'E5DAF0' },
    navy:    { bg: 'FFFFFF', surface: 'EFF2F9', text: '101A33', muted: '56607A', primary: '1B3A6B', accent: 'D9A441', line: 'D8E0EF' },
    tide:    { bg: 'FFFFFF', surface: 'ECF6F5', text: '0F2A2A', muted: '557474', primary: '16736F', accent: 'E2A03F', line: 'D2E8E6' },
    grape:   { bg: 'FFFFFF', surface: 'F3F1FB', text: '1D1836', muted: '5F5A7A', primary: '4B3FB5', accent: 'EF7A5A', line: 'DFDBF2' }
  };

  var DARK_PALETTES = {
    midnight: { bg: '0E1117', surface: '1A212C', text: 'F2F5FA', muted: '9DA9BA', primary: '5B8CFF', accent: 'F2B24C', line: '2A3442' },
    carbon:   { bg: '141414', surface: '202020', text: 'F4F4F4', muted: 'A0A0A0', primary: 'D9D9D9', accent: 'E0B060', line: '2E2E2E' },
    night:    { bg: '0B1020', surface: '171E33', text: 'EEF2FB', muted: '94A0B8', primary: '7C9CFF', accent: 'F0A63C', line: '232C45' }
  };

  // fontId -> [标题字体, 正文字体]（必须是用户机器上常见的字体名，
  // 不能直接用 presets.js 里的 CSS 字体栈：栈首常是系统未安装的思源系列，
  // 写进 pptx 后 PowerPoint 只能做替换，效果不可控）
  var FONT_MAP = {
    'sans-cn':    ['Microsoft YaHei', 'Microsoft YaHei'],
    'serif-cn':   ['SimSun', 'Microsoft YaHei'],
    'kai-cn':     ['KaiTi', 'Microsoft YaHei'],
    'rounded-cn': ['Microsoft YaHei', 'Microsoft YaHei'],
    'mono-en':    ['Consolas', 'Consolas'],
    'song':       ['SimSun', 'Microsoft YaHei'],
    'kai':        ['KaiTi', 'Microsoft YaHei'],
    'hei':        ['Microsoft YaHei', 'Microsoft YaHei'],
    'mono':       ['Consolas', 'Consolas'],
    'serif':      ['Georgia', 'Georgia'],
    'sans':       ['Arial', 'Arial']
  };

  var GENERIC_FONT = /^(sans-serif|serif|system-ui|ui-sans-serif|ui-serif|ui-monospace|-apple-system|blinkmacsystemfont|inherit|initial|unset|monospace|"sans-serif"|"serif")$/i;

  /* ---------------------------- 颜色工具 ---------------------------- */
  function normHex(v) {
    if (v == null) return null;
    var s = String(v).trim();
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return h.toUpperCase();
    }
    var rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
    if (rgb) {
      return [1, 2, 3].map(function (i) {
        var n = Math.max(0, Math.min(255, parseInt(rgb[i], 10)));
        return (n < 16 ? '0' : '') + n.toString(16);
      }).join('').toUpperCase();
    }
    return null;
  }

  function toRgb(hex) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ];
  }

  function toHex(r, g, b) {
    return [r, g, b].map(function (n) {
      n = Math.max(0, Math.min(255, Math.round(n)));
      return (n < 16 ? '0' : '') + n.toString(16);
    }).join('').toUpperCase();
  }

  function mix(a, b, t) {
    var A = toRgb(a), B = toRgb(b);
    return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }

  function lum(hex) {
    var c = toRgb(hex).map(function (v) { return v / 255; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < String(s).length; i++) {
      h ^= String(s).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function paletteFor(theme) {
    theme = theme || {};
    var id = String(theme.paletteId || '').toLowerCase();
    var found = PALETTES[id] || DARK_PALETTES[id];
    if (found) return { colors: Object.assign({}, found), dark: !!DARK_PALETTES[id] };

    // 未知 id：按 hash 生成一套协调配色，避免和预设撞色又保证好看
    var h = hashStr(id || 'default') % 360;
    var dark = /dark|night|midnight|black|noir/.test(id);
    if (dark) {
      return {
        dark: true,
        colors: {
          bg: '0D1117', surface: '1A212C', text: 'F2F5FA', muted: '9AA6B8',
          primary: hslToHex(h, 68, 66), accent: hslToHex(h + 42, 74, 62), line: '2A3442'
        }
      };
    }
    return {
      dark: false,
      colors: {
        bg: 'FFFFFF',
        surface: mix('FFFFFF', hslToHex(h, 62, 92), 0.85),
        text: '141A24',
        muted: '5D6779',
        primary: hslToHex(h, 62, 42),
        accent: hslToHex(h + 38, 74, 52),
        line: mix('FFFFFF', hslToHex(h, 40, 86), 0.9)
      }
    };
  }

  /* ---------------------------- 主题解析 ---------------------------- */
  function pickPreset(theme) {
    var out = null;
    try {
      if (global.PRESETS && typeof global.PRESETS.get === 'function') {
        out = global.PRESETS.get(theme);
      }
    } catch (e) { out = null; }
    if (out && (out.palette || out.font)) return out;
    try {
      if (global.PPT && typeof global.PPT.resolve === 'function') {
        var r = global.PPT.resolve(theme);
        if (r) return r;
      }
    } catch (e) { /* ignore */ }
    return out || {};
  }

  function firstFamily(css) {
    if (!css) return '';
    var s = String(css).split(',')[0].trim().replace(/^["']|["']$/g, '');
    return s;
  }

  function pptFont(css, fallback) {
    var f = firstFamily(css);
    if (!f) return fallback;
    if (GENERIC_FONT.test(f)) return fallback;
    if (/^(sans|serif|mono)$/i.test(f)) return fallback;
    return f;
  }

  function resolveTheme(theme) {
    theme = theme || {};
    var preset = pickPreset(theme) || {};
    var palette = preset.palette || null;
    var colors = (palette && palette.colors) || null;

    var base = paletteFor(theme);
    var c = {
      bg:      normHex(colors && colors.bg)      || base.colors.bg,
      surface: normHex(colors && colors.surface) || base.colors.surface,
      text:    normHex(colors && colors.text)    || base.colors.text,
      muted:   normHex(colors && colors.muted)   || base.colors.muted,
      primary: normHex(colors && colors.primary) || base.colors.primary,
      accent:  normHex(colors && colors.accent)  || base.colors.accent,
      line:    normHex(colors && colors.line)    || base.colors.line
    };
    // 让对比度不至于崩：文字与背景太接近时纠偏
    if (Math.abs(lum(c.text) - lum(c.bg)) < 0.18) {
      c.text = lum(c.bg) > 0.5 ? '141A24' : 'F5F8FC';
    }
    if (Math.abs(lum(c.primary) - lum(c.bg)) < 0.1) {
      c.primary = lum(c.bg) > 0.5 ? mix(c.primary, '000000', 0.45) : mix(c.primary, 'FFFFFF', 0.45);
    }

    var fmap = FONT_MAP[String(theme.fontId || '').toLowerCase()] || null;
    var font = preset.font || {};
    // 已知 fontId 走内置映射（保证是常见系统字体）；未知 id 才去解析 CSS 字体栈
    var heading = fmap ? fmap[0] : pptFont(font.heading, 'Microsoft YaHei');
    var body = fmap ? fmap[1] : pptFont(font.body, 'Microsoft YaHei');

    var dark = lum(c.bg) < 0.42;
    return {
      colors: c,
      dark: dark,
      fontHeading: heading,
      fontBody: body,
      styleId: (preset.style && preset.style.id) || theme.styleId || 'default',
      // 派生色：装饰块 / 浅色分隔线 / 序号底色
      softPrimary: mix(c.primary, c.bg, dark ? 0.55 : 0.86),
      softAccent: mix(c.accent, c.bg, dark ? 0.6 : 0.84),
      onPrimary: lum(c.primary) > 0.58 ? '141A24' : 'FFFFFF'
    };
  }

  /* ---------------------------- 脚本加载 ---------------------------- */
  var scriptCache = {};

  function loadScript(urls, label) {
    var key = label || urls[0];
    if (scriptCache[key]) return scriptCache[key];
    var p = new Promise(function (resolve, reject) {
      var i = 0;
      (function next() {
        if (i >= urls.length) {
          reject(new Error('无法加载 ' + (label || urls[0]) + '（本地与 CDN 均失败）'));
          return;
        }
        var url = urls[i++];
        var s = document.createElement('script');
        var finished = false;
        function fail() {
          if (finished) return;
          finished = true;
          try { if (s.parentNode) s.parentNode.removeChild(s); } catch (e) {}
          next();
        }
        s.src = url;
        s.async = true;
        s.onload = function () { if (!finished) { finished = true; resolve(url); } };
        s.onerror = fail;
        setTimeout(fail, 20000);
        document.head.appendChild(s);
      })();
    });
    scriptCache[key] = p;
    p['catch'](function () { delete scriptCache[key]; });
    return p;
  }

  async function ensurePptxGen() {
    if (global.PptxGenJS) return global.PptxGenJS;
    try {
      await loadScript(LIB_URLS.pptxgen, 'pptxgen');
    } catch (e) {
      throw new Error('导出失败：没能加载 PptxGenJS（请确认 vendor/pptxgen.js 存在，或网络可用）');
    }
    if (!global.PptxGenJS) {
      throw new Error('导出失败：PptxGenJS 未注册全局对象（vendor/pptxgen.js 可能损坏）');
    }
    return global.PptxGenJS;
  }

  async function ensureHtml2Canvas() {
    if (global.html2canvas) return global.html2canvas;
    try {
      await loadScript(LIB_URLS.html2canvas, 'html2canvas');
    } catch (e) {
      throw new Error('图片版导出需要 html2canvas（vendor/html2canvas.min.js 缺失且 CDN 不可用）');
    }
    if (!global.html2canvas) throw new Error('图片版导出需要 html2canvas，但没有找到');
    return global.html2canvas;
  }

  /* ---------------------------- 文本工具 ---------------------------- */
  function asText(v) {
    if (v == null) return '';
    return String(v).replace(/\r\n?/g, '\n').trim();
  }

  /* 逐条递减字号：>=7 条 14pt，5–6 条 16pt，<=4 条 18pt（SPEC 要求） */
  function bulletsFontSize(n) {
    if (n >= 7) return 14;
    if (n >= 5) return 16;
    return 18;
  }

  /* 超出一屏能容纳的条目：保留前 N 条 + 汇总行，避免 pptx 溢出 */
  function fitBullets(list, maxLines) {
    var arr = (list || []).map(asText).filter(function (s) { return s; });
    if (arr.length <= maxLines) return { items: arr, extra: 0 };
    var keep = arr.slice(0, maxLines);
    return { items: keep, extra: arr.length - maxLines };
  }

  function sanitizeName(s) {
    return String(s || '')
      .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[.\s]+|[.\s]+$/g, '')
      .slice(0, 80)
      .trim();
  }

  function filenameFor(deck, opts) {
    if (opts && opts.filename) {
      var f = sanitizeName(String(opts.filename).replace(/\.pptx$/i, ''));
      if (!f) f = sanitizeName(deck && deck.title) || '演示文稿';
      return f + '.pptx';
    }
    var t = sanitizeName(deck && deck.title) || sanitizeName(deck && deck.subtitle) || '演示文稿';
    return t + '.pptx';
  }

  /* =====================================================================
   *  native 模式：逐页生成可编辑幻灯片
   * ===================================================================== */

  function addBg(slide, hex) {
    try { slide.background = { color: hex }; } catch (e) { /* ignore */ }
    try { slide.bkgd = hex; } catch (e) { /* ignore */ }
  }

  function shape(pptx, slide, type, opts) {
    try {
      slide.addShape(type, opts);
    } catch (e) {
      // 极少数旧版本没有该形状，退化成矩形
      try { slide.addShape(pptx.ShapeType.rect, opts); } catch (e2) { /* ignore */ }
    }
  }

  function text(slide, str, opts) {
    opts = opts || {};
    if (!opts.margin) opts.margin = 0;
    slide.addText(String(str == null ? '' : str), opts);
  }

  /* --- 通用页眉 --- */
  function header(pptx, slide, s, T, accentBar) {
    var title = asText(s.title);
    if (title) {
      text(slide, title, {
        x: px(84), y: px(52), w: px(1112), h: px(80),
        fontFace: T.fontHeading, fontSize: 28, bold: true, color: T.colors.text,
        valign: 'middle', align: 'left', fit: 'shrink', breakLine: false
      });
    }
    if (accentBar !== false) {
      shape(pptx, slide, pptx.ShapeType.rect, {
        x: px(84), y: px(140), w: px(64), h: px(6),
        fill: { color: T.colors.accent }, line: { color: T.colors.accent, width: 0 }
      });
    }
  }

  /* --- 页脚页码 --- */
  function footer(slide, idx, total, T) {
    try {
      text(slide, String(idx + 1) + ' / ' + total, {
        x: px(1040), y: px(664), w: px(156), h: px(28),
        fontFace: T.fontBody, fontSize: 9, color: T.colors.muted, align: 'right', valign: 'middle'
      });
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------ cover ------------------------------ */
  function renderCover(pptx, s, T, idx) {
    var slide = pptx.addSlide();
    addBg(slide, T.colors.bg);

    // 装饰：右上大圆（带透明度）+ 左下强调条 + 顶部细线
    shape(pptx, slide, pptx.ShapeType.ellipse, {
      x: px(880), y: px(-170), w: px(560), h: px(560),
      fill: { color: T.softPrimary, transparency: 25 },
      line: { color: T.softPrimary, width: 0 }
    });
    shape(pptx, slide, pptx.ShapeType.ellipse, {
      x: px(1010), y: px(430), w: px(180), h: px(180),
      fill: { color: T.softAccent, transparency: 35 },
      line: { color: T.softAccent, width: 0 }
    });
    shape(pptx, slide, pptx.ShapeType.rect, {
      x: px(84), y: px(226), w: px(120), h: px(10),
      fill: { color: T.colors.accent }, line: { color: T.colors.accent, width: 0 }
    });

    var title = asText(s.title) || asText(s.subtitle) || '未命名演示';
    text(slide, title, {
      x: px(84), y: px(262), w: px(780), h: px(174),
      fontFace: T.fontHeading, fontSize: 40, bold: true, color: T.colors.text,
      valign: 'top', align: 'left', fit: 'shrink', lineSpacingMultiple: 1.06
    });

    var sub = asText(s.subtitle);
    if (sub) {
      text(slide, sub, {
        x: px(86), y: px(446), w: px(720), h: px(64),
        fontFace: T.fontBody, fontSize: 18, color: T.colors.muted,
        valign: 'top', align: 'left', fit: 'shrink'
      });
    }

    var meta = [];
    var m = (s.meta || {}).grade ? '' : '';
    if (s.meta) {
      if (s.meta.grade) meta.push(s.meta.grade);
      if (s.meta.subject) meta.push(s.meta.subject);
      if (s.meta.minutes) meta.push(s.meta.minutes + ' 分钟');
    }
    var metaStr = meta.join('  ·  ');
    if (!metaStr && s.footer) metaStr = asText(s.footer);
    if (metaStr) {
      text(slide, metaStr, {
        x: px(86), y: px(556), w: px(640), h: px(36),
        fontFace: T.fontBody, fontSize: 12, color: T.colors.muted,
        valign: 'middle', align: 'left'
      });
    }
    return slide;
  }

  /* ----------------------------- section ----------------------------- */
  function renderSection(pptx, s, T, idx) {
    var slide = pptx.addSlide();
    addBg(slide, T.colors.bg);

    var num = s.number != null && s.number !== '' ? String(s.number) : (idx + 1 < 10 ? '0' + (idx + 1) : String(idx + 1));
    if (/^\d+$/.test(num) && num.length === 1) num = '0' + num;

    text(slide, num, {
      x: px(84), y: px(170), w: px(420), h: px(190),
      fontFace: T.fontHeading, fontSize: 96, bold: true, color: T.colors.primary,
      align: 'left', valign: 'middle', fit: 'shrink'
    });
    shape(pptx, slide, pptx.ShapeType.rect, {
      x: px(90), y: px(372), w: px(150), h: px(6),
      fill: { color: T.colors.accent }, line: { color: T.colors.accent, width: 0 }
    });

    var title = asText(s.title);
    if (title) {
      text(slide, title, {
        x: px(84), y: px(400), w: px(900), h: px(96),
        fontFace: T.fontHeading, fontSize: 34, bold: true, color: T.colors.text,
        align: 'left', valign: 'middle', fit: 'shrink'
      });
    }
    var sub = asText(s.subtitle);
    if (sub) {
      text(slide, sub, {
        x: px(86), y: px(504), w: px(820), h: px(56),
        fontFace: T.fontBody, fontSize: 16, color: T.colors.muted,
        align: 'left', valign: 'top', fit: 'shrink'
      });
    }
    // 右侧装饰竖条
    shape(pptx, slide, pptx.ShapeType.rect, {
      x: px(1156), y: px(170), w: px(10), h: px(380),
      fill: { color: T.softPrimary }, line: { color: T.softPrimary, width: 0 }
    });
    return slide;
  }

  /* ----------------------------- bullets ----------------------------- */
  function renderBullets(pptx, s, T, idx, total) {
    var slide = pptx.addSlide();
    addBg(slide, T.colors.bg);
    header(pptx, slide, s, T);

    var res = fitBullets(s.bullets, 13);
    var items = res.items;
    if (!items.length && s.subtitle) items = [asText(s.subtitle)];
    var fs = bulletsFontSize(items.length);
    if (res.extra > 0) items.push('……另有 ' + res.extra + ' 条（可在编辑模式补充）');

    var runs = items.map(function (t, i) {
      return {
        text: t,
        options: {
          bullet: { code: '2022', indent: 18 },
          breakLine: i < items.length - 1,
          color: (res.extra > 0 && i === items.length - 1) ? T.colors.muted : T.colors.text,
          fontSize: (res.extra > 0 && i === items.length - 1) ? Math.max(11, fs - 2) : fs
        }
      };
    });

    if (runs.length) {
      slide.addText(runs, {
        x: px(84), y: px(190), w: px(1112), h: px(430),
        fontFace: T.fontBody, color: T.colors.text, fontSize: fs,
        valign: 'top', align: 'left', fit: 'shrink',
        lineSpacingMultiple: 1.16, paraSpaceAfter: 8, margin: 0
      });
    }
    footer(slide, idx, total, T);
    return slide;
  }

  /* ----------------------------- two-col ----------------------------- */
  function renderTwoCol(pptx, s, T, idx, total) {
    var slide = pptx.addSlide();
    addBg(slide, T.colors.bg);
    header(pptx, slide, s, T);

    var cols = Array.isArray(s.columns) ? s.columns.slice(0, 2) : [];
    if (!cols.length) {
      // 退化：把 bullets 平分两栏
      var b = (s.bullets || []).slice();
      cols = [
        { title: '要点', items: b.slice(0, Math.ceil(b.length / 2)) },
        { title: '要点', items: b.slice(Math.ceil(b.length / 2)) }
      ];
    }
    while (cols.length < 2) cols.push({ title: '', items: [] });

    var geo = [
      { x: px(84), w: px(536) },
      { x: px(660), w: px(536) }
    ];

    cols.forEach(function (col, i) {
      var g = geo[i];
      var cardH = px(430), cardY = px(200);
      shape(pptx, slide, pptx.ShapeType.roundRect, {
        x: g.x, y: cardY, w: g.w, h: cardH,
        rectRadius: 0.06,
        fill: { color: T.colors.surface },
        line: { color: T.colors.line, width: 1 }
      });

      var ct = asText(col && col.title) || ('第 ' + (i + 1) + ' 栏');
      text(slide, ct, {
        x: g.x + px(26), y: cardY + px(22), w: g.w - px(52), h: px(44),
        fontFace: T.fontHeading, fontSize: 18, bold: true, color: T.colors.primary,
        valign: 'middle', align: 'left', fit: 'shrink'
      });
      shape(pptx, slide, pptx.ShapeType.rect, {
        x: g.x + px(26), y: cardY + px(70), w: px(40), h: px(4),
        fill: { color: T.colors.accent }, line: { color: T.colors.accent, width: 0 }
      });

      var items = ((col && col.items) || []).map(asText).filter(function (x) { return x; });
      var fs = bulletsFontSize(items.length) - 2;
      if (fs < 11) fs = 11;
      if (items.length) {
        var runs = items.map(function (t, k) {
          return {
            text: t,
            options: {
              bullet: { code: '2022', indent: 16 },
              breakLine: k < items.length - 1,
              color: T.colors.text, fontSize: fs
            }
          };
        });
        slide.addText(runs, {
          x: g.x + px(26), y: cardY + px(96), w: g.w - px(52), h: cardH - px(124),
          fontFace: T.fontBody, color: T.colors.text, fontSize: fs,
          valign: 'top', align: 'left', fit: 'shrink',
          lineSpacingMultiple: 1.14, paraSpaceAfter: 6, margin: 0
        });
      }
    });

    footer(slide, idx, total, T);
    return slide;
  }

  /* ------------------------------ image ------------------------------ */
  function renderImage(pptx, s, T, idx, total) {
    var slide = pptx.addSlide();
    addBg(slide, T.colors.bg);

    var title = asText(s.title);
    if (title) {
      text(slide, title, {
        x: px(84), y: px(40), w: px(1112), h: px(64),
        fontFace: T.fontHeading, fontSize: 24, bold: true, color: T.colors.text,
        valign: 'middle', align: 'left', fit: 'shrink'
      });
    }

    var top = title ? px(128) : px(56);
    var areaH = title ? px(430) : px(520);
    var img = s.image || {};
    var src = typeof img === 'string' ? img : img.src;
    var caption = asText(typeof img === 'string' ? (s.caption || '') : (img.caption || s.caption || ''));
    var areaY = top + (title ? px(6) : px(10));

    if (src) {
      var pad = px(40);
      var boxW = px(1200) - pad * 2;
      var boxH = areaH;
      try {
        slide.addImage({
          data: src,
          x: px(40) + pad,
          y: areaY,
          w: boxW,
          h: boxH,
          sizing: { type: 'contain', w: boxW, h: boxH }
        });
      } catch (e) {
        // 图片数据异常时给个占位，别让整份导出失败
        shape(pptx, slide, pptx.ShapeType.roundRect, {
          x: px(360), y: areaY + px(60), w: px(560), h: px(280),
          rectRadius: 0.08, fill: { color: T.colors.surface }, line: { color: T.colors.line, width: 1 }
        });
        text(slide, '（图片无法嵌入）', {
          x: px(360), y: areaY + px(180), w: px(560), h: px(48),
          fontFace: T.fontBody, fontSize: 14, color: T.colors.muted, align: 'center', valign: 'middle'
        });
      }
    } else {
      shape(pptx, slide, pptx.ShapeType.roundRect, {
        x: px(360), y: areaY + px(60), w: px(560), h: px(280),
        rectRadius: 0.08, fill: { color: T.colors.surface }, line: { color: T.colors.line, width: 1 }
      });
      text(slide, '（未提供图片）', {
        x: px(360), y: areaY + px(180), w: px(560), h: px(48),
        fontFace: T.fontBody, fontSize: 14, color: T.colors.muted, align: 'center', valign: 'middle'
      });
    }

    if (caption) {
      text(slide, caption, {
        x: px(84), y: px(610), w: px(1112), h: px(60),
        fontFace: T.fontBody, fontSize: 12, color: T.colors.muted,
        align: 'center', valign: 'top', fit: 'shrink'
      });
    }
    footer(slide, idx, total, T);
    return slide;
  }

  /* ------------------------------ quote ------------------------------ */
  function renderQuote(pptx, s, T, idx, total) {
    var slide = pptx.addSlide();
    addBg(slide, T.colors.bg);

    // 背景块 + 引号
    shape(pptx, slide, pptx.ShapeType.roundRect, {
      x: px(84), y: px(140), w: px(1112), h: px(420),
      rectRadius: 0.05, fill: { color: T.colors.surface }, line: { color: T.colors.line, width: 0 }
    });
    shape(pptx, slide, pptx.ShapeType.rect, {
      x: px(84), y: px(140), w: px(10), h: px(420),
      fill: { color: T.colors.accent }, line: { color: T.colors.accent, width: 0 }
    });

    text(slide, '“', {
      x: px(120), y: px(150), w: px(160), h: px(140),
      fontFace: 'Georgia', fontSize: 96, bold: true, color: T.softPrimary,
      align: 'left', valign: 'top'
    });

    var q = asText(s.quote) || asText(s.title);
    text(slide, q, {
      x: px(170), y: px(240), w: px(950), h: px(220),
      fontFace: T.fontHeading, fontSize: 26, color: T.colors.text,
      align: 'center', valign: 'middle', fit: 'shrink', lineSpacingMultiple: 1.22
    });

    var author = asText(s.author) || asText(s.subtitle);
    if (author) {
      shape(pptx, slide, pptx.ShapeType.rect, {
        x: px(590), y: px(486), w: px(100), h: px(4),
        fill: { color: T.colors.accent }, line: { color: T.colors.accent, width: 0 }
      });
      text(slide, '—— ' + author, {
        x: px(170), y: px(502), w: px(950), h: px(42),
        fontFace: T.fontBody, fontSize: 14, color: T.colors.muted,
        align: 'center', valign: 'middle'
      });
    }
    footer(slide, idx, total, T);
    return slide;
  }

  /* ------------------------------ stats ------------------------------ */
  function renderStats(pptx, s, T, idx, total) {
    var slide = pptx.addSlide();
    addBg(slide, T.colors.bg);

    var title = asText(s.title);
    if (title) {
      text(slide, title, {
        x: px(84), y: px(50), w: px(1112), h: px(70),
        fontFace: T.fontHeading, fontSize: 26, bold: true, color: T.colors.text,
        align: 'left', valign: 'middle', fit: 'shrink'
      });
    }

    var stats = Array.isArray(s.stats) ? s.stats.slice(0, 8) : [];
    if (!stats.length) stats = [{ value: '—', label: asText(s.subtitle) || '暂无数据' }];

    var n = stats.length;
    var oneRow = n <= 4;
    var cols = oneRow ? n : Math.ceil(n / 2);
    if (cols > 4) cols = 4;
    var rows = Math.ceil(n / cols);

    var totalW = px(1112), gap = px(20);
    var cardW = (totalW - gap * (cols - 1)) / cols;
    var topY = title ? px(160) : px(110);
    var availH = px(672) - topY;
    var cardH = (availH - gap * (rows - 1)) / rows;

    stats.forEach(function (st, i) {
      var r = Math.floor(i / cols), c = i % cols;
      var x = px(84) + c * (cardW + gap);
      var y = topY + r * (cardH + gap);
      shape(pptx, slide, pptx.ShapeType.roundRect, {
        x: x, y: y, w: cardW, h: cardH, rectRadius: 0.06,
        fill: { color: T.colors.surface }, line: { color: T.colors.line, width: 1 }
      });
      shape(pptx, slide, pptx.ShapeType.rect, {
        x: x + px(24), y: y + px(26), w: px(36), h: px(4),
        fill: { color: T.colors.accent }, line: { color: T.colors.accent, width: 0 }
      });
      text(slide, asText(st && st.value), {
        x: x + px(16), y: y + cardH * 0.28, w: cardW - px(32), h: cardH * 0.36,
        fontFace: T.fontHeading, fontSize: Math.min(46, Math.max(24, Math.round(cardH / (cardH > 200 ? 4.2 : 5.6)))),
        bold: true, color: T.colors.primary, align: 'center', valign: 'middle', fit: 'shrink'
      });
      text(slide, asText(st && st.label), {
        x: x + px(16), y: y + cardH * 0.66, w: cardW - px(32), h: cardH * 0.26,
        fontFace: T.fontBody, fontSize: 12, color: T.colors.muted,
        align: 'center', valign: 'top', fit: 'shrink'
      });
    });

    footer(slide, idx, total, T);
    return slide;
  }

  /* ------------------------------ list ------------------------------- */
  function renderList(pptx, s, T, idx, total) {
    var slide = pptx.addSlide();
    addBg(slide, T.colors.bg);
    header(pptx, slide, s, T);

    var items = (s.bullets || s.items || []).map(asText).filter(function (x) { return x; });
    if (!items.length) items = [asText(s.subtitle) || '暂无内容'];

    var maxShow = 8;
    var extra = 0;
    if (items.length > maxShow) { extra = items.length - maxShow; items = items.slice(0, maxShow); }

    var top = px(196), bottom = px(664);
    var step = Math.min(px(64), (bottom - top) / Math.max(items.length, 1));
    var d = px(34);
    var fs = Math.min(17, Math.max(12, Math.round(step / px(64) * 15)));
    if (items.length <= 4) fs = 17;

    items.forEach(function (t, i) {
      var y = top + i * step;
      shape(pptx, slide, pptx.ShapeType.ellipse, {
        x: px(84), y: y + (step - d) / 2, w: d, h: d,
        fill: { color: T.colors.primary }, line: { color: T.colors.primary, width: 0 }
      });
      text(slide, String(i + 1), {
        x: px(84), y: y + (step - d) / 2, w: d, h: d,
        fontFace: T.fontBody, fontSize: 12, bold: true, color: T.onPrimary,
        align: 'center', valign: 'middle'
      });
      text(slide, t, {
        x: px(84) + d + px(20), y: y, w: px(1060) - d, h: step,
        fontFace: T.fontBody, fontSize: fs, color: T.colors.text,
        align: 'left', valign: 'middle', fit: 'shrink'
      });
    });

    if (extra > 0) {
      text(slide, '……另有 ' + extra + ' 条', {
        x: px(84), y: top + items.length * step, w: px(600), h: px(28),
        fontFace: T.fontBody, fontSize: 11, color: T.colors.muted, valign: 'middle'
      });
    }
    footer(slide, idx, total, T);
    return slide;
  }

  /* ------------------------------- end ------------------------------- */
  function renderEnd(pptx, s, T, idx, total) {
    var slide = pptx.addSlide();
    addBg(slide, T.colors.bg);

    shape(pptx, slide, pptx.ShapeType.ellipse, {
      x: px(430), y: px(-80), w: px(420), h: px(420),
      fill: { color: T.softPrimary, transparency: 30 }, line: { color: T.softPrimary, width: 0 }
    });

    text(slide, asText(s.title) || '谢谢', {
      x: px(0), y: px(250), w: px(1280), h: px(120),
      fontFace: T.fontHeading, fontSize: 56, bold: true, color: T.colors.text,
      align: 'center', valign: 'middle', fit: 'shrink'
    });
    var sub = asText(s.subtitle);
    if (sub) {
      text(slide, sub, {
        x: px(140), y: px(376), w: px(1000), h: px(56),
        fontFace: T.fontBody, fontSize: 18, color: T.colors.muted,
        align: 'center', valign: 'top', fit: 'shrink'
      });
    }
    shape(pptx, slide, pptx.ShapeType.rect, {
      x: px(590), y: px(452), w: px(100), h: px(5),
      fill: { color: T.colors.accent }, line: { color: T.colors.accent, width: 0 }
    });
    return slide;
  }

  var RENDERERS = {
    cover: renderCover,
    section: renderSection,
    bullets: renderBullets,
    'two-col': renderTwoCol,
    image: renderImage,
    quote: renderQuote,
    stats: renderStats,
    list: renderList,
    end: renderEnd
  };

  function renderNative(pptx, deck, T) {
    var slides = (deck && deck.slides) || [];
    if (!slides.length) throw new Error('没有可导出的内容：deck.slides 为空');
    var total = slides.length;

    slides.forEach(function (s, i) {
      s = s || {};
      var fn = RENDERERS[s.type] || renderBullets;
      var slide;
      try {
        slide = fn(pptx, s, T, i, total);
      } catch (e) {
        // 单页失败 → 用 bullets 兜底，整体不中断
        slide = renderBullets(pptx, {
          type: 'bullets',
          title: asText(s.title) || '第 ' + (i + 1) + ' 页',
          bullets: [asText(s.subtitle) || '（本页内容无法渲染）']
        }, T, i, total);
      }
      var notes = asText(s.notes);
      if (notes && slide && typeof slide.addNotes === 'function') {
        try { slide.addNotes(notes.replace(/\n{2,}/g, '\n')); } catch (e) { /* ignore */ }
      }
    });
    return total;
  }

  /* =====================================================================
   *  image 模式：把每页渲染成图片铺满整页（像素级还原，不可编辑）
   * ===================================================================== */

  function nextFrame() {
    return new Promise(function (resolve) {
      var done = false;
      function go() { if (!done) { done = true; resolve(); } }
      try {
        requestAnimationFrame(function () { requestAnimationFrame(go); });
      } catch (e) { /* ignore */ }
      setTimeout(go, 120);
    });
  }

  async function waitFonts() {
    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1500); })]);
      }
    } catch (e) { /* ignore */ }
  }

  function forceVisible(el) {
    var st = el.style;
    st.opacity = '1';
    st.visibility = 'visible';
    st.transform = 'none';
    st.animation = 'none';
    st.transition = 'none';
    st.filter = 'none';
    st.width = STAGE_W + 'px';
    st.height = STAGE_H + 'px';
    st.maxWidth = 'none';
    st.maxHeight = 'none';
    st.margin = '0';
    st.position = 'relative';
    st.left = '0';
    st.top = '0';
    el.classList.add('is-active');
  }

  async function shoot(el, h2c, bg, scale) {
    var opts = {
      scale: scale,
      width: STAGE_W,
      height: STAGE_H,
      windowWidth: STAGE_W,
      windowHeight: STAGE_H,
      backgroundColor: '#' + bg,
      logging: false,
      useCORS: true,
      allowTaint: true,
      imageTimeout: 8000,
      removeContainer: true
    };
    try {
      return await h2c(el, opts);
    } catch (e) {
      // 二次尝试：部分环境不允许 allowTaint
      opts.allowTaint = false;
      return await h2c(el, opts);
    }
  }

  async function renderShots(deck, theme, T, opts) {
    var PPT = global.PPT;
    var slides = (deck && deck.slides) || [];
    if (!slides.length) throw new Error('没有可导出的内容：deck.slides 为空');

    var canThumb = PPT && typeof PPT.renderThumb === 'function';
    var canDeck = PPT && typeof PPT.renderDeck === 'function';
    if (!canThumb && !canDeck) {
      throw new Error('图片版导出需要 PPT 渲染模块（render.js），当前页面没有加载');
    }
    var h2c = await ensureHtml2Canvas();
    await waitFonts();

    var scale = Math.max(1, Math.min(3, Number(opts && opts.scale) || 1.5));
    var host = document.createElement('div');
    host.setAttribute('data-pp-export', 'image');
    host.style.cssText =
      'position:fixed;left:-20000px;top:0;z-index:-1;pointer-events:none;' +
      'width:' + STAGE_W + 'px;height:' + STAGE_H + 'px;overflow:hidden;' +
      'background:#' + T.colors.bg + ';';
    document.body.appendChild(host);

    var canvasList = [];
    try {
      if (canThumb) {
        for (var i = 0; i < slides.length; i++) {
          host.innerHTML = '';
          var box = document.createElement('div');
          box.style.cssText = 'position:relative;width:' + STAGE_W + 'px;height:' + STAGE_H + 'px;overflow:hidden;background:#' + T.colors.bg + ';';
          host.appendChild(box);
          try {
            PPT.renderThumb(box, slides[i], deck, theme);
          } catch (e) {
            box.innerHTML = '<div style="font:16px sans-serif;color:#888;padding:40px">第 ' + (i + 1) + ' 页渲染失败</div>';
          }
          await nextFrame();
          // renderThumb 可能把内容按 scale 缩小，这里统一强制成 1280×720 并可见
          var direct = box.querySelector('.slide');
          if (direct) { forceVisible(direct); direct.style.position = 'relative'; }
          else { forceVisible(box); }
          canvasList.push(await shoot(direct || box, h2c, T.colors.bg, scale));
        }
      } else {
        PPT.renderDeck(host, deck, theme, { export: true });
        await nextFrame();
        var nodes = host.querySelectorAll('.slide');
        if (!nodes.length) throw new Error('图片版导出失败：渲染模块没有输出 .slide 节点');
        for (var k = 0; k < nodes.length; k++) {
          var el = nodes[k];
          forceVisible(el);
          await nextFrame();
          canvasList.push(await shoot(el, h2c, T.colors.bg, scale));
        }
      }
    } finally {
      try { host.parentNode.removeChild(host); } catch (e) { /* ignore */ }
    }

    if (!canvasList.length) throw new Error('图片版导出失败：没有渲染出任何页面');
    return canvasList;
  }

  function renderImageDeck(pptx, canvasList, deck) {
    var slides = (deck && deck.slides) || [];
    canvasList.forEach(function (cv, i) {
      var slide = pptx.addSlide();
      var data;
      try { data = cv.toDataURL(JPQ, 0.92); }
      catch (e) { data = cv.toDataURL('image/png'); }
      slide.addImage({ data: data, x: 0, y: 0, w: PAGE_W, h: PAGE_H });
      // 图片版页面本身不可编辑，但演讲者备注仍然保留
      var note = asText(slides[i] && slides[i].notes);
      if (note) { try { slide.addNotes(note); } catch (e) { /* ignore */ } }
    });
    return canvasList.length;
  }

  /* =====================================================================
   *  对外 API
   * ===================================================================== */

  async function toPptx(deck, theme, opts) {
    opts = opts || {};
    var mode = opts.mode === 'image' ? 'image' : 'native';
    if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
      throw new Error('导出失败：演示文稿是空的（deck.slides 为空）');
    }

    var T = resolveTheme(theme);
    var PptxGenJS = await ensurePptxGen();

    var pptx = new PptxGenJS();
    try { pptx.layout = 'LAYOUT_16x9'; } catch (e) { /* ignore */ }
    pptx.author = 'AI 课件工坊';
    pptx.company = 'AI 课件工坊';
    pptx.title = asText(deck.title) || '演示文稿';
    pptx.subject = asText(deck.subtitle) || '';
    if (typeof pptx.theme === 'object' && pptx.theme) {
      try {
        pptx.theme.headFontFace = T.fontHeading;
        pptx.theme.bodyFontFace = T.fontBody;
      } catch (e) { /* ignore */ }
    }

    var count;
    if (mode === 'image') {
      var canvasList = await renderShots(deck, theme, T, opts);
      count = renderImageDeck(pptx, canvasList, deck);
    } else {
      count = renderNative(pptx, deck, T);
    }

    var blob;
    try {
      blob = await pptx.write({ outputType: 'blob' });
    } catch (e) {
      try {
        var buf = await pptx.write({ outputType: 'arraybuffer' });
        blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      } catch (e2) {
        throw new Error('导出失败：生成 pptx 文件时出错（' + ((e2 && e2.message) || (e && e.message) || '未知错误') + '）');
      }
    }

    var PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (!(blob instanceof Blob)) {
      blob = new Blob([blob], { type: PPTX_MIME });
    } else if (blob.type !== PPTX_MIME) {
      // PptxGenJS 的 blob 类型是 application/zip；补上 pptx 的 MIME，
      // 下载提示、拖进邮件附件、系统「打开方式」都更准确
      try { blob = new Blob([blob], { type: PPTX_MIME }); } catch (e) { /* 保留原 blob */ }
    }
    if (!blob || !blob.size) throw new Error('导出失败：生成的文件为空');

    return {
      blob: blob,
      filename: filenameFor(deck, opts),
      size: blob.size,
      slides: count,
      mode: mode
    };
  }

  function printPdf() {
    if (typeof global.print !== 'function') {
      throw new Error('当前环境不支持打印');
    }
    try { document.documentElement.classList.add('pp-printing'); } catch (e) { /* ignore */ }
    try { document.body.classList.add('pp-printing'); } catch (e) { /* ignore */ }

    var cleanup = function () {
      try { document.documentElement.classList.remove('pp-printing'); } catch (e) {}
      try { document.body.classList.remove('pp-printing'); } catch (e) {}
      try { global.removeEventListener('afterprint', cleanup); } catch (e) {}
    };
    try { global.addEventListener('afterprint', cleanup); } catch (e) { /* ignore */ }

    // 让打印样式先生效，再唤起打印
    setTimeout(function () {
      global.print();
      setTimeout(cleanup, 1500);
    }, 60);
  }

  function download(result) {
    if (!result || !result.blob) throw new Error('没有可下载的文件');
    var url = URL.createObjectURL(result.blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = result.filename || '演示文稿.pptx';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { document.body.removeChild(a); } catch (e) {}
      try { URL.revokeObjectURL(url); } catch (e) {}
    }, 1500);
    return result.filename;
  }

  global.EXPORTER = {
    version: '1.0.0',
    toPptx: toPptx,
    printPdf: printPdf,
    download: download,
    filenameFor: filenameFor,
    resolveTheme: resolveTheme,
    /* 预加载依赖，减少第一次点击导出的等待 */
    preload: function (mode) {
      var jobs = [ensurePptxGen()];
      if (mode === 'image') jobs.push(ensureHtml2Canvas());
      return Promise.all(jobs);
    },
    _libUrls: LIB_URLS,
    _vendorBase: VENDOR
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[EXPORTER] ready, vendor =', VENDOR);
  }
})(typeof window !== 'undefined' ? window : this);
