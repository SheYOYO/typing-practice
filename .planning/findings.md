# Findings — 哪吒打字「文章打字交互」逆向记录

来源：https://www.nezhadazi.com/level/29-2-101.html （文章大全 → 散文一百篇 →《豁达》）
证据：页面内嵌 JSON + `student.js` 源码 + 无头浏览器实测（截图 /tmp/nz_clean.png、/tmp/nz_after.png）

---

## F1 站点与资源
- 页面壳：`https://www.nezhadazi.com/level/<uri>.html`（服务端渲染，内含关卡 JSON）
- 引擎：`https://v.yuncong-ai.com/static/dazi/js/student.js`（约 150KB，jQuery 风格，含 `studentCtrl` 单例）
- 样式：`https://v.mamioo.com/static/dazi/level.css`（53KB）
- 其他：PixiJS（游戏关卡）、Live2D（桌宠）、layer.js（弹窗）
- **文章模式不用 PixiJS**，是纯 DOM（`.level_para_line` + `<input>`）

## F2 关卡数据结构（内嵌 JSON，`{"id":0,"uri":...}`）
```
{ id, uri, type:"para", name, lock, src, keyboard:"",
  section:"散文一百篇", course_id:"29",
  pre_uri, next_uri,
  pages:[{ type:"para", split:"cn", focus, text,
           lines:[[ {index, label:汉字, text:汉字, chars:拼音, pinyin:拼音}, ... ], ...] }] }
```
- 实测《豁达》：`lines` 21 行，`总字数 410`
- `split:"cn"` = 中文按**字**切；`split:"en"` = 英文按**词**切
- 每个字自带拼音 `chars`/`pinyin`（**仅用于提示，不用于判定**）
- `pre_uri` / `next_uri` → 上下篇跳转

## F3 ★核心判定：`studentCtrl.processPara(inputDom)`（文章模式唯一判定入口）
绑定：`$('.level_para_lines').on('input', '.input_box', fn)`
```js
// 中文模式下，输入纯英文/空格/逗号 → 直接 return，不计入
if (/[a-zA-Z ,]{1,}$/.test(input.val())) {
  if (type==='para' && split!=='en') return true
}
const typed = Array.from(input.val());              // 用户用**自己的输入法**打出的汉字
curIdx = typed.length - 1
line.find('.word_box').each((index, el) => {
  const target = el.find('.word_label').text();     // 目标汉字
  el.removeClass('correct incorrect')
  if (curIdx >= index) {
    if (target === typed[index]) { el.addClass('correct');   playSound('correct')   }
    else                         { el.addClass('incorrect'); playSound('incorrect') }
  }
})
if (typed.length >= 本行字数) { 本行完成 → 光标跳下一行 input }
if (所有行完成) levelDone()  // → 结算
```
**结论（用户已确认）**：拼音只是提示；**必须打出正确的汉字才算对**。
逐字比较"目标汉字 vs 用户输入汉字"，位置一一对应。

## F4 ★拼音提示：`#notify_para`
- DOM：`<div id="notify_para" class="notify_para" style="display:flex; top:141px; left:273px"><span class="word_tips">sheng</span></div>`
- **一个绿色小浮标**，定位在「当前待输入字」的坐标上，内容是那个字的拼音
- `studentCtrl.notifyPara()` 负责定位与显隐
- 节流开关：`userData.config.notify`（0=关闭 / 1=总是 / 2=仅纠错）→ 对应设置项「字码提示：总是/仅纠错/关闭」

## F5 布局结构（文章模式）
```
.level_para_lines                        (宽 98%，纵向 flex)
  └ .level_para_line                     (白底卡片，min-width 900px，内阴影，圆角4px)
      ├ .words_box > .word_box × N       (inline-block，每个字一格)
      │     ├ .word_label                (汉字，font-size 30px，等宽字体)
      │     └ .word_cursor               (下划线光标)
      └ input.input_box                  (height 50px，font-size 30px，仅上边框有淡色)
```
- 行内字数由 `getMaxCharsByFilling()` 按容器宽度算，超宽自动折行
- 配色：`.correct .word_label{color:#0086d2}` 蓝 / `.incorrect .word_label{color:#ff5e7c}` 粉红
- 卡片背景：`.level_para_line{background:#fff; box-shadow: inset 0 0 4px rgba(84,53,7,.2)}`
- 页面背景：淡水墨山水（原站自有素材，不复刻）

## F6 顶部统计条 `.score_bar`（实测值）
`时间： 00:03  速度： 60WPM  进度： 0%  总字数： 410  准确率： 100%`
- **时间**：`00:00:00`，从第一次输入开始计时
- **速度**：文章模式显示 **WPM**（`speedw`）；`cn` 时 `speedw = speed + 0`；
  `speed = round(correct_count * 60 / duration秒)`
- **进度**：`%`
- **总字数**：整篇字数（410）
- **准确率**：`%`，由 correct/incorrect 统计得出

## F7 结算界面（照搬目标）
```
.stars_row
  ├ .stars_col：.stars_list（5 颗星，star-empty/star-image 两张图叠放切换）
  │            .star_emoj（表情动图 hap2.gif 等）
  └ .stars_col：.reward_h > h3 「恭喜过关」
                .reward_list
                   #reward_accuracy  准确率 + 进度条 + 评级文字
                   #reward_speed     打字速度 + 进度条 + 评级文字
                   #reward_duration  闯关时长 + 进度条 + 评级文字
#reward_star .reach_box（段位条，count3 三列一屏）
```
段位表：塑料小白 0星 → 一指青铜 100星 → 二指白银 200星 → 十指黄金 300星 →
流云蓝珀 400星 → 幻影钻石 500星 → 键影星耀 800星 → 神速大师 1000星 →
键舞王者 200CPM → 星河宗师 400CPM

## F8 失败弹窗 `#failed_box`
`闯关失败！💔 / 你打错了太多字，再接再厉吧！ / [再试一次]`

