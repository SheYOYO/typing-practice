/* 打开原站关卡页，量出与「打字交互页」有关的全部事实：
   文案 / 字号 / 每行字数 / 卡片宽度。只读，不写任何站点数据。 */
const { chromium } = require('playwright-core');
const path = require('path');

const EXE = process.env.HOME
  ? path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
  : '';

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-gpu']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const log = [];
  page.on('console', m => log.push('[console] ' + m.text()));
  page.on('pageerror', e => log.push('[pageerror] ' + e.message));

  await page.goto('https://www.nezhadazi.com/level/29-2-101.html', {
    waitUntil: 'domcontentloaded', timeout: 60000
  }).catch(e => log.push('[goto] ' + e.message));

  // 等正文渲染出来
  await page.waitForSelector('#level_page_0 .level_para_line', { timeout: 30000 })
    .catch(e => log.push('[wait] ' + e.message));
  await page.waitForTimeout(2500);

  const data = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const out = {
      title: (q('.level_nav h1') || {}).innerText,
      score_bar: (q('#tongji_bar') || {}).innerText,
      keyinfo: (q('#level_keyinfo_bar') || {}).innerText,
      keyinfo_html: (q('#level_keyinfo_bar') || {}).innerHTML,
      footer_btns: [...document.querySelectorAll('#level_process_bar button')]
        .map(b => ({ id: b.id, text: b.innerText, display: getComputedStyle(b).display })),
      body_class: document.body.className,
      wrap_class: (q('#level_wrap') || {}).className,
      word_label_fs: null,
      line_width: null,
      input_fs: null,
      lines: [],
      lines_total: 0,
      chars_total: 0
    };
    const lb = q('#level_page_0 .level_para_line .word_label');
    if (lb) out.word_label_fs = getComputedStyle(lb).fontSize;
    const inp = q('#level_page_0 .level_para_line .input_box');
    if (inp) {
      out.input_fs = getComputedStyle(inp).fontSize;
      out.input_border = getComputedStyle(inp).border;
    }
    const line = q('#level_page_0 .level_para_line');
    if (line) {
      const r = line.getBoundingClientRect();
      out.line_width = Math.round(r.width * 100) / 100;
    }
    const all = [...document.querySelectorAll('#level_page_0 .level_para_line')];
    out.lines_total = all.length;
    out.lines = all.map((el, i) => {
      const ws = el.querySelector('.words_box');
      return {
        i,
        w: ws ? Math.round(ws.getBoundingClientRect().width) : null,
        n: ws ? ws.querySelectorAll('.word_box').length : 0,
        text: ws ? ws.innerText.replace(/\s+/g, '') : ''
      };
    }).filter(x => x.n > 0);
    out.chars_total = out.lines.reduce((a, b) => a + b.n, 0);
    return out;
  }).catch(e => ({ error: String(e) }));

  console.log(JSON.stringify(data, null, 2));
  if (log.length) console.log('--- browser log ---\n' + log.slice(0, 30).join('\n'));

  await page.screenshot({ path: path.join(__dirname, '../reference/origin/live_1440.png') });
  await browser.close();
})();
