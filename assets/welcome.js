/* ============================================================
   welcome.js —— 开场动画：欢迎来到「好想睡觉的ppt小屋」
   每个会话展示一次；点击/按键可跳过；尊重 prefers-reduced-motion。
   ============================================================ */
(function () {
  'use strict';

  var SESSION_KEY = 'pptai.welcome.v1';
  var SHOW_MS = 3400;      // 动画完整时长（含慢启动）
  var FADE_MS = 560;       // 退场时间

  var root = null;
  var finished = false;
  var timers = [];

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function build() {
    var el = document.createElement('div');
    el.id = 'welcome';
    el.setAttribute('role', 'presentation');
    el.setAttribute('aria-hidden', 'true');

    var title = '好想睡觉的ppt小屋';
    var chars = '';
    for (var i = 0; i < title.length; i++) {
      var delay = (0.45 + i * 0.075).toFixed(3);
      chars += '<span style="animation-delay:' + delay + 's">' + title.charAt(i) + '</span>';
    }

    el.innerHTML =
      '<div class="wl-stars"></div>' +
      '<div class="wl-cards">' +
        '<i class="wl-card c1"></i><i class="wl-card c2"></i><i class="wl-card c3"></i>' +
        '<i class="wl-card c4"></i><i class="wl-card c5"></i>' +
      '</div>' +
      '<div class="wl-stage">' +
        '<div class="wl-logo"><img src="assets/img/avatar-girl-face.jpg" alt=""></div>' +
        '<div class="wl-eyebrow">WELCOME</div>' +
        '<h1 class="wl-title" aria-label="欢迎来到好想睡觉的ppt小屋">' + chars + '</h1>' +
        '<p class="wl-sub">一句话，生成一份能直接讲的课件</p>' +
        '<div class="wl-progress"><i></i></div>' +
        '<div class="wl-hint">点击任意处跳过</div>' +
      '</div>';

    return el;
  }

  function cleanup() {
    timers.forEach(clearTimeout);
    timers = [];
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPoint, true);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
  }

  function finish() {
    if (finished || !root) return;
    finished = true;
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* ignore */ }
    root.classList.add('is-out');
    root.setAttribute('aria-hidden', 'true');
    timers.push(setTimeout(cleanup, reduced() ? 140 : FADE_MS));
  }

  function onKey(e) {
    // 只拦截 Esc / 空格 / 回车，避免误吞用户输入
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') finish();
    else finish();
  }

  function onPoint() { finish(); }

  function start(el) {
    root = el;
    (document.body || document.documentElement).appendChild(el);

    // 首次访问时给主界面一点「浮上来」的入场感
    document.documentElement.classList.add('is-booting');

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPoint, true);

    timers.push(setTimeout(function () {
      document.documentElement.classList.remove('is-booting');
    }, 1200));

    timers.push(setTimeout(finish, reduced() ? 900 : SHOW_MS));
  }

  function init() {
    var seen = false;
    try { seen = sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { seen = false; }
    if (seen) {
      document.documentElement.classList.remove('is-booting');
      return;
    }
    start(build());
  }

  init();
})();
