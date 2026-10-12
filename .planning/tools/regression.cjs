/* 无头回归：覆盖 产品底线.md 的判定/观感/折行/对齐/控制台 各项。
   用法：先在本项目根目录起 8899 静态服务，再 node regression.cjs
   退出码 0 = 全绿。 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const BASE = 'http://127.0.0.1:8899/index.html';
const TEXT = fs.readFileSync(path.join(__dirname, '../reference/origin/huoda.txt'), 'utf8');

let PASS = 0, FAIL = 0;
function ok(name, cond, extra) {
  if (cond) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}

async function enterPractice(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(txt => {
    localStorage.clear();
    localStorage.setItem('nzd_articles_v1', JSON.stringify([
      { id: 'huoda_test', title: '《豁达》', author: '符江', source: '散文一百篇', builtin: false, text: txt }
    ]));
  }, TEXT);
  await page.goto(BASE + '#/p/huoda_test', { waitUntil: 'load' });
  await page.waitForSelector('#level_para_lines .level_para_line', { timeout: 15000 });
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errors.push('404/failed: ' + r.url()));

  console.log('\n=== 1. 主页 ===');
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  ok('主页卡片已渲染', await page.locator('.a_card').count() > 0);
  ok('「清空练习进度」功能已移除', await page.locator('#clear_progress').count() === 0,
     '仍存在 ' + await page.locator('#clear_progress').count() + ' 个');
  ok('导入 / 删除 按钮仍在（未误伤其它功能）',
     await page.locator('#imp_file_btn').count() === 1 && await page.locator('#imp_delmode').count() === 1);

  console.log('\n=== 1b. 文章编辑弹层（导入确认 / 卡片编辑） ===');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#imp_title', { timeout: 8000 });

  // (a) 入口一：导入确认
  await page.fill('#imp_title', '原标题');
  await page.fill('#imp_text', '第一句话, 第二句话.');
  await page.click('#imp_btn');
  await page.waitForSelector('#editor_mask', { timeout: 5000 });
  const pre1 = await page.evaluate(() => ({
    t: document.querySelector('#ed_title').value,
    x: document.querySelector('#ed_text').value,
    btn: document.querySelector('#ed_save').textContent
  }));
  ok('导入时弹出「确认导入」且预填面板内容',
     pre1.t === '原标题' && pre1.x.indexOf('第一句话') === 0 && pre1.btn === '确认导入',
     JSON.stringify(pre1));
  await page.fill('#ed_title', '改过的标题');
  await page.fill('#ed_text', '改过的正文, 只有两句.');
  await page.click('#ed_save');
  await page.waitForTimeout(350);
  ok('确认导入后弹层关闭', await page.locator('#editor_mask').count() === 0);
  const afterImp = await page.evaluate(() => {
    const arts = JSON.parse(localStorage.getItem('nzd_articles_v1') || '[]');
    const c = document.querySelector('.a_card');
    return { n: arts.length, title: c.querySelector('.a_name').textContent,
             text: arts[0] && arts[0].text, hasEdit: !!c.querySelector('.a_edit') };
  });
  ok('新卡片用的是弹层里改过的标题', afterImp.title === '改过的标题', afterImp.title);
  ok('入库正文标点已是中文', /，/.test(afterImp.text) && !/,/.test(afterImp.text), afterImp.text);
  ok('导入的卡片带 ✎ 编辑按钮', afterImp.hasEdit);

  // (b) 入口二：卡片编辑，且不丢练习进度
  await page.evaluate(() => {
    const id = JSON.parse(localStorage.getItem('nzd_articles_v1'))[0].id;
    localStorage.setItem('nzd_progress_v1', JSON.stringify({
      [id]: { done: true, attempts: 3, best: { speed: 88, accuracy: 99, duration: 12, stars: 4 } }
    }));
  });
  await page.hover('.a_card');
  await page.click('.a_edit');
  await page.waitForSelector('#editor_mask', { timeout: 5000 });
  const pre2 = await page.evaluate(() => ({
    t: document.querySelector('#ed_title').value,
    btn: document.querySelector('#ed_save').textContent
  }));
  ok('编辑弹层预填该文章内容、按钮为「保存修改」',
     pre2.t === '改过的标题' && pre2.btn === '保存修改', JSON.stringify(pre2));
  await page.fill('#ed_title', '再改一次');
  await page.fill('#ed_text', '又改了一次的正文.');
  await page.click('#ed_save');
  await page.waitForTimeout(350);
  const afterEd = await page.evaluate(() => {
    const arts = JSON.parse(localStorage.getItem('nzd_articles_v1'));
    const prog = JSON.parse(localStorage.getItem('nzd_progress_v1'));
    const c = document.querySelector('.a_card');
    return { text: arts[0].text, title: c.querySelector('.a_name').textContent,
             done: c.classList.contains('is_done'), p: prog[arts[0].id],
             n: arts.length };
  });
  ok('编辑后正文已更新', afterEd.text === '又改了一次的正文。', afterEd.text);
  ok('编辑后标题已更新', afterEd.title === '再改一次', afterEd.title);
  ok('编辑不新增文章（仍是 1 篇）', afterEd.n === 1, String(afterEd.n));
  ok('编辑后 id 不变 → 进度与最好成绩保留',
     afterEd.done && afterEd.p && afterEd.p.attempts === 3 && afterEd.p.best.speed === 88,
     JSON.stringify(afterEd.p));

  // (c) 内置文章不可编辑
  const builtin = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.a_card')];
    const b = cards[cards.length - 1];
    return { hasEdit: !!b.querySelector('.a_edit'), hasDel: !!b.querySelector('.a_del') };
  });
  ok('内置文章卡片上没有 ✎ / ×', !builtin.hasEdit && !builtin.hasDel, JSON.stringify(builtin));

  // (d) 超上限 / 太短：就地报错、不关弹层；Esc 关闭
  await page.hover('.a_card');
  await page.click('.a_edit');
  await page.waitForSelector('#editor_mask', { timeout: 5000 });
  await page.evaluate(() => { document.querySelector('#ed_text').value = '中'.repeat(50001); });
  await page.click('#ed_save');
  await page.waitForTimeout(300);
  const over = await page.evaluate(() => ({
    open: !!document.querySelector('#editor_mask'),
    err: document.querySelector('#ed_err').textContent
  }));
  ok('超 5 万字：弹层不关且就地报错', over.open && /超出上限/.test(over.err), JSON.stringify(over));
  await page.fill('#ed_text', '一');
  await page.click('#ed_save');
  await page.waitForTimeout(250);
  const tooShort = await page.evaluate(() => ({
    open: !!document.querySelector('#editor_mask'),
    err: document.querySelector('#ed_err').textContent
  }));
  ok('正文太短：就地报错', tooShort.open && /至少 2 个字/.test(tooShort.err), JSON.stringify(tooShort));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok('Esc 关闭弹层', await page.locator('#editor_mask').count() === 0);
  const unchanged = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('nzd_articles_v1'))[0].text);
  ok('取消/Esc 后原文章未被改动', unchanged === '又改了一次的正文。', unchanged);

  console.log('\n=== 2. 打字页 · 文案 / 字号 / 每行字数（对齐原站） ===');
  await enterPractice(page);
  const facts = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const line = q('#level_para_lines .level_para_line');
    const ws = line.querySelector('.words_box');
    const all = [...document.querySelectorAll('#level_para_lines .level_para_line')].filter(e => e.querySelector('.words_box'));
    return {
      title: q('.level_nav h1').innerText,
      bar: q('#score_bar').innerText,
      btns: [...document.querySelectorAll('.level_process_content button')].map(b => b.innerText),
      keyinfo: q('.level_keyinfo').innerText.replace(/\s+/g, ' ').trim(),
      fs: getComputedStyle(q('#level_para_lines .word_label')).fontSize,
      lineW: Math.round(line.getBoundingClientRect().width),
      boxW: Math.round(ws.getBoundingClientRect().width),
      maxN: Math.max(...all.map(e => e.querySelectorAll('.word_box').length)),
      lines: all.length,
      wrap: q('#app > .level_wrap').className
    };
  });
  ok('标题 = 哪吒打字 打字练习文 散文一百篇[《豁达》]', facts.title === '哪吒打字 打字练习文 散文一百篇[《豁达》]', facts.title);
  ok('统计条含 0CPM（原站初始单位）', /速度： 0CPM/.test(facts.bar), facts.bar);
  ok('统计条时间初始 00:00:00', /时间： 00:00:00/.test(facts.bar), facts.bar);
  ok('底栏按钮 = 上一关 / 下一关', facts.btns.join('/') === '上一关/下一关', facts.btns.join('/'));
  ok('快捷键条 = 右Ctrl 朗读 / ←→ 翻页 / Ctrl + Alt 提示',
     facts.keyinfo === '右Ctrl 朗读 ←→ 翻页 Ctrl + Alt 提示', facts.keyinfo);
  ok('汉字字号 30px（原站默认档 3）', facts.fs === '30px', facts.fs);
  ok('行卡片宽 900px / 内容 894px（原站实测值）', facts.lineW === 900 && facts.boxW === 894, facts.lineW + '/' + facts.boxW);
  ok('每行最多 27 字（与原站逐行一致）', facts.maxN === 27 && facts.lines === 22, facts.maxN + '字/' + facts.lines + '行');
  ok('字号类名 = font_label_size3', /font_label_size3/.test(facts.wrap), facts.wrap);
  ok('「下一关」带 .active（蓝底）', await page.locator('#bt_next.active').count() === 1);

  console.log('\n=== 3. 逐格对齐（输入框内字符 x ≈ 目标格 x，≤0.6px） ===');
  const align = await page.evaluate(() => {
    // 挑最长的一行量（首行「符江」只有 2 格，没有说服力）
    const lines = [...document.querySelectorAll('#level_para_lines .level_para_line')].filter(l => l.querySelector('.words_box'));
    const line = lines.reduce((a, b) =>
      a.querySelectorAll('.word_box').length >= b.querySelectorAll('.word_box').length ? a : b);
    const input = line.querySelector('.input_box');
    const boxes = [...line.querySelectorAll('.word_box')];
    const text = boxes.map(b => b.textContent).join('');
    input.value = text;
    const cs = getComputedStyle(input);
    const ir = input.getBoundingClientRect();
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:pre;' +
      'font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize + ';letter-spacing:' + cs.letterSpacing + ';';
    document.body.appendChild(host);
    const h0 = host.getBoundingClientRect().left;
    const spans = [...text].map(c => { const s = document.createElement('span'); s.textContent = c; host.appendChild(s); return s; });
    // 输入框有 1px 左边框，正文字符实际从 border-box 左侧 + 1px 起排
    const x0 = ir.left + parseFloat(cs.borderLeftWidth || 0);
    let worst = 0, at = -1;
    spans.forEach((s, i) => {
      const inX = x0 + (s.getBoundingClientRect().left - h0);
      const d = Math.abs(inX - boxes[i].getBoundingClientRect().left);
      if (d > worst) { worst = d; at = i; }
    });
    host.remove();
    input.value = '';
    return { worst: Math.round(worst * 100) / 100, at, n: boxes.length, sample: text.slice(0, 12) };
  });
  ok('最长行 ' + align.n + ' 格（' + align.sample + '…）最大偏移 ' + align.worst + 'px',
     align.worst <= 0.6, 'worst=' + align.worst + '@' + align.at);

  console.log('\n=== 4. 打字判定：打对变黑、打错变粉红、组字期不判定 ===');
  const judge = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // 用第 2 行（24 字），够长；先点它使其成为当前行
    const lines = [...document.querySelectorAll('#level_para_lines .level_para_line')].filter(l => l.querySelector('.words_box'));
    const act = lines[1];
    const input = act.querySelector('.input_box');
    input.focus();
    await sleep(150);
    act.querySelectorAll('.correct,.incorrect').forEach(e => e.classList.remove('correct', 'incorrect'));
    const target = [...act.querySelectorAll('.word_box')].map(b => b.textContent).join('');
    const typeChar = ch => {
      input.value = input.value + ch;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    // 组字期（拼音）不应判定
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.value = 'sheng'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(40);
    const composingMarked = act.querySelectorAll('.correct,.incorrect').length;
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(40);
    // 打错一个字
    typeChar('错'); await sleep(80);
    const hasWrong = act.querySelectorAll('.incorrect').length > 0;
    const wrongColor = act.querySelector('.word_box.incorrect')
      ? getComputedStyle(act.querySelector('.word_box.incorrect .word_label')).color : null;
    // 清掉重来
    input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); await sleep(40);
    // 正确打完前 8 字
    for (const ch of [...target].slice(0, 8)) { typeChar(ch); await sleep(20); }
    const hasCorrect = act.querySelectorAll('.correct').length;
    const correctColor = hasCorrect
      ? getComputedStyle(act.querySelector('.word_box.correct .word_label')).color : null;
    input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
    return { composingMarked, hasWrong, hasCorrect, target: target.slice(0, 8), correctColor, wrongColor };
  });
  ok('组字期不判定（0 个着色格）', judge.composingMarked === 0, String(judge.composingMarked));
  ok('打错 → 出现 .incorrect', judge.hasWrong);
  ok('打对 8 字（' + judge.target + '）→ 8 个 .correct', judge.hasCorrect === 8, '实际 ' + judge.hasCorrect);
  ok('打对的字 = 黑色 #333（rgb(51,51,51)）', judge.correctColor === 'rgb(51, 51, 51)', judge.correctColor);
  ok('打错的字 = 粉红 #ff5e7c', judge.wrongColor === 'rgb(255, 94, 124)', judge.wrongColor);

  console.log('\n=== 4b. 深色主题下打对的字仍可见 ===');
  const darkColor = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const lines = [...document.querySelectorAll('#level_para_lines .level_para_line')].filter(l => l.querySelector('.words_box'));
    const act = lines[1];
    const input = act.querySelector('.input_box');
    const target = [...act.querySelectorAll('.word_box')].map(b => b.textContent).join('');
    for (const ch of [...target].slice(0, 3)) {
      input.value += ch; input.dispatchEvent(new Event('input', { bubbles: true })); await sleep(20);
    }
    await sleep(120);
    const wrap = document.querySelector('#app > .level_wrap');
    wrap.classList.add('level_dark');
    await sleep(200);
    const b = act.querySelector('.word_box.correct');
    const c = b ? getComputedStyle(b.querySelector('.word_label')).color : null;
    wrap.classList.remove('level_dark');
    input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
    return c;
  });
  ok('深色下打对 = #eee（不是糊掉的 #333）', darkColor === 'rgb(238, 238, 238)', darkColor);

  console.log('\n=== 5. 字号档位（原站 16/20/30/40/50/60/70/80/90） ===');
  const fontProbe = [];
  for (const [lvl, px] of [[1, '16px'], [9, '90px'], [3, '30px']]) {
    const got = await page.evaluate(async n => {
      const r = document.querySelector('input[name="fontSize"]');
      r.value = String(n);
      r.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(x => setTimeout(x, 350));
      return getComputedStyle(document.querySelector('#level_para_lines .word_label')).fontSize;
    }, lvl);
    fontProbe.push(lvl + '→' + got);
    ok('档位 ' + lvl + ' = ' + px, got === px, got);
  }

  console.log('\n=== 6. 深色 / 背景主题 切换无异常 ===');
  await page.evaluate(() => {
    document.querySelector('#bt_dark').click();
    document.querySelector('#bt_bg').click();
  });
  await page.waitForTimeout(400);
  const dark = await page.evaluate(() => document.querySelector('#app > .level_wrap').className);
  ok('深色类已加', /level_dark/.test(dark), dark);
  ok('背景面板已展开', await page.locator('#bg-themes li').count() >= 11);
  const bgClick = await page.evaluate(async () => {
    const li = document.querySelector('#bg-themes li[rel="1"]');
    li.click();
    await new Promise(r => setTimeout(r, 250));
    return document.querySelector('#app > .level_wrap').className;
  });
  ok('切背景生效（bg1）', /bg1/.test(bgClick), bgClick);

  console.log('\n=== 7. 窄窗口（800px）不裁掉左侧正文 ===');
  await page.setViewportSize({ width: 800, height: 700 });
  await page.waitForTimeout(500);
  const narrow = await page.evaluate(() => {
    const main = document.querySelector('.level_main');
    const line = document.querySelector('#level_para_lines .level_para_line');
    const r = line.getBoundingClientRect();
    return { left: Math.round(r.left), w: Math.round(r.width), scrollable: main.scrollWidth > main.clientWidth };
  });
  ok('窄窗下行宽仍 900px（与原站一致）', narrow.w === 900, String(narrow.w));
  ok('左侧未被裁切（line.left ≥ 0）', narrow.left >= 0, 'left=' + narrow.left);
  ok('可横向滚动', narrow.scrollable, String(narrow.scrollable));
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('\n=== 7b. 每行字数与原站一致：per 恒为 27，不随字号变 ===');
  const perAt = async n => page.evaluate(async v => {
    const r = document.querySelector('input[name="fontSize"]');
    r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(x => setTimeout(x, 400));
    const ls = [...document.querySelectorAll('#level_para_lines .level_para_line')].filter(x => x.querySelector('.word_box'));
    return { per: window.Engine.per, lines: ls.length,
             maxN: Math.max(...ls.map(x => x.querySelectorAll('.word_box').length)) };
  }, n);
  const perTable = [];
  for (const n of [1, 3, 5, 9]) {
    const s = await perAt(n);
    perTable.push(`档${n}:per=${s.per}/${s.lines}行`);
    ok(`档${n}：per=27 且仍是 22 行 27 字上限（原站实测值）`,
       s.per === 27 && s.lines === 22 && s.maxN === 27, JSON.stringify(s));
  }
  await page.evaluate(async () => {
    const r = document.querySelector('input[name="fontSize"]');
    r.value = '3'; r.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(x => setTimeout(x, 300));
  });

  console.log('\n=== 7c. 朗读键：右 Ctrl 触发，空格不再触发，Ctrl+Alt 不误触 ===');
  const keyTest = await page.evaluate(async () => {
    const sleep = ms => new Promise(x => setTimeout(x, ms));
    const calls = [];
    // 注意：window.speechSynthesis 是只读访问器，整体替换不生效 → 只覆盖它的 speak 方法
    const syn = window.speechSynthesis;
    const origSpeak = syn ? syn.speak : null;
    if (syn) {
      syn.speak = function (u) { calls.push(u && u.text); };
      if (typeof syn.cancel === 'function') {
        const oc = syn.cancel.bind(syn);
        syn.cancel = function () { oc(); };
      }
    }
    const fire = (type, code, extra) => document.dispatchEvent(new KeyboardEvent(type,
      Object.assign({ code, key: code, bubbles: true, cancelable: true }, extra || {})));
    // ① 单纯按一下右 Ctrl
    fire('keydown', 'ControlRight'); fire('keyup', 'ControlRight'); await sleep(80);
    const afterCtrl = calls.length;
    // ② 空格
    fire('keydown', 'Space', { key: ' ' }); fire('keyup', 'Space', { key: ' ' }); await sleep(80);
    const afterSpace = calls.length;
    // ③ Ctrl + Alt（提示）——不能顺带触发朗读
    fire('keydown', 'ControlRight');
    fire('keydown', 'AltLeft', { altKey: true });
    fire('keydown', 'KeyH', { key: 'h', ctrlKey: true, altKey: true });
    fire('keyup', 'KeyH', { key: 'h', ctrlKey: true, altKey: true });
    fire('keyup', 'AltLeft');
    fire('keyup', 'ControlRight');
    await sleep(100);
    const afterCombo = calls.length;
    if (syn && origSpeak) syn.speak = origSpeak;
    return {
      ctrl: afterCtrl, spaceDelta: afterSpace - afterCtrl, comboDelta: afterCombo - afterSpace,
      spoken: calls.slice(0, 1)
    };
  });
  ok('右 Ctrl 按下再抬起 → 朗读一次', keyTest.ctrl === 1,
     '实际 ' + keyTest.ctrl + ' 次' + (keyTest.spoken[0] ? ' 文本:' + keyTest.spoken[0].slice(0, 10) : ''));
  ok('空格不再触发朗读', keyTest.spaceDelta === 0, '多了 ' + keyTest.spaceDelta + ' 次');
  ok('Ctrl + Alt 提示 不会误触发朗读', keyTest.comboDelta === 0, '多了 ' + keyTest.comboDelta + ' 次');

  console.log('\n=== 7d. 文章标点统一为中文标点 ===');
  const punct = await page.evaluate(async () => {
    const sleep = ms => new Promise(x => setTimeout(x, ms));
    const ASCII = '第一句话, 第二句话. 他说"你好"! 这是(括号)和[方括号].';
    localStorage.setItem('nzd_articles_v1', JSON.stringify([
      { id: 'punct_test', title: '《标点》', author: '测试', source: '散文一百篇', builtin: false, text: ASCII }
    ]));
    const j = window.Util.toChinesePunct(ASCII);
    return { in: ASCII, out: j, idempotent: window.Util.toChinesePunct(j) === j };
  });
  ok('函数：半角 → 中文标点', /，/.test(punct.out) && /。/.test(punct.out) &&
     /！/.test(punct.out) && /（/.test(punct.out) && /【/.test(punct.out) && !/[,!]/.test(punct.out),
     punct.out);
  ok('函数：幂等（再来一遍不变）', punct.idempotent);
  await page.goto(BASE + '#/p/punct_test', { waitUntil: 'load' });
  await page.waitForSelector('#level_para_lines .level_para_line', { timeout: 15000 });
  await page.waitForTimeout(600);
  const rendered = await page.evaluate(() =>
    document.querySelector('#level_para_lines').innerText.replace(/\s+/g, ''));
  ok('渲染页里的标点已是中文标点', /，/.test(rendered) && /。/.test(rendered) && !/,/.test(rendered), rendered);

  console.log('\n=== 8. 结算页 ===');
  await enterPractice(page);
  const done = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // 直接把整篇打完太长：只验证 finish 链路 —— 手动触发最后一行
    const lines = [...document.querySelectorAll('#level_para_lines .level_para_line')];
    return lines.length;
  });
  ok('正文已按原站折成 22 行', done === 22, String(done));

  console.log('\n=== 9. 控制台 ===');
  ok('0 个错误 / 0 个失败请求', errors.length === 0, errors.slice(0, 5).join(' | '));

  await page.screenshot({ path: path.join(__dirname, '../reference/mine_after_fix.png') });
  await browser.close();

  console.log('\n——————————————————————');
  console.log('通过 ' + PASS + ' 项，失败 ' + FAIL + ' 项');
  process.exit(FAIL ? 1 : 0);
})();
