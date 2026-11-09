/* ============================================================
   presets.js —— 风格 / 配色 / 字体 / 动画 预设
   供 render.js（PPT.*）与 export.js（EXPORTER.*）共用
   ============================================================ */
(function () {
  'use strict';

  const styles = [
    {
      id: 'editorial',
      name: '杂志极简',
      desc: '留白充足、大标题、细线条，适合公开课与说课',
      hint: 'Editorial'
    },
    {
      id: 'corporate',
      name: '商务深色',
      desc: '深色底 + 高对比强调色，稳重、投影清晰',
      hint: 'Corporate'
    },
    {
      id: 'playful',
      name: '活泼儿童',
      desc: '圆角卡片、明快配色、大字号，适合小学课堂',
      hint: 'Playful'
    },
    {
      id: 'tech',
      name: '科技渐变',
      desc: '渐变光斑 + 网格底纹，适合信息科技与理科',
      hint: 'Tech'
    },
    {
      id: 'warm',
      name: '温暖纸感',
      desc: '米色纸纹、衬线标题，适合语文与人文',
      hint: 'Warm'
    }
  ];

  const palettes = [
    {
      id: 'ink',
      name: '墨黑蓝',
      colors: {
        bg: '#ffffff', surface: '#f4f6fa', text: '#0f172a', muted: '#64748b',
        primary: '#2563eb', accent: '#f59e0b', line: 'rgba(15,23,42,.10)'
      }
    },
    {
      id: 'ocean',
      name: '深海蓝',
      colors: {
        bg: '#0b1220', surface: '#151f33', text: '#e8eefc', muted: '#93a4c4',
        primary: '#38bdf8', accent: '#f472b6', line: 'rgba(232,238,252,.14)'
      }
    },
    {
      id: 'forest',
      name: '森屿绿',
      colors: {
        bg: '#f7fbf7', surface: '#e9f3ec', text: '#0f2a1d', muted: '#5b7266',
        primary: '#177a4f', accent: '#d99a1d', line: 'rgba(15,42,29,.10)'
      }
    },
    {
      id: 'sunset',
      name: '落日橙',
      colors: {
        bg: '#fff8f3', surface: '#ffe8db', text: '#2b1a12', muted: '#8a6a5c',
        primary: '#e2571b', accent: '#0ea5e9', line: 'rgba(43,26,18,.10)'
      }
    },
    {
      id: 'candy',
      name: '糖果粉',
      colors: {
        bg: '#fffdfa', surface: '#ffeff6', text: '#3b1f2b', muted: '#9c7186',
        primary: '#db2777', accent: '#16a34a', line: 'rgba(59,31,43,.10)'
      }
    },
    {
      id: 'paper',
      name: '纸感米',
      colors: {
        bg: '#fbf8f2', surface: '#f1eadd', text: '#2b2416', muted: '#7a6d57',
        primary: '#b45309', accent: '#0f766e', line: 'rgba(43,36,22,.12)'
      }
    },
    {
      id: 'violet',
      name: '夜幕紫',
      colors: {
        bg: '#101014', surface: '#1b1b22', text: '#f4f4f5', muted: '#a1a1aa',
        primary: '#a78bfa', accent: '#34d399', line: 'rgba(244,244,245,.14)'
      }
    },
    {
      id: 'mono',
      name: '极简黑白',
      colors: {
        bg: '#ffffff', surface: '#f5f5f5', text: '#111111', muted: '#737373',
        primary: '#111111', accent: '#e11d48', line: 'rgba(17,17,17,.12)'
      }
    }
  ];

  const fonts = [
    {
      id: 'sans-cn', name: '黑体（默认）',
      heading: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif',
      body: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    },
    {
      id: 'serif-cn', name: '宋体标题',
      heading: '"Source Han Serif SC","Noto Serif SC","Songti SC","SimSun",Georgia,serif',
      body: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    },
    {
      id: 'kai-cn', name: '楷体人文',
      heading: 'KaiTi,"Kaiti SC","STKaiti","Songti SC",serif',
      body: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    },
    {
      id: 'rounded-cn', name: '圆润活泼',
      heading: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif',
      body: '"PingFang SC","Hiragino GB","Microsoft YaHei",system-ui,sans-serif'
    },
    {
      id: 'mono-en', name: '等宽科技',
      heading: 'ui-monospace,"JetBrains Mono","Cascadia Mono",Consolas,monospace',
      body: '"Source Han Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    }
  ];

  const anims = [
    { id: 'fade-up', name: '淡入上浮', cssClass: 'anim-fade-up' },
    { id: 'fade', name: '纯淡入', cssClass: 'anim-fade' },
    { id: 'slide-left', name: '左侧滑入', cssClass: 'anim-slide-left' },
    { id: 'zoom', name: '缩放浮现', cssClass: 'anim-zoom' },
    { id: 'wipe', name: '擦除揭示', cssClass: 'anim-wipe' },
    { id: 'none', name: '无动画', cssClass: 'anim-none' }
  ];

  function get(theme) {
    theme = theme || {};
    return {
      style: styles.find(s => s.id === theme.styleId) || styles[0],
      palette: palettes.find(p => p.id === theme.paletteId) || palettes[0],
      font: fonts.find(f => f.id === theme.fontId) || fonts[0],
      anim: anims.find(a => a.id === theme.animId) || anims[0]
    };
  }

  const DEFAULT_THEME = { styleId: 'editorial', paletteId: 'ink', fontId: 'sans-cn', animId: 'fade-up' };

  window.PRESETS = { styles, palettes, fonts, anims, get, DEFAULT_THEME };
})();
