const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path');
const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
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
  const snap = async () => p.evaluate(() => {
    const ls = [...document.querySelectorAll('#level_para_lines .level_para_line')].filter(x => x.querySelector('.word_box'));
    return { per: window.Engine.per, lines: ls.length,
             maxN: Math.max(...ls.map(x => x.querySelectorAll('.word_box').length)),
             counts: ls.map(x => x.querySelectorAll('.word_box').length).join(',') };
  });
  console.log('默认（档3/30px）:', JSON.stringify(await snap()));
  for (const n of [1, 2, 3, 5, 9]) {
    await p.evaluate(async v => {
      const r = document.querySelector('input[name="fontSize"]');
      r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(x => setTimeout(x, 400));
    }, n);
    const s = await snap();
    console.log(`档${n}: per=${s.per} 行数=${s.lines} 最长行=${s.maxN} ${s.per === 27 && s.lines === 22 && s.maxN === 27 ? '✓' : '✗'}`);
  }
  // 逐格对齐在非默认字号下是否仍成立
  for (const n of [1, 5]) {
    const r = await p.evaluate(async v => {
      const r = document.querySelector('input[name="fontSize"]');
      r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(x => setTimeout(x, 350));
      const lines = [...document.querySelectorAll('#level_para_lines .level_para_line')].filter(l => l.querySelector('.word_box'));
      const line = lines.reduce((a, b) => a.querySelectorAll('.word_box').length >= b.querySelectorAll('.word_box').length ? a : b);
      const inp = line.querySelector('.input_box');
      const boxes = [...line.querySelectorAll('.word_box')];
      const text = boxes.map(x => x.textContent).join('');
      inp.value = text;
      const cs = getComputedStyle(inp);
      const ir = inp.getBoundingClientRect();
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:pre;font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize + ';letter-spacing:' + cs.letterSpacing + ';';
      document.body.appendChild(host);
      const h0 = host.getBoundingClientRect().left;
      const spans = [...text].map(ch => { const s2 = document.createElement('span'); s2.textContent = ch; host.appendChild(s2); return s2; });
      const x0 = ir.left + parseFloat(cs.borderLeftWidth || 0);
      let worst = 0;
      spans.forEach((s2, i) => { const d = Math.abs(x0 + (s2.getBoundingClientRect().left - h0) - boxes[i].getBoundingClientRect().left); if (d > worst) worst = d; });
      host.remove(); inp.value = '';
      return { fs: cs.fontSize, worst: Math.round(worst * 100) / 100 };
    }, n);
    console.log(`档${n} 逐格对齐最大偏移: ${r.worst}px (输入框字号 ${r.fs}) ${r.worst <= 0.6 ? '✓' : '✗'}`);
  }
  await b.close();
})();
