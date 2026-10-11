/* 用与原站完全相同的口径量我们自己的打字页：文案 / 字号 / 每行字数。 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const TEXT = fs.readFileSync(path.join(__dirname, '../reference/origin/huoda.txt'), 'utf8');

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const log = [];
  page.on('console', m => { if (m.type() !== 'log') log.push('[' + m.type() + '] ' + m.text()); });
  page.on('pageerror', e => log.push('[pageerror] ' + e.message));

  await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'load' });
  await page.evaluate(txt => {
    localStorage.clear();
    localStorage.setItem('nzd_articles_v1', JSON.stringify([
      { id: 'huoda_test', title: '《豁达》', author: '符江', source: '散文一百篇', builtin: false, text: txt }
    ]));
  }, TEXT);
  await page.goto('http://127.0.0.1:8899/index.html#/p/huoda_test', { waitUntil: 'load' });
  await page.waitForSelector('#level_para_lines .level_para_line', { timeout: 15000 }).catch(e => log.push('[wait] ' + e.message));
  await page.waitForTimeout(1200);

  const data = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const out = {
      title: (q('.level_nav h1') || {}).innerText,
      score_bar: (q('#score_bar') || {}).innerText,
      keyinfo: (q('#level_keyinfo') || {}).innerText,
      footer_btns: [...document.querySelectorAll('.level_process_content button')].map(b => b.innerText),
      wrap_class: (q('#app > .level_wrap') || {}).className,
      word_label_fs: null, input_fs: null, line_width: null,
      line_style: null, box_style: null,
      lines: []
    };
    const lb = q('#level_para_lines .word_label');
    if (lb) out.word_label_fs = getComputedStyle(lb).fontSize;
    const inp = q('#level_para_lines .input_box');
    if (inp) { out.input_fs = getComputedStyle(inp).fontSize; }
    const line = q('#level_para_lines .level_para_line');
    if (line) {
      const r = line.getBoundingClientRect();
      out.line_width = Math.round(r.width * 100) / 100;
      const cs = getComputedStyle(line);
      out.line_style = { minWidth: cs.minWidth, maxWidth: cs.maxWidth, width: cs.width };
    }
    const wsb = q('#level_para_lines .words_box');
    if (wsb) out.box_style = { width: Math.round(wsb.getBoundingClientRect().width * 100) / 100, paddingLeft: getComputedStyle(wsb).paddingLeft };
    const all = [...document.querySelectorAll('#level_para_lines .level_para_line')];
    out.lines = all.map((el, i) => {
      const ws = el.querySelector('.words_box');
      return { i, n: ws ? ws.querySelectorAll('.word_box').length : 0, text: ws ? ws.innerText.replace(/\s+/g, '') : '' };
    }).filter(x => x.n > 0);
    return out;
  });

  console.log(JSON.stringify(data, null, 2));
  if (log.length) console.log('--- log ---\n' + log.join('\n'));
  await page.screenshot({ path: path.join(__dirname, '../reference/mine_1440.png') });
  await browser.close();
})();
