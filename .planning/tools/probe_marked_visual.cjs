/* 两边都强制把第 1 行前 6 个字标成 correct、后 2 个标成 incorrect，截图 + 读色。
   这样能直接看到「原站打对的字到底长什么样」。 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const OUT = p => path.join(__dirname, '../reference/', p);
const TEXT = fs.readFileSync(path.join(__dirname, '../reference/origin/huoda.txt'), 'utf8');

const PAINT = () => {
  const line = [...document.querySelectorAll('.level_para_line')]
    .find(l => l.querySelectorAll('.word_box').length > 15);
  const boxes = [...line.querySelectorAll('.word_box')];
  boxes.forEach((b, i) => {
    b.classList.remove('correct', 'incorrect');
    if (i < 6) b.classList.add('correct');
    else if (i < 8) b.classList.add('incorrect');
  });
  const rd = i => {
    const b = boxes[i];
    return { i, box: b.className, color: getComputedStyle(b.querySelector('.word_label')).color };
  };
  return { read: [rd(0), rd(5), rd(6)] };
};

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE, args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-gpu']
  });

  // 原站
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('https://www.nezhadazi.com/level/29-2-101.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#level_page_0 .level_para_line', { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      ['full_screen_overlay', 'lock_screen_overlay'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
      document.querySelectorAll('.level_para_lines').forEach((l, i) => { if (i) l.parentElement.style.display = 'none'; });
    });
    const r = await page.evaluate(PAINT);
    console.log('原站:', JSON.stringify(r.read));
    // 只截第 1 行
    const el = await page.$('#level_page_0 .level_para_line');
    await el.screenshot({ path: OUT('origin/live_marked.png') });
    await ctx.close();
  }

  // 本项目
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'load' });
    await page.evaluate(txt => {
      localStorage.clear();
      localStorage.setItem('nzd_articles_v1', JSON.stringify([
        { id: 'huoda_test', title: '《豁达》', author: '符江', source: '散文一百篇', builtin: false, text: txt }
      ]));
    }, TEXT);
    await page.goto('http://127.0.0.1:8899/index.html#/p/huoda_test', { waitUntil: 'load' });
    await page.waitForSelector('#level_para_lines .level_para_line', { timeout: 15000 });
    await page.waitForTimeout(800);
    const r = await page.evaluate(PAINT);
    console.log('本项目:', JSON.stringify(r.read));
    const el = (await page.$$('#level_para_lines .level_para_line'))[1];
    await el.screenshot({ path: OUT('mine_marked.png') });
    await ctx.close();
  }

  await browser.close();
})();
