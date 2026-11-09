/* =========================================================================
 * assets/files.js  ——  文件解析模块（纯浏览器，无构建）
 * 依赖：JSZip / mammoth / pdfjs（优先 vendor/ 本地，缺失回退 CDN）
 * 暴露：window.FILES.read(FileList|File[]) -> Promise<entry[]>
 *       window.FILES.humanSize(bytes) -> "1.2 MB"
 *
 * entry = {
 *   name, size, mime, kind, ext,
 *   text?,      // 纯文本内容，截断到 200,000 字符（kind: text/pdf/docx/pptx）
 *   dataUrl?,   // 图片主图（最长边 <= 1600 的 jpeg）  （kind: image）
 *   thumb?,     // 缩略图 dataURL（宽度 <= 480）        （kind: image/video）
 *   width?, height?,   // 图片像素尺寸
 *   truncated?, // 文本被截断
 *   oversized?, // 文件 > 50MB，仅记录了元信息
 *   error?      // 解析失败时的中文说明（此时 kind 通常为 "other"）
 * }
 * ========================================================================= */
(function (global) {
  'use strict';

  /* ------------------------------ 常量 ------------------------------ */
  var TEXT_LIMIT = 200000;              // 单文件文本上限
  var BIG_FILE   = 50 * 1024 * 1024;    // 50MB 保护
  var IMAGE_MAX  = 1600;                // 图片主图最长边
  var THUMB_MAX  = 480;                 // 缩略图最长边（即宽度上限）
  var VIDEO_TIMEOUT = 6000;             // 抓首帧超时

  var TEXT_EXT = {
    txt: 1, md: 1, markdown: 1, csv: 1, tsv: 1, json: 1, html: 1, htm: 1,
    xml: 1, js: 1, css: 1, yaml: 1, yml: 1, ini: 1, log: 1, srt: 1, vtt: 1
  };
  var IMG_EXT = { jpg: 1, jpeg: 1, png: 1, webp: 1, gif: 1, bmp: 1, avif: 1, svg: 1 };
  var VID_EXT = { mp4: 1, webm: 1, mov: 1, m4v: 1, ogv: 1, avi: 1, mkv: 1, wmv: 1 };
  var AUD_EXT = { mp3: 1, wav: 1, m4a: 1, aac: 1, ogg: 1, flac: 1, wma: 1, opus: 1 };

  /* --------------------- 自身路径（定位 vendor/） -------------------- */
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
    jszip: [
      VENDOR + 'jszip.min.js',
      CDN_JS + 'jszip@3.10.1/dist/jszip.min.js',
      CDN_UNPKG + 'jszip@3.10.1/dist/jszip.min.js'
    ],
    mammoth: [
      VENDOR + 'mammoth.browser.min.js',
      CDN_JS + 'mammoth@1.8.0/mammoth.browser.min.js',
      CDN_UNPKG + 'mammoth@1.8.0/mammoth.browser.min.js'
    ],
    pdfjs: [
      VENDOR + 'pdf.min.js',
      CDN_JS + 'pdfjs-dist@3.11.174/build/pdf.min.js',
      CDN_UNPKG + 'pdfjs-dist@3.11.174/build/pdf.min.js'
    ]
  };

  /* ---------------------------- 脚本加载 ---------------------------- */
  var scriptCache = {};

  function loadScript(urls, label) {
    var key = label || urls[0];
    if (scriptCache[key]) return scriptCache[key];

    var p = new Promise(function (resolve, reject) {
      var i = 0;
      (function tryNext() {
        if (i >= urls.length) {
          reject(new Error('无法加载依赖 ' + (label || urls[0]) + '（本地与 CDN 均失败）'));
          return;
        }
        var url = urls[i++];
        var s = document.createElement('script');
        var finished = false;
        function fail() {
          if (finished) return;
          finished = true;
          try { if (s.parentNode) s.parentNode.removeChild(s); } catch (e) {}
          tryNext();
        }
        function ok() {
          if (finished) return;
          finished = true;
          resolve(url);
        }
        s.src = url;
        s.async = true;
        s.onload = ok;
        s.onerror = fail;
        // 有的网络环境会静默挂起，超时后换下一个源
        setTimeout(fail, 20000);
        document.head.appendChild(s);
      })();
    });

    scriptCache[key] = p;
    p['catch'](function () { delete scriptCache[key]; });
    return p;
  }

  function getJSZip() { return global.JSZip; }
  function getMammoth() { return global.mammoth; }
  function getPdfjs() { return global.pdfjsLib || global['pdfjs-dist/build/pdf'] || null; }

  /* ---------------------------- 小工具 ----------------------------- */
  function extOf(name) {
    var m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function kindOf(file) {
    var ext = extOf(file.name);
    var mime = String(file.type || '').toLowerCase();

    if (IMG_EXT[ext] || /^image\//.test(mime)) return 'image';
    if (VID_EXT[ext] || /^video\//.test(mime)) return 'video';
    if (AUD_EXT[ext] || /^audio\//.test(mime)) return 'audio';
    if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
    if (ext === 'docx' || mime.indexOf('wordprocessingml') >= 0) return 'docx';
    if (ext === 'pptx' || mime.indexOf('presentationml') >= 0) return 'pptx';
    if (ext === 'doc' || ext === 'ppt' || ext === 'xls' || ext === 'xlsx') return 'other';
    if (TEXT_EXT[ext] || /^text\//.test(mime) ||
        mime === 'application/json' || mime === 'application/xml') return 'text';
    return 'other';
  }

  function clampText(str, extra) {
    str = String(str == null ? '' : str)
      .replace(/\r\n?/g, '\n')
      .replace(/[\t\u000b\f]/g, ' ')
      .replace(/\u0000/g, '')
      .replace(/\n{3,}/g, '\n\n');
    if (str.length > TEXT_LIMIT) {
      str = str.slice(0, TEXT_LIMIT);
      if (extra) extra.truncated = true;
    }
    return str.trim();
  }

  function readAsDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(fr.error || new Error('读取文件失败')); };
      fr.readAsDataURL(blob);
    });
  }

  function readAsArrayBuffer(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error || new Error('读取文件失败')); };
      fr.readAsArrayBuffer(blob);
    });
  }

  function readAsText(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(fr.error || new Error('读取文件失败')); };
      // 先按 UTF-8 读；乱码由浏览器自动替换，不阻塞
      fr.readAsText(blob, 'UTF-8');
    });
  }

  function decodeEntities(s) {
    return String(s)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  }

  /* ------------------------------ 图片 ------------------------------ */
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('图片解码失败')); };
      img.src = src;
    });
  }

  function drawToCanvas(img, maxEdge, bg) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('图片尺寸无效');
    var scale = Math.min(1, maxEdge / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));
    var cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    var ctx = cv.getContext('2d');
    if (!ctx) throw new Error('canvas 不可用');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch); }
    if (ctx.imageSmoothingEnabled !== undefined) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
    ctx.drawImage(img, 0, 0, cw, ch);
    return cv;
  }

  function canvasJpeg(cv, quality) {
    try { return cv.toDataURL('image/jpeg', quality); }
    catch (e) { return cv.toDataURL('image/png'); }
  }

  async function parseImage(file, out) {
    var src = await readAsDataUrl(file);
    out.dataUrl = src;

    // SVG：不做栅格化（无自然尺寸时 canvas 会画空白），原样保留
    if (extOf(file.name) === 'svg' || /^image\/svg/.test(file.type || '')) {
      out.thumb = src;
      return out;
    }

    var img = await loadImage(src);
    out.width = img.naturalWidth || undefined;
    out.height = img.naturalHeight || undefined;

    var maxEdge = Math.max(img.naturalWidth || 0, img.naturalHeight || 0);
    var needShrink = maxEdge > IMAGE_MAX;

    if (needShrink) {
      // 白底 jpeg：避免 PNG 透明区在 PPT 里变黑
      out.dataUrl = canvasJpeg(drawToCanvas(img, IMAGE_MAX, '#ffffff'), 0.86);
      out.compressed = true;
    }

    var thumbCv = drawToCanvas(img, THUMB_MAX, '#ffffff');
    out.thumb = canvasJpeg(thumbCv, 0.8);
    out.thumbWidth = thumbCv.width;
    out.thumbHeight = thumbCv.height;
    return out;
  }

  /* ------------------------------ 视频 ------------------------------ */
  // 抓首帧做缩略图。坑：只设置 preload='metadata' 且不播放时，Chrome 往往
  // 不会解码首帧（loadeddata 不触发），所以这里用 preload='auto' + 静音 play()
  // 把第一帧推出来；为了拿到更有代表性的画面，首帧拿到后再 seek 到 0.25s 重画一次。
  function grabVideoThumb(file) {
    return new Promise(function (resolve) {
      var url = null;
      var video = null;
      var timer = null;
      var settled = false;
      var seekTried = false;
      var pending = null;   // 已经截到的画面（seek 失败时兜底用）

      function cleanup() {
        if (timer) { clearTimeout(timer); timer = null; }
        try {
          if (video) {
            try { video.pause(); } catch (e) { /* ignore */ }
            video.removeAttribute('src');
            video.load();
            if (video.parentNode) video.parentNode.removeChild(video);
          }
        } catch (e) { /* ignore */ }
        try { if (url) URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
      }

      function finish(shot) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(shot || pending || null);
      }

      function drawFrame() {
        if (settled || !video) return;
        var w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) return;
        var data;
        try {
          // 注意：这里必须把真实的 <video> 交给 drawImage，不能像图片那样传「伪 img」
          var scale = Math.min(1, THUMB_MAX / Math.max(w, h));
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(w * scale));
          cv.height = Math.max(1, Math.round(h * scale));
          var ctx = cv.getContext('2d');
          if (!ctx) return;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, cv.width, cv.height);
          if (ctx.imageSmoothingEnabled !== undefined) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
          }
          ctx.drawImage(video, 0, 0, cv.width, cv.height);
          data = canvasJpeg(cv, 0.8);
        } catch (e) {
          return;
        }
        pending = { thumb: data, width: w, height: h };
        if (!seekTried && isFinite(video.duration) && video.duration > 0.8 && video.currentTime < 0.08) {
          seekTried = true;
          try {
            video.currentTime = Math.min(0.25, video.duration / 4);
            return;
          } catch (e) { /* 直接用手上这帧 */ }
        }
        finish(pending);
      }

      try {
        url = URL.createObjectURL(file);
        video = document.createElement('video');
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.preload = 'auto';
        video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';

        video.onloadeddata = drawFrame;
        video.oncanplay = drawFrame;
        video.onseeked = drawFrame;
        video.ontimeupdate = drawFrame;
        video.onerror = function () { finish(null); };

        document.body.appendChild(video);
        video.src = url;
        video.load();
        try {
          var pr = video.play();
          if (pr && typeof pr.catch === 'function') pr.catch(function () { /* 自动播放被拦，靠事件兜底 */ });
        } catch (e) { /* ignore */ }
        timer = setTimeout(function () { finish(null); }, VIDEO_TIMEOUT);
      } catch (e) {
        finish(null);
      }
    });
  }

  /* ------------------------------ PDF ------------------------------- */
  async function parsePdf(file, out) {
    var used = await loadScript(LIB_URLS.pdfjs, 'pdfjs');
    var pdfjs = getPdfjs();
    if (!pdfjs || !pdfjs.getDocument) throw new Error('pdfjs 未就绪');

    // worker 与主库同源
    if (pdfjs.GlobalWorkerOptions) {
      var workerUrl = used.replace(/pdf\.min\.js(\?.*)?$/, 'pdf.worker.min.js');
      if (workerUrl === used) {
        workerUrl = used.replace(/pdf\.js(\?.*)?$/, 'pdf.worker.min.js');
      }
      try { pdfjs.GlobalWorkerOptions.workerSrc = workerUrl; } catch (e) { /* ignore */ }
    }

    var data = new Uint8Array(await readAsArrayBuffer(file));
    var doc = await pdfjs.getDocument({ data: data, isEvalSupported: false }).promise;
    var pages = [];
    var total = doc.numPages || 0;
    var collected = 0;

    for (var i = 1; i <= total; i++) {
      if (collected > TEXT_LIMIT * 2) { out.truncated = true; break; }
      var page = await doc.getPage(i);
      var content = await page.getTextContent();
      var line = '';
      var buf = [];
      for (var k = 0; k < content.items.length; k++) {
        var it = content.items[k];
        if (!it || typeof it.str !== 'string') continue;
        line += it.str;
        if (it.hasEOL) { buf.push(line); line = ''; }
      }
      if (line) buf.push(line);
      var pageText = buf.join('\n').replace(/[ \t]+\n/g, '\n').trim();
      if (pageText) {
        pages.push('【第 ' + i + ' 页】\n' + pageText);
        collected += pageText.length;
      }
      page.cleanup();
    }

    if (typeof doc.destroy === 'function') { try { await doc.destroy(); } catch (e) { /* ignore */ } }

    out.pages = total;
    out.text = clampText(pages.join('\n\n'), out);
    if (!out.text) out.error = 'PDF 中没有可提取的文本（可能是扫描件/图片版）';
    return out;
  }

  /* ------------------------------ DOCX ------------------------------ */
  async function parseDocx(file, out) {
    var buffer = await readAsArrayBuffer(file);
    var mammoth = null;
    try {
      await loadScript(LIB_URLS.mammoth, 'mammoth');
      mammoth = getMammoth();
    } catch (e) { mammoth = null; }

    if (mammoth && typeof mammoth.extractRawText === 'function') {
      try {
        var res = await mammoth.extractRawText({ arrayBuffer: buffer });
        var value = res && res.value ? String(res.value) : '';
        if (value.trim()) {
          out.text = clampText(value, out);
          out.parser = 'mammoth';
          return out;
        }
      } catch (e) { /* 退回到 JSZip */ }
    }

    // 兜底：直接解 word/document.xml 去标签
    await loadScript(LIB_URLS.jszip, 'jszip');
    var JSZip = getJSZip();
    if (!JSZip) throw new Error('JSZip 未就绪');
    var zip = await JSZip.loadAsync(buffer);
    var entry = zip.file('word/document.xml');
    if (!entry) throw new Error('不是有效的 docx（缺少 word/document.xml）');
    var xml = await entry.async('string');
    var text = xml
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+\n/g, '\n');
    out.text = clampText(decodeEntities(text), out);
    out.parser = 'jszip';
    return out;
  }

  /* ------------------------------ PPTX ------------------------------ */
  async function parsePptx(file, out) {
    await loadScript(LIB_URLS.jszip, 'jszip');
    var JSZip = getJSZip();
    if (!JSZip) throw new Error('JSZip 未就绪');

    var buffer = await readAsArrayBuffer(file);
    var zip = await JSZip.loadAsync(buffer);

    var slidePaths = [];
    zip.forEach(function (path) {
      var m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(path);
      if (m) slidePaths.push({ path: path, n: parseInt(m[1], 10) });
    });
    if (!slidePaths.length) throw new Error('不是有效的 pptx（未找到幻灯片）');
    slidePaths.sort(function (a, b) { return a.n - b.n; });

    var blocks = [];
    var collected = 0;
    for (var i = 0; i < slidePaths.length; i++) {
      if (collected > TEXT_LIMIT * 2) { out.truncated = true; break; }
      var xml = await zip.file(slidePaths[i].path).async('string');
      var texts = [];
      var re = /<a:t>([\s\S]*?)<\/a:t>/g;
      var m;
      while ((m = re.exec(xml)) !== null) {
        var t = decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
        if (t) texts.push(t);
      }
      if (texts.length) {
        blocks.push('【第 ' + slidePaths[i].n + ' 页】\n' + texts.join('\n'));
        collected += texts.join('\n').length;
      }
    }

    out.slides = slidePaths.length;
    out.text = clampText(blocks.join('\n\n'), out);
    return out;
  }

  /* ---------------------------- 单文件入口 --------------------------- */
  async function readOne(file) {
    var out = {
      name: file.name || '未命名文件',
      size: file.size || 0,
      mime: file.type || '',
      kind: 'other',
      ext: extOf(file.name),
      file: file
    };
    if (!out.mime) {
      out.mime = ({
        txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
        html: 'text/html', pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      })[out.ext] || '';
    }

    var kind = kindOf(file);

    /* 大文件保护：只留元信息 */
    if (file.size > BIG_FILE && kind !== 'video' && kind !== 'audio') {
      out.oversized = true;
      out.kind = kind;
      out.error = '文件超过 50MB，仅记录信息，未解析内容';
      if (kind === 'image' || kind === 'other') out.kind = kind === 'image' ? 'image' : 'other';
      return out;
    }

    try {
      switch (kind) {
        case 'image':
          out.kind = 'image';
          await parseImage(file, out);
          break;

        case 'video': {
          out.kind = 'video';
          if (file.size <= BIG_FILE) {
            var thumb = await grabVideoThumb(file);
            if (thumb) { out.thumb = thumb.thumb; out.width = thumb.width; out.height = thumb.height; }
          } else {
            out.oversized = true;
            out.error = '视频超过 50MB，仅记录信息';
          }
          break;
        }

        case 'audio':
          out.kind = 'audio';
          break;

        case 'pdf':
          out.kind = 'pdf';
          await parsePdf(file, out);
          break;

        case 'docx':
          out.kind = 'docx';
          await parseDocx(file, out);
          break;

        case 'pptx':
          out.kind = 'pptx';
          await parsePptx(file, out);
          break;

        case 'text':
          out.kind = 'text';
          out.text = clampText(await readAsText(file), out);
          break;

        default:
          out.kind = 'other';
          break;
      }
    } catch (err) {
      // 任何失败都不抛出：降级成 other，并保留原始 kind 信息
      out.kind = 'other';
      out.originalKind = kind;
      out.error = (err && err.message) ? String(err.message) : '解析失败';
      if (!out.text) out.text = '';
    }

    return out;
  }

  /* ------------------------------ 公共 API --------------------------- */
  function humanSize(bytes) {
    var n = Number(bytes);
    if (!isFinite(n) || n < 0) return '0 B';
    if (n < 1024) return Math.round(n) + ' B';
    var units = ['KB', 'MB', 'GB', 'TB'];
    var i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
    var v = n >= 100 ? n.toFixed(0) : n.toFixed(1);
    v = v.replace(/\.0$/, '');
    return v + ' ' + units[i];
  }

  async function read(fileList) {
    var files = [];
    if (!fileList) return [];
    if (typeof fileList.length === 'number' && !fileList.name) {
      for (var i = 0; i < fileList.length; i++) if (fileList[i]) files.push(fileList[i]);
    } else {
      files.push(fileList);
    }

    var results = [];
    for (var k = 0; k < files.length; k++) {
      try {
        results.push(await readOne(files[k]));
      } catch (e) {
        results.push({
          name: files[k] && files[k].name ? files[k].name : '未命名文件',
          size: files[k] && files[k].size ? files[k].size : 0,
          mime: (files[k] && files[k].type) || '',
          kind: 'other',
          ext: extOf(files[k] && files[k].name),
          text: '',
          error: (e && e.message) ? String(e.message) : '解析失败'
        });
      }
    }
    return results;
  }

  /* 把一批解析结果拼成给模型看的参考资料（供 app.js 选用，非契约必需） */
  function toPromptText(entries, opts) {
    opts = opts || {};
    var max = opts.maxChars || 60000;
    var parts = [];
    (entries || []).forEach(function (en) {
      if (!en) return;
      var label = en.name + '（' + humanSize(en.size) + '，' + en.kind + '）';
      if (en.text) parts.push('### 文件：' + label + '\n' + en.text);
      else if (en.kind === 'image') parts.push('### 图片：' + label + (en.width ? '，' + en.width + '×' + en.height : '') + (en.error ? '（' + en.error + '）' : ''));
      else if (en.kind === 'video') parts.push('### 视频：' + label + '（仅首帧缩略图，无文本）');
      else if (en.kind === 'audio') parts.push('### 音频：' + label + '（未解析）');
      else parts.push('### 文件：' + label + (en.error ? '（' + en.error + '）' : ''));
    });
    var text = parts.join('\n\n');
    if (text.length > max) text = text.slice(0, max) + '\n\n……（资料过长已截断）';
    return text;
  }

  global.FILES = {
    version: '1.0.0',
    read: read,
    humanSize: humanSize,
    toPromptText: toPromptText,
    kindOf: kindOf,
    TEXT_LIMIT: TEXT_LIMIT,
    BIG_FILE: BIG_FILE,
    loadScript: function (name) {
      var urls = LIB_URLS[name];
      if (!urls) return Promise.reject(new Error('未知依赖: ' + name));
      return loadScript(urls, name);
    },
    /* 内部常量，测试用 */
    _vendorBase: VENDOR
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[FILES] ready, vendor =', VENDOR);
  }
})(typeof window !== 'undefined' ? window : this);
