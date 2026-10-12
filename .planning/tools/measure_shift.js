const { chromium } = require('playwright-core');
const path = require('path');
const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'load' });
  await p.waitForSelector('.a_card', { timeout: 8000 });
  const snap = () => p.evaluate(() => {
    const g = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().width) : null; };
    const l = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().left) : null; };
    return {
      bodyW: document.body.clientWidth, docW: document.documentElement.clientWidth,
      mainW: g('.home_main'), mainL: l('.home_main'), panelW: g('.import_panel'),
      scrollbar: window.innerWidth - document.documentElement.clientWidth
    };
  });
  console.log('弹层前:', JSON.stringify(await snap()));
  await p.fill('#imp_text', '测试内容一。测试内容二。');
  await p.click('#imp_btn');
  await p.waitForSelector('#editor_mask', { timeout: 5000 });
  await p.waitForTimeout(400);
  console.log('弹层后:', JSON.stringify(await snap()));
  await b.close();
})();
