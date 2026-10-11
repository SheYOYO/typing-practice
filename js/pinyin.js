/* pinyin.js —— 汉字 → 拼音 查询与文本切分
   依赖 pinyin-data.js 提供的 window.PINYIN_DATA。
   说明：本文件只负责「给每个汉字配一个提示用的拼音」，不参与打字判分。 */
(function (global) {
  'use strict';

  var dict = Object.create(null);

  /* 解析紧凑串：汉字 + [a-z]+ 顺排，因字符集不相交可顺序扫描 */
  function buildDict(raw) {
    var i = 0, n = raw.length;
    while (i < n) {
      var ch = raw[i];
      i++;
      var j = i;
      while (j < n) {
        var c = raw.charCodeAt(j);
        // 'a'=97 .. 'z'=122
        if (c >= 97 && c <= 122) j++; else break;
      }
      if (j > i) dict[ch] = raw.substring(i, j);
      i = j;
    }
  }

  if (global.PINYIN_DATA) buildDict(global.PINYIN_DATA);

  /* 中文标点 → 提示用的键位（沿用原站：：→: ，→, 等） */
  var PUNCT = {
    '，': ',', '。': '.', '、': '\\', '；': ';', '：': ':',
    '？': '?', '！': '!', '“': '"', '”': '"', '‘': "'", '’': "'",
    '（': '(', '）': ')', '《': '<', '》': '>', '【': '[', '】': ']',
    '—': '-', '－': '-', '…': '^', '·': '.', '　': 'space'
  };

  function isHan(ch) {
    var c = ch.charCodeAt(0);
    return c >= 0x4E00 && c <= 0x9FFF;
  }

  /* 单个字符的提示信息 */
  function pinyinOf(ch) {
    if (!ch) return '';
    if (isHan(ch)) return dict[ch] || '';
    if (PUNCT[ch]) return PUNCT[ch];
    if (ch === ' ') return 'space';
    return ch; // 英文/数字/半角符号：提示即其本身
  }

  /* ===== 分行（还原原站「服务端分行 + 前端定长续切」两层逻辑） =====
     依据：/level/29-2-101.html 实测的 pagedata.lines 与最终 DOM 行对比
       ┌ pagedata.lines[8] = "容不得半点污秽和虚伪，是黑而决不会说白、是鹿决不会说是马。" (29字)
       └ 最终 DOM        = "容不得半点污秽和虚伪，是黑而决不会说白、是鹿决不会说是" (27字)
                          + "马。" (2字)          ← 29 字被**从腰斩断**，标点完全不避让
       ┌ pagedata.lines[1] = "生活老人悄悄告诉我：性格开朗并非豁达之全部内涵，" (以逗号结尾却独立成行)
     ⇒ 反推出的真实规则（两层，缺一不可）：
       ① **服务端按原文换行 \n 分行**，不是按句号分句（逗号结尾照样成行就是铁证）；
          段落之间不插空行，整篇拍平成连续的行数组。
       ② **前端按可视宽度定长续切**：student.js 里
            line_text_len = getMaxCharsByFilling('tmp_input', split) - 2; if (<10) = 10;
          实测 1440px 宽 / 30px 字号下 = 27 字。切的时候不避让标点。
       ③ 用户看到的「一句一行」只是因为原站素材本身一句一行，不是引擎的行为。
     本项目的额外处理：对**没有换行的连续长段落**（用户导入常见），额外在句末标点处
     断一下，让效果贴近原站素材的「一句一行」观感；对原站那种一句一行的素材无副作用
     （每行本来就只有一个句末标点且在末尾，切完还是原样）。 */
  var SENT_END = '。！？；…';
  var SENT_TAIL = '。！？；…”＂〕』》）"\'';

  function splitSentences(text) {
    var out = [];
    var paras = String(text || '').replace(/\r\n?/g, '\n').split('\n');

    function flush(s) {
      var t = String(s || '').trim();
      if (t) out.push(t);
    }

    paras.forEach(function (para) {
      var s = String(para || '').trim();
      if (!s) return;                       // 空行不保留（原站 lines 里没有空行）
      var chars = Array.from(s);
      var buf = '';
      for (var i = 0; i < chars.length; i++) {
        buf += chars[i];
        if (SENT_END.indexOf(chars[i]) < 0) continue;
        // 吃掉紧随其后的连续句末标点 / 收尾引号，避免「？？」被拆成两行
        while (i + 1 < chars.length && SENT_TAIL.indexOf(chars[i + 1]) >= 0) {
          i++;
          buf += chars[i];
        }
        flush(buf);
        buf = '';
      }
      flush(buf);   // 没有句末标点的尾巴（标题、末句、整段无标点）
    });

    if (!out.length) out = [String(text || '').trim() || ''];
    return out;
  }

  /* 把一篇文章切成「句」再转成单元数组
     返回：[ [ { ch, py, han }, ... ], ... ]（每句一组） */
  function splitLines(text) {
    return splitSentences(text).map(function (line) {
      var chars = Array.from(line);
      var buf = [];
      for (var i = 0; i < chars.length; i++) {
        var ch = chars[i];
        if (ch === '\t') ch = ' ';
        buf.push({ ch: ch, py: pinyinOf(ch), han: isHan(ch) });
      }
      return buf;
    });
  }

  global.Pinyin = {
    of: pinyinOf,
    isHan: isHan,
    splitLines: splitLines,
    splitSentences: splitSentences,
    size: function () { return Object.keys(dict).length; }
  };
})(window);
