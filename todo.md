# 开发规划与进度

> 后续开发按本文顺序执行。每完成一项就把状态改为 `[x]`；**未达成「完成判据」不得勾选**。
> 规则实现以 `docs/RULES.md` 为准，数据口径以 `docs/DATA.md` 为准，分层约定以 `AGENTS.md` §4 为准。

## 进度总览

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 环境与仓库 | ✅ 完成 |
| P1 | 数据流水线与快照 | ✅ 完成 |
| P2 | 随机引擎（`core/`）+ 单元测试 | ☐ |
| P3 | 展示层（页面 / 卡片 / 资料卡） | ☐ |
| P4 | 端到端验证与打磨 | ☐ |
| P5 | 部署文档与 README | ☐ |
| P6 | （v2 备选）移动端适配 | ☐ |

---

## P0 环境与仓库

- [x] **P0.1 git 初始化**
  - `git init -b main`；`.gitignore`（`node_modules/`、`dist/`、`unpackage/`、`.probe/`、日志、编辑器目录）。
  - 初始提交已固化 `AGENTS.md`、`docs/**`、`todo.md`、工程骨架。另加 `.gitattributes` 统一 LF，避免 Windows 换行噪音。
  - **完成判据**：`git log --oneline` 有 1 条提交；`git status` 干净；`git ls-files` 中 `node_modules`/`.probe` 计数为 0。✅ 已验证

- [x] **P0.2 uni-app（Vue 3 + Vite）骨架**
  - 手建 `uni-preset-vue#vite` 布局：`index.html`、`vite.config.ts`、`src/{main.ts,App.vue,manifest.json,pages.json,uni.scss,static/}`。
  - 所有 `@dcloudio/*` 锁死 `3.0.0-5020620260917001`，`vite` 锁 `5.2.8`，`vite-plugin-uni` 同版本。
  - **完成判据**：`npm install` 成功（527 包）；`npm run dev:h5` 起在 `http://localhost:5173/`（HTTP 200，页面模块可编译）；`npm run build:h5` 产出 `dist/build/h5`。✅ 已验证

- [x] **P0.3 TypeScript + 测试链路**
  - `tsconfig.json`（strict + `@/*` 路径别名）、`src/env.d.ts`、`vitest.config.ts`（node 环境，只扫 `tests/**`）。
  - **完成判据**：`npm run typecheck`（vue-tsc）无输出无错；`npm run test` 18 个用例全绿。✅ 已验证

- [x] **P0.4 npm scripts**
  - **完成判据**：`dev:h5` ✅、`build:h5` ✅、`preview:h5` ✅（HTTP 200）、`test` ✅、`typecheck` ✅、`fetch:data` ✅（P1.1 后补验）。全部实跑通过。

---

## P1 数据流水线与快照

- [x] **P1.1 数据源常量与抓取**
  - `scripts/lib/sources.mjs`（5 个主源 + 2 个交叉校验源）；`scripts/fetch-data.mjs`（3 次重试、20s 超时、AbortSignal、纯 JSON 解析、原子写入）。
  - **完成判据**：`npm run fetch:data` 实跑成功，patch 16.18。✅

- [x] **P1.2 normalize —— 英雄与召唤师技能**
  - 英雄 173 条（含 `alias` 驱动的图标 URL）；技能按 `gamemode` 含「经典」过滤得 9 条。
  - **完成判据**：产物含 `4 闪现`、`11 惩戒`，不含 `32`/`39`/`13`。✅

- [x] **P1.3 normalize —— 装备分组**
  - 传说池 107（剔除 `4643` 及 5 个辅助任务升级件）、鞋 7 + 升级鞋 7 + 升级映射 7、通用出门装 8、打野蛋 3、辅助出门装 1 + 升级件 5。
  - 鞋池用显式 ID 列表 + `into` 字段双重认定。
  - **完成判据**：各池条数匹配；传说池无鞋子、无任务专属件（已在断言中覆盖）。✅

- [x] **P1.4 normalize —— 符文树**
  - 5 系；排顺序取自 CommunityDragon `perkstyles.json`（`rune_list2.js` 的排顺序与客户端不一致，且数字样式键会丢原顺序）；小符文三排同样以官方数据为准。
  - 发现并修掉的坑：符文文案的 HTML 被**实体编码过一层**，必须先解码再剥标签。
  - **完成判据**：5 系；每系基石 ≥ 3、系内小符文 3 排 × 3 个；小符文 3 排 × 3 个且第 1 排为 {适应之力, 攻击速度, 技能急速}；启迪「巧具」排含 `8306`。✅

- [x] **P1.5 完整性断言与原子写入**
  - 硬断言（结构性不变量）+ 软提示（随版本漂移的条数，只打印新旧差异）；失败保留旧快照并非 0 退出。
  - `src/core/types.ts`（全项目类型唯一出处）、`src/core/constants.ts`、`src/data/index.ts`（`DATA: DataBundle`）。
  - **完成判据**：连续两次 `fetch:data`，第一次无对比基线、第二次全部显示「未变」；`typecheck` 与 `build:h5` 均通过。✅

---

## P2 随机引擎（`core/`）+ 单元测试

> 本阶段**不碰 UI**。`core/` 不得 import Vue / uni-app / DOM，也不得直接 import `src/data/*.json`（数据以 `DataBundle` 注入）。

