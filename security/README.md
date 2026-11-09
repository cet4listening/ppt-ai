# 安全与防护说明

这个站点是**纯静态前端**（GitHub Pages），没有传统意义上的服务器。
所以「防护」分成两层：**已经内置的前端加固** + **可选的真后端代理（Cloudflare Worker）**。

---

## 一、已经内置的加固（默认生效，不用配置）

| 项目 | 做法 | 目的 |
| --- | --- | --- |
| 内容安全策略 CSP | `<meta http-equiv="Content-Security-Policy">`：脚本只允许同源；`object-src 'none'`；`base-uri 'self'`；图片允许 `self/data/blob`；网络请求只允许 `https:` | 就算有人往页面里塞了恶意脚本/外链，也执行不了 |
| 禁止被嵌套 | `frame-ancestors`（需由托管商响应头下发；Pages 不支持，本地/自建服务器可加） | 防点击劫持 |
| 不泄漏来源 | `referrer: no-referrer` | 跳到第三方时不带你的页面地址 |
| Key 不明文落盘 | localStorage 里的 Key 用 `v1:` 前缀做 XOR+Base64 混淆；勾掉「记住」后只写 sessionStorage，关标签页即失效 | 防止随手打开 devtools 就能复制到 Key |
| 错误信息打码 | 所有报错先过 `scrub()`，`sk-...` / GitHub token 形态的串一律替换成 `sk-***` | 报错截图、贴群里时不会顺手泄漏 Key |
| 请求频率限制 | 同一句话 2 秒内不重复提交；1 分钟最多 8 次；输入上限 2000 字 | 防误触连点、防把额度刷光 |
| 图片地址白名单 | 模型返回的 `image.src` 只接受 `data:image/*;base64`、`blob:`、`https:`、相对路径 | 防止模型被诱导塞进奇怪协议 |
| 文本全程转义 | 所有渲染都走 `esc()` | 防 XSS |
| 上传文件只读解析 | 文件在浏览器里本地解析（PDF/DOCX/PPTX/图片/视频首帧），**不上传任何服务器**；单文件 > 50MB 只记元信息 | 隐私：资料不离开你的浏览器 |
| 开发页不上线 | `dev/` 已在 `.gitignore` 并从仓库移除 | 内测工具不暴露在公网 |
| 依赖全部本地化 | `vendor/` 里自带 pptxgenjs / pdfjs / mammoth / jszip / html2canvas，无 CDN | 不会被 CDN 投毒或断供 |

> ⚠️ 老实说：前端的「混淆」不等于加密。任何人只要有你这台电脑的浏览器权限，就能取到 Key。
> 想要「Key 完全不进浏览器」，只能用下面的 Worker 方案。

---

## 二、可选：加一个真后端（Cloudflare Worker）

`security/worker-cf.js` 是一个可以直接部署的 Worker，提供：

- **Key 只存在服务端**（环境变量 `DEEPSEEK_KEY`），浏览器完全接触不到
- 只放行 `/chat/completions`，其它路径 404
- **Origin 白名单**（`ALLOW_ORIGINS`），别人抄你的网页也调不动
- **每 IP 每分钟 12 次**限流，超了返回 429
- 请求体 512KB 上限、`max_tokens` 封顶 8000
- 模型名只允许 `deepseek-*`，防止被当成任意服务的免费代理

### 部署步骤（约 3 分钟）

1. 打开 <https://dash.cloudflare.com/> → **Workers & Pages** → **Create** → **Worker** → 起名 `pptai-proxy`
2. 把 `security/worker-cf.js` 全部内容粘进在线编辑器 → **Deploy**
3. 进入该 Worker 的 **Settings → Variables and Secrets**，添加：
   - `DEEPSEEK_KEY` = 你的 `sk-...`（点 **Encrypt** 加密保存）
   - `ALLOW_ORIGINS` = `https://cet4listening.github.io`
4. 复制 Worker 地址，例如 `https://pptai-proxy.abc123.workers.dev`
5. 回到网页 → 设置：
   - **接口地址**：`https://pptai-proxy.abc123.workers.dev/v1`
   - **API Key**：随便填，如 `proxy`（Worker 会用自己的密钥覆盖）
   - 模型：`deepseek-flash`

这样即使有人拿到你的网页源码，也拿不到 Key，也刷不了你的额度。

> 不想折腾 Cloudflare 的话：现在的纯前端版本 + 上面那层加固，对「自己用、偶尔分享给同学」已经够用；
> 真正的风险只是「Key 存在浏览器里」，别在公共电脑上用、别把 Key 截图发出去就行。