## F9 其他交互细节
- 顶部工具栏：桌宠 / 主题 / 键盘 / 音效 / **拼音全拼下拉（输入法方案）** / 设置 / 重来
- 底部进度条 `.level_process`：`[上一个] ▓▓▓▓ [跳过]`，右下角「上一关 / 下一关」
- 快捷键提示条：`空格 朗读`、`←→ 翻页`、`Ctrl+Alt 提示`
- 启动遮罩：`鼠标点我 或 按 空格键 开始`
- 退格：`onBackSpace`，行首退格回上一行
- 「出示答案」：把整行文字填进输入框（调试/提示用）

---

## F10 自己实现时踩到的坑（复刻 Demo 阶段）

| # | 现象 | 根因 | 修法 |
|---|------|------|------|
| 1 | 首页白屏，`Cannot set properties of null` | `Engine.destroy()` 在未 mount 时访问 `this.root.innerHTML` | destroy 里加 `if (this.root)` 守卫，并解绑 keydown |
| 2 | 打对过的字会被清成无色 | `classList.remove('correct')` 写在 `locked` 提前 return 之前 | 去掉 locked 优化，每次整行重算；空输入时整行清标记 |
| 3 | 顶栏工具按钮全部消失 | `fragWrap.appendChild(frag)` 先把 DocumentFragment 子节点搬空，之后 `holder.appendChild(frag)` 追加的是空片段 | 去掉多余的 fragWrap；`buildTools` 直接接收 `ul.tools` 当根 |
| 4 | 深色模式下汉字仍是深灰看不见 | `.level_para_line .words_box .word_box .word_label`（4 类）优先级高于 `.level_dark .level_para_line .word_label`（3 类） | 把浅色规则压平为 `.level_para_line .word_label`（2 类） |
| 5 | 长段落折行后点不到结算、控制台 `reading 'length'` | `this.records` 按**原行**初始化，而输入回调按**折行后的视觉行**取下标 | records 改为在 `measureAndRender` 里按 `viewLines` 重建 |
| 6 | 空行卡住无法继续 | 空行没有字符，永远不会"完成" | `advanceLine` 向前找第一个非空行；导入时折叠连续空行 |
| 7 | 拼音提示浮标水平偏移 | 用 `left - 20` 硬凑宽度 | 改用 CSS `transform: translateX(-50%)` 真正居中 |
| 8 | 提示浮标指错字 | 恒定取"下一个待输入字" | 打错时指回刚打错的那个字（与原站 notifyPara 一致） |
| 9 | 速度出现 5475WPM 这种荒唐值 | 不足 1 秒就参与 `correct*60/sec` | `sec >= 1` 才计算速度 |

## F11 实测环境备忘
- 沙箱直连 nezhadazi.com 报 SSL 35 → 必须 `curl --insecure`（走沙箱代理 MITM）
- 本机 ms-playwright 只有 `chromium_headless_shell-1243`，playwright-core 需显式
  `executablePath`（默认找不到 chromium-1247）
- `playwright-cli` 的会话不跨进程保持；改用自写 playwright-core 单进程脚本
- 本地读页面用 `pathToFileURL()`，路径含中文与括号必须编码

---

## F12 第二轮修正：输入法组字误判 + 音效（2026-10-10 晚）

### 问题 1：还没打完就"识别并结束"
**现象**：用户用拼音输入法打出 `chuang`，还没选字，程序就把拼音字母当成正文对齐，
判定为"已输入"，还提前把行打满、跳到下一行甚至结束。

**根因**：`onInput` 只用了 `/^[a-zA-Z ,]*$/`（**整串都是** ASCII 才跳过）。
输入法组字时 `input.value` 是「已提交的汉字 + 末尾一串拼音字母」，
整串不是纯 ASCII，于是检查失效。
原站用的是 **`/[a-zA-Z ,]{1,}$/`（以 ASCII 结尾即跳过）**——所以它不出这个 bug。

**修法（三重）**：
1. 监听 `compositionstart` / `compositionend`，组字期间 `this.composing = true`，直接不判定；
   同时检查 `event.isComposing` 与 `input.composing`
2. 判定规则改回原站的 `/[a-zA-Z ,]{1,}$/`（仅对含汉字的行生效，英文行不跳）
3. 换行条件加双保险：`typed` 截到本行长度后的尾巴不能是纯 ASCII

**实测（CDP 真实输入法组字）**：
```
组字中(chuang)         val=chuang          correct=0 incorrect=0 不换行 不出声 ✅
组字中(21字母长拼音)     val=chuangqian...   correct=0 incorrect=0 不换行 不出声 ✅
提交「床」             val=床              correct=1 出声1次     ✅
整行提交完             correct=12 换到下一行 出声12次           ✅
```

### 问题 2：没有声音
**排查**：打桩统计 `AudioContext` 调用 → 其实**有**触发（ctx running、oscillator 在创建），
只是我自研的合成音**又短又轻**（35ms、peak 0.08）≈ 听不见。
另外原站**根本没有"逐键点击音"**，我多加了一个，还是个更听不见的短音。

**原站真实做法（student.js）**：
- 用 **zzfx**（Zuper Zmall Zound Zynth，MIT）现场合成，**不用音频文件**
- `sound_themes = { correct: {0..3}, incorrect: {0..3} }` 四档音色，另加一个 `star`
  - 「键盘音效：跳动/轻击/滴答/碎响」= `correct` 的 '0'/'1'/'2'/'3'
  - 「错误音效：警告1/2/3/4」= `incorrect` 的 '0'/'3'/'2'/'1'（**注意不是顺序对应**）
- 触发点只有两处：
  - 打对 → `if (chars_cur_index === index) playSound('correct')`
  - 打错 → `if (chars_cur_index === index && index !== 0) playSound('incorrect')`
  - 结算星星 → 每颗亮起 `playSound('star')`，间隔 300ms
- 音量：滑块 0~10，`zzfxV = 音量/100`

