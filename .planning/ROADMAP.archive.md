# ROADMAP.archive.md — 历史归档（无上限，靠 grep 抵达）

> 本文件收纳「已完成、但结论仍有参考价值」的历史小节。
> 从 L1 `ROADMAP.md` 搬来的内容保留**源标题**（`## 从 L1 搬来的 §x`）。
> 每轮迭代的完整机理去 `.planning/findings.md`（F1–F18）与 `.planning/task_plan.md`。

---

## 项目目标与形态（源自 task_plan.md 首节）

复刻 nezhadazi.com「文章打字交互」，独立网页 Demo，工作链条：
`主界面（选/导入文章）→ 打字交互 → 结算（照搬原站）→ 下一篇 / 返回主界面`。
已完成文章显示「已完成」但可再次练习。交付 = 多文件工程 + 便捷入口（`index.html` + `启动.cmd`）。

---

## 八轮迭代结论（按轮归档，细节 grep 对应 Fxx）

### 第一轮：首版构建（2026-10-10）
纯前端 hash 路由 + localStorage；文件清单：`index.html`、`启动.cmd`、`css/app.css`、
`css/level.css`、`js/pinyin-data.js`(20924 字)、`js/pinyin.js`、`js/audio.js`、`js/articles.js`(10 篇)、
`js/engine.js`、`js/result.js`、`js/app.js`。修复折行越界、工具栏按钮不可点、深色汉字不可见。→ F1–F11。

### 第二轮：输入法组字误判 + 音效（2026-10-10 晚）
- 组字误判：`compositionstart/end` 期不判定 + 恢复原站「以 ASCII 结尾跳过」+ 换行双保险。
- 音效没声：改用原站 zzfx 原参数表，删逐键音，仅打对/打错/星星；修 `playFinish` 崩溃。→ F12。

### 第三轮：背景主题搬运（2026-10-11）
`.level_box::before` 铺满屏 `background-size:100% 100%`、opacity .5（深色 .2）；11 套 bg0~bga + 缩略图面板；
偏离处：z-index 从 -6999 改为 0 + 内容层提升（父级有背景色）。→ F13。

### 第四轮：逐格对齐 + 万字上限 + 交互组件视觉还原（2026-10-11）
- 对齐根因：`.word_label` 多了 `padding:0 1px`、`.input_box` 多了 `padding:0 4px`、1px 边框 → 固定偏移；
  宽度漂移沿行累积。做法：padding 归零 + `white-space:nowrap` + `measureWidths()/applyCharWidths()` 钉宽。
  实测 39 字行含 7 标点偏差 0.00px。
- 字数：`MAX_CHARS=50000` / `WARN_CHARS=10000`，一万内不弹确认；渲染改拼 HTML 一次性落地（万字提速）。
- 视觉：逐项对齐原站 level.css（下划线 #205b02@.3、卡片 900~1200 + 内阴影、顶栏、面板、深色 #000/#666/#eee/#333）。→ F14。

### 第五轮：换行/分行规则 100% 照搬原站（2026-10-11）
**关键反转**：原站不是按句号分句，而是「服务端按 `\n` 分行 → 前端按输入框二分定长续切」。
铁证：101 篇 29 字句被腰斩成 27+2；有行以逗号结尾却独立成行。
落地：`pinyin.js splitSentences()` 按 `\n` 分行 + 句末标点补切（去长度硬切）；
`engine.js getMaxCharsByFilling()` 照搬二分 + `computePer()` 减 2。4/4 篇逐行一致。→ F15。

### 第六轮：主界面卡片改圆角正方形 + 文档导入（2026-10-11）
- 卡片照原站 `.lesson-item`：220×230 / radius15 / 白底 / shadow `rgba(0,80,179,.08) 0 4px 30px`；
  内容换文章名+作者+完成打钩；左上角序号动态 index；加 1px 描边（本项目浅蓝底需要）。
- 文档导入：txt（UTF-8→gb18030 回退）/ md / docx（原生 DecompressionStream，零第三方库）；
  自动抓标题作者填入预览框。→ F16。

### 第七轮：文章名字号翻倍 + 删除组块（2026-10-11）
- 文章名 18→36px，`-webkit-line-clamp:2` 截断省略 + title 全名。
- 曾做「删除我的文章」并排面板（复选/全选/批量删）。**第八轮已整块废弃**。→ F17。

### 第八轮：删除入口改「按钮式两步删除」（2026-10-11）
删除 = 按钮「删除文章」插在「导入文档」与「填入示例文本」之间 → 点它激活删除模式 → 点卡片即删除。
内置卡片锁定「内置 · 不可删」；删除后提示+「撤销」（原位置+原进度恢复）；Esc/再点按钮/进练习页退出。
踩坑：`.btn.is_active` 须在 :hover 重申红渐变；蒙层须不透明 + 悬停正文淡出（否则叠字）。→ F18。

---

## 逆向取证关键记录（从 findings.md 提炼，完整版 grep Fxx）

- F3 判定入口 `processPara(inputDom)`：逐字符比对，正确 `#0086d2`、错误 `#ff5e7c`，纯 ASCII 不计入。
- F4 拼音提示 `#notify_para > .word_tips`：绿色浮标，仅提示不判分。
- F7 结算页：5 星 + 准确率/速度/时长 + 段位条。
- F15 折行二分 `getMaxCharsByFilling`：输入框塞 500「中」二分，`scrollWidth<=clientWidth`，返回值-2。

---

## 测试与验收基线（门禁）

- 无头回归脚本位于 `C:/tmp/nzd/`：`verify.js`(对齐/判定/万字)、`verify2.js`(深色/背景/字号)、
  `verify3.js`(下划线/打超续行)、`verify_line.js`(折行 4 篇逐行)、`verify_delmode.js`(删除两步式)、
  `verify_home.js`(文档导入)、`fileurl.js`(file:// 冒烟)。
- 每条门禁结论：控制台 0 报错、0 个 404、file:// 直开通过。
