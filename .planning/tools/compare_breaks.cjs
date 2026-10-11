/* 把「原站」与「本项目」在**同一篇文章、同一视口**下的分行结果逐行抓出来对比，
   并额外测：改字号后两边的每行字数会怎么变。 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const TEXT = fs.readFileSync(path.join(__dirname, '../reference/origin/huoda.txt'), 'utf8');

// 取每个 .level_para_line 的可见文字
const GRAB = () => {
  const lines = [...document.querySelectorAll('.level_para_line')]
    .filter(l => l.querySelector('.word_box'));
  return lines.map(l => [...l.querySelectorAll('.word_box')]
    .map(b => b.querySelector('.word_label').textContent).join(''));
};
const PROBE_PER = () => {
  // 复刻原站 getMaxCharsByFilling：往一个 input 里灌「中」做二分
  const inp = document.querySelector('#tmp_input')
    || document.querySelector('.level_para_line .input_box');
  if (!inp) return null;
  const save = inp.value;
  const s = '中'.repeat(500);
  inp.value = s;
  let lo = 0, hi = s.length, res = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    inp.value = s.substring(0, mid);
    if (inp.scrollWidth <= inp.clientWidth) { res = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  inp.value = save;
  return res;
};

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE, args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-gpu']
  });

  // ==================== 原站 ====================
  const octx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const op = await octx.newPage();
  await op.goto('https://www.nezhadazi.com/level/29-2-101.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await op.waitForSelector('#level_page_0 .level_para_line .word_box', { timeout: 30000 });
  await op.waitForTimeout(1800);
  const originLines = await op.evaluate(GRAB);
  const originInfo = await op.evaluate(() => {
    const l = document.querySelector('#level_page_0 .level_para_line');
    const inp = l.querySelector('.input_box');
    return {
      lineW: Math.round(l.getBoundingClientRect().width),
      boxW: Math.round(l.querySelector('.words_box').getBoundingClientRect().width),
      inputW: Math.round(inp.getBoundingClientRect().width),
      inputClientW: inp.clientWidth,
      fs: getComputedStyle(l.querySelector('.word_label')).fontSize,
      body: document.body.className
    };
  });
  console.log('=== 原站 ===');
  console.log('卡片/内容/输入框/输入框可用:', originInfo.lineW, originInfo.boxW, originInfo.inputW, originInfo.inputClientW, '字号', originInfo.fs);
  console.log('body:', originInfo.body);
  console.log('行数', originLines.length, '每行字数', originLines.map(x => x.length).join(','));
  // 原站改字号后重算
  const originByFont = {};
  for (const [lvl, px] of [[1, 16], [3, 30], [5, 50], [9, 90]]) {
    const r = await op.evaluate(async ([n, p]) => {
      document.body.classList.remove(...[...document.body.classList].filter(c => /^font_label_size\d/.test(c)));
      document.body.classList.add('font_label_size' + n);
      await new Promise(x => setTimeout(x, 400));
      const l = document.querySelector('#level_page_0 .level_para_line');
      const inp = l.querySelector('.input_box');
      const s = '中'.repeat(500); inp.value = s;
      let lo = 0, hi = s.length, res = 0;
      while (lo <= hi) { const mid = Math.floor((lo + hi) / 2); inp.value = s.substring(0, mid);
        if (inp.scrollWidth <= inp.clientWidth) { res = mid; lo = mid + 1; } else hi = mid - 1; }
      inp.value = '';
      return { fs: getComputedStyle(l.querySelector('.word_label')).fontSize,
               lineW: Math.round(l.getBoundingClientRect().width), fits: res, per: Math.max(10, res - 2) };
    }, [lvl, px]);
    originByFont[lvl] = r;
    console.log(`  原站 档${lvl}: ${r.fs} 卡片${r.lineW} 装得下${r.fits} → per=${r.per}`);
  }
  await op.evaluate(() => {
    document.body.classList.remove(...[...document.body.classList].filter(c => /^font_label_size\d/.test(c)));
    document.body.classList.add('font_label_size3');
  });
  await octx.close();

  // ==================== 本项目 ====================
  const mctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mp = await mctx.newPage();
  await mp.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'load' });
  await mp.evaluate(t => {
    localStorage.clear();
    localStorage.setItem('nzd_articles_v1', JSON.stringify([
      { id: 'x', title: '《豁达》', author: '符江', source: '散文一百篇', builtin: false, text: t }
    ]));
  }, TEXT);
  await mp.goto('http://127.0.0.1:8899/index.html#/p/x', { waitUntil: 'load' });
  await mp.waitForSelector('#level_para_lines .level_para_line', { timeout: 15000 });
  await mp.waitForTimeout(1000);
  const mineLines = await mp.evaluate(GRAB);
  const mineInfo = await mp.evaluate(() => {
    const l = document.querySelector('#level_para_lines .level_para_line');
    const inp = l.querySelector('.input_box');
    return {
      lineW: Math.round(l.getBoundingClientRect().width),
      boxW: Math.round(l.querySelector('.words_box').getBoundingClientRect().width),
      inputW: Math.round(inp.getBoundingClientRect().width),
      inputClientW: inp.clientWidth,
      fs: getComputedStyle(l.querySelector('.word_label')).fontSize,
      wrap: document.querySelector('#app > .level_wrap').className
    };
  });
  console.log('\n=== 本项目 ===');
  console.log('卡片/内容/输入框/输入框可用:', mineInfo.lineW, mineInfo.boxW, mineInfo.inputW, mineInfo.inputClientW, '字号', mineInfo.fs);
  console.log('wrap:', mineInfo.wrap);
  console.log('行数', mineLines.length, '每行字数', mineLines.map(x => x.length).join(','));
  const mineByFont = {};
  for (const [lvl, px] of [[1, 16], [3, 30], [5, 50], [9, 90]]) {
    const r = await mp.evaluate(async (n) => {
      const r = document.querySelector('input[name="fontSize"]');
      r.value = String(n); r.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(x => setTimeout(x, 500));
      const l = document.querySelector('#level_para_lines .level_para_line');
      const inp = l.querySelector('.input_box');
      const s = '中'.repeat(500); inp.value = s;
      let lo = 0, hi = s.length, res = 0;
      while (lo <= hi) { const mid = Math.floor((lo + hi) / 2); inp.value = s.substring(0, mid);
        if (inp.scrollWidth <= inp.clientWidth) { res = mid; lo = mid + 1; } else hi = mid - 1; }
      inp.value = '';
      const ls = [...document.querySelectorAll('#level_para_lines .level_para_line')].filter(x => x.querySelector('.word_box'));
      return { fs: getComputedStyle(l.querySelector('.word_label')).fontSize,
               lineW: Math.round(l.getBoundingClientRect().width), fits: res, per: Math.max(10, res - 2),
               maxLine: Math.max(...ls.map(x => x.querySelectorAll('.word_box').length)) };
    }, lvl);
    mineByFont[lvl] = r;
    console.log(`  本项目 档${lvl}: ${r.fs} 卡片${r.lineW} 装得下${r.fits} → per=${r.per} 实际最长行=${r.maxLine}`);
  }
  await mctx.close();
  await browser.close();

  // ==================== 差异 ====================
  console.log('\n=== 逐行差异（原站 vs 本项目）===');
  const n = Math.max(originLines.length, mineLines.length);
  let diff = 0;
  for (let i = 0; i < n; i++) {
    const a = originLines[i], b = mineLines[i];
    if (a !== b) {
      diff++;
      console.log(`  #${i} 原站(${a === undefined ? '—' : a.length}) ${a === undefined ? '' : JSON.stringify(a)}`);
      console.log(`      我方(${b === undefined ? '—' : b.length}) ${b === undefined ? '' : JSON.stringify(b)}`);
    }
  }
  if (!diff) console.log('  完全一致');
  console.log('\n字号对比表:');
  for (const lvl of [1, 3, 5, 9]) {
    console.log(`  档${lvl}: 原站 per=${originByFont[lvl].per} (${originByFont[lvl].fs}) | 我方 per=${mineByFont[lvl].per} (${mineByFont[lvl].fs})`);
  }
})();