**照搬结果**：`js/audio.js` 内联 zzfx 原码 + 原参数表原样复制；
引擎去掉逐键音，只在打对/打错处发音；结算页星星逐颗响。
唯一偏离：`zzfxV` 用 `音量/10*0.5`（原站 `/100` 只有其一半，怕再被说听不见），
默认 5 档 → peak 0.25~1.0 / 时长 0.18~0.66s，实测清晰可闻。

**实测**：纯按键 0 次出声；打对 1 次；打错 1 次；星星逐颗。真实手势下 ctx 自动 unlock 为 running。

---

## F13 第三轮：打字交互页「背景主题」搬运（2026-10-11）

### 原站背景机制（从 level.css 逆向）
```css
.level_body            { background: #EDF6FF; }           /* 页面底色 */
.level_body .level_box::before {
  content:""; position: fixed; top:0; left:0;
  width:100%; height:100vh;
  background-repeat:no-repeat; background-size:100% 100%;
  background-position:center; opacity:.5; z-index:-6999;
}
.level_body.bg0 .level_box::before { background-image: url('.../levelbg0.webp'); }
/* bg0 ~ bg9, bga 共 11 套；另 .level_dark .level_box::before { opacity:.2 !important } */
.bg0 .char_char, .bg1 .char_char, ... { color:#333333; }   /* 有背景时字色加深 */
```
- 大图：`https://v.typingclub.cn/static/dazi/images/levelbg{N}.webp`
- 缩略图：`https://v.yuncong-ai.com/static/dazi/images/levelbg{N}t.jpg`
- 默认项：`rel=""`，缩略图 `levelbgt.jpg`

### 11 套主题名称（照搬原站 ul#bg-themes 顺序）
| rel | 名称 | rel | 名称 | rel | 名称 | rel | 名称 |
|---|---|---|---|---|---|---|---|
| '' | 默认 | '0' | 戏蝶 | '1' | 花海 | '2' | 翠幕 |
| '3' | 青穹 | '4' | 远岫 | '5' | 群灵 | '6' | 玄夜 |
| '7' | 溯风 | '8' | 织雪 | '9' | 凝香 | 'a' | 曲涧 |

### 实现要点
- 全部 22 张图（11 大图 + 11 缩略图 + 1 默认缩略图，共 254KB）下载到 `bg/`，**离线可用**
- CSS 用 `.level_wrap::before` 承载背景层。**偏离原站一处**：原站用 `z-index:-6999`，
  这里改为 `z-index:0` 并把内容层提到 `z-index:1`——因为本项目 `.level_wrap` 自带背景色，
  负层级伪元素会被父背景色遮挡。视觉结果一致（opacity/铺设方式/尺寸完全相同）。
- 新增 `.bg_set` 类控制 opacity（0.5 / 深色 0.2），避免"默认"项也叠一层透明度。
- 配置项 `cfg.bg`（'' 或 '0'..'a'），存 localStorage `nzd_cfg_v2`，刷新保持。
- 工具栏新增「主题（背景）」按钮 `bt_bg`，面板为缩略图网格（照搬原站 `ul.bg-themes` 样式）。

### 踩到的坑
**背景层一加，顶栏下拉面板全部点不动了。**
原因：给 `.level_header` 加 `z-index:1` 抬升到背景之上时，**同时创建了层叠上下文**，
面板的 `z-index:7999` 只在 header 内部有效；而 `.level_main` 也是 `z-index:1` 且 DOM 靠后，
于是 main 整体盖住了 header，Playwright 报 "subtree intercepts pointer events"。
修法：`.level_header { z-index:100 }`（> main 的 1），main 保持 1。
**另注意**：底部 `.level_footer` 是 `position:fixed; z-index:1000`，
不能用 `.level_wrap > * { position:relative }` 一刀切，否则会把固定定位改坏。

### 实测
```
主题面板       12 项，名称/缩略图全部加载成功，默认项高亮        ✅
选「花海」     cls=level_wrap bg1 bg_set，opacity=0.5，
               background-size=100% 100%，position=fixed，
               已写入 localStorage.bg='1'                        ✅
深色模式       opacity=0.2（照搬原站）                          ✅
刷新后         背景保持（bg1 bg_set）                            ✅
请求失败 0 / 控制台报错 0                                        ✅
回归：全流程 / 边界折行空行 / IME 组字 / 音频解锁  全绿          ✅
```

---

## F14 — 原站 level.css 交互组件取值（2026-10-11 核对，视觉还原的唯一依据）

来源：`https://v.mamioo.com/static/dazi/level.css`（53,767 B）。**改视觉前先核这份。**

```css
/* 正文行 —— 宽度模型 + 内阴影 */
.level_para_line { display:block; width:auto; min-width:900px; background:#ffffff;
  border-radius:4px; box-shadow: inset 0 0 4px rgb(84,53,7,0.2);
  padding:3px; padding-bottom:0; margin:auto auto; margin-bottom:10px; }
@media (min-width:576px)  { .level_para_line { max-width:600px } }
@media (min-width:768px)  { .level_para_line { max-width:760px } }
@media (min-width:1024px) { .level_para_line { max-width:960px } }
@media (min-width:1280px) { .level_para_line { max-width:1200px } }
@media (min-width:1536px) { .level_para_line { max-width:1200px } }
/* 全局重置：* { margin:0; padding:0; box-sizing:border-box } —— 这是 .input_box 没有 padding 的原因 */
.level_para_lines { width:98%; margin:10px auto; display:flex; flex-direction:column }
.level_page { display:flex; justify-content:center; align-items:center; margin-bottom:20px }
.level_para_line .words_box .word_box { display:inline-block; padding:0!important; margin:0!important; box-sizing:content-box }
.level_para_line .words_box .word_label { padding:0!important; margin:0!important; box-sizing:content-box;
  font-size:30px; font-family:Consolas, Courier New, SF Mono, PingFang SC, Hiragino Sans GB,
  Microsoft YaHei, WenQuanYi Micro Hei, sans-serif; min-width:3px }
.level_para_line .input_box { display:block; width:100%!important; height:50px;
  border:1px solid #ffffff; font-size:30px; letter-spacing:0px; margin-bottom:5px; border-top-color:#ddeedd }
/* 下划线：当前行整行浅绿，不是逐字状态色 */
.level_para_line .word_cursor { display:block; opacity:0 }
.level_para_line .on .word_cursor { opacity:0.3; background-color:#205b02 }
.level_para_line .incorrect .word_label { color:#ff5e7c }
.level_para_line .correct .word_label { color:#0086d2 }
/* 注：原站把「.on .word_label { border-top:1px solid #205b02 }」注释掉了 —— 别再加回来 */
```

