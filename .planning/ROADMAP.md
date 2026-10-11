# ROADMAP.md — 主索引（每会话唯一必读）

> **分层**（越往下越少读）：
> **L0** `.workbuddy/memory/MEMORY.md`（指针+5 条硬规则）
> → **L1 本文件**（主索引，硬上限 6000 字符）
> → **L1.5** `ROADMAP.archive.md`（历史，无上限，靠指针抵达）
> → **L2** `findings.md` / `task_plan.md` / `progress.md`（**grep 定位，绝不整篇读**）
> → **L3** `.workbuddy/memory/YYYY-MM-DD.md`（每日日志，极少读）
>
> 超限？把不再影响下一决策的小节**原样搬**到 `ROADMAP.archive.md`，留一行结论+指针。
> 收尾跑 `python .planning/roadmap_check.py`（非零退出=不合格）。

## 0. 会话仪式（勿跳）

1. 读本文件；2. 要细节就按指针 grep L2 那一节；3. 收尾更新「Next」、追加 findings、跑 `roadmap_check.py`。

## 1. 不可妥协规则（用户硬要求，全文见 `产品底线.md`）

1. 拼音仅提示、判分只看汉字逐位比对（`typed[i]===target[i]`）。
2. 逐格对齐（汉字+标点 ≤0.6px）：word_label/input_box 水平 padding 必须 0 + `applyCharWidths()` 钉宽。
3. 换行照搬原站两层逻辑（按换行符分行 + 输入框二分定长续切，超长句腰斩）→ F15。
4. 纯前端离线、file:// 直开、零构建、零第三方库、数据只存 localStorage。
5. 改动后必跑无头回归，控制台 0 报错。

## 2. 在哪 / 可改什么

| 区域 | 细节在 | 状态 | 可编辑层 |
|---|---|---|---|
| 打字判定/折行/对齐引擎 | `js/engine.js` + `js/pinyin.js` | 全绿 | L2 `findings.md` F3/F12/F15 |
| 主界面卡片/导入/删除 | `js/app.js` + `css/app.css` | 全绿 | L2 `findings.md` F16/F17/F18 |
| 打字页观感/深色/背景 | `css/level.css` + `bg/` | 全绿 | L2 `findings.md` F13/F14 |
| 音效 | `js/audio.js`（zzfx 合成） | 全绿 | L2 `findings.md` F12 |
| 红线清单 | `产品底线.md` | 权威 | 只增不改 |

## 3. 工作规则（判定级；全文去 findings.md）

- 输入法组字期不判定；以拉丁字母/空格/逗号结尾跳过 → F12。
- 当前行下划线整行 `#205b02@.3`，只改字色不改 cursor 色 → F14/F15。
- 删除=按钮式两步（激活→点卡片），必带撤销 → F18。
- docx 解析用原生 DecompressionStream，禁第三方库 → F16。

## 4. 环境事实（已实测，别再重测）

- 原站 CSS：`v.mamioo.com/static/dazi/level.css`（53KB）；判定入口 `studentCtrl.processPara`。
- 无头测试：Playwright + `chromium_headless_shell-1243`；CDP `Input.imeSetComposition` 模拟输入法。
- 1440px/30px 下每行 27 字；`getMaxCharsByFilling()-2`、最小 10。
- 本地静态服务器 8899 用于回归；`file://` 直开同样可用。

## 5. 已完成 → 仍在用的结论（历史在 ROADMAP.archive.md）

| 项 | 仍需要的结论 | 指针 |
|---|---|---|
| 折行规则 | 服务端按换行符分行 + 前端定长续切，非按标点 | F15 |
| 卡片取值 | 220×230 / radius15 / 蓝调柔影 | F16 |
| 逐格对齐 | 三条件缺一不可 | F14 + 产品底线 §5 |
| 删除交互 | 按钮两步式 + 撤销 | F18 |
| 打字页对照口径 | 标题/0CPM/上一关下一关/字号档 16~90 默认 3/行宽 900/每行 27 字 | F19 |
| **一行的字数 = 字号档位** | 行宽两边都锁 900px，字数只随字号变 → 别再动折行算法 | F19.1 |
| 打对字色 | **用户要求黑 #333**（原站实为 #0086d2 蓝，回退改一行） | F20.1 |
| 清空练习进度 | **已按用户要求移除**，勿再加回 | F20.2 |

## 6. Next（唯一起点）

**暂无待办** —— 第 10 轮（打对字色改黑 + 移除清空练习进度）已完成，31 项回归全绿。

- ⚠ **打对字色是「用户要求」而非原站值**：原站实测 #0086d2 蓝（见 F20.1 四条证据）。
  若之后又要「照搬原站」，把 `css/level.css` 里 `.correct .word_label` 的 `#333333` 换回 `#0086d2`。
- 原站取证物在 `.planning/reference/origin/`；复现脚本在 `.planning/tools/`
  （`regression.cjs` / `e2e_finish.cjs` 需先在根目录起 8899 静态服务）。
- **已知仍未对齐、等用户发话**（详见 F19.5）：快捷键条原站默认隐藏、启动遮罩
  「鼠标点我 或 按 空格键 开始」、结算页速度/时长单位。
- 新需求先查 `ROADMAP.archive.md` / CHANGELOG 是否已做过。

## 7. 阻塞 / 等用户（勿动）

- 无。
