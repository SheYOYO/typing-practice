/* app.js —— 路由 + 主界面 + 导入 + 进度存储 + 串联引擎与结算
   依赖：util.js、pinyin.js、engine.js、result.js */
(function (global) {
  'use strict';

  var el = global.Util.el, esc = global.Util.esc;

  var P_KEY = 'nzd_progress_v1';
  var A_KEY = 'nzd_articles_v1';

  /* 导入文章的字数上限
     硬上限 50000 字（远超「一万字以上」的要求），10000 字以内不再弹任何确认；
     超过 10000 字只给一次提示，不阻断导入。 */
  var MAX_CHARS = 50000;
  var WARN_CHARS = 10000;

  /* ---------------- 存储 ---------------- */
  function readJSON(k, dft) {
    try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : dft; } catch (e) { return dft; }
  }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function getProgress() { return readJSON(P_KEY, {}); }
  function setProgress(p) { writeJSON(P_KEY, p); }

  function getImported() { return readJSON(A_KEY, []); }
  function saveImported(list) { writeJSON(A_KEY, list); }

  function allArticles() {
    // 自己导入的排在前面，方便找到
    return getImported().concat(global.BUILTIN_ARTICLES || []);
  }
  function findArticle(id) {
    var list = allArticles();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function countChars(text) {
    return global.Pinyin.splitLines(text).reduce(function (n, l) { return n + l.length; }, 0);
  }

  /* 删除若干篇导入的文章（同时清掉它们的练习进度，避免留下孤儿进度）
     删除内容会记进 lastDeleted，供「撤销」恢复（含原位置与原进度）。 */
  function deleteArticles(ids, silent) {
    var set = {};
    ids.forEach(function (id) { set[id] = 1; });
    var all = getImported();
    var removed = [];
    all.forEach(function (a, i) { if (set[a.id]) removed.push({ art: a, idx: i }); });
    if (!removed.length) return;
    saveImported(all.filter(function (a) { return !set[a.id]; }));

    var p = getProgress(), backup = {}, changed = false;
    removed.forEach(function (r) {
      if (p[r.art.id]) { backup[r.art.id] = p[r.art.id]; delete p[r.art.id]; changed = true; }
    });
    if (changed) setProgress(p);

    lastDeleted = { items: removed, prog: backup };
    pendingNotice = removed.length === 1
      ? '已删除「' + removed[0].art.title + '」'
      : '已删除 ' + removed.length + ' 篇文章';
    pendingUndo = true;
    if (!silent) viewHome();
  }

  /* 撤销上一次删除：插回原位置 + 恢复练习进度 */
  function undoDelete() {
    if (!lastDeleted || !lastDeleted.items.length) return;
    var list = getImported();
    lastDeleted.items.forEach(function (r) {
      var at = r.idx < 0 || r.idx > list.length ? list.length : r.idx;
      list.splice(at, 0, r.art);
    });
    saveImported(list);
    var p = getProgress();
    Object.keys(lastDeleted.prog || {}).forEach(function (k) { p[k] = lastDeleted.prog[k]; });
    setProgress(p);
    var n = lastDeleted.items.length;
    var firstName = lastDeleted.items[0].art.title;
    lastDeleted = null;
    pendingNotice = n === 1 ? '已恢复「' + firstName + '」' : '已恢复 ' + n + ' 篇文章';
    pendingUndo = false;
    viewHome();
  }

  var appEl, lastResult = null, currentId = null;
  var pendingNotice = '';    // 删除后的一次性提示（viewHome 渲染后即清空）
  var pendingUndo = false;   // 提示里是否带「撤销」按钮
  var lastDeleted = null;    // 上一次删除的内容（用于撤销）
  var deleteMode = false;    // 删除模式：点「删除文章」激活，再点卡片即删除

  /* ---------------- 路由 ---------------- */
  function route() {
    var h = location.hash || '#/';
    var m;
    if ((m = h.match(/^#\/p\/(.+)$/))) { viewPractice(decodeURIComponent(m[1])); return; }
    if ((m = h.match(/^#\/r\/(.+)$/))) {
      if (!lastResult) { location.hash = '#/'; return; }
      viewResult(decodeURIComponent(m[1])); return;
    }
    viewHome();
  }

  /* ---------------- 主界面 ---------------- */
  function viewHome() {
    if (global.Engine) global.Engine.destroy();
    appEl.className = 'app_home';
    var prog = getProgress();
    var list = allArticles();

    var CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
      '<path d="M2.5 7.4 5.6 10.4 11.5 3.9" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var cards = list.map(function (a, i) {
      var p = prog[a.id];
      var done = p && p.done;
      var best = p && p.best;
      var n = countChars(a.text || '');
      var bestLine = best
        ? '<div class="a_best">最好 ' + best.speed + ' WPM · ' + best.accuracy + '% · ' + global.Util.fmtTime(best.duration) + '</div>'
        : '';
      var del = (a.builtin || deleteMode) ? ''
        : '<button class="a_del" data-del="' + esc(a.id) + '" title="删除这篇导入的文章" aria-label="删除">&times;</button>';
      var cls = 'a_card' + (done ? ' is_done' : '') + (deleteMode ? ' is_delmode' : '') +
        (deleteMode && a.builtin ? ' is_locked' : '');
      var aria = deleteMode
        ? (a.builtin ? '《' + esc(a.title) + '》是内置文章，不可删除' : '点击删除《' + esc(a.title) + '》')
        : '练习《' + esc(a.title) + '》';
      return '' +
        '<li class="' + cls + '" data-id="' + esc(a.id) + '"' +
        ' tabindex="0" role="button" aria-label="' + aria + '">' +
        '  <div class="a_cover">' +
        '    <div class="a_name" title="' + esc(a.title) + '">' + esc(a.title) + '</div>' +
        '    <div class="a_author">' + esc(a.author || '佚名') + '</div>' +
        '  </div>' +
        '  <div class="a_body">' +
        '    <div class="a_foot">' +
        '      <span class="a_meta">' + n + ' 字' + (p && p.attempts ? ' · 已练 ' + p.attempts + ' 次' : '') + '</span>' +
        '      <span class="a_bt" data-go="' + esc(a.id) + '">' + (done ? '再练一次' : '开始练习') + '</span>' +
        '    </div>' +
        '  </div>' +
        bestLine +
        (done ? '  <div class="a_check" title="已完成">' + CHECK_SVG + '</div>' : '') +
        '  <div class="a_no" title="第 ' + (i + 1) + ' 篇">' + (i + 1) + '</div>' +
        del +
        '</li>';
    }).join('');

    appEl.innerHTML = '' +
      '<header class="home_header">' +
      '  <h1>哪吒打字 · 交互模式复刻</h1>' +
      '  <p class="sub">文章打字交互 Demo —— 看字打汉字，拼音仅为提示</p>' +
      '</header>' +
      '<main class="home_main">' +
      '  <section class="panel import_panel">' +
      '    <h2>导入我自己的文章</h2>' +
      '    <div class="imp_row">' +
      '      <input id="imp_title" placeholder="标题（可留空）" maxlength="40">' +
      '      <input id="imp_author" placeholder="作者（可留空）" maxlength="20">' +
      '    </div>' +
      '    <textarea id="imp_text" placeholder="把文章正文粘贴到这里，用换行分段……"></textarea>' +
      '    <div class="imp_actions">' +
      '      <button class="btn btn-primary" id="imp_btn">导入并加入列表</button>' +
      '      <button class="btn" id="imp_file_btn">导入文档</button>' +
      '      <button class="btn btn-danger' + (deleteMode ? ' is_active' : '') + '" id="imp_delmode"' +
      '        aria-pressed="' + (deleteMode ? 'true' : 'false') + '">' +
      (deleteMode ? '退出删除模式' : '删除文章') + '</button>' +
      '      <button class="btn" id="imp_sample">填入示例文本</button>' +
      '      <span class="imp_count" id="imp_count">0 字</span>' +
      '      <span class="imp_tip" id="imp_tip"></span>' +
      '    </div>' +
      '    <input type="file" id="imp_file" accept=".txt,.text,.md,.markdown,.docx" hidden>' +
      '    <p class="imp_hint">支持 .txt / .md / .docx；导入后会自动抓取标题与作者填入上方，可再编辑确认。</p>' +
      '  </section>' +
      '  <section class="panel list_panel">' +
      '    <div class="list_head"><h2>选择要练习的文章</h2>' +
      (deleteMode ? '<span class="list_tip">删除模式已激活：点击文章卡片即可删除（内置文章不可删）</span>' : '') +
      '</div>' +
      '    <ul class="article_list">' + cards + '</ul>' +
      '  </section>' +
      '</main>' +
      '<footer class="home_footer">离线单机 Demo · 进度保存在本机浏览器 localStorage</footer>';

    /* 渲染删除后的提示（附「撤销」） */
    if (pendingNotice) {
      var tip = appEl.querySelector('#imp_tip');
      if (tip) {
        tip.textContent = pendingNotice;
        if (pendingUndo && lastDeleted) {
          var ub = document.createElement('button');
          ub.className = 'undo';
          ub.id = 'undo_del';
          ub.textContent = '撤销';
          ub.addEventListener('click', undoDelete);
          tip.appendChild(ub);
        }
      }
    }
    pendingNotice = '';

    appEl.querySelector('#imp_btn').addEventListener('click', doImport);
    appEl.querySelector('#imp_text').addEventListener('input', updateCount);
    updateCount();
    appEl.querySelector('#imp_sample').addEventListener('click', function () {
      appEl.querySelector('#imp_title').value = '我的练习段落';
      appEl.querySelector('#imp_text').value =
        '读书之法，在循序而渐进，熟读而精思。\n凡读书，须要读得字字响亮，不可误一字，不可少一字，不可多一字，不可倒一字。';
      updateCount();
      setTip('已填入示例，可直接点「导入并加入列表」');
    });
    appEl.querySelector('#imp_file_btn').addEventListener('click', function () {
      var f = appEl.querySelector('#imp_file');
      if (f) f.click();
    });
    appEl.querySelector('#imp_file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) loadDocument(f);
      e.target.value = '';   // 允许连续选同一个文件
    });

    /* 「删除文章」按钮：激活 / 退出删除模式 */
    appEl.querySelector('#imp_delmode').addEventListener('click', function () {
      deleteMode = !deleteMode;
      if (!deleteMode) setTip('已退出删除模式');
      viewHome();
      if (deleteMode) setTip('删除模式已激活：点击下面的文章卡片即可删除');
    });
    document.removeEventListener('keydown', escDeleteMode);   // 防重复绑定
    document.addEventListener('keydown', escDeleteMode);

    function enterArticle(id) { location.hash = '#/p/' + encodeURIComponent(id); }
    function removeArticle(id) {
      var a0 = findArticle(id);
      if (!a0) return;
      if (a0.builtin) { setTip('「' + a0.title + '」是内置文章，不可删除'); return; }
      deleteArticles([id]);   // 删除后保持删除模式，可连续点删
    }
    appEl.querySelector('.article_list').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest && e.target.closest('.a_card');
      if (!card || e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      if (deleteMode) removeArticle(card.dataset.id); else enterArticle(card.dataset.id);
    });
    appEl.querySelector('.article_list').addEventListener('click', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.go) {
        if (deleteMode) return;          // 删除模式下不进练习
        location.hash = '#/p/' + encodeURIComponent(t.dataset.go);
        return;
      }
      if (t.dataset && t.dataset.del) {
        deleteArticles([t.dataset.del]);   // 可在提示里「撤销」
        return;
      }
      var card = t.closest && t.closest('.a_card');
      if (!card || t.tagName === 'BUTTON') return;
      if (deleteMode) removeArticle(card.dataset.id); else enterArticle(card.dataset.id);
    });
    window.scrollTo(0, 0);
  }

  /* Esc 退出删除模式（只在主界面生效） */
  function escDeleteMode(e) {
    if (e.key !== 'Escape' || !deleteMode) return;
    if (!appEl || appEl.className !== 'app_home') return;
    deleteMode = false;
    viewHome();
  }

  function exitDeleteMode() {
    document.removeEventListener('keydown', escDeleteMode);
    if (deleteMode) deleteMode = false;
  }

  function setTip(msg) {
    var e = appEl.querySelector('#imp_tip');
    if (e) e.textContent = msg || '';
  }

  /* 实时字数统计（按实际参与打字的字符数计，与结算口径一致） */
  function updateCount() {
    var ta = appEl && appEl.querySelector('#imp_text');
    var out = appEl && appEl.querySelector('#imp_count');
    if (!ta || !out) return;
    var n = countChars(ta.value || '');
    out.textContent = n + ' 字';
    out.className = 'imp_count' + (n > MAX_CHARS ? ' over' : (n > WARN_CHARS ? ' warn' : ''));
    return n;
  }

  /* ---------------- 文档导入（.txt / .md / .docx） ---------------- */

  function setFileVal(sel, v) { var e = appEl.querySelector(sel); if (e) e.value = v || ''; }

  function loadDocument(file) {
    setTip('正在读取 ' + file.name + ' …');
    readArticleFile(file).then(function (r) {
      setFileVal('#imp_title', r.title);
      setFileVal('#imp_author', r.author);
      setFileVal('#imp_text', r.body);
      updateCount();
      var got = [];
      if (r.title) got.push('标题《' + r.title + '》');
      if (r.author) got.push('作者 ' + r.author);
      setTip('已读取 ' + file.name + '：' +
        (got.length ? '自动抓到 ' + got.join('、') : '没识别出标题和作者') +
        '。可在上方修改后点「导入并加入列表」。');
    }).catch(function (err) {
      setTip('⚠ 读取失败：' + ((err && err.message) || err || '未知错误'));
    });
  }

  function readArticleFile(file) {
    var name = String(file.name || '').toLowerCase();
    var p = /\.docx$/.test(name) ? readDocx(file) : readPlain(file);
    return p.then(guessMeta);
  }

  /* 纯文本：先按 UTF-8 严格解，失败则回退 GB18030（中文 txt 常见） */
  function readPlain(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = function () { rej(new Error('文件读取失败')); };
      fr.onload = function () { res(decodeText(new Uint8Array(fr.result))); };
      fr.readAsArrayBuffer(file);
    });
  }

  function decodeText(buf) {
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      return new TextDecoder('utf-8').decode(buf.subarray(3));
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, ''); }
    catch (e) { /* 不是 UTF-8，往下走 */ }
    try { return new TextDecoder('gb18030').decode(buf); }
    catch (e2) { return new TextDecoder('utf-8').decode(buf); }
  }

  /* docx = zip；不引第三方库，用浏览器原生 DecompressionStream 解压 word/document.xml */
  function readDocx(file) {
    return file.arrayBuffer().then(function (ab) {
      var buf = new Uint8Array(ab);
      var entry = findZipEntry(buf, 'word/document.xml');
      if (!entry) throw new Error('不是有效的 .docx 文件');
      if (entry.method === 0) return new TextDecoder('utf-8').decode(entry.data);
      if (entry.method !== 8) throw new Error('不支持的压缩方式（' + entry.method + '）');
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('当前浏览器不支持解压 docx，请改用 .txt');
      }
      return new Response(new Blob([entry.data]).stream()
        .pipeThrough(new DecompressionStream('deflate-raw')))
        .arrayBuffer().then(function (out) { return new TextDecoder('utf-8').decode(out); });
    }).then(docxXmlToText);
  }

  /* 极简 ZIP 定位：从 EOCD 找到中央目录，按名字取一条记录的原始数据 */
  function findZipEntry(buf, want) {
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var eocd = -1, min = Math.max(0, buf.length - 65558);
    for (var i = buf.length - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    var count = dv.getUint16(eocd + 10, true);
    var p = dv.getUint32(eocd + 16, true);
    for (var n = 0; n < count; n++) {
      if (p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var cmtLen = dv.getUint16(p + 32, true);
      var lOff = dv.getUint32(p + 42, true);
      var name = new TextDecoder('utf-8').decode(buf.subarray(p + 46, p + 46 + nameLen));
      if (name === want) {
        var lp = lOff;
        if (lp + 30 > buf.length) return null;
        var dataStart = lp + 30 + dv.getUint16(lp + 26, true) + dv.getUint16(lp + 28, true);
        return { method: method, data: buf.subarray(dataStart, dataStart + csize) };
      }
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return null;
  }

  function docxXmlToText(xml) {
    var s = String(xml || '')
      .replace(/<w:tab\b[^>]*\/>/g, ' ')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n');
    var out = s.split('\n').map(function (line) {
      var ts = line.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
      return ts.map(function (t) {
        return t.replace(/^<w:t[^>]*>/, '').replace(/<\/w:t>$/, '')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
      }).join('');
    }).join('\n');
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  /* 自动抓取标题 / 作者：
     规则 —— 首个非空行若「不太长（≤40）且不以句末标点结尾」视为标题；
     紧接着的下一个非空行若「更短（≤24）且同样不以句末标点结尾」视为作者；
     其余全部作为正文。识别不出来就整体当正文，标题作者留空由用户填。 */
  var NO_END = /[。！？；…!?;,.，、：:]$/;
  function guessMeta(raw) {
    var text = String(raw || '').replace(/\r\n?/g, '\n');
    var lines = text.split('\n');
    var idx = [];
    for (var i = 0; i < lines.length && idx.length < 6; i++) {
      if (lines[i].trim()) idx.push(i);
    }
    var title = '', author = '', start = 0;
    var l1 = idx.length ? lines[idx[0]].trim() : '';
    var l2 = idx.length > 1 ? lines[idx[1]].trim() : '';
    if (l1 && l1.replace(/\s/g, '').length <= 40 && !NO_END.test(l1)) {
      title = cleanTitle(l1);
      start = idx[0] + 1;
      if (l2 && l2.replace(/\s/g, '').length <= 24 && !NO_END.test(l2) && !/^\d+/.test(l2)) {
        author = cleanAuthor(l2);
        start = idx[1] + 1;
      }
    }
    var body = lines.slice(start).join('\n').trim();
    if (!body) { body = text.trim(); title = ''; author = ''; }
    return { title: title, author: author, body: body };
  }

  function cleanTitle(s) {
    return s.replace(/^\s*[#>*\-\s]+/, '')
      .replace(/^\s*(标题|题目|文章名|篇名)\s*[:：]\s*/, '')
      .replace(/^《/, '').replace(/》$/, '')
      .trim().slice(0, 40);
  }

  function cleanAuthor(s) {
    return s.replace(/^\s*[#>*\-\s]+/, '')
      .replace(/^\s*(作者|作\s*者|文\/|by)\s*[:：]?\s*/i, '')
      .replace(/^[—–\-]{1,}\s*/, '').replace(/\s*[—–\-]{1,}$/, '')
      .replace(/^\s*\[/, '').replace(/\]\s*$/, '')
      .trim().slice(0, 20);
  }

  function doImport() {
    var title = (appEl.querySelector('#imp_title').value || '').trim();
    var author = (appEl.querySelector('#imp_author').value || '').trim();
    var text = appEl.querySelector('#imp_text').value || '';
    text = text.replace(/\r\n?/g, '\n').replace(/\n{2,}/g, '\n').trim();
    if (text.length < 2) { setTip('⚠ 请先粘贴正文内容'); return; }
    var n = countChars(text);
    if (n > MAX_CHARS) {
      setTip('⚠ 共 ' + n + ' 字，超出上限 ' + MAX_CHARS + ' 字，请拆分后再导入');
      return;
    }
    var id = 'u_' + Date.now().toString(36);
    var art = {
      id: id,
      title: title || ('我的文章 ' + new Date().toLocaleDateString()),
      author: author || '佚名',
      source: '自选导入',
      builtin: false,
      text: text
    };
    var list = getImported();
    list.unshift(art);
    saveImported(list);
    viewHome();
    setTip('已导入「' + art.title + '」，' + n + ' 字' +
           (n > WARN_CHARS ? '（长文，练习时间较长，可随时退出）' : ''));
  }

  /* ---------------- 练习界面 ---------------- */
  function viewPractice(id) {
    var art = findArticle(id);
    if (!art) { location.hash = '#/'; return; }
    exitDeleteMode();          // 进入练习页时清掉删除模式状态与监听
    currentId = id;
    appEl.className = 'app_level';
    appEl.innerHTML = '';
    var root = el('div', 'level_wrap');
    appEl.appendChild(root);

    global.Engine.mount(root, art, {
      // 底栏「上一关 / 下一关」= 列表里相邻的文章（对齐原站底栏按钮文案与位置）
      onPrev: (function () {
        var l = allArticles(), i = l.findIndex(function (a) { return a.id === id; });
        var p = i > 0 ? l[i - 1] : null;
        return p ? function () { location.hash = '#/p/' + encodeURIComponent(p.id); } : null;
      })(),
      onNext: (function () {
        var l = allArticles(), i = l.findIndex(function (a) { return a.id === id; });
        var n = i >= 0 && i < l.length - 1 ? l[i + 1] : null;
        return n ? function () { location.hash = '#/p/' + encodeURIComponent(n.id); } : null;
      })(),
      onFinish: function (stats) {
        var prog = getProgress();
        var rec = prog[id] || { attempts: 0 };
        rec.done = true;
        rec.attempts = (rec.attempts || 0) + 1;
        var stars = global.Result.starsOf(stats);
        if (!rec.best || stats.speed > rec.best.speed ||
            (stats.speed === rec.best.speed && stats.accuracy > rec.best.accuracy)) {
          rec.best = { speed: stats.speed, accuracy: stats.accuracy, duration: stats.duration, stars: stars };
        }
        prog[id] = rec;
        setProgress(prog);
        lastResult = { stats: stats, id: id };
        location.hash = '#/r/' + encodeURIComponent(id);
      },
      onExit: function () { location.hash = '#/'; }
    });

    // 首次交互解锁音频
    var unlock = function () { global.Sfx.unlock(); document.removeEventListener('pointerdown', unlock, true); document.removeEventListener('keydown', unlock, true); };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    window.scrollTo(0, 0);
  }

  /* ---------------- 结算界面 ---------------- */
  function viewResult(id) {
    if (global.Engine) global.Engine.destroy();
    var art = findArticle(id);
    if (!art || !lastResult) { location.hash = '#/'; return; }
    var stats = lastResult.stats;

    var list = allArticles();
    var idx = list.findIndex(function (a) { return a.id === id; });
    var next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

    appEl.className = 'app_result';
    appEl.innerHTML = '';
    var box = el('div', 'result_host');
    appEl.appendChild(box);
    box.style.maxWidth = '1100px';
    box.style.margin = '0 auto';

    global.Result.render(box, art, stats, { hasNext: !!next });

    appEl.querySelector('#rs_next').addEventListener('click', function () {
      if (next) location.hash = '#/p/' + encodeURIComponent(next.id);
    });
    appEl.querySelector('#rs_retry').addEventListener('click', function () {
      location.hash = '#/p/' + encodeURIComponent(id);
    });
    appEl.querySelector('#rs_home').addEventListener('click', function () {
      location.hash = '#/';
    });
    window.scrollTo(0, 0);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    appEl = document.getElementById('app');
    window.addEventListener('hashchange', route);
    route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.App = { route: route, allArticles: allArticles, getProgress: getProgress };
})(window);
