/* 验证：原站的 input_box 字号是否恒定 30px（与「中文大小」档位解耦），我方是否绑到了档位 */
const { chromium } = require('playwright-core');
const path = require('path');
const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-gpu'] });

  // ---- 原站 ----
  const c1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p1 = await c1.newPage();
  await p1.goto('https://www.nezhadazi.com/level/29-2-101.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p1.waitForSelector('#level_page_0 .level_para_line .word_box', { timeout: 30000 });
  await p1.waitForTimeout(1800);
  console.log('=== 原站 ===');
  for (const lvl of [1, 3, 9]) {
    const r = await p1.evaluate(async n => {
      document.body.classList.remove(...[...document.body.classList].filter(c => /^font_label_size\d/.test(c)));
      document.body.classList.add('font_label_size' + n);
      await new Promise(x => setTimeout(x, 400));
      const l = document.querySelector('#level_page_0 .level_para_line');
      const lb = l.querySelector('.word_label');
      const inp = l.querySelector('.input_box');
      const wb = l.querySelector('.words_box');
      const boxes = [...l.querySelectorAll('.word_box')];
      return {
        labelFs: getComputedStyle(lb).fontSize,
        inputFs: getComputedStyle(inp).fontSize,
        labelW: Math.round(lb.getBoundingClientRect().width * 100) / 100,
        boxesW: Math.round(wb.getBoundingClientRect().width),
        n: boxes.length
      };
    }, lvl);
    console.log(`  档${lvl}: word_label ${r.labelFs} (单格 ${r.labelW}px) | input_box ${r.inputFs} | 该行 ${r.n} 格 共 ${r.boxesW}px`);
  }
  await c1.close();

  // ---- 本项目 ----
  const fs = require('fs');
  const TEXT = fs.readFileSync(path.join(__dirname, '../reference/origin/huoda.txt'), 'utf8');
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await c2.newPage();
  await p2.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'load' });
  await p2.evaluate(t => { localStorage.clear(); localStorage.setItem('nzd_articles_v1', JSON.stringify([{ id: 'x', title: '《豁达》', author: '符江', source: '散文一百篇', builtin: false, text: t }])); }, TEXT);
  await p2.goto('http://127.0.0.1:8899/index.html#/p/x', { waitUntil: 'load' });
  await p2.waitForSelector('#level_para_lines .level_para_line', { timeout: 15000 });
  await p2.waitForTimeout(900);
  console.log('\n=== 本项目 ===');
  for (const lvl of [1, 3, 9]) {
    const r = await p2.evaluate(async n => {
      const r = document.querySelector('input[name="fontSize"]');
      r.value = String(n); r.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(x => setTimeout(x, 500));
      const l = document.querySelector('#level_para_lines .level_para_line');
      const lb = l.querySelector('.word_label');
      const inp = l.querySelector('.input_box');
      const wb = l.querySelector('.words_box');
      return {
        labelFs: getComputedStyle(lb).fontSize,
        inputFs: getComputedStyle(inp).fontSize,
        labelW: Math.round(lb.getBoundingClientRect().width * 100) / 100,
        boxesW: Math.round(wb.getBoundingClientRect().width),
        n: l.querySelectorAll('.word_box').length
      };
    }, lvl);
    console.log(`  档${lvl}: word_label ${r.labelFs} (单格 ${r.labelW}px) | input_box ${r.inputFs} | 首行 ${r.n} 格 共 ${r.boxesW}px`);
  }
  await c2.close();
  await browser.close();
})();