行 DOM（`student.js` 里拼的）：
```html
<div class="level_para_line level_line" lang="en">
  <div class="words_box">
    <div class="word_box" cut="#index#"><div class="word_label">#text#</div><div class="word_cursor"></div></div>
    …
  </div>
  <input class="input_box" disabled autocomplete="off"/>
</div>
```

其余关键取值：顶栏 `.level_header{height:40px; padding:0; linear-gradient(#F9F9F9,#fff); box-shadow:0 2px 8px rgba(0,0,0,.1)}`；
`.level_header .level_nav{border-bottom:none!important; max-height:38px; margin-top:1px}`；
`h1{font-size:14px; line-height:26px; padding-left:20px; max-width:500px}`；
`nav ul.tools li{margin-left:20px}`；`.tools .options{top:50px; width:300px; line-height:35px; box-shadow:0 -2px 5px rgba(0,0,0,.2)}`；
`.tools .options > div{border-bottom:1px solid #CCCCCC}`；
`ul.bg-themes li{width:150px; margin:10px; border:3px solid #ddd} li.active{border-color:#5DB7E5}`；
`.level_process{height:60px; background:#FFF; border-top:1px solid #e0e0e0}`；
`.btn{font-size:16px; border-radius:28px}` `:hover{translateY(-2px); box-shadow:0 4px 8px rgba(51,175,255,.2)}`；
`progress{height:8px}` `.options progress-value{linear-gradient(90deg,#33AFFF,#2b8fd1)}`；
`.level_keyinfo{bottom:35px; opacity:0}`（原站默认不可见）；
深色：`.level_dark.level_body{background:#000!important}` `.level_dark .level_header{background:#666666}`
`.level_dark .level_line{background:#666; color:#eee}` `.level_dark .word_label{color:#eee}`
`.level_dark .level_para_line .input_box{color:#eee; background:#333; border:1px solid #ddd}`
`.level_dark .level_box::before{opacity:0.2!important}`。

### 结论：逐格对齐不是"原站有个镜像层"，而是**等宽自然对齐**
`student.js` 里没有任何"已输入文字"的镜像 DOM，全靠输入框与 `.word_label` 同字体 + 全局 `padding:0`
自然对齐。**任何一边加了水平 padding 都会破坏它** —— 这是本轮踩到的坑，已写进 `产品底线.md` 第 5 条。
为防御字体回退/全角半角标点/空格的宽度漂移（会沿行累积），本项目额外用
`Engine.measureWidths()` / `applyCharWidths()` 把每格宽度钉死（原站没有这层，但结果一致且更稳）。

---

## F15 — 原站「换行/分行」规则逆向（2026-10-11，终极结论）

**取证方法**：Playwright 打开原站 4 篇真实文章，同时抓两样东西对比：
- `#level_data` 里 `pagedata.lines`（服务端分行结果）
- 最终 DOM 里每个 `.words_box .word_label` 拼出的行（前端切完的真实效果）

**铁证**（`/level/29-2-101.html`）：
```
pagedata.lines[8] = "容不得半点污秽和虚伪，是黑而决不会说白、是鹿决不会说是马。"   29 字
最终 DOM         = "容不得半点污秽和虚伪，是黑而决不会说白、是鹿决不会说是"       27 字
                 + "马。"                                                     2 字
                    ↑ 29 字被从**腰斩**，标点完全不避让
pagedata.lines[1] = "生活老人悄悄告诉我：性格开朗并非豁达之全部内涵，"  以**逗号**结尾却独立成行
                    ↑ 若引擎按标点分句，逗号处不该断
```

**⇒ 真实规则是两层，之前一直理解错了：**

| 层 | 位置 | 规则 |
|---|---|---|
| ① 服务端 | 生成 `pagedata.lines` | **按原文换行 `\n` 分行**，不按句号分句；整篇拍平、段间不插空行 |
| ② 前端 | `student.js` `initPage` | 每行按可视宽度**定长续切**，切的时候不避让标点 |

②的实现（`student.js` 原文）：
```js
let line_text_len = getMaxCharsByFilling('tmp_input', pagedata['split'] || '') - 2;
if (line_text_len < 10) line_text_len = 10;
for (let i = 0; i < pagedata.lines.length; i++) {
  let parawords = pagedata.lines[i];
  for (let j = 0; j < parawords.length; j += line_text_len)
    levelData.lines.push(Array.from(parawords.slice(j, j + line_text_len)));
}
function getMaxCharsByFilling(inputId, lang) {      // 二分：输入框装得下几个字
  let testStr = (lang !== 'en' && lang !== '') ? '中'.repeat(500) : 'M'.repeat(500);
  inputElement.value = testStr;
  let low = 0, high = testStr.length, result = 0;
  while (low <= high) { const mid = Math.floor((low + high) / 2);
    inputElement.value = testStr.substring(0, mid);
    if (inputElement.scrollWidth <= inputElement.clientWidth) { result = mid; low = mid + 1; }
    else high = mid - 1; }
  return result;
}
```

**关键数值**：1440px 宽 + 30px 字号下 `getMaxCharsByFilling` 返回 29 → `27`。
（原因是 `.level_para_line` 上 `margin:auto auto` + `width:auto` 阻止了 flex stretch，
无内容的测量行宽度收缩到 `min-width:900px`；扣除 border/padding 后 input clientWidth≈892px，
`892 / 30 ≈ 29`。所以卡片宽度是 900 而不是 1200 —— 这点很反直觉，但实测如此。）

