/* util.js —— 公共工具函数（engine.js / app.js / result.js 共用）
   消除各处重复的 el / esc / pad2 / fmtTime。 */
(function (global) {
  'use strict';

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
  }

  /* 打字页计时显示：原站 student.js 的定时器只拼「分:秒」（小时那段被注释掉了），
     所以运行中的时间形如 00:03、01:12 —— 不是 00:00:03。 */
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60);
  }

  /* 把文章里的半角标点统一成中文（全角）标点。
     内置文章、导入文章、以及历史上已经存在本机 localStorage 的文章，
     在渲染时都会过一遍 —— 本身就是幂等的（中文标点不会被二次改动）。

     会转换：, . ! ? ; : ( ) [ ] < > ~ " '  以及 ... 与 --
     刻意不碰（避免误伤）：
       · 数字中间的 . 与 ,（3.14 / 1,000 保持原样）
       · 单个连字符 -（人名、复合词里的连字符），只有 -- / --- 才变破折号 ——
       · 代码味符号 \ / | ` { } ^ $ # @ % * & _ + = 一律保持原样 */
  function toChinesePunct(s) {
    if (s == null) return s;
    var t = String(s);
    if (!t) return t;

    t = t.replace(/\.{2,}/g, '……');     // ... / …… → 省略号
    t = t.replace(/-{2,}/g, '——');      // -- / --- → 破折号
    t = t.replace(/~/g, '～');

    // 数字里的小数点/千分位不动
    t = t.replace(/\./g, function (m, i, str) {
      return (/[0-9]/.test(str.charAt(i - 1)) && /[0-9]/.test(str.charAt(i + 1))) ? '.' : '。';
    });
    t = t.replace(/,/g, function (m, i, str) {
      return (/[0-9]/.test(str.charAt(i - 1)) && /[0-9]/.test(str.charAt(i + 1))) ? ',' : '，';
    });

    t = t.replace(/!/g, '！').replace(/\?/g, '？')
         .replace(/;/g, '；').replace(/:/g, '：');
    t = t.replace(/[(\[]/g, function (m) { return m === '(' ? '（' : '【'; })
         .replace(/[)\]]/g, function (m) { return m === ')' ? '）' : '】'; });
    t = t.replace(/</g, '《').replace(/>/g, '》');

    // 成对的直引号按出现顺序改成中文弯引号
    var dq = 0, sq = 0;
    t = t.replace(/"/g, function () { return (dq++ % 2 === 0) ? '“' : '”'; });
    t = t.replace(/'/g, function () { return (sq++ % 2 === 0) ? '‘' : '’'; });

    return t;
  }

  global.Util = {
    el: el, esc: esc, pad2: pad2, fmtTime: fmtTime, fmtClock: fmtClock,
    toChinesePunct: toChinesePunct
  };
})(window);
