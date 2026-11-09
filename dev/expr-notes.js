(async () => {
  const k = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  k('ArrowRight');
  await new Promise(r => setTimeout(r, 700));
  k('n');
  await new Promise(r => setTimeout(r, 800));
  return 'notes-open';
})()