**逐行还原验证（4/4 完全一致）**：
```
29-2-101  per=27  原站 DOM 22 行  本项目 22 行  ✅ 逐行完全一致（含 27+2 腰斩那句）
29-2-102  per=27  原站 DOM 90 行  本项目 90 行  ✅
29-2-103  per=27  原站 DOM 39 行  本项目 39 行  ✅
29-2-104  per=27  原站 DOM 21 行  本项目 21 行  ✅
视口 1440/1280/1024/900 → per=27     视口 700 → per=20   （均与独立复算一致）
```

**本项目落点**：
- `js/pinyin.js` → `splitSentences()`：按 `\n` 分行（去空行）+ 行内按句末标点 `。！？；…`
  补切一段（**这是给"用户导入的连续长段落"用的**，让效果贴近原站素材的「一句一行」；
  对原站那种一句一行的素材零副作用，因为每行末尾就一个标点）。
  **不做长度硬切** —— 长度交给前端定长切，保证与原站 27+2 的腰斩行为一致。
- `js/engine.js` → `getMaxCharsByFilling()`（原样照搬二分）+ `computePer()` = `-2`、`min 10`。
- 字号变化 / 窗口 resize 时（未开打）重折行。

**踩过的坑**：一度以为要"按句号分句"，于是加了 30 字硬切，结果 101 篇那句 29 字
被切成 30+5 派生行，与原站 27+2 不符。**长度硬切必须去掉，只由输入框二分值决定每行字数。**

---

## F16 — 原站课程卡片（圆角正方形）取值与文档导入实现（2026-10-11）

### 原站 `.lesson-item`（/course/ 实测，主界面卡片改版的依据）
```css
.lesson-item{
  width:220px; height:230px;            /* 接近正方形 */
  border-radius:15px; background:#fff;
  box-shadow:rgba(0,80,179,.08) 0 4px 30px;   /* 蓝调柔影 */
  transition:box-shadow .3s;            /* 只过渡阴影，不做位移 */
}
.lesson-item:hover{ box-shadow:rgba(0,80,179,.12) 0 8px 30px; }
/* 内部结构：.cover(220×123 封面图) + .content > h3.title + .foot(左信息 + 右 .lesson-bt 按钮) */
h3.title{font-size:16px; color:#3E454D; font-weight:500; line-height:24px; margin:0 0 8px}
.foot{font-size:14px; color:#555; display:flex; justify-content:space-between}
.lesson-bt{font-size:14px; color:#F5F5F5; background:#F44336; border-radius:10px; padding:1px 7px}
```

### 本项目落点（内容按需求替换为「文章名 + 作者 + 是否完成」）
- 卡片：`220×230 / radius 15 / 白底 / shadow rgba(0,80,179,.08) 0 4px 30px`；
  `transition: box-shadow .3s, transform .3s cubic-bezier(.25,.8,.25,1), border-color .3s`；
  hover：阴影加深到 `.12 / 0 8px 30px` + `translateY(-3px)`。
  **额外加了一条 1px `#eaf0f8` 极淡描边** —— 因为本项目页面底色是浅蓝 `#eef4fb`，
  只靠原站那种淡阴影边界会糊；原站底色更白所以不需要描边。
- 上区 `.a_cover`（`flex:1`，浅蓝 `#f5f8fc`）：文章名 18px `#3E454D` + 作者 13px，垂直居中。
- 下区 `.a_body`（贴底）：左「N 字 · 已练 M 次」，右胶囊按钮「开始练习 / 再练一次」。
- 完成态：右上角 26px 绿圆白勾 `.a_check`；卡片浅绿底 `#f2faf5`；序号转绿；按钮转绿。
- **左上角序号 `.a_no`**：22px `#adbfd2`，`tabular-nums`，**由渲染时的 index 动态生成**
  （增删后自动重排，不写进文章数据）；完成转 `#7fc9a2`，hover 加深并 `translateY(-1px)`。
- `.a_best`（最好成绩）改为 `position:absolute` 贴在底部信息行上方，
  **避免它参与布局把文章名挤得上下浮动**（有成绩的卡和没成绩的卡名字位置必须一致，实测均为卡片内 y=88）。
- 删除按钮 `.a_del` 移到序号下方 `top:42px; left:12px`，hover 浮现（原 `.a_del` 旧规则已删，
  否则会覆盖新样式）。

### 文档导入（新功能）
- `<input type="file" accept=".txt,.text,.md,.markdown,.docx">` + 「导入文档」按钮。
- **.txt / .md**：`FileReader.readAsArrayBuffer` → `TextDecoder`。
  先跳 BOM，再按 **UTF-8 fatal** 严格解；解不出来则回退 **`gb18030`**（老式中文 txt 常见）。
- **.docx**：不引第三方库。docx 就是 zip —— 从 EOCD 找中央目录，定位 `word/document.xml`，
  用原生 **`DecompressionStream('deflate-raw')`** 解压（method 0 直接取），
  再从 XML 抽 `<w:t>` 文本（`</w:p>`→换行，`<w:tab/>`→空格，`<w:br/>`→换行，并解 XML 实体）。
- **自动抓标题 / 作者**（`guessMeta`）：首个非空行若「≤40 字且不以句末标点结尾」当标题；
  紧接着的下一个非空行若「≤24 字、同样不以标点结尾、不以数字开头」当作者；其余为正文。
  另清理 `《》`、`标题：`、`作者：`、`by`、破折号等前缀。识别失败则整体当正文、标题作者留空。
- 结果填入预览框（标题 / 作者 / 正文三个输入），**用户可编辑后再点「导入并加入列表」**。
- 实测：UTF-8 txt ✅ / GB18030 txt ✅ / 真 docx（zipfile 生成）✅，三者标题作者均正确抓出。

---

## F17 — 主界面卡片：文章名字号翻倍 + 删除管理组块（2026-10-11）