- [ ] **P2.1 `core/types.ts` + `core/random.ts`**
  - 全部对外类型；`createRng(seed)`（mulberry32）、`pick`、`pickMany`（无放回）、`shuffle`、`defaultRng`。
  - **完成判据**：`tests/random.test.ts` 覆盖：同 seed 序列一致、`pickMany` 不重复且不越界、`shuffle` 是排列、`pick` 覆盖全池。

- [ ] **P2.2 `core/validate.ts` + `core/positions.ts`**
  - `docs/RULES.md` §1 的 V1~V5；§2 的位置分配。
  - **完成判据**：`tests/validate.test.ts` 覆盖人数越界、人数≠位置数、同队重复位置、每队位置恰好 5 个不同值、指定位置被尊重。

- [ ] **P2.3 `core/champions.ts` + `core/spells.ts`**
  - 英雄全场去重；技能按位置与开关取池（`docs/RULES.md` §4）。
  - **完成判据**：`tests/generate.test.ts` 断言打野必含惩戒、非打野开关开时无惩戒、开关关时允许惩戒、两技能不重复、多人英雄不重复。

- [ ] **P2.4 `core/items.ts`**
  - 出门装（含辅助展示替换）、六件成装（无放回、107 池）、鞋子（中路升级）（`docs/RULES.md` §5）。
  - **完成判据**：`tests/items.test.ts` 断言恰好 6 件、互不重复、全在 107 池内、不含任务专属件与鞋子；鞋池正确；中路必为升级款、非中路必为未升级款。

- [ ] **P2.5 `core/runes.ts`**
  - 主系 / 副系 / 小符文 / 海克斯闪现罗网约束（`docs/RULES.md` §6）。
  - **完成判据**：`tests/runes.test.ts` 断言副系≠主系、主系 3 小符文分属 3 个不同排、副系 2 个分属 2 个不同排、小符文每排结果属于该排候选；**扫描 1 万个 seed** 验证 `8306` 出现的充要条件成立。

- [ ] **P2.6 `core/generate.ts` 编排**
  - 按 `docs/RULES.md` §8 的固定顺序串起来，返回 `GenerateResult`。
  - **完成判据**：`tests/generate.test.ts` 断言同 seed 同输入两次运行深比较相等；单人 / 5 人 / 10 人双队（随机分队与预先分队两种）各跑通并满足全部不变量。

---

## P3 展示层

- [ ] **P3.1 输入区**
  - 人数选择（1~10）、玩家名字输入、位置下拉（5 选 1 + 「随机」）、双队模式开关、随机分队开关、惩戒开关。
  - 人数与位置数量的联动校验，错误就地提示。
  - **完成判据**：手动走一遍：改人数会同步生成/移除输入行；位置冲突与数量不符能给出明确提示且不放行。

- [ ] **P3.2 `BuildCard.vue` 单份结果卡片**
  - 排布对齐 `hexfuser.com`：位置行 → 英雄头像 → 两个召唤师技能 → 出门装 → 成装一行 + 鞋子 → 符文分隔 → 主/副系与详细点法 → 三个小符文。
  - **完成判据**：单人随机与 5 人随机各生成一次，卡片信息完整、无错位、无「undefined」。

- [ ] **P3.3 `HoverCard.vue` 悬停资料卡**
  - 英雄/装备/符文/召唤师技能均可悬停看说明，内容取自快照。
  - **完成判据**：逐个类型悬停一次都有内容；浮层不被卡片裁切、不闪烁。

- [ ] **P3.4 响应式与视觉**
  - 扁平化、简洁、留白充足；窄屏（≤768px）卡片改为单列，宽屏多列排布。
  - 图标 `@error` 兜底为占位块。
  - **完成判据**：1280 / 1920 / 375 三档宽度下无横向滚动条、无重叠。

- [ ] **P3.5 合规声明**
  - 页面底部标注数据来源、「非官方」声明与当前 patch 版本。
  - **完成判据**：可见且文案与 `docs/DATA.md` §5 一致。

---

## P4 端到端验证与打磨

- [ ] **P4.1 全量测试与构建**
  - **完成判据**：`npm run test` 全绿；`npm run typecheck` 无错；`npm run build:h5` 成功产出 `dist/build/h5`。

- [ ] **P4.2 人工核对清单**
  - 逐条对照 `docs/RULES.md` §10 的边界用例，在页面上真实点出来核对（不只是跑单测）。
  - **完成判据**：每条都有「已核对」的痕迹；发现不符的条目已修并回归。

- [ ] **P4.3 生产产物验证**
  - 用静态服务器起 `dist/build/h5`，走完整流程一次。
  - **完成判据**：构建产物（不是 dev server）下功能与样式均正常。

---

## P5 部署文档与 README

- [ ] **P5.1 `docs/DEPLOY.md`**
  - 覆盖：构建命令与产物路径、静态托管（Nginx 配置片段）、子路径部署（`base` 配置）、Docker 可选方案、缓存策略、CDN 图片白名单、常见问题（图标裂、子路径 404、跨域）。
  - **完成判据**：文档里的每条命令都在本机实际执行过并成功。

- [ ] **P5.2 `README.md`**
  - 项目简介、截图占位、本地开发步骤、数据刷新步骤、目录说明、声明。
  - **完成判据**：新人在只有仓库的情况下能照着跑起 dev server。

---

## P6 （v2 备选）移动端适配

- [ ] 断点与触控交互（悬停资料卡改点击）、`manifest.json` 平台配置、真机/模拟器验证。
- **完成判据**：移动端构建产物在至少一台真机上可完成一次完整随机。

---

## 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-09-21 | 初始化：需求整理、架构设计、规则规范、数据口径，确认 10 项决策 |
