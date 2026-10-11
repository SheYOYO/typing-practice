const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path');
const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
// 故意用半角标点，验证「文章标点统一为中文标点」
const TEXT = fs.readFileSync(path.join(__dirname, '../reference/origin/huoda.txt'), 'utf8');
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'load' });
  await p.evaluate(t => { localStorage.clear(); localStorage.setItem('nzd_articles_v1', JSON.stringify([{ id: 'x', title: '《豁达》', author: '符江', source: '散文一百篇', builtin: false, text: t }])); }, TEXT);
  await p.goto('http://127.0.0.1:8899/index.html#/p/x', { waitUntil: 'load' });
  await p.waitForSelector('#level_para_lines .level_para_line', { timeout: 15000 });
  await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(__dirname, '../reference/v12_default_30px.png') });
  await p.evaluate(async () => {
    const r = document.querySelector('input[name="fontSize"]');
    r.value = '1'; r.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(x => setTimeout(x, 600));
  });
  await p.screenshot({ path: path.join(__dirname, '../reference/v12_font1_16px.png') });
  const info = await p.evaluate(() => ({ per: window.Engine.per, fs: getComputedStyle(document.querySelector('.word_label')).fontSize }));
  console.log('档1 截图完成 per=' + info.per + ' 字号=' + info.fs);
  await b.close();
})();
