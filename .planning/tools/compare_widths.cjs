/* 同一组视口宽度下，横向对比「原站」与「本项目」的打字页关键指标。
   输出：每个宽度下 —— 行卡片宽度 / 每行最多字数 / 汉字字号 / 标题文案。 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const TEXT = fs.readFileSync(path.join(__dirname, '../reference/origin/huoda.txt'), 'utf8');
const WIDTHS = [1920, 1600, 1440, 1366, 1280, 1152, 1024];

const PROBE = () => {
  const q = s => document.querySelector(s);
  const line = q('#level_para_lines .level_para_line') || q('#level_page_0 .level_para_line');
  const ws = line && line.querySelector('.words_box');
  const lb = q('.level_label_probe') || (line && line.querySelector('.word_label'));
  const res = {
    line_w: line ? Math.round(line.getBoundingClientRect().width) : null,
    box_w: ws ? Math.round(ws.getBoundingClientRect().width) : null,
    max_per_line: 0,
    fs: lb ? getComputedStyle(lb).fontSize : null,
    title: (q('.level_nav h1') || {}).innerText,
    lines: 0
  };
  const all = [...document.querySelectorAll('.level_para_line')];
  all.forEach(el => {
    const w = el.querySelector('.words_box');
    if (w) { const n = w.querySelectorAll('.word_box').length; if (n > res.max_per_line) res.max_per_line = n; }
  });
  res.lines = all.filter(el => el.querySelector('.words_box')).length;
  return res;
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-gpu'] });
  const out = { origin: {}, mine: {} };

  for (const w of WIDTHS) {
    // ---- 原站 ----
    {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      const page = await ctx.newPage();
      await page.goto('https://www.nezhadazi.com/level/29-2-101.html', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await page.waitForSelector('#level_page_0 .level_para_line', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
      out.origin[w] = await page.evaluate(PROBE).catch(e => ({ error: String(e) }));
      await ctx.close();
    }
    // ---- 本项目 ----
    {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      const page = await ctx.newPage();
      await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'load' });
      await page.evaluate(txt => {
        localStorage.clear();
        localStorage.setItem('nzd_articles_v1', JSON.stringify([
          { id: 'huoda_test', title: '《豁达》', author: '符江', source: '散文一百篇', builtin: false, text: txt }
        ]));
      }, TEXT);
      await page.goto('http://127.0.0.1:8899/index.html#/p/huoda_test', { waitUntil: 'load' });
      await page.waitForSelector('#level_para_lines .level_para_line', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
      out.mine[w] = await page.evaluate(PROBE).catch(e => ({ error: String(e) }));
      await ctx.close();
    }
    console.log('width ' + w + ' done');
  }

  console.log('\n宽    | 原站 line/box/每行/字号 | 本项目 line/box/每行/字号');
  for (const w of WIDTHS) {
    const a = out.origin[w] || {}, b = out.mine[w] || {};
    const f = o => [o.line_w, o.box_w, o.max_per_line, o.fs].join(' / ');
    console.log(String(w).padEnd(5) + ' | ' + f(a).padEnd(24) + ' | ' + f(b));
  }
  console.log('\n原站标题:', out.origin[WIDTHS[0]] && out.origin[WIDTHS[0]].title);
  console.log('我方标题:', out.mine[WIDTHS[0]] && out.mine[WIDTHS[0]].title);
  await browser.close();
})();
