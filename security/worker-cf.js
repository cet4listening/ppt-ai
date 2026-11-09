/**
 * Cloudflare Worker：给「好想睡觉的ppt小屋」做真正的后端防护层（可选）
 * ---------------------------------------------------------------
 * 作用：
 *   1. API Key 只存 Worker 的环境变量里，浏览器永远拿不到（最彻底的防护）
 *   2. 只放行 /chat/completions，其它路径 404
 *   3. Origin 白名单（只允许你自己的站点）
 *   4. 每 IP 每分钟限流 + 单次请求体积/输出上限
 *   5. 上游固定为 DeepSeek，客户端无法把你当免费代理刷别的服务
 *
 * 部署（二选一）：
 *   A. 控制台：Workers & Pages → 新建 Worker → 粘贴本文件 → Settings → Variables
 *      添加 DEEPSEEK_KEY（加密保存）、ALLOW_ORIGINS → Deploy
 *   B. 命令行：npm i -g wrangler && wrangler deploy worker-cf.js --name pptai-proxy
 *
 * 然后把网页「设置 → 接口地址」填成：https://pptai-proxy.<你的子域>.workers.dev/v1
 * API Key 随便填一个占位符（例如 proxy），Worker 会用自己的密钥。
 */

const UPSTREAM = 'https://api.deepseek.com';
const MAX_BODY = 512 * 1024;        // 单次请求体上限
const MAX_TOKENS_CAP = 8000;        // 输出 token 上限（防止被刷）
const RATE_PER_MIN = 12;            // 每 IP 每分钟允许的请求数

function corsHeaders(origin, allowed) {
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function nowMinute() {
  return Math.floor(Date.now() / 60000);
}

export default {
  async fetch(request, env, ctx) {
    const allowed = String(env.ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }
    // Origin 白名单：没有 Origin 的（curl 等）也允许，方便自测；想更严格可改成必须匹配
    if (origin && allowed.length && !allowed.includes(origin)) {
      return new Response(JSON.stringify({ error: { message: 'origin not allowed' } }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    if (!env.DEEPSEEK_KEY) {
      return new Response(JSON.stringify({ error: { message: 'server key not configured' } }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    if (!/\/chat\/completions$/.test(url.pathname)) {
      return new Response(JSON.stringify({ error: { message: 'not found' } }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // --- 限流：按 IP + 分钟计数，用 Cache API 做简易计数器（尽力而为） ---
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const bucket = `rl:${ip}:${nowMinute()}`;
    const cache = caches.default;
    const rlKey = new Request('https://ratelimit.internal/' + encodeURIComponent(bucket));
    let used = 0;
    const hit = await cache.match(rlKey);
    if (hit) used = parseInt(await hit.text(), 10) || 0;
    if (used >= RATE_PER_MIN) {
      return new Response(JSON.stringify({ error: { message: 'rate limited, retry in a minute' } }), {
        status: 429, headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '60' }
      });
    }
    ctx.waitUntil(cache.put(rlKey, new Response(String(used + 1), {
      headers: { 'Cache-Control': 'max-age=120' }
    })));

    // --- 读 body 并做上限与参数裁剪 ---
    const raw = await request.text();
    if (raw.length > MAX_BODY) {
      return new Response(JSON.stringify({ error: { message: 'payload too large' } }), {
        status: 413, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    let body;
    try { body = JSON.parse(raw); } catch (e) {
      return new Response(JSON.stringify({ error: { message: 'invalid json' } }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    if (!body || !Array.isArray(body.messages) || !body.messages.length) {
      return new Response(JSON.stringify({ error: { message: 'messages required' } }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    // 客户端指定的模型不受信任：只允许 deepseek 家族
    const model = /^deepseek-/.test(String(body.model || '')) ? body.model : 'deepseek-flash';
    body.max_tokens = Math.min(Number(body.max_tokens) || 3000, MAX_TOKENS_CAP);
    body.stream = false;

    const upstream = await fetch(UPSTREAM + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + env.DEEPSEEK_KEY
      },
      body: JSON.stringify({ ...body, model })
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  }
};