### ① 文章名字号翻倍 + 过长省略
- `.a_name` 由 18px → **36px**（正好两倍），`font-weight:600`，`line-height:1.25`。
- 过长处理用**两行截断 + 省略号**：
  ```css
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; word-break: break-all; max-width: 100%;
  ```
  卡片内可用宽度 220-32=188px，36px 汉字一行约 5 字、两行约 10 字 ——
  绝大多数标题（如「荷塘月色」「登鹳雀楼」）能完整显示，超长才截断并打「…」。
- 同时给 `.a_name` 加 `title="完整标题"`，鼠标悬停可看全名；`.a_author` 也加了单行省略。

### ② 卡片右上角的删除按钮改形（原来是左上角「删除」文字按钮）
- 36px 名字占位变大，原 `top:42px;left:12px` 的文字按钮会压到名字。
  改为 **22×22 圆形 ×**，`top:14px; right:10px`；已完成卡片上有右上角对勾，
  故 `.a_card.is_done .a_del { right: 44px }`（实测 × 在 153~175px、对勾在 183~209px，**不重叠**；
  名字顶部 y=65，× 底部 y=37，**也不压名字**）。默认 `opacity:0; scale(.85)` → 悬停浮现。

### ③ 「删除我的文章」组块（新增，与「导入我自己的文章」并排）
- 布局：`<div class="home_row">` 包住两个 `.panel`，
  `.home_row{display:flex; gap:22px; align-items:stretch}` + 子面板 `flex:1 1 0`；
  `align-items:stretch` + `.manage_panel{display:flex;flex-direction:column}` +
  `.mg_actions{margin-top:auto}` 让两块**等高**、操作条贴底。≤780px 自动改纵向堆叠。
- 内容：每篇导入文章一行「复选框 + 标题（单行省略） + N 字 + 删除按钮」；
  底部「全选（含 indeterminate 半选态） + 删除选中的（N）」。
  **只列自己导入的文章**，内置文章不进这张表（`.a_del` 也不渲染在 builtin 卡片上）。
- 交互：单条删除 / 批量删除都走 `deleteArticles(ids)`，删除前 `confirm` 带文章名，
  删完在 `#mg_tip` 显示「已删除 N 篇」一次性提示（`pendingNotice` 变量，渲染后清空）。
- **`deleteArticles()` 会同时清掉这些文章的练习进度**（`nzd_progress_v1` 里对应 id 的键），
  避免留下孤儿进度数据。

---

## F18 — 删除入口改「按钮式两步删除」（2026-10-11 第八轮）

### 需求
「删除文章的组块放在导入文档和填入示范文档的中间，视觉效果同两者；用户点击后激活删除，
再点击文章即可以删除文章。」⇒ 上一轮的并排「删除我的文章」面板**整块废弃**。

### 落地
- 按钮行顺序：`导入并加入列表 | 导入文档 | 删除文章 | 填入示例文本 | N 字 | 提示`
  （`#imp_delmode` 位于 `#imp_file_btn` 与 `#imp_sample` 之间，实测 index 相邻）。
- 几何实测：`h=37 / radius=999px / font=14px / padding=8px 18px` 与「导入文档」「填入示例文本」完全一致；
  颜色 `#c02b3d` 白底，激活后 `linear-gradient(135deg,#f2566c,#c02b3d)` + 白字。
- **坑**：`.btn-danger:hover` 与 `.btn.is_active` 特异性相同（0,2,0）且前者定义在后的话，
  悬停会把红渐变盖成浅粉。已在 `.btn.is_active:hover/:focus-visible` 里**重申红渐变**修掉。
- 删除模式（`deleteMode` 模块级变量，非持久化）：
  - 卡片加 `.is_delmode`（红描边 + 悬停蒙层）；内置加 `.is_locked`（`opacity:.5` + 灰蓝蒙层）。
  - 蒙层用 `::after` + **不透明渐变**；并且**悬停时把 `.a_cover/.a_body/.a_no/.a_check/.a_best`
    淡出到 opacity 0** —— 否则 0.95 半透明蒙层下名字仍透出来与「点击删除」叠字（实测踩到）。
  - 删除模式下隐藏卡片右上角的 ×（避免两个删除入口打架），并屏蔽「开始练习」按钮与键盘 Enter/Space 进入练习。
- 撤销：`deleteArticles()` 现在记录 `lastDeleted = { items:[{art, idx}], prog }`，
  `undoDelete()` 按原 index 插回 + 恢复 `nzd_progress_v1`；提示区渲染「已删除《X》+ 撤销」按钮。
- 退出：再点按钮 / **Esc**（`escDeleteMode` 监听 document，`viewHome` 前先 `removeEventListener` 防重复绑定）/
  进入练习页 `exitDeleteMode()`。
- 已彻底清理 `.home_row/.manage_panel/.mg_*` 全部 CSS 与 JS（`grep` 确认 0 残留）。

## F19 — 打字页「文案 / 字号 / 每行字数」对齐原站（2026-10-11，第 9 轮）

**取证方式（可复现）**：不再靠截图目测。抓原站真实页面 + 样式到
`.planning/reference/origin/`（`level_29-2-101.html`、`level.css`、`main.css`、`student.js`），
再用 playwright-core 在**同一组视口宽度**下同时量原站与本项目：
`.planning/tools/measure_origin.cjs` / `measure_mine.cjs` / `compare_widths.cjs`。

**实测对照表（1440px，唯一权威数值）**

| 项 | 原站 | 本项目（改前） | 改后 |
|---|---|---|---|
| 标题 | `哪吒打字 打字练习文 散文一百篇[《豁达》]` | `哪吒打字 交互模式复刻 · …` | ✅ 同原站 |
| 统计条 | `时间： 00:00:00 速度： 0CPM …` | `…速度： 0WPM` | ✅ 0CPM |
| 底栏按钮 | `上一关` / `下一关`（bt_next 带 `.active` 蓝底） | `上一个` / `跳过本行`（且无点击事件） | ✅ 同原站 |
| 快捷键条 | `空格 朗读`/`←→ 翻页`/`Ctrl + Alt 提示` | 多一条 `Esc 返回` | ✅ 三条 |
| 汉字字号 | 30px（档 3） | 30px（档 5） | 30px（档 3） |
| 行卡片 / 内容宽 | 900 / 894px | 900 / 894px | 同 |
| 每行最多字数 | **27** | **27** | 同 |
| 折行结果 | 22 行 410 字 | 22 行 410 字 | 同 |

