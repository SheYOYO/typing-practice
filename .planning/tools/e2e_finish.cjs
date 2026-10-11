/* 端到端：用内置《静夜思》逐字打完，校验
   ① 运行中 时间=分:秒、速度={n}WPM ② 打满自动进下一行 ③ 落到结算页 */
const { chromium } = require('playwright-core');
const path = require('path');

const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const BASE = 'http://127.0.0.1:8899/index.html';

let FAIL = 0;
function ok(n, c, extra) { console.log((c ? '  ✅ ' : '  ❌ ') + n + (c ? '' : '  → ' + extra)); if (!c) FAIL++; }

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + '#/p/jingyesi', { waitUntil: 'load' });
  await page.waitForSelector('#level_para_lines .level_para_line', { timeout: 15000 });
  await page.waitForTimeout(600);

  const title = await page.evaluate(() => document.querySelector('.level_nav h1').innerText);
  ok('标题 = 哪吒打字 打字练习文 唐诗·五言绝句[静夜思]',
     title === '哪吒打字 打字练习文 唐诗·五言绝句[静夜思]', title);

  // 逐字打完两行
  const total = await page.evaluate(() => {
    window.__t = [];
    return [...document.querySelectorAll('#level_para_lines .level_para_line')]
      .filter(l => l.querySelector('.words_box'))
      .map(l => [...l.querySelectorAll('.word_box')].map(b => b.textContent).join(''));
  });
  let during = '';
  for (let li = 0; li < total.length; li++) {
    for (const ch of total[li]) {
      await page.evaluate(c => {
        const inp = document.querySelector('#level_para_lines .level_para_line.on .input_box')
                 || document.querySelector('#level_para_lines .input_box');
        inp.value += c;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }, ch);
      await page.waitForTimeout(25);
    }
    await page.waitForTimeout(120);
    // 第一行打完就抓一次统计条（通关后页面已跳转，就抓不到了）
    if (li === 0) {
      during = await page.evaluate(() => (document.querySelector('#score_bar') || {}).innerText || '');
    }
  }
  await page.waitForTimeout(1800);
  ok('运行中 速度单位已由 CPM 变 WPM', /\d+WPM/.test(during) && !/CPM/.test(during), during);
  ok('运行中 时间 = 分:秒（不再是 00:00:00）', /时间： \d{2}:\d{2}(?!:)/.test(during), during);
  ok('打完第一行 → 进度 50%（共 2 行）', /进度： 50%/.test(during), during);
  ok('准确率 100%', /准确率： 100%/.test(during), during);

  await page.waitForTimeout(600);
  const hash = await page.evaluate(() => location.hash);
  ok('已跳到结算页 #/r/...', /^#\/r\//.test(hash), hash);
  const stars = await page.locator('.stars_list').count();
  ok('结算页已渲染', stars > 0, 'stars_list=' + stars);

  ok('0 控制台错误', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.screenshot({ path: path.join(__dirname, '../reference/mine_result_after_fix.png') });
  await browser.close();
  console.log(FAIL ? '\n失败 ' + FAIL + ' 项' : '\n全部通过');
  process.exit(FAIL ? 1 : 0);
})();
