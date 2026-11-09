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
    },
    {
      id: 'glass',
      name: '玻璃拟态',
      desc: '半透明磨砂卡片 + 柔和光晕，通透轻盈，适合科技与美育',
      hint: 'Glassmorphism'
    },
    {
      id: 'retro',
      name: '复古印刷',
      desc: '粗描边、错位套印与旧纸颗粒，像一张老海报，适合历史与人文',
      hint: 'Retro Print'
    },
    {
      id: 'ink',
      name: '水墨中国',
      desc: '大留白、细笔触与竖排题签，墨色淡雅，适合语文与传统文化',
      hint: 'Ink Wash'
    },
    {
      id: 'grid',
      name: '极简网格',
      desc: '细网格、等宽数字与克制强调色，理性精确，适合理科与数据',
      hint: 'Swiss Grid'
    },
    {
      id: 'neon',
      name: '霓虹科技',
      desc: '深底发光描边与渐变光带，赛博感强，适合信息科技与编程',
      hint: 'Neon'
    },
    {
      id: 'blueprint',
      name: '蓝图工程',
      desc: '细网格、双线图框与等宽标注，像一张工程图纸，适合理科与通用技术',
      hint: 'Blueprint'
    },
    {
      id: 'paper',
      name: '手账笔记',
      desc: '点阵纸、和纸胶带与便签卡片，轻松有手作感，适合备课与班会',
      hint: 'Bullet Journal'
    },
    {
      id: 'deco',
      name: '装饰艺术',
      desc: '对称构图、金色双线框与放射纹，典雅有仪式感，适合公开课与汇演',
      hint: 'Art Deco'
    },
    {
      id: 'zen',
      name: '留白禅意',
      desc: '大留白、细线与一枚淡墨圆相，克制安静，适合语文与美育',
      hint: 'Zen'
    },
    {
      id: 'swiss',
      name: '瑞士网格',
      desc: '左对齐大标题、国际主义网格与一小块强调色，理性有力，适合公开课与汇报',
      hint: 'Swiss Style'
    },
    {
      id: 'magazine',
      name: '杂志跨栏',
      desc: '衬线报头、跨栏正文与整幅大图，像一本刊物内页，适合语文与人文',
      hint: 'Magazine'
    },
    {
      id: 'mint',
      name: '薄荷清透',
      desc: '薄荷渐变、轻柔圆角与高光卡片，清透治愈，适合小学与美育',
      hint: 'Fresh Mint'
    },
    {
      id: 'noir',
      name: '黑白电影',
      desc: '黑白强对比、胶片颗粒与黑边字幕条，戏剧张力强，适合文学与历史',
      hint: 'Film Noir'
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
    },
    {
      id: 'mint',
      name: '薄荷',
      colors: {
        bg: '#f6fdfb', surface: '#e7f7f1', text: '#0c2f28', muted: '#5c7f76',
        primary: '#0f9d76', accent: '#f2768b', line: 'rgba(12,47,40,.10)'
      }
    },
    {
      id: 'sand',
      name: '暖沙',
      colors: {
        bg: '#faf6ee', surface: '#f1e8d7', text: '#2e2417', muted: '#7d6b52',
        primary: '#b06a2c', accent: '#2f7d6b', line: 'rgba(46,36,23,.10)'
      }
    },
    {
      id: 'rose',
      name: '玫瑰粉',
      colors: {
        bg: '#fff7f9', surface: '#ffe9ef', text: '#351b25', muted: '#8f6172',
        primary: '#c2185b', accent: '#8b5cf6', line: 'rgba(53,27,37,.10)'
      }
    },
    {
      id: 'slate',
      name: '石板灰蓝',
      colors: {
        bg: '#f5f7fa', surface: '#e7edf4', text: '#1c2733', muted: '#5f6f80',
        primary: '#476b8f', accent: '#d98b3a', line: 'rgba(28,39,51,.12)'
      }
    },
    {
      id: 'aurora',
      name: '极光绿紫',
      colors: {
        bg: '#0b1220', surface: '#142033', text: '#eafaf4', muted: '#93b8ad',
        primary: '#3ddc97', accent: '#a78bfa', line: 'rgba(234,250,244,.14)'
      }
    },
    {
      id: 'coffee',
      name: '咖啡棕',
      colors: {
        bg: '#f8f3ed', surface: '#ece2d5', text: '#2a1f17', muted: '#7a6655',
        primary: '#6f4a2f', accent: '#c98a3c', line: 'rgba(42,31,23,.12)'
      }
    },
    {
      id: 'ice',
      name: '冰蓝',
      colors: {
        bg: '#f3f9fd', surface: '#e7f3fb', text: '#10293d', muted: '#4a6b80',
        primary: '#2b8cc4', accent: '#e08a4f', line: 'rgba(16,41,61,.10)'
      }
    },
    {
      id: 'forest-2',
      name: '深林',
      colors: {
        bg: '#0c1e18', surface: '#12291f', text: '#e8f6ee', muted: '#9cb9a9',
        primary: '#55c48d', accent: '#e0b25c', line: 'rgba(232,246,238,.14)'
      }
    },
    {
      id: 'mono-warm',
      name: '暖灰',
      colors: {
        bg: '#f4f1ec', surface: '#e9e4dc', text: '#2a2622', muted: '#6b6359',
        primary: '#5f574d', accent: '#b07d46', line: 'rgba(42,38,34,.12)'
      }
    },
    {
      id: 'candy-2',
      name: '糖果紫',
      colors: {
        bg: '#fbf7ff', surface: '#f2e9ff', text: '#2b1b3d', muted: '#7c6a92',
        primary: '#7c4dd6', accent: '#e26fa8', line: 'rgba(43,27,61,.10)'
      }
    },
    {
      id: 'peach',
      name: '蜜桃',
      colors: {
        bg: '#fff8f5', surface: '#ffe9e0', text: '#33201a', muted: '#8a6255',
        primary: '#e46a4b', accent: '#4a9d8e', line: 'rgba(51,32,26,.10)'
      }
    },
    {
      id: 'sky',
      name: '晴空',
      colors: {
        bg: '#f4faff', surface: '#e3f2ff', text: '#12283d', muted: '#557088',
        primary: '#2f80d8', accent: '#f0a03c', line: 'rgba(18,40,61,.10)'
      }
    },
    {
      id: 'olive',
      name: '橄榄',
      colors: {
        bg: '#f7f8f0', surface: '#e9ecda', text: '#262b1a', muted: '#646b4e',
        primary: '#6f7d2f', accent: '#c06a3a', line: 'rgba(38,43,26,.12)'
      }
    },
    {
      id: 'plum',
      name: '梅子紫',
      colors: {
        bg: '#1d1120', surface: '#2a1830', text: '#f7eef8', muted: '#c0a5c9',
        primary: '#d48be0', accent: '#f0c46a', line: 'rgba(247,238,248,.14)'
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
    },
    {
      id: 'display-serif', name: '衬线大标题',
      heading: 'Georgia,"Times New Roman","Songti SC","SimSun","Source Han Serif SC",serif',
      body: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    },
    {
      id: 'hand', name: '手写楷书',
      heading: 'KaiTi,"Kaiti SC","STKaiti","楷体","Xingkai SC",cursive',
      body: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    },
    {
      id: 'condensed', name: '窄体标题',
      heading: '"Arial Narrow","Impact","Haettenschweiler","Microsoft YaHei","PingFang SC",sans-serif',
      body: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    },
    {
      id: 'rounded-serif', name: '圆衬线标题',
      heading: '"Bookman Old Style",Georgia,"Songti SC","SimSun","Source Han Serif SC",serif',
      body: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    },
    {
      id: 'serif-modern', name: '现代宋体标题',
      heading: '"Songti SC","Source Han Serif SC","Noto Serif CJK SC","SimSun",Georgia,serif',
      body: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    },
    {
      id: 'latin-serif', name: '拉丁衬线',
      heading: 'Georgia,"Times New Roman","Songti SC","SimSun","Source Han Serif SC",serif',
      body: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    },
    {
      id: 'kai-soft', name: '柔和楷体',
      heading: 'KaiTi,"Kaiti SC","STKaiti","Songti SC","SimSun",serif',
      body: '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif'
    }
  ];

  const anims = [
    { id: 'fade-up', name: '淡入上浮', cssClass: 'anim-fade-up' },
    { id: 'fade', name: '纯淡入', cssClass: 'anim-fade' },
    { id: 'slide-left', name: '左侧滑入', cssClass: 'anim-slide-left' },
    { id: 'zoom', name: '缩放浮现', cssClass: 'anim-zoom' },
    { id: 'wipe', name: '擦除揭示', cssClass: 'anim-wipe' },
    { id: 'none', name: '无动画', cssClass: 'anim-none' },
    { id: 'zoom-in', name: '缩放淡入', cssClass: 'anim-zoom-in' },
    { id: 'wipe-up', name: '自下擦除', cssClass: 'anim-wipe-up' },
    { id: 'flip', name: '3D 轻翻转', cssClass: 'anim-flip' },
    { id: 'blur-in', name: '模糊聚焦', cssClass: 'anim-blur-in' },
    { id: 'slide-right', name: '右侧滑入', cssClass: 'anim-slide-right' },
    { id: 'pop-in', name: '弹入', cssClass: 'anim-pop-in' },
    { id: 'slide-in-left', name: '自左滑入', cssClass: 'anim-slide-in-left' },
    { id: 'rise-blur', name: '上浮模糊', cssClass: 'anim-rise-blur' }
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