## F19.1 一行的文字数：真凶不是折行算法，是「字号档位刻度」

`compare_widths.cjs` 在 1024/1152/1280/1366/1440/1600/1920 七个宽度下对比：
两边的 `line=900 / box=894 / 每行=27 / 字号=30px` **七个宽度全部一致**——
因为 `.level_para_line` 的 `min-width:900px` 恒压过 max-width，桌面端行宽锁死在 900px。

所以「一行文字数不一样」只可能来自：
1. **字号档位刻度不同**（真凶）：
   - 原站 `.font_label_size1~9 .word_label` = **16/20/30/40/50/60/70/80/90px**，默认档 **3**。
   - 本项目旧值 = 18/22/26/28/30/34/38/44/52px，默认档 **5**（都恰好 30px，所以默认看不出差别；
     一旦动滑杆就对不上：档 3 = 26px vs 30px，最大 52px vs 90px）。
   - 现已换成原站原值 + 默认档 3，类名也改为 `.font_label_sizeN`。
2. 本项目自加的 `@media (max-width:960px){ min-width:0; width:100% }` —— 窄窗口会重排成更少字/行，
   原站永远不会（min-width 900 硬撑）。**已删除该断点**，改为照搬原站
   `max-width 600/760(≥768)/960(≥1024)/1200(≥1280)` 四段，窄窗靠 `.level_main` 横向滚动。
   实测 800px：行宽仍 900、左侧不裁切、可横向滚动。

★ **最要紧的判断**：每行字数 = f(行宽 × 字号)，行宽两边都锁 900px，所以**字号档位就是唯一的自变量**。
把档位刻度换成原站原值后，"字号不一样" 与 "每行字数不一样" 同时消失。

## F19.2 计时与速度格式（原站 student.js 原文）

- 时间：原站定时器只拼 `String(minutes).padStart(2,'0') + ':' + String(seconds).padStart(2,'0')`
  （**小时那段被注释掉了**）→ 运行中是 **`00:03`（分:秒）**，不是 `00:00:03`。
  初始静态 HTML 是 `00:00:00`。新增 `Util.fmtClock()` 专管这个，**结算页的 `fmtTime` 不动**。
- 速度：`$('#level_speed').html(speed + 'CPM')`；para 且 duration>0 时才覆盖成 `speedw + 'WPM'`。
  故 **初始 0CPM → 开始后 {n}WPM**（中文 speedw=speed）。
- 旧存档兼容：`LEGACY_FONT_SIZES` 把老的档位号按**实际像素**就近映射到新刻度，
  避免老用户档 5 从 30px 突变成 50px。

## F19.3 底栏「上一关 / 下一关」接法

原站 `setProcessBar()`：`page_id===0` → `上一关`；最后一页 → `下一关`（`.addClass('active')`）。
本项目单页文章 → 恒显示 `上一关 / 下一关`。这里把它接成**列表里相邻的文章**
（`app.js` 传 `onPrev/onNext`，无目标时 `setProcess()` 里 `display:none`，避免死按钮）。
注意：原底栏的 `上一个/跳过本行` **此前根本没有绑点击事件**，等于摆设，本轮一并修掉。

## F19.4 顺带核出的其它差异（本轮已改）

- `.level_nav nav li > span` 原站是 **12px**，本项目写成了 14px → 已改 12px。
- 字号面板文案：原站是 **「中文大小：」** 且右侧跟当前档位数字 → 已改（并加 `#font_size_value`）。
- 统计条空格排版按原站 `#tongji_bar` 原样（`</span> <span>` 之间有空格）。

## F19.5 明知仍未对齐（未改，等用户发话）

- 快捷键条：原站 `.level_keyinfo{opacity:0}` **默认不可见**，本项目常显（对单机练手有用）。
- 启动遮罩 `鼠标点我 或 按 空格键 开始`：原站有，本项目无。
- 结算页：原站 `速度 {n}CPM`、`闯关时长 {minutes}分钟`；本项目用 `WPM` + `HH:MM:SS`（未在本轮范围内）。

**验收**：`.planning/tools/regression.cjs` 26 项全绿（对齐 0px / 组字不判定 / 打对打错着色 /
字号档位 16·30·90px / 深色 / 背景 / 800px 窄窗 / 控制台 0 报错）；
`e2e_finish.cjs` 通关链路 8 项全绿；`file://` 直开：主页 10 卡、打字页 30px/27 字/0 报错。

## F20 — 打对字色改黑 + 移除「清空练习进度」（2026-10-11，第 10 轮）

### F20.1 打对的字：原站实测是蓝色，**按用户要求改成黑色**

**取证（4 条独立证据，全部指向蓝色）**：
1. `v.mamioo.com/static/dazi/level.css` 原文：`.level_para_line .correct .word_label{color:#0086d2}`
2. 站点级 `nezhadazi.com/static/dazi/level.css?1791298415`（后加载的同名样式表）**同一条**也是 `#0086d2`。
3. **级联实测**（`tools/probe_cascade.cjs`）：在活的原站页面上给真实 `.word_box` 挂 `.correct`，
   `getComputedStyle` 返回 `rgb(0,134,210)`；`.incorrect` = `rgb(255,94,124)`。
4. **走原站自己的判定逻辑**（`tools/probe_real3.cjs`）：用 jQuery `.val()+trigger('input')`
   把第 2 行整行前缀「生活老人悄悄」喂进去，原站 `processPara` 逐个加 `.correct`，
   6 个字实测全是 `rgb(0,134,210)`。

★ **结论：原站打对 = #0086d2 蓝，这是客观事实。**
但用户明确要求「打对的字要是黑色」，故按用户要求改为 **#333333（与正文汉字同色）**。

