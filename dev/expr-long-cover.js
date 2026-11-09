(async () => {
  const d = window.__deck;
  d.title = '这是一个很长很长的课件标题';
  d.slides[0].title = '这是一个很长很长的课件标题，用来测试两行标题的截断与自适应字号';
  d.slides[0].subtitle = '副标题也故意写得很长：把一块月饼平均分给四个小朋友，每人分到多少？再想一想，如果把月饼平均分给八个小朋友，每人又分到多少？';
  PPT.renderDeck(document.getElementById('stage'), d, window.__theme, { mode: 'single', index: 0 });
  await new Promise(r => setTimeout(r, 600));
  return 'long-cover';
})()
