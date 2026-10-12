const { chromium } = require('playwright-core');
const path = require('path');
const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'load' });
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('nzd_articles_v1', JSON.stringify([
      { id: 'u_a', title: '我的第一篇练习', author: '佚名', source: '自选导入', builtin: false,
        text: '读书之法，在循序而渐进，熟读而精思。\n凡读书，须要读得字字响亮，不可误一字。' },
      { id: 'u_b', title: '荷塘月色（节选）', author: '朱自清', source: '自选导入', builtin: false,
        text: '曲曲折折的荷塘上面，弥望的是田田的叶子。' }
    ]));
    localStorage.setItem('nzd_progress_v1', JSON.stringify({ u_a: { done: true, attempts: 2, best: { speed: 72, accuracy: 98, duration: 40, stars: 4 } } }));
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.a_card', { timeout: 8000 });
  await p.waitForTimeout(400);
  // 悬停第一张卡片，让 ✎ 和 × 浮现
  await p.hover('.a_card');
  await p.waitForTimeout(450);
  await p.screenshot({ path: path.join(__dirname, '../reference/v13_cards_hover.png') });
  // 打开编辑弹层
  await p.click('.a_edit');
  await p.waitForSelector('#editor_mask', { timeout: 5000 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(__dirname, '../reference/v13_editor.png') });
  // 导入确认弹层
  await p.keyboard.press('Escape');
  await p.waitForTimeout(250);
  await p.fill('#imp_title', '新文章');
  await p.fill('#imp_text', '这是从文档导进来的正文, 里面还有半角标点.');
  await p.click('#imp_btn');
  await p.waitForSelector('#editor_mask', { timeout: 5000 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(__dirname, '../reference/v13_import_confirm.png') });
  console.log('截图完成');
  await b.close();
})();
