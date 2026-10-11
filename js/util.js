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

  global.Util = { el: el, esc: esc, pad2: pad2, fmtTime: fmtTime, fmtClock: fmtClock };
})(window);
