/* 出一张浅色干净截图（供与原站逐字对照），并顺带验证 file:// 直开可用。 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const ROOT = path.resolve(__dirname, '../..');
const TEXT = fs.readFileSync(path.join(__dirname, '../reference/origin/huoda.txt'), 'utf8');
const fileUrl = require('url').pathToFileURL(path.join(ROOT, 'index.html')).href;

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });

  // ---- http 干净截图 ----
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'load' });
  await page.evaluate(txt => {
    localStorage.clear();
    localStorage.setItem('nzd_articles_v1', JSON.stringify([
      { id: 'huoda_test', title: '《豁达》', author: '符江', source: '散文一百篇', builtin: false, text: txt }
    ]));
  }, TEXT);
  await page.goto('http://127.0.0.1:8899/index.html#/p/huoda_test', { waitUntil: 'load' });
  await page.waitForSelector('#level_para_lines .level_para_line', { timeout: 15000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(__dirname, '../reference/mine_light_1440.png') });
  console.log('http 截图完成；控制台错误 ' + errs.length);
  await ctx.close();

  // ---- file:// 直开 ----
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on('console', m => { if (m.type() === 'error') errs2.push(m.text()); });
  p2.on('pageerror', e => errs2.push('pageerror: ' + e.message));
  await p2.goto(fileUrl, { waitUntil: 'load' });
  await p2.waitForTimeout(600);
  const cards = await p2.locator('.a_card').count();
  await p2.evaluate(txt => {
    localStorage.setItem('nzd_articles_v1', JSON.stringify([
      { id: 'huoda_test', title: '《豁达》', author: '符江', source: '散文一百篇', builtin: false, text: txt }
    ]));
  }, TEXT);
  await p2.goto(fileUrl + '#/p/huoda_test', { waitUntil: 'load' });
  await p2.waitForSelector('#level_para_lines .level_para_line', { timeout: 15000 });
  await p2.waitForTimeout(900);
  const f = await p2.evaluate(() => ({
    title: document.querySelector('.level_nav h1').innerText,
    fs: getComputedStyle(document.querySelector('#level_para_lines .word_label')).fontSize,
    per: Math.max(...[...document.querySelectorAll('#level_para_lines .level_para_line')]
      .filter(e => e.querySelector('.words_box'))
      .map(e => e.querySelectorAll('.word_box').length))
  }));
  console.log('file:// 主页卡片 ' + cards + ' 张；打字页 ' + JSON.stringify(f) + '；错误 ' + errs2.length);
  await browser.close();
})();
