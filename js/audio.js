/* audio.js —— 音效层，完全照搬 nezhadazi.com 的实现
   · 合成器：zzfx（Zuper Zmall Zound Zynth，MIT，KilledByAPixel）——原站 student.js 内联的那份
   · 音色参数：原站 sound_themes 原样复制（correct 4 档 / incorrect 4 档 / star）
   · 响应用途与原站一致：只有「打对」「打错」「结算星星」三种，没有逐键点击音
   · 音量：原站滑块 0~10；原站 zzfxV = 音量/100，这里为保证可听性映射为 音量/10*0.5 */
(function (global) {
  'use strict';

  /* ---------- zzfx（原站 student.js 内联版本，逐字复制） ---------- */
  var zzfxV = 0.3,
      zzfxX = null,
      zzfx = function (p, k, b, e, r, t, q, D, u, y, v, z, l, E, A, F, c, w, m, B, N) {
        p = p === undefined ? 1 : p; k = k === undefined ? .05 : k; b = b === undefined ? 220 : b;
        e = e || 0; r = r || 0; t = t === undefined ? .1 : t; q = q || 0;
        D = D === undefined ? 1 : D; u = u || 0; y = y || 0; v = v || 0; z = z || 0; l = l || 0;
        E = E || 0; A = A || 0; F = F || 0; c = c || 0; w = w === undefined ? 1 : w;
        m = m || 0; B = B || 0; N = N || 0;
        var M = Math, d = 2 * M.PI, R = 44100,
            G = u *= 500 * d / R / R,
            C = b *= (1 - k + 2 * k * M.random(k = [])) * d / R,
            g = 0, H = 0, a = 0, n = 1, I = 0, J = 0, f = 0,
            h = N < 0 ? -1 : 1, x = d * h * N * 2 / R, L = M.cos(x), Z = M.sin, K = Z(x) / 4, O = 1 + K,
            X = -2 * L / O, Y = (1 - K) / O, P = (1 + h * L) / 2 / O, Q = -(h + L) / O,
            S = P, T = 0, U = 0, V = 0, W = 0;
        e = R * e + 9;
        m *= R; r *= R; t *= R; c *= R;
        y *= 500 * d / R / R / R;
        A *= d / R; v *= d / R; z *= R; l = R * l | 0;
        p *= zzfxV;
        for (h = e + m + r + t + c | 0; a < h; k[a++] = f * p)
          ++J % (100 * F | 0) || (f = q ? 1 < q ? 2 < q ? 3 < q ? Z(g * g * g) : M.max(M.min(M.tan(g), 1), -1) : 1 - (2 * g / d % 2 + 2) % 2 : 1 - 4 * M.abs(M.round(g / d) - g / d) : Z(g),
            f = (l ? 1 - B + B * Z(d * a / l) : 1) * (f < 0 ? -1 : 1) * M.abs(f) ** D * (a < e ? a / e : a < e + m ? 1 - (a - e) / m * (1 - w) : a < e + m + r ? w : a < h - c ? (h - a - c) / t * w : 0),
            f = c ? f / 2 + (c > a ? 0 : (a < h - c ? 1 : (h - a) / c) * k[a - c | 0] / 2 / p) : f,
            N ? f = W = S * T + Q * (T = U) + P * (U = f) - Y * V - X * (V = W) : 0),
            x = (b += u += y) * M.cos(A * H++), g += x + x * E * Z(Math.pow(a, 5)),
            n && ++n > z && (b += v, C += v, n = 0),
            !l || ++I % l || (b = C, u = G, n = n || 1);
        p = zzfxX.createBuffer(1, h, R);
        p.getChannelData(0).set(k);
        b = zzfxX.createBufferSource();
        b.buffer = p;
        b.connect(zzfxX.destination);
        b.start();
      };

  /* ---------- 原站 sound_themes 原样复制 ---------- */
  var SOUND_THEMES = {
    'correct': {
      '0': [1, 0, 645, 0, .01, .16, 0, 3.8, 4, 22, 314, .07, 0, 0, 0, 0, 0, .54, .02, 0, 0],
      '1': [2.2, .05, 73.41619, 0, .02, .1, 0, 1, 0, 0, 0, 0, .05, .3, 18, .2, .08, .1, .01, .11, 0],
      '2': [1, .05, 555, 0, .01, .009, 3, 1.5, 903, 0, -272, .1, .035, 0, 0, 0, .3, .1, .02, 0, 0],
      '3': [8, .05, 900, 0, .01, .009, 4, 1.5, 903, 0, -272, .1, .035, 0, 0, 0, .3, .1, .01, 0, 0]
    },
    'incorrect': {
      '0': [1.1, undefined, 312, undefined, .01, .08, 5, undefined, -4, -1, undefined, undefined, .08, 1.8, undefined, .1, undefined, .71, .09, .43],
      '1': [1.9, undefined, 235, undefined, .18, .09, undefined, 3.1, 3, -44, undefined, undefined, .13, undefined, undefined, undefined, .29, .95, .1, undefined, -1067],
      '2': [.8, undefined, 117, undefined, .05, .14, undefined, 3.7, undefined, 15, undefined, undefined, undefined, 1.6, undefined, .1, undefined, .78, .08, undefined, -2121],
      '3': [2.4, undefined, 236, undefined, .03, .09, 1, 2.3, undefined, -8, undefined, undefined, undefined, undefined, undefined, undefined, .04, .81, .04, undefined, 392]
    }
  };
  var STAR_THEME = [1.7, undefined, 148, .01, .28, .06, undefined, 3.5, undefined, undefined, 433, .09, .03, .1, undefined, undefined, .03, .68, .24, .25];

  /* ---------- 配置（对齐原站字段名） ---------- */
  var cfg = {
    sound: 1,              // 键盘声音 开/关
    sound_volume: 5,       // 键盘音量 0~10
    sound_theme: '0',      // 键盘音效：0 跳动 / 1 轻击 / 2 滴答 / 3 碎响
    sound2_theme: '0'      // 错误音效：0 警告1 / 3 警告2 / 2 警告3 / 1 警告4
  };

  function ctxReady() {
    if (!zzfxX) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      zzfxX = new AC();
    }
    if (zzfxX.state === 'suspended') { try { zzfxX.resume(); } catch (e) {} }
    return zzfxX;
  }

  /* 原站 playSound 的等价实现 */
  function playSound(type) {
    if (String(cfg.sound) === '0') return;
    var vol = Number(cfg.sound_volume);
    if (isNaN(vol)) vol = 5;
    if (vol <= 0) return;
    if (!ctxReady()) return;
    zzfxV = vol / 10 * 0.5;        // 原站为 vol/100（音量约为本实现的一半），此处上调到可听区间
    try {
      if (type === 'star') { zzfx.apply(null, STAR_THEME); return; }
      if (type === 'correct') {
        var a = SOUND_THEMES['correct'][cfg.sound_theme] || SOUND_THEMES['correct']['0'];
        zzfx.apply(null, a);
      }
      if (type === 'incorrect') {
        var b = SOUND_THEMES['incorrect'][cfg.sound2_theme] || SOUND_THEMES['incorrect']['0'];
        zzfx.apply(null, b);
      }
    } catch (e) { /* 忽略音频异常，不影响打字 */ }
  }

  global.Sfx = {
    config: cfg,
    play: playSound,
    playCorrect: function () { playSound('correct'); },
    playError: function () { playSound('incorrect'); },
    playStar: function () { playSound('star'); },
    /* 首次用户手势时创建/恢复 AudioContext */
    unlock: function () { ctxReady(); },
    themes: SOUND_THEMES
  };
})(window);
