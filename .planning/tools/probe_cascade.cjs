/* 在原站真实页面上，人工给 .word_box 加 correct/incorrect，读 CSS 级联后的真实颜色，
   并把「哪条规则最终生效」也列出来。 */
const { chromium } = require('playwright-core');
const path = require('path');

const EXE = path.join(process.env.HOME, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE, args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-gpu']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('https://www.nezhadazi.com/level/29-2-101.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#level_page_0 .level_para_line', { timeout: 30000 });
  await page.waitForTimeout(1500);

  const res = await page.evaluate(() => {
    const line = [...document.querySelectorAll('#level_page_0 .level_para_line')].find(l => l.querySelector('.word_label'));
    if (!line) return { err: 'no line' };
    const boxes = [...line.querySelectorAll('.word_box')];
    boxes[0].classList.add('correct');
    boxes[1].classList.add('incorrect');
    const rd = el => el ? getComputedStyle(el).color : null;
    const ls = el => el ? getComputedStyle(el).fontSize : null;

    // 列出所有「选择器能命中该元素且带 color」的规则
    function rulesFor(el) {
      const out = [];
      for (const ss of document.styleSheets) {
        let rules; try { rules = ss.cssRules; } catch (e) { continue; }
        if (!rules) continue;
        for (const r of rules) {
          if (!r.selectorText || !/color/.test(r.style && r.style.cssText || '')) continue;
          let hit = false;
          try { hit = el.matches(r.selectorText); } catch (e) { continue; }
          if (hit) out.push({ sel: r.selectorText, color: r.style.color, href: (ss.href || 'inline').split('/').pop() });
        }
      }
      return out;
    }
    const corLabel = boxes[0].querySelector('.word_label');
    const incLabel = boxes[1].querySelector('.word_label');
    const plainLabel = boxes[2] ? boxes[2].querySelector('.word_label') : null;

    return {
      body_class: document.body.className,
      correct_box_cls: boxes[0].className,
      correct_label_color: rd(corLabel),
      correct_label_size: ls(corLabel),
      incorrect_label_color: rd(incLabel),
      plain_label_color: rd(plainLabel),
      correct_rules: rulesFor(corLabel),
      incorrect_rules: rulesFor(incLabel),
      plain_rules: rulesFor(plainLabel)
    };
  });
  console.log(JSON.stringify(res, null, 2));
  await page.screenshot({ path: path.join(__dirname, '../reference/origin/live_color_probe.png') });
  await browser.close();
})();
