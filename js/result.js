/* result.js —— 结算页（复刻原站结算模式：5 星 + 三项奖励条 + 段位条）
   原站结构：.stars_row(.stars_list/.star_emoj + .reward_h/.reward_list) + .reach_box
   段位与星级为自研规则（原站私有素材未搬）。 */
(function (global) {
  'use strict';

  /* 段位表：按本次速度（字/分钟） */
  var RANKS = [
    { name: '塑料小白', min: 0 },
    { name: '一指青铜', min: 20 },
    { name: '二指白银', min: 30 },
    { name: '十指黄金', min: 40 },
    { name: '流云蓝珀', min: 55 },
    { name: '幻影钻石', min: 70 },
    { name: '键影星耀', min: 90 },
    { name: '神速大师', min: 120 },
    { name: '键舞王者', min: 160 },
    { name: '星河宗师', min: 200 }
  ];

  function accPts(a) { return a >= 98 ? 3 : a >= 92 ? 2 : a >= 80 ? 1 : 0; }
  function spdPts(s) { return s >= 60 ? 2 : s >= 35 ? 1 : 0; }
  function starsOf(s) { return Math.max(0, Math.min(5, accPts(s.accuracy) + spdPts(s.speed))); }

  function rankIndex(speed) {
    var i = 0;
    for (var k = 0; k < RANKS.length; k++) if (speed >= RANKS[k].min) i = k;
    return i;
  }

  function meterColor(pct) {
    return pct >= 85 ? '#16a34a' : pct >= 60 ? '#0ea5e9' : pct >= 30 ? '#f59e0b' : '#ef4444';
  }

  function rewardRow(title, valueText, pct, scoreText) {
    return '' +
      '<li>' +
      '<span class="reward_tit">' + title + '</span>' +
      '<span class="reward_txt">' + valueText + '</span>' +
      '<span class="reward_progress"><i style="width:' + Math.max(3, Math.min(100, pct)) + '%;background:' + meterColor(pct) + '"></i></span>' +
      '<span class="reward_score">' + scoreText + '</span>' +
      '</li>';
  }

  function rankIcon(i) {
    var glyphs = ['🌱', '🥉', '🥈', '🥇', '💠', '💎', '✨', '🚀', '⚡', '🌟'];
    return glyphs[i] || '⭐';
  }

  global.Result = {
    starsOf: starsOf,
    rankIndex: rankIndex,
    RANKS: RANKS,

    /* 渲染结算页到容器；返回可绑定按钮的 DOM */
    render: function (container, article, stats, opts) {
      opts = opts || {};
      var failed = stats.accuracy < 60;
      var stars = failed ? 0 : starsOf(stats);
      var rank = rankIndex(stats.speed);

      var starLis = '';
      for (var i = 0; i < 5; i++) {
        starLis += '<li class="' + (i < stars ? 'on' : '') + '">' +
          '<span class="star-empty">☆</span><span class="star-image">★</span></li>';
      }

      var accPct = stats.accuracy;
      var spdPct = Math.min(100, Math.round(stats.speed / 200 * 100));
      var durTarget = Math.max(30, Math.round(stats.total * 0.6));
      var durPct = Math.max(0, Math.min(100, Math.round(durTarget / Math.max(1, stats.duration) * 100)));
      var durScore = stats.duration <= durTarget ? '敏捷' : '加油';
      var spdScore = stats.speed >= 60 ? '飞快' : stats.speed >= 35 ? '稳健' : '加油';
      var accScore = accPct >= 98 ? '优秀' : accPct >= 92 ? '良好' : accPct >= 80 ? '及格' : '加油';

      var ranks = RANKS.map(function (r, k) {
        var on = k <= rank ? 'on' : '';
        var cur = k === rank ? 'cur' : '';
        return '<li class="' + on + ' ' + cur + '">' +
          '<p class="title">' + r.name + '</p>' +
          '<div class="icon">' + rankIcon(k) + '</div>' +
          '<div class="strip"><i></i></div>' +
          '<p class="reach-tips">' + r.min + '字/分</p>' +
          '</li>';
      }).join('');

      var html = '' +
        '<div class="result_wrap ' + (failed ? 'is_failed' : '') + '">' +
        '  <div class="stars_row">' +
        '    <div class="stars_col">' +
        '      <ul class="stars_list">' + starLis + '</ul>' +
        '      <div class="star_emoj">' + (failed ? '💔' : '🎉') + '</div>' +
        '    </div>' +
        '    <div class="stars_col">' +
        '      <div class="reward_h"><h3>' + (failed ? '闯关失败！💔' : '恭喜过关') + '</h3></div>' +
        '      <p class="result_sub">' + (failed ? '你打错了太多字，再接再厉吧！' : '《' + article.title + '》 · 完成练习') + '</p>' +
        '      <ul class="reward_list">' +
        rewardRow('准确率', accPct + '%', accPct, accScore) +
        rewardRow('打字速度', stats.speed + 'WPM', spdPct, spdScore) +
        rewardRow('闯关时长', global.Util.fmtTime(stats.duration), durPct, durScore) +
        '      </ul>' +
        '    </div>' +
        '  </div>' +
        '  <div class="reach_box">' +
        '    <div class="reach_head">当前段位：<b>' + RANKS[rank].name + '</b>（' + stats.speed + ' 字/分）</div>' +
        '    <ul class="count5">' + ranks + '</ul>' +
        '  </div>' +
        '  <div class="result_actions">' +
        '    <button class="btn btn-primary" id="rs_next" ' + (opts.hasNext ? '' : 'disabled') + '>下一篇</button>' +
        '    <button class="btn" id="rs_retry">再练一次</button>' +
        '    <button class="btn" id="rs_home">返回主界面</button>' +
        '  </div>' +
        '</div>';

      container.innerHTML = html;

      // 原站：星星逐颗亮起，每颗亮起时播放 star 音效（间隔 300ms）
      if (!failed && global.Sfx) {
        var starEls = container.querySelectorAll('.stars_list li.on');
        for (var s = 0; s < starEls.length; s++) {
          (function (k) {
            setTimeout(function () { global.Sfx.playStar(); }, k * 300);
          })(s);
        }
      }
      return container;
    }
  };
})(window);