**实现**：`css/level.css`
```css
.level_para_line .correct .word_label { color: #333333; }          /* 打对 = 黑 */
.level_para_line .incorrect .word_label { color: #ff5e7c; }        /* 打错 = 粉红（未改） */
.level_dark .level_para_line .correct .word_label { color: #eee; } /* 深色下必须跟正文同为浅色 */
```
- ⚠ **深色主题的坑**：`.correct`(0,3,0) 特异性高于 `.level_dark .word_label`(0,2,0)，
  若不加第 3 行，深色下打对的字会变成 #333 落在 #000 底上 → 糊掉看不见。
- **回退方式**：把第 1 行的 `#333333` 换回 `#0086d2` 即恢复原站蓝，注释里已写明。
- 打错色、下划线色、判定逻辑一律未动。

### F20.2 移除「清空练习进度」

- 主页 `选择要练习的文章` 标题栏右侧的 `<button id="clear_progress">清空练习进度</button>` 及其
  `confirm(...) → setProgress({}) → viewHome()` 监听一并删除。
- 连带清理只被它使用、已无引用的 `.btn-mini` 规则（`grep` 确认全项目仅此一处）。
- **未动**：`setProgress()` 本身（`onFinish` 写入成绩、`undoDelete` 恢复进度都要用）、
  卡片上的「最好 N WPM」展示、`nzd_progress_v1` 存储结构、导入/删除/撤销全部功能。
  主页三按钮（导入并加入列表 / 导入文档 / 删除文章）与其它面板实测不受影响。

**验收**：`regression.cjs` **31/31 全绿**（新增：清空进度按钮不存在 + 导入/删除按钮仍在 +
打对 = rgb(51,51,51) + 打错 = rgb(255,94,124) + 深色下打对 = rgb(238,238,238)）；
`e2e_finish.cjs` 8/8；`file://` 直开 0 报错。

## F21 — 发布到 GitHub：本机 `github.com` 解析到不可达 IP（2026-10-11）

**结果**：仓库 `SheYOYO/typing-practice`（public），13 个分层提交，
本地 HEAD 与远端 `main` SHA 逐位一致，远端 57 个 blob 与本地逐文件一致。

### F21.1 本次真正卡住的地方（和技能里记的「沙箱屏蔽 github.com」不是一回事）

逐主机实测（`tools` 无关，用 socket 直接测）：

| 主机:端口 | 结果 |
|---|---|
| `github.com:443`（= 20.205.243.166） | ✗ TCP 超时（沙箱内 / 沙箱外**都一样**） |
| `140.82.112.3:443` · `140.82.113.3:443` · `…116.3` · `…121.3` · `20.27.177.113` · `4.237.22.34` | ✓ TCP + **TLS 握手成功，证书 CN=github.com** |
| `api.github.com:443` / `codeload.github.com:443` / `objects.githubusercontent.com:443` | ✓ |
| `github.com:22` / `ssh.github.com:443` | ✓（SSH banner `SSH-2.0-3bc2e72`） |
| 系统代理 `CONNECT github.com:443` | ✗ 502 |
| 本机常见代理端口 7890/10809/10808/… | 全部没有监听 |

★ **根因**：本机 DNS 把 `github.com` 解析到 **`20.205.243.166`（不可达）**，
而 GitHub 其它边缘 IP 是好的。所以 `git push` 报的是
`Failed to connect to github.com:443 after 21084 ms` 或 `schannel: server closed abruptly`
—— **不是沙箱、不是代理、不是没凭据**，是**域名解析到了一个坏 IP**。

⇒ `dangerouslyDisableSandbox` 对这个问题**完全无效**（沙箱外实测同样超时）。

### F21.2 解法：本地 CONNECT 中转（不改 hosts、不动系统配置）

起一个**只监听 `127.0.0.1`** 的极简 CONNECT 代理，把 `github.com:443`
转发到实测可达的边缘 IP，`git push` 走 `-c http.proxy=http://127.0.0.1:<port>`：

```python
conn.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
up = socket.create_connection((GOOD_IP, 443), timeout=10)   # GOOD_IP=140.82.112.3
# 然后 双向 pipe() 即可
```

- 已固化成 **`.planning/tools/push_to_github.py`**（仓库内，含 `--check`）。
- 脚本逻辑：`shutil.which('git')` 定位 git → 凭据管理器读 token（不落盘）→
  `direct_ok()` 探 `github.com:443`，通则直连、不通则自动起中转 → push → 用
  `GET /git/ref/heads/<branch>` 核验 SHA。
- 实测：`POST git-receive-pack (507500 bytes)`、`* [new branch] main -> main`、rc=0。

### F21.3 顺带确认的既有结论仍然成立

- 全局 `url.insteadOf` 仍把 github.com 改写成 `gh-proxy.com`（只读镜像）。
  ⇒ `git remote -v` 显示 `https://gh-proxy.com/https://github.com/...` **是显示层改写，不是错误**；
  推送必须带 `GIT_CONFIG_GLOBAL=<空文件>` 隔离，脚本里已固定这一步。
- `git branch --set-upstream-to=origin/main` 会报 `does not exist`
  （本环境 git 写 `refs/remotes/**` 静默失效）—— 按旧结论**不纠缠**，
  判「推没推成功」只认 `rev-parse HEAD` == 远端 `ref/heads/main`。
- 仓库根目录**铺平**（`README.md` 等直接放根），只在必要处保留子目录。

### F21.4 提交分层（用户要求的「一个一个上传」）

13 个提交，按依赖自底向上，便于后期按模块 `git log -- js/engine.js` 回溯：

```
chore: 仓库初始化（.gitignore / .gitattributes）
feat(util) → feat(pinyin) → feat(audio) → feat(articles)
feat(engine) → feat(result) → feat(app)
style: 样式 → assets: bg → feat: 入口与启动脚本
docs: README/产品底线/CHANGELOG → docs(planning): 开发档案与回归脚本
```

`.gitignore` 排除 `.workbuddy/`（会话记忆）与 `.planning/reference/`（原站取证素材）。
`.gitattributes` 用 `* -text` 禁用一切行尾转换；`启动.cmd` 规范为 CRLF。
