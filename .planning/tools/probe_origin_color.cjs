/* 在原站点里真的打几个字，读「打对 / 打错」的 .word_label 计算颜色与类名挂载位置。 */
const { chromium } = require('playwright-core');
const path = require('path');

const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE, args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-gpu']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const log = [];
  page.on('pageerror', e => log.push('pageerror: ' + e.message));

  await page.goto('https://www.nezhadazi.com/level/29-2-101.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#level_page_0 .level_para_line', { timeout: 30000 });
  await page.waitForTimeout(1500);

  // 破掉启动遮罩
  await page.evaluate(() => {
    ['full_screen_overlay', 'lock_screen_overlay'].forEach(id => {
      const e = document.getElementById(id); if (e) e.style.display = 'none';
    });
    document.querySelectorAll('.level_para_line').forEach((l, i) => { if (i === 0) l.style.display = ''; });
  });
  await page.waitForTimeout(300);

  // 找到当前可输入行，逐字输入
  const out = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // 原站把输入框 focus 起来才算进入
    const lines = [...document.querySelectorAll('#level_page_0 .level_para_line')].filter(l => l.querySelector('.word_label'));
    const line = lines[1];                       // 第 2 行：生活老人悄悄告诉我…
    const input = line.querySelector('.input_box');
    if (!input) return { err: 'no input' };
    input.disabled = false; input.style.display = '';
    input.focus();
    await sleep(200);
    const boxes = [...line.querySelectorAll('.word_box')];
    const target = boxes.map(b => b.querySelector('.word_label').textContent).join('');
    const type = ch => {
      input.value = input.value + ch;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    // 打对 3 个字
    for (const ch of [...target].slice(0, 3)) { type(ch); await sleep(60); }
    // 再打 1 个错的
    type('错'); await sleep(200);

    const pick = sel => {
      const e = line.querySelector(sel);
      if (!e) return null;
      const cs = getComputedStyle(e);
      return { color: cs.color, fontSize: cs.fontSize, cls: e.className };
    };
    const marked = [...line.querySelectorAll('.correct,.incorrect')]
      .map(e => ({ cls: e.className, tag: e.tagName, color: getComputedStyle(e).color, text: e.textContent }));
    return {
      target: target.slice(0, 6),
      correctBox: pick('.word_box.correct'),
      correctLabelInBox: pick('.word_box.correct .word_label'),
      incorrectBox: pick('.word_box.incorrect'),
      incorrectLabel: pick('.word_box.incorrect .word_label'),
      plainLabel: pick('.word_box:not(.correct):not(.incorrect) .word_label'),
      marked
    };
  });
  console.log(JSON.stringify(out, null, 2));
  if (log.length) console.log('log: ' + log.join(' | '));
  await page.screenshot({ path: path.join(__dirname, '../reference/origin/live_typed.png') });
  await browser.close();
})();
