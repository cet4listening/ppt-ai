(async () => {
  document.querySelector('.pp-zone-next').click();
  await new Promise(r => setTimeout(r, 900));
  return 'clicked-next';
})()
