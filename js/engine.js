/* engine.js —— 文章打字交互引擎（复刻 nezhadazi.com 文章模式）
   核心判定与原站一致：
     · 用户用自带输入法打出【汉字】，与目标字逐位比对
     · 打对 → .correct（黑色，与正文同色）；打错 → .incorrect（粉红）
     · 中文模式下纯英文/空格输入不计入
     · 拼音只作为提示浮标 #notify_para > .word_tips
   依赖：util.js、pinyin.js、audio.js

   结构分区（自上而下）：
     [A] 配置  [B] 引擎主体 mount  [C] 顶栏构建  [D] 正文构建
     [E] 折行渲染  [F] 核心判定  [G] 光标与提示  [H] 统计
     [I] 完成/销毁  [J] 快捷键与 TTS

   红线（见 产品底线.md）：拼音仅提示、必须打对汉字、组字不判定、无逐键音。 */
(function (global) {
  'use strict';

  var CFG_KEY = 'nzd_cfg_v2';
  var el = global.Util.el, esc = global.Util.esc, fmtClock = global.Util.fmtClock;

  var DEFAULT_CFG = {
    hint: 'always',        // always | error | off  （原站「字码提示」）
    sound: 1,              // 键盘声音 开/关
    sound_volume: 5,       // 键盘音量 0~10
    sound_theme: '0',      // 键盘音效：0 跳动 / 1 轻击 / 2 滴答 / 3 碎响
    sound2_theme: '0',     // 错误音效：0 警告1 / 3 警告2 / 2 警告3 / 1 警告4
    bg: '4',               // 背景主题：'' 默认(无) | '0'..'a'（原站 11 套）
                           // 默认取 '4'「远岫」= 原站文章关卡页实际呈现的水墨山峦背景
    dark: false,
    fontSize: 3            // 1..9 —— 原站「中文大小」默认档就是 3（→30px）
  };

  /* 字号档位：**原站 .font_label_size1~9 的原值**
     16 / 20 / 30 / 40 / 50 / 60 / 70 / 80 / 90（默认档 3 = 30px）
     必须与 css/level.css 的 .font_label_size1~9 保持一致 */
  var FONT_SIZES = { 1: 16, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70, 8: 80, 9: 90 };

  /* 背景主题表（照搬原站 ul#bg-themes 的顺序与命名） */
  var BG_THEMES = [
    { id: '',  name: '默认' },
    { id: '0', name: '戏蝶' }, { id: '1', name: '花海' }, { id: '2', name: '翠幕' },
    { id: '3', name: '青穹' }, { id: '4', name: '远岫' }, { id: '5', name: '群灵' },
    { id: '6', name: '玄夜' }, { id: '7', name: '溯风' }, { id: '8', name: '织雪' },
    { id: '9', name: '凝香' }, { id: 'a', name: '曲涧' }
  ];
  function bgThumb(id) {
    // 缩略图：默认用 levelbgt.jpg，其余 levelbg{N}t.jpg
    return 'bg/' + (id === '' ? 'levelbgt.jpg' : 'levelbg' + id + 't.jpg');
  }

  /* 旧版本的字号档位表（18/22/26/28/30/34/38/44/52）。
     档位含义改成原站刻度后，老存档里的档位号必须按「实际像素」重新映射，
     否则档位 5 会从旧的 30px 变成新的 50px（字突然变大、每行字数变少）。 */
  var LEGACY_FONT_SIZES = { 1: 18, 2: 22, 3: 26, 4: 28, 5: 30, 6: 34, 7: 38, 8: 44, 9: 52 };
  function migrateCfg(cfg) {
    if (!cfg || cfg.__font_scale === 'label') return cfg;
    var oldPx = LEGACY_FONT_SIZES[cfg.fontSize] || 30;
    var best = 3, bestD = Infinity;
    Object.keys(FONT_SIZES).forEach(function (k) {
      var d = Math.abs(FONT_SIZES[k] - oldPx);
      if (d < bestD) { bestD = d; best = +k; }
    });
    cfg.fontSize = best;
    cfg.__font_scale = 'label';
    return cfg;
  }

  function loadCfg() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (raw) {
        var c = migrateCfg(Object.assign({}, DEFAULT_CFG, JSON.parse(raw)));
        saveCfg(c);
        return c;
      }
    } catch (e) {}
    return Object.assign({}, DEFAULT_CFG, { __font_scale: 'label' });
  }
  function saveCfg(c) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {}
  }

  /* ================== [A] 引擎主体 ================== */

  function Engine() {
    this.cfg = loadCfg();
    this.article = null;
    this.root = null;
    this.lines = [];          // [[unit, ...], ...]  原始行
    this.viewLines = [];      // 折行后的视觉行
    this.lineIdx = 0;
    this.records = [];        // 每行：records[lineIdx] = [{ok, ch}, ...]
    this.started = false;
    this.startTime = 0;
    this.elapsed = 0;
    this.timer = null;
    this.finished = false;
    this.usedHint = false;
    this.onFinish = null;
  }

  Engine.prototype.mount = function (rootEl, article, opts) {
    opts = opts || {};
    this.root = rootEl;
    this.article = article;
    this.onFinish = opts.onFinish || function () {};
    this.onExit = opts.onExit || function () {};
    // 底栏「上一关 / 下一关」的目标（原站跳相邻关卡，这里跳相邻文章；为空则按钮隐藏）
    this.onPrev = opts.onPrev || null;
    this.onNext = opts.onNext || null;

    this.lines = global.Pinyin.splitLines(article.text || '');
    this.records = [];
    this.lineIdx = 0;
    this.started = false;
    this.finished = false;
    this.elapsed = 0;
    this.usedHint = false;
    this.startTime = 0;
    this._lastSig = null;
    this.composing = false;

    this.root.innerHTML = '';
    this.root.className = 'level_wrap' + (this.cfg.dark ? ' level_dark' : '');
    this.root.appendChild(this.buildHeader());
    this.root.appendChild(this.buildMain());
    this.root.appendChild(this.buildFooter());

    var tip = el('div', 'notify_para');
    tip.id = 'notify_para';
    tip.style.display = 'none';
    this.root.appendChild(tip);
    this.tipEl = tip;

    this.measureAndRender();
    this.bindKeys();
    this.bindResize();
    this.syncCfgUI();
    this.setStats(0, 0, 0, this.totalChars, 0);
    this.setProcess();
    return this;
  };

  /* ---------- [C] 顶栏：标题 / 统计条 / 工具 ---------- */
  Engine.prototype.buildHeader = function () {
    var a = this.article;
    var head = el('header', 'level_header');
    var nav = el('main', 'container level_nav');
    var inner = el('nav');

    var more = el('ul', 'more');
    var li = el('li');
    var back = el('span', 'iconfont icon-back');
    back.id = 'bt_back';
    back.title = '返回主界面';
    back.textContent = '←';
    li.appendChild(back);
    more.appendChild(li);
    inner.appendChild(more);
    var self0 = this;
    back.addEventListener('click', function () { self0.onExit(); });

    var h1 = el('h1');
    // 原站标题原样：`哪吒打字 打字练习文 散文一百篇[《豁达》]`
    //   = 「哪吒打字 打字练习文 」+ 出处 + 「[」+ 篇名 + 「]」
    h1.innerHTML = '<strong>哪吒打字 打字练习文 ' + esc(a.source || '自选导入') +
                   '[' + esc(a.title) + ']</strong>';
    inner.appendChild(h1);

    var bar = el('div', 'score_bar');
    bar.id = 'score_bar';
    // 原站 #tongji_bar 的结构与空格排版原样照搬（初始：时间 00:00:00 / 速度 0CPM）
    bar.innerHTML =
      '<span id="level_time_label">时间：</span> <span id="level_time">00:00:00</span> ' +
      '<span>速度：</span> <span id="level_speed">0CPM</span> ' +
      '<span>进度：</span> <span id="level_progressrate">0%</span> ' +
      '<span>总字数：</span> <span id="level_len">0</span>' +
      '<span>准确率：</span> <span id="level_accuracy">0%</span>';
    inner.appendChild(bar);

    var tools = el('ul', 'tools');
    this.buildTools(tools);
    inner.appendChild(tools);

    nav.appendChild(inner);
    head.appendChild(nav);
    return head;
  };

  Engine.prototype.buildTools = function (root) {
    var self = this;
    var cfg = this.cfg;

    function toggleLi(id, icon, title, panel) {
      var li = el('li', '', '<span class="iconfont ' + icon + '" id="' + id + '" title="' + title + '">' + icon2txt(icon) + '</span>');
      if (panel) {
        panel.className = 'options';
        panel.style.display = 'none';
        li.appendChild(panel);
      }
      return li;
    }
    function icon2txt(cls) {
      return {
        'icon-set': '⚙', 'icon-moon': '🌙', 'icon-sun': '☀',
        'icon-sound': '🔊', 'icon-reset': '⟳', 'icon-theme1': '🎨'
      }[cls] || '•';
    }

    var frag = document.createDocumentFragment();

    /* 字码提示 */
    var pHint = el('div', 'options');
    pHint.innerHTML =
      '<div><span>字码提示（拼音）：</span>' +
      '<label><input type="radio" name="hint" value="always"><span>总是</span></label>' +
      '<label><input type="radio" name="hint" value="error"><span>仅纠错</span></label>' +
      '<label><input type="radio" name="hint" value="off"><span>关闭</span></label></div>';
    frag.appendChild(toggleLi('bt_hint', 'icon-set', '字码提示', pHint));

    /* 音效（选项与取值对齐原站） */
    var pSnd = el('div', 'options');
    pSnd.innerHTML =
      '<div style="margin-bottom:10px"><span>键盘声音：</span>' +
      '<label><input type="radio" name="sound" value="1"><span>开启</span></label>' +
      '<label><input type="radio" name="sound" value="0"><span>关闭</span></label></div>' +
      '<div style="margin-bottom:10px"><span>键盘音量：</span>' +
      '<input type="range" name="sound_volume" min="0" max="10" step="1">' +
      '<span class="vol_val" id="sound_volume_value">5</span></div>' +
      '<div style="margin-bottom:10px"><span>键盘音效：</span>' +
      '<label><input type="radio" name="sound_theme" value="0"><span>跳动</span></label>' +
      '<label><input type="radio" name="sound_theme" value="1"><span>轻击</span></label>' +
      '<label><input type="radio" name="sound_theme" value="2"><span>滴答</span></label>' +
      '<label><input type="radio" name="sound_theme" value="3"><span>碎响</span></label></div>' +
      '<div style="margin-bottom:10px"><span>错误音效：</span>' +
      '<label><input type="radio" name="sound2_theme" value="0"><span>警告1</span></label>' +
      '<label><input type="radio" name="sound2_theme" value="3"><span>警告2</span></label>' +
      '<label><input type="radio" name="sound2_theme" value="2"><span>警告3</span></label>' +
      '<label><input type="radio" name="sound2_theme" value="1"><span>警告4</span></label></div>';
    frag.appendChild(toggleLi('bt_sound', 'icon-sound', '音效设置', pSnd));

    /* 背景主题（照搬原站「主题」面板 ul.bg-themes 缩略图网格） */
    var pBg = el('div', 'options');
    pBg.style.width = '360px';
    pBg.innerHTML =
      '<div class="options_close"><span class="iconfont icon-del">✕</span></div>' +
      '<div><span class="iconfont icon-theme1">&nbsp;背景主题：</span></div>' +
      '<div class="bg-pick-tip">点击缩略图切换（选择会自动保存）</div>' +
      '<ul class="bg-themes" id="bg-themes">' +
      BG_THEMES.map(function (t) {
        return '<li rel="' + t.id + '" title="' + t.name + '">' +
               '<img src="' + bgThumb(t.id) + '" alt="' + t.name + '"><i>' + t.name + '</i></li>';
      }).join('') +
      '</ul>';
    frag.appendChild(toggleLi('bt_bg', 'icon-theme1', '主题（背景）', pBg));

    /* 字号（原站设置项名「中文大小」，滑杆 1~9，右侧跟当前档位数字） */
    var pFont = el('div', 'options');
    pFont.innerHTML = '<div><span>&nbsp;中文大小：</span>' +
      '<input type="range" name="fontSize" min="1" max="9" step="1">' +
      '<span id="font_size_value" style="margin-left:10px;">3</span></div>';
    frag.appendChild(toggleLi('bt_font', 'icon-set', '中文大小', pFont));

    /* 深色 */
    var dl = el('li');
    var dbtn = el('span', 'iconfont icon-moon', '🌙');
    dbtn.id = 'bt_dark';
    dbtn.title = '深色 / 浅色';
    dl.appendChild(dbtn);
    frag.appendChild(dl);

    /* 重来 */
    var rl = el('li');
    var rbtn = el('span', 'iconfont icon-reset', '⟳');
    rbtn.id = 'bt_restart';
    rbtn.title = '重来';
    rl.appendChild(rbtn);
    frag.appendChild(rl);

    var holder = root;
    holder.appendChild(frag);
    // 展开工具面板的交互
    root.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t.id === 'bt_hint' || t.id === 'bt_sound' || t.id === 'bt_font' || t.id === 'bt_bg') {
        var panel = t.parentNode.querySelector('.options');
        var open = panel.style.display !== 'none';
        root.querySelectorAll('.options').forEach(function (p) { p.style.display = 'none'; });
        panel.style.display = open ? 'none' : 'block';
        ev.stopPropagation();
        return;
      }
      /* 背景主题缩略图 */
      var bgLi = t.closest ? t.closest('#bg-themes li') : null;
      if (bgLi) {
        self.setBg(bgLi.getAttribute('rel'));
        ev.stopPropagation();
        return;
      }
      if (t.classList && t.classList.contains('options_close')) {
        t.closest('.options').style.display = 'none';
        return;
      }
      if (t.id === 'bt_dark') { self.toggleDark(); return; }
      if (t.id === 'bt_restart') { self.restart(); return; }
      if (t.id === 'bt_back') { self.onExit(); return; }
      // 关闭已展开面板
      if (!t.closest || !t.closest('.options')) {
        root.querySelectorAll('.options').forEach(function (p) { p.style.display = 'none'; });
      }
    });

    /* 表单联动 */
    root.addEventListener('change', function (ev) {
      var n = ev.target.name;
      if (!n) return;
      if (n === 'hint') { self.cfg.hint = ev.target.value; saveCfg(self.cfg); self.updateHint(); }
      if (n === 'sound') { self.cfg.sound = ev.target.value === '1' ? 1 : 0; saveCfg(self.cfg); global.Sfx.config.sound = self.cfg.sound; }
      if (n === 'sound_theme') { self.cfg.sound_theme = ev.target.value; saveCfg(self.cfg); global.Sfx.config.sound_theme = self.cfg.sound_theme; global.Sfx.playCorrect(); }
      if (n === 'sound2_theme') { self.cfg.sound2_theme = ev.target.value; saveCfg(self.cfg); global.Sfx.config.sound2_theme = self.cfg.sound2_theme; global.Sfx.playError(); }
    });
    root.addEventListener('input', function (ev) {
      var n = ev.target.name;
      if (n === 'sound_volume') {
        self.cfg.sound_volume = +ev.target.value;
        saveCfg(self.cfg);
        global.Sfx.config.sound_volume = self.cfg.sound_volume;
        var lbl = root.querySelector('#sound_volume_value');
        if (lbl) lbl.textContent = self.cfg.sound_volume;
        global.Sfx.playCorrect();   // 原站：拖动音量滑杆会试听一次
      }
      if (n === 'fontSize') {
        self.cfg.fontSize = +ev.target.value; saveCfg(self.cfg); self.applyFont();
        var fv = root.querySelector('#font_size_value');
        if (fv) fv.textContent = self.cfg.fontSize;
      }
    });

    /* 保存引用，供同步 UI */
    this._toolRoot = root;
    return root;
  };

  Engine.prototype.syncCfgUI = function () {
    var r = this._toolRoot, c = this.cfg;
    if (!r) return;
    var set = function (sel, val) { var e = r.querySelector(sel); if (e) e.value = val; };
    var radio = function (name, val) {
      r.querySelectorAll('input[name="' + name + '"]').forEach(function (e) { e.checked = (e.value === String(val)); });
    };
    radio('hint', c.hint);
    radio('sound', c.sound ? '1' : '0');
    radio('sound_theme', c.sound_theme);
    radio('sound2_theme', c.sound2_theme);
    set('input[name="sound_volume"]', c.sound_volume);
    set('input[name="fontSize"]', c.fontSize);
    var lbl = r.querySelector('#sound_volume_value');
    if (lbl) lbl.textContent = c.sound_volume;
    var fvl = r.querySelector('#font_size_value');
    if (fvl) fvl.textContent = c.fontSize;
    global.Sfx.config.sound = c.sound;
    global.Sfx.config.sound_volume = c.sound_volume;
    global.Sfx.config.sound_theme = c.sound_theme;
    global.Sfx.config.sound2_theme = c.sound2_theme;
    this.applyFont();
    this.applyBg();
  };

  /* ---------- [C-3] 背景主题 ---------- */
  Engine.prototype.setBg = function (id) {
    this.cfg.bg = id || '';
    saveCfg(this.cfg);
    this.applyBg();
  };

  Engine.prototype.applyBg = function () {
    if (!this.root) return;
    var self = this;
    // 清掉旧的 bg 类
    BG_THEMES.forEach(function (t) {
      if (t.id) self.root.classList.remove('bg' + t.id);
    });
    var bg = this.cfg.bg;
    if (bg) {
      this.root.classList.add('bg' + bg);
      this.root.classList.add('bg_set');
    } else {
      this.root.classList.remove('bg_set');
    }
    // 面板里高亮当前项
    var r = this._toolRoot;
    if (r) {
      r.querySelectorAll('#bg-themes li').forEach(function (li) {
        li.classList.toggle('active', li.getAttribute('rel') === String(bg));
      });
    }
  };

  Engine.prototype.applyFont = function () {
    if (!this.root) return;
    for (var i = 1; i <= 9; i++) this.root.classList.remove('font_label_size' + i);
    this.root.classList.add('font_label_size' + this.cfg.fontSize);
    // 字号变了 → 输入框装得下的字数也变了。
    // 还没开打就按新字号重新折行；已经开打了则只重钉格子宽度，绝不打断练习。
    if (!this.started && !this.finished && this.linesBox) {
      if (this.computePer() !== this.per) { this.measureAndRender(); return; }
    }
    this.applyCharWidths();
  };

  Engine.prototype.toggleDark = function () {
    this.cfg.dark = !this.cfg.dark;
    saveCfg(this.cfg);
    this.root.classList.toggle('level_dark', this.cfg.dark);
  };

  /* ---------- [D] 中部：正文卡片 ---------- */
  Engine.prototype.buildMain = function () {
    var main = el('main', 'container level_main');
    var pages = el('div', 'level_pages');
    pages.id = 'level_pages';
    var page = el('div', 'level_page');
    page.id = 'level_page_0';
    var linesBox = el('div', 'level_lines level_para_lines');
    linesBox.id = 'level_para_lines';
    page.appendChild(linesBox);
    pages.appendChild(page);
    main.appendChild(pages);
    this.linesBox = linesBox;
    return main;
  };

  Engine.prototype.buildFooter = function () {
    var f = el('div', 'level_footer_wrap');
    var proc = el('div', 'level_process');
    // 原站底栏（单页文章关卡时 setProcessBar 的实际结果）：
    //   [上一关] ▓▓▓▓ [下一关]，「下一关」带 .active（蓝底）
    proc.innerHTML =
      '<div class="level_process_content">' +
      '<button class="btn btn-link" id="bt_pre" tabindex="-1"><span>上一关</span></button>' +
      '<progress id="level_progress" value="0" max="100"></progress>' +
      '<button class="btn btn-link active" id="bt_next" tabindex="-1"><span>下一关</span></button>' +
      '<div class="pass_bar" id="pass_bar"></div>' +
      '</div>';
    f.appendChild(proc);

    // 原站快捷键条原文（不含「Esc 返回」—— 那是本项目自加的，已按原站移除）
    var ki = el('div', 'level_keyinfo');
    ki.innerHTML =
      '<span class="read">空格 朗读</span>' +
      '<span class="read">←→ 翻页</span>' +
      '<span class="write">Ctrl + Alt 提示</span>';
    f.appendChild(ki);

    // 原站：上一关/下一关 = 跳相邻关卡；这里 = 跳相邻文章（无目标则在 setProcess 里隐藏）
    var self = this;
    var pre = proc.querySelector('#bt_pre');
    var next = proc.querySelector('#bt_next');
    if (pre) pre.addEventListener('click', function () { if (self.onPrev) self.onPrev(); });
    if (next) next.addEventListener('click', function () { if (self.onNext) self.onNext(); });

    this.procEl = proc;
    return f;
  };

  /* ---------- [E-0] 字宽测量：让「打出的字」与「上方的目标字」逐格对齐 ----------
     输入框与 .word_label 使用同一 font-family / font-size / letter-spacing:0，
     同一字符的「推进宽度」理论上应当一致；但字体回退、全角与半角标点、空格等会造成
     个别字符偏差，且偏差会在一行内累积，导致后半行越走越歪。
     做法：用真实 DOM 排版把每个字符在当前字号下的推进宽度量出来，写死到 .word_box 上。
     这样第 N 个格子的左边界 === 输入框内第 N 个字符的左边界（汉字与标点都成立）。 */
  var _wcache = {};   // { fontSize: { ch: width } }

  Engine.prototype.fontPx = function () {
    return FONT_SIZES[this.cfg.fontSize] || 30;
  };

  /* 批量测量（一次 reflow 量完所有未见过的字符，结果按字号缓存） */
  Engine.prototype.measureWidths = function (chars) {
    var fs = this.fontPx();
    var map = _wcache[fs] || (_wcache[fs] = {});
    var need = [];
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      if (map[c] === undefined && need.indexOf(c) < 0) need.push(c);
    }
    if (!need.length) return map;

    var host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;' +
                         'white-space:pre;pointer-events:none;';
    var probe = el('div', 'level_para_line');
    probe.style.setProperty('--hz-size', fs + 'px');
    var wbs = el('div', 'words_box');
    var nodes = [];
    need.forEach(function (c) {
      var wb = el('div', 'word_box');
      var lb = el('div', 'word_label');
      lb.textContent = c;   // 空格靠 white-space:pre 保留 → 量到的是真实空格宽
      wb.appendChild(lb);
      wbs.appendChild(wb);
      nodes.push({ ch: c, node: wb });
    });
    probe.appendChild(wbs);
    host.appendChild(probe);
    document.body.appendChild(host);
    nodes.forEach(function (n) {
      var w = n.node.getBoundingClientRect().width;
      map[n.ch] = w > 0 ? w : (map[n.ch] || 0);
    });
    if (host.parentNode) host.parentNode.removeChild(host);
    return map;
  };

  /* 把测量出的宽度写回每个格子（字号切换 / 首次渲染时调用） */
  Engine.prototype.applyCharWidths = function () {
    if (!this.cards || !this.cards.length) return;
    var map = this.measureWidths(this._allChars || []);
    var self = this;
    this.viewLines.forEach(function (line, li) {
      var card = self.cards[li];
      if (!card) return;
      var wbs = card.querySelectorAll('.word_box');
      line.forEach(function (u, ci) {
        var w = map[u.ch];
        if (wbs[ci] && w) wbs[ci].style.width = w + 'px';
      });
    });
  };

  /* 每行放几个字 —— 原样照搬原站 getMaxCharsByFilling(inputId, lang)
     原站做法：往一个 .input_box 里塞 500 个「中」，二分找出
     scrollWidth <= clientWidth 的最大字符数，再 -2，最小 10。
     （不是按像素除法估的，是真实的「输入框装得下几个字」） */
  Engine.prototype.getMaxCharsByFilling = function () {
    var box = this.linesBox;
    if (!box) return 30;
    var wrap = el('div', 'level_para_line level_line');
    var inp = document.createElement('input');
    inp.className = 'input_box';
    inp.type = 'text';
    inp.autocomplete = 'off';
    inp.disabled = true;
    wrap.appendChild(inp);
    wrap.style.visibility = 'hidden';   // 原站是直接 append 后清空，这里藏起来避免闪一下
    box.appendChild(wrap);

    var testStr = new Array(501).join('中');
    var low = 0, high = testStr.length, result = 0;
    inp.value = testStr;
    while (low <= high) {
      var mid = Math.floor((low + high) / 2);
      inp.value = testStr.substring(0, mid);
      if (inp.scrollWidth <= inp.clientWidth) { result = mid; low = mid + 1; }
      else { high = mid - 1; }
    }
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    return result;
  };

  Engine.prototype.computePer = function () {
    var n = this.getMaxCharsByFilling() - 2;   // 原站：line_text_len = getMaxCharsByFilling(...) - 2
    if (n < 10) n = 10;                        // 原站：if (line_text_len < 10) line_text_len = 10
    this.per = n;
    return n;
  };

  /* 窗口尺寸变化：只在「还没开始打字」且每行字数确实变了时才重新折行，避免打断练习 */
  Engine.prototype.bindResize = function () {
    var self = this;
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    var timer = null;
    this._resizeHandler = function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (!self.root || self.finished || self.started) return;
        if (self.computePer() === self.per) return;
        self.measureAndRender();
      }, 300);
    };
    window.addEventListener('resize', this._resizeHandler);
  };

  /* ---------- [E] 折行 + 渲染 ---------- */
  Engine.prototype.measureAndRender = function () {
    var self = this;
    var box = this.linesBox;
    box.innerHTML = '';

    var per = this.computePer();

    // 收集全文去重字符，供字宽测量使用
    var seen = {}, all = [];
    this.lines.forEach(function (line) {
      line.forEach(function (u) { if (!seen[u.ch]) { seen[u.ch] = 1; all.push(u.ch); } });
    });
    this._allChars = all;

    // 折行
    var view = [];
    this.lines.forEach(function (line) {
      if (!line.length) { view.push([]); return; }
      for (var i = 0; i < line.length; i += per) {
        view.push(line.slice(i, i + per));
      }
    });
    // 去掉纯空行（保留视觉换行用空行）
    this.viewLines = view;
    // records 必须与「折行后的视觉行」一一对应
    this.records = view.map(function () { return []; });

    var total = 0;
    this.lines.forEach(function (l) { total += l.length; });
    this.totalChars = total;

    // 渲染（万字级文章：一次性拼好 HTML 再落地，比逐个 createElement 快一个数量级）
    var html = '';
    view.forEach(function (line, li) {
      html += '<div class="level_para_line level_line" data-line="' + li + '"><div class="words_box">';
      if (!line.length) html += '&nbsp;';
      line.forEach(function (u, ci) {
        html += '<div class="word_box" data-index="' + ci + '">' +
                '<div class="word_label">' + (u.ch === ' ' ? '&nbsp;' : esc(u.ch)) + '</div>' +
                '<div class="word_cursor"></div></div>';
      });
      html += '</div><input class="input_box" type="text" autocomplete="off" spellcheck="false" ' +
              'lang="zh-CN"' + (li !== 0 ? ' disabled' : '') + '></div>';
    });
    this.linesBox.innerHTML = html;

    this.cards = Array.prototype.slice.call(this.linesBox.querySelectorAll('.level_para_line'));
    this.composing = false;
    this.cards.forEach(function (card, li) {
      var input = card.querySelector('.input_box');
      input.addEventListener('input', function (e) { self.onInput(li, input, e); });
      input.addEventListener('keydown', function (e) { self.onKeydown(li, input, e); });
      input.addEventListener('blur', function () { self.updateHint(); });
      input.addEventListener('focus', function () { self.updateHint(); });
      // 输入法组字期间不判定（关键：避免把拼音字母当成正文对齐）
      input.addEventListener('compositionstart', function () {
        self.composing = true;
        input.setAttribute('data-composing', '1');
      });
      input.addEventListener('compositionend', function (e) {
        self.composing = false;
        input.removeAttribute('data-composing');
        // 组字提交后再跑一次判定
        self.onInput(li, input, e);
      });
      card.querySelectorAll('.word_box').forEach(function (wb) { wb.classList.remove('correct', 'incorrect'); });
    });

    // 把每个格子的宽度钉死为该字符在输入框里的推进宽度（汉字与标点逐格对齐的关键）
    this.applyCharWidths();

    // 焦点到第一行
    var first = this.cards[0] && this.cards[0].querySelector('.input_box');
    if (first) { first.disabled = false; setTimeout(function () { first.focus(); }, 60); }

    this.markCursor();
    this.setLenLabel();
  };

  Engine.prototype.setLenLabel = function () {
    var e = this.root.querySelector('#level_len');
    if (e) e.textContent = this.totalChars;
  };

  /* ---------- [F] 核心判定 ---------- */
  Engine.prototype.onInput = function (li, input, ev) {
    if (this.finished) return;
    var card = this.cards[li];
    var units = this.viewLines[li] || [];
    var words = card.querySelectorAll('.word_box');

    // ① 输入法正在组字（拼音→汉字候选）时，一律不判定
    if (this.composing || (ev && ev.isComposing)) return;
    if (input.composing === true) return;

    this.beginIfNeeded();

    var val = input.value;

    // ③ 同一状态不重复处理（compositionend 与 input 可能对同一次提交各触发一次，
    //    不去重会导致音效响两遍）
    var sig = li + '|' + val;
    if (this._lastSig === sig) return;
    this._lastSig = sig;

    // ② 沿用原站规则：输入内容以拉丁字母/空格/逗号结尾 → 视为还在输入法组字，不计入
    //    （只在中文行生效；英文行里拉丁字母本身就是正文，不能跳过）
    var lineHasHan = units.some(function (u) { return u.han; });
    if (lineHasHan && /[a-zA-Z ,]{1,}$/.test(val)) return;

    var typed = Array.from(val);
    var recs = this.records[li];

    // 记录新增/回退
    if (typed.length > recs.length) {
      for (var k = recs.length; k < typed.length; k++) {
        var target0 = units[k] ? units[k].ch : '';
        recs.push({ ok: typed[k] === target0, ch: typed[k] });
      }
    } else if (typed.length < recs.length) {
      recs.length = typed.length;
    }

    // 输入框为空：清空本行所有对错标记
    if (typed.length === 0) {
      words.forEach(function (wb) { wb.classList.remove('correct', 'incorrect'); });
      this.lastWasWrong = false;
      this.updateHint();
      this.refreshStats();
      return;
    }

    // ③ 超出本行字数的多余字符不参与比对（防止输入法残留把行提前打满）
    var curIdx = Math.min(typed.length - 1, units.length - 1);
    var lastWasWrong = false;

    words.forEach(function (wb, index) {
      wb.classList.remove('correct', 'incorrect');
      if (index > curIdx) return;
      var target = units[index] ? units[index].ch : '';
      if (typed[index] === target) {
        wb.classList.add('correct');
        // 原站：只有「当前正在输入的那个字」打对时才出声
        if (index === curIdx) global.Sfx.playCorrect();
      } else {
        wb.classList.add('incorrect');
        // 原站：只有「当前正在输入的那个字」打错时才出声，且行首(索引 0)不打错音
        if (index === curIdx && index !== 0) { global.Sfx.playError(); lastWasWrong = true; }
      }
    }, this);

    this.lastWasWrong = lastWasWrong;
    this.updateHint();
    this.refreshStats();

    // 本行完成 → 进入下一行（必须刚好打满，且末字不能是未提交的拉丁字母）
    if (units.length > 0 && typed.length >= units.length) {
      var tail = typed.slice(0, units.length).join('');
      if (/^[a-zA-Z ,]*$/.test(tail)) return;
      // 原站 processPara：打超的字符不丢，自动带到下一行
      this.advanceLine(li, typed.slice(units.length).join(''));
    }
  };

  Engine.prototype.advanceLine = function (li, extra) {
    var self = this;
    var input = this.cards[li].querySelector('.input_box');
    var units = this.viewLines[li] || [];
    input.disabled = true;
    if (extra) {
      // 本行只保留到刚好打满，多出来的交给下一行
      input.value = Array.from(input.value).slice(0, units.length).join('');
      this._lastSig = null;
    }
    // 跳到下一个非空行（空行无需输入）
    var nextIdx = -1;
    for (var i = li + 1; i < this.cards.length; i++) {
      if ((this.viewLines[i] || []).length > 0) { nextIdx = i; break; }
    }
    if (nextIdx >= 0) {
      var next = this.cards[nextIdx];
      var nin = next.querySelector('.input_box');
      nin.disabled = false;
      this.lineIdx = nextIdx;
      setTimeout(function () {
        nin.focus();
        if (extra) {
          nin.value = extra;
          self._lastSig = null;
          self.onInput(nextIdx, nin, null);   // 让下一行的对错着色与统计同步
        }
        try { nin.setSelectionRange(nin.value.length, nin.value.length); } catch (e) {}
        next.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 30);
    } else {
      this.finish();
    }
    this.markCursor();
    this.updateHint();
    this.setProcess();
  };

  Engine.prototype.onKeydown = function (li, input, e) {
    if (this.finished) return;
    // 原站没有「逐键点击音」，声音只在打对/打错时响，这里不再额外发音
    if (e.key === 'Backspace' && input.value === '' && li > 0) {
      var prev = this.cards[li - 1];
      if (!prev) return;
      var pin = prev.querySelector('.input_box');
      pin.disabled = false;
      input.disabled = true;
      this.lineIdx = li - 1;
      setTimeout(function () {
        pin.focus();
        try { pin.setSelectionRange(pin.value.length, pin.value.length); } catch (err) {}
      }, 20);
      this.markCursor();
      this.updateHint();
      e.preventDefault();
    }
  };

  /* ---------- [G] 光标 / 提示 ---------- */
  Engine.prototype.markCursor = function () {
    this.cards.forEach(function (c) { c.classList.remove('on'); });
    var card = this.cards[this.lineIdx];
    if (card) card.classList.add('on');
  };

  Engine.prototype.currentTargetPoint = function () {
    var card = this.cards[this.lineIdx];
    if (!card) return null;
    var input = card.querySelector('.input_box');
    var units = this.viewLines[this.lineIdx] || [];
    var typedLen = input ? Array.from(input.value).length : 0;
    var wbs = card.querySelectorAll('.word_box');
    // 打错 → 提示指回刚打错的那个字；打对 → 提示下一个待输入字
    var idx = this.lastWasWrong ? typedLen - 1 : typedLen;
    if (idx < 0) idx = 0;
    if (idx > wbs.length - 1) idx = wbs.length - 1;
    var wb = wbs[idx];
    if (!wb) return null;
    return { wb: wb, idx: idx, unit: units[idx] };
  };

  Engine.prototype.updateHint = function () {
    if (!this.tipEl) return;
    var c = this.cfg;
    if (c.hint === 'off') { this.tipEl.style.display = 'none'; return; }
    if (c.hint === 'error' && !this.lastWasWrong) { this.tipEl.style.display = 'none'; return; }
    var pt = this.currentTargetPoint();
    if (!pt || !pt.unit) { this.tipEl.style.display = 'none'; return; }
    var py = pt.unit.py;
    if (!py || py === 'space') py = pt.unit.ch === ' ' ? 'space' : (py || '');
    if (!py) { this.tipEl.style.display = 'none'; return; }

    this.tipEl.innerHTML = '<span class="word_tips">' + esc(py) + '</span>';
    this.tipEl.style.display = 'flex';
    // 定位到该字正上方（CSS 用 translateX(-50%) 做水平居中）
    var box = pt.wb.getBoundingClientRect();
    var host = this.root.getBoundingClientRect();
    var left = box.left - host.left + box.width / 2;
    var top = box.top - host.top - 26;
    this.tipEl.style.left = Math.max(30, left) + 'px';
    this.tipEl.style.top = Math.max(4, top) + 'px';
  };

  /* ---------- [H] 统计 ---------- */
  Engine.prototype.beginIfNeeded = function () {
    if (this.started) return;
    this.started = true;
    this.startTime = Date.now();
    var self = this;
    this.timer = setInterval(function () {
      self.elapsed = (Date.now() - self.startTime) / 1000;
      self.refreshStats();
    }, 1000);
  };

  Engine.prototype.stats = function () {
    var correct = 0, wrong = 0;
    this.records.forEach(function (rs) {
      rs.forEach(function (r) { if (r.ok) correct++; else wrong++; });
    });
    var done = 0;
    this.records.forEach(function (rs, i) {
      if (!rs) return;
      var v = this.viewLines[i] || [];
      done += Math.min(rs.length, v.length);
    }, this);
    var sec = this.started ? (Date.now() - this.startTime) / 1000 : 0;
    var speed = sec >= 1 ? Math.round(correct * 60 / sec) : 0;
    var acc = (correct + wrong) > 0 ? Math.round(correct / (correct + wrong) * 100) : 0;
    return {
      correct: correct, wrong: wrong, done: done,
      total: this.totalChars,
      progress: this.totalChars ? Math.min(100, Math.round(done / this.totalChars * 100)) : 0,
      speed: speed, accuracy: acc, duration: Math.round(sec)
    };
  };

  Engine.prototype.refreshStats = function () {
    var s = this.stats();
    this.setStats(s.duration, s.speed, s.progress, s.total, s.accuracy);
    this.setProcess();
    return s;
  };

  Engine.prototype.setStats = function (dur, speed, progress, len, acc) {
    var q = function (id) { return this.root.querySelector('#' + id); }.bind(this);
    // 原站：未开始 时间 00:00:00 / 速度 0CPM；开始后 时间「分:秒」（fmtClock）、速度 {n}WPM
    if (q('level_time')) q('level_time').textContent = this.started ? fmtClock(dur) : '00:00:00';
    if (q('level_speed')) q('level_speed').textContent = this.started ? (speed + 'WPM') : '0CPM';
    if (q('level_progressrate')) q('level_progressrate').textContent = progress + '%';
    if (q('level_len')) q('level_len').textContent = len;
    if (q('level_accuracy')) q('level_accuracy').textContent = acc + '%';
  };

  Engine.prototype.setProcess = function () {
    var p = this.root.querySelector('#level_progress');
    if (p) p.value = this.stats().progress;
    // 原站单页关卡恒显示「上一关 / 下一关」；这里没有相邻文章时隐藏，避免出现死按钮
    var pre = this.root.querySelector('#bt_pre');
    var next = this.root.querySelector('#bt_next');
    if (pre) pre.style.display = this.onPrev ? '' : 'none';
    if (next) next.style.display = this.onNext ? '' : 'none';
  };

  /* ---------- [I] 完成 ---------- */
  Engine.prototype.finish = function () {
    if (this.finished) return;
    this.finished = true;
    clearInterval(this.timer);
    var s = this.stats();
    // 原站完成时没有单独的过关音：结算页 5 颗星逐颗亮起时播放 'star' 音效
    var self = this;
    setTimeout(function () { self.onFinish(s, self.article); }, 220);
  };

  Engine.prototype.restart = function () {
    clearInterval(this.timer);
    this.mount(this.root, this.article, { onFinish: this.onFinish, onExit: this.onExit });
  };

  Engine.prototype.destroy = function () {
    clearInterval(this.timer);
    this.finished = true;
    if (global.speechSynthesis) global.speechSynthesis.cancel();
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler, true);
    this._keyHandler = null;
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this._resizeHandler = null;
    if (this.root) this.root.innerHTML = '';
    this.root = null;
  };

  /* ---------- [J] 全局快捷键 ---------- */
  Engine.prototype.bindKeys = function () {
    var self = this;
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler, true);
    this._keyHandler = function (e) {
      if (self.finished) return;
      var inInput = e.target && e.target.classList && e.target.classList.contains('input_box');
      if (e.key === 'Escape') {
        if (self.started && !self.finished && !confirm('退出练习？本行进度不会保存。')) return;
        self.onExit();
        return;
      }
      if (e.code === 'Space' && !e.ctrlKey && !e.altKey) {
        // 空格 = 朗读当前行
        e.preventDefault();
        self.speakCurrentLine();
        return;
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); self.gotoLine(self.lineIdx - 1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); self.gotoLine(self.lineIdx + 1); return; }
      if (e.ctrlKey && e.altKey && (e.key === 'h' || e.key === 'H' || e.key === '9')) {
        e.preventDefault();
        self.showAnswerTip();
        return;
      }
    };
    document.addEventListener('keydown', this._keyHandler, true);
  };

  Engine.prototype.gotoLine = function (i) {
    if (i < 0 || i >= this.cards.length) return;
    this.cards.forEach(function (c, k) {
      var inp = c.querySelector('.input_box');
      inp.disabled = !(k <= i);
    });
    this.lineIdx = i;
    var card = this.cards[i];
    var inp = card.querySelector('.input_box');
    inp.disabled = false;
    setTimeout(function () {
      inp.focus();
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 20);
    this.markCursor();
    this.updateHint();
    this.setProcess();
  };

  Engine.prototype.speakCurrentLine = function () {
    if (!global.speechSynthesis) return;
    var units = this.viewLines[this.lineIdx] || [];
    var text = units.map(function (u) { return u.ch; }).join('');
    if (!text.trim()) return;
    global.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.9;
    global.speechSynthesis.speak(u);
  };

  Engine.prototype.showAnswerTip = function () {
    this.usedHint = true;
    var units = this.viewLines[this.lineIdx] || [];
    var text = units.map(function (u) { return u.ch; }).join('');
    var d = document.createElement('div');
    d.className = 'answer_tip';
    d.textContent = '本行答案：' + text;
    this.root.appendChild(d);
    setTimeout(function () { d.classList.add('out'); }, 1800);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 2400);
  };

  global.Engine = new Engine();
  global.EngineCfg = { loadCfg: loadCfg, saveCfg: saveCfg, DEFAULT_CFG: DEFAULT_CFG, fmtClock: fmtClock };
})(window);
