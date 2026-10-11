/* 完整走原站自己的判定：先打完第 1 行，再在第 2 行一次性填入整行前缀。 */
const { chromium } = require('playwright-core');
const path = require('path');
const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('https://www.nezhadazi.com/level/29-2-101.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#level_page_0 .level_para_line .input_box', { timeout: 30000 });
  await page.waitForTimeout(1800);
  const r = await page.evaluate(async () => {
    const sleep = ms => new Promise(x => setTimeout(x, ms));
    const $ = window.jQuery;
    const lines = () => [...document.querySelectorAll('#level_page_0 .level_para_line')].filter(l => l.querySelector('.word_box'));
    const txt = l => [...l.querySelectorAll('.word_box')].map(b => b.querySelector('.word_label').textContent).join('');
    const L = lines();
    const fill = async (lineEl, text) => {
      const $i = $(lineEl).find('.input_box');
      $i.prop('disabled', false);
      $i.val(text);
      $i.trigger('input');
      await sleep(250);
    };
    // 第 1 行整行打对
    await fill(L[0], txt(L[0]));
    const afterFirst = { cursorLine: $('#level_page_0 .word_box.on').closest('.level_para_line').index(),
                         firstLineMarked: [...L[0].querySelectorAll('.word_box.correct,.word_box.incorrect')].length };
    // 第 2 行填入整行前缀（前 6 个字，全对）
    const t2 = txt(L[1]);
    await fill(L[1], [...t2].slice(0, 6).join(''));
    const marked = [];
    L[1].querySelectorAll('.word_box.correct, .word_box.incorrect').forEach(b => marked.push({
      box: b.className, t: b.querySelector('.word_label').textContent,
      color: getComputedStyle(b.querySelector('.word_label')).color
    }));
    return { afterFirst, t2: t2.slice(0, 8), marked, inputVal: $(L[1]).find('.input_box').val() };
  });
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})();
