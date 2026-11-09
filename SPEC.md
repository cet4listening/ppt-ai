# AI 课件工坊 · 内部接口契约（SPEC）

所有模块都是**纯浏览器 JS**，无构建步骤、无框架、无 npm。通过 `window.*` 全局对象互相调用。
页面入口：`ppt-ai/index.html`，按顺序加载：

```html
<script src="assets/presets.js"></script>   <!-- Lead 写 -->
<script src="assets/search.js"></script>    <!-- Lead 写 -->
<script src="assets/files.js"></script>     <!-- files-export 写 -->
<script src="assets/render.js"></script>    <!-- slides-engine 写 -->
<script src="assets/export.js"></script>    <!-- files-export 写 -->
<script src="assets/app.js"></script>       <!-- Lead 写 -->
```

---

## 1. 数据模型

```js
// 演示文稿（模型输出，可被用户编辑）
deck = {
  title: "小学三年级英语 · 第一节课 Hello!",
  subtitle: "Unit 1 Greetings",
  meta: { grade: "小学三年级", subject: "英语", minutes: 40 },
  slides: [
    {
      type: "cover" | "section" | "bullets" | "two-col" | "image" | "quote" | "stats" | "list" | "end",
      title: "…",
      subtitle: "…",            // 可选
      bullets: ["…", "…"],      // bullets / list 用
      columns: [{ title: "…", items: ["…"] }],   // two-col 用（2 项）
      image: { src: "data:image/...", caption: "…" },  // image 用
      quote: "…", author: "…",  // quote 用
      stats: [{ value: "26", label: "字母数量" }], // stats 用
      notes: "讲稿提示（可选）"
    }
  ]
}

// 主题选择
theme = { styleId: "editorial", paletteId: "ink", fontId: "sans-cn", animId: "fade-up" }
```

## 2. `window.PRESETS`（presets.js，Lead 负责）

```js
PRESETS = {
  styles:   [{ id, name, desc, layouts: [type...] }],
  palettes: [{ id, name, colors: { bg, surface, text, muted, primary, accent, line } }],
  fonts:    [{ id, name, heading, body }],
  anims:    [{ id, name, cssClass }],
}
PRESETS.get(theme) // -> { style, palette, font, anim }
```

## 3. `window.PPT`（render.js + themes.css，slides-engine 负责）

```js
PPT.renderDeck(rootEl, deck, theme, opts)  // 清空 rootEl，渲染 .deck > .slide[data-index]
PPT.renderThumb(el, slide, deck, theme)    // 把单页缩略图渲染进 el（16:9，scale 自适应）
PPT.present(deck, theme, startIndex)       // 全屏放映层（自带 DOM、键盘/点击翻页、进度、讲稿开关、ESC 退出）
PPT.resolve(theme)                         // -> {style, palette, font, anim}，同 PRESETS.get
PPT.applyVars(el, theme)                   // 在 el 上写入 --pp-* CSS 变量（供外部预览用）
```

约束：
- 舞台基准尺寸 **1280×720**，外部容器决定缩放（`transform: scale()`），幻灯片内部不得依赖视口单位。
- 所有颜色/字体通过 CSS 变量（`--pp-bg` `--pp-surface` `--pp-text` `--pp-muted` `--pp-primary` `--pp-accent` `--pp-line` `--pp-font-heading` `--pp-font-body`）取值，禁止硬编码主题色。
- 入场动画用 CSS keyframes，由 `.slide.is-active` 触发；`animId` 决定动画类别。
- 打印（导出 PDF）时每页一张幻灯片、横向、无阴影。

## 4. `window.FILES`（files.js，files-export 负责）

```js
await FILES.read(FileList) // -> [{ name, size, mime, kind, text?, dataUrl?, thumb? }]
// kind: "image" | "video" | "audio" | "pdf" | "docx" | "pptx" | "text" | "other"
// text: 纯文本内容（截断到 200k 字符）；image/video 提供 thumb（dataURL, 宽度<=480）
FILES.humanSize(bytes) // "1.2 MB"
```

## 5. `window.EXPORTER`（export.js，files-export 负责）

```js
await EXPORTER.toPptx(deck, theme, { mode: "native" | "image", filename })
// -> { blob, filename }；pptgenjs 全局名 PptxGenJS；image 模式用 html2canvas（若可用）
EXPORTER.printPdf() // 调起浏览器打印（横向）
```

## 6. 依赖库（vendor）

优先 `ppt-ai/vendor/*.js`（本地文件，离线可用）；缺失时回退 CDN。用到的：
- `pptxgenjs`（PptxGenJS 3.12）
- `jszip`（docx/pptx 解析）
- `pdfjs-dist`（pdf 文本提取，含 worker）
- `mammoth`（docx → text）
- `html2canvas`（图片版 pptx）
