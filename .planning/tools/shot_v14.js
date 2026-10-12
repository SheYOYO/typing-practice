const { chromium } = require('playwright-core');
const path = require('path');
const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'load' });
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('nzd_articles_v1', JSON.stringify([
      { id: 'u_a', title: '荷塘月色（节选）', author: '朱自清', source: '自选导入', builtin: false, text: '曲曲折折的荷塘上面，弥望的是田田的叶子。' }
    ]));
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.import_panel', { timeout: 8000 });
  await p.waitForTimeout(400);
  const el = await p.$('.import_panel');
  const box = await el.boundingBox();
  await p.screenshot({ path: path.join(__dirname, '../reference/v14_panel.png'),
    clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 } });
  // 删除模式激活态
  await p.click('#imp_delmode');
  await p.waitForTimeout(400);
  const el2 = await p.$('.import_panel');
  const box2 = await el2.boundingBox();
  await p.screenshot({ path: path.join(__dirname, '../reference/v14_panel_delmode.png'),
    clip: { x: box2.x - 6, y: box2.y - 6, width: box2.width + 12, height: box2.height + 12 } });
  console.log('截图完成');
  await b.close();
})();
