const { chromium } = require('playwright-core');
const path = require('path');
const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'load' });
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('nzd_articles_v1', JSON.stringify([
      { id: 'u_a', title: '我的第一篇练习', author: '佚名', source: '自选导入', builtin: false, text: '读书之法，在循序而渐进，熟读而精思。' }
    ]));
    localStorage.setItem('nzd_progress_v1', JSON.stringify({ u_a: { done: true, attempts: 2, best: { speed: 72, accuracy: 98, duration: 40, stars: 4 } } }));
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.a_card', { timeout: 8000 });
  await p.hover('.a_card');
  await p.waitForTimeout(500);
  const el = await p.$('.a_card');
  const box = await el.boundingBox();
  await p.screenshot({ path: path.join(__dirname, '../reference/v13_card_zoom.png'),
    clip: { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 } });
  const geo = await p.evaluate(() => {
    const c2 = document.querySelector('.a_card');
    const g = s => { const e = c2.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cr = c2.getBoundingClientRect();
      return { l: Math.round(r.left - cr.left), r: Math.round(cr.right - r.right), w: Math.round(r.width) }; };
    return { card: Math.round(c2.getBoundingClientRect().width), check: g('.a_check'), del: g('.a_del'), edit: g('.a_edit') };
  });
  console.log(JSON.stringify(geo));
  await b.close();
})();
