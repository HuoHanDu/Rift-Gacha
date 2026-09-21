# 开发规划与进度

> 后续开发按本文顺序执行。每完成一项就把状态改为 `[x]`；**未达成「完成判据」不得勾选**。
> 规则实现以 `docs/RULES.md` 为准，数据口径以 `docs/DATA.md` 为准，分层约定以 `AGENTS.md` §4 为准。

## 进度总览

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 环境与仓库 | ☐ |
| P1 | 数据流水线与快照 | ☐ |
| P2 | 随机引擎（`core/`）+ 单元测试 | ☐ |
| P3 | 展示层（页面 / 卡片 / 资料卡） | ☐ |
| P4 | 端到端验证与打磨 | ☐ |
| P5 | 部署文档与 README | ☐ |
| P6 | （v2 备选）移动端适配 | ☐ |

---

## P0 环境与仓库

- [ ] **P0.1 git 初始化**
  - `git init`，默认分支 `main`；写 `.gitignore`（`node_modules/`、`dist/`、`unpackage/`、`.probe/`、`*.log`、`.DS_Store`、`.idea/`、`.vscode/` 里除 `settings.json` 外的内容）。
  - 做一次初始提交，把 `AGENTS.md`、`docs/**`、`todo.md` 固化进历史。
  - **完成判据**：`git log --oneline` 至少有 1 条提交；`git status` 干净；`node_modules` 不在跟踪列表里。

- [ ] **P0.2 uni-app（Vue 3 + Vite）骨架**
  - 按 `uni-preset-vue#vite` 布局手建工程（不依赖 `degit` 之外的脚手架）：`index.html`、`vite.config.ts`、`src/{main.ts,App.vue,manifest.json,pages.json,uni.scss,static/}`。
  - **所有 `@dcloudio/*` 依赖锁死同一版本 `3.0.0-5020620260917001`**，`vite` 锁 `5.2.8`，`vue` `^3.4.21`，`rollup` `4.14.3`（见 `docs/ARCHITECTURE.md` §7）。
  - `npm install` 成功，`npm run dev:h5` 能起服务并看到默认页。
  - **完成判据**：dev server 起来、页面无控制台报错、`npm run build:h5` 产生产物。

- [ ] **P0.3 TypeScript + 测试链路**
  - `tsconfig.json` 覆盖 `src/**` 与 `tests/**`，`types` 含 `@dcloudio/types`。
  - 装 `vitest@^1.6`、`vitest.config.ts` 只扫 `tests/**`，`npm run test` 能跑通一个占位用例。
  - **完成判据**：`npx vue-tsc --noEmit`（或 `tsc --noEmit`）无错；`npm run test` 退出码 0。

- [ ] **P0.4 npm scripts**
  - `fetch:data`、`test`、`dev:h5`、`build:h5`、`preview:h5`、`typecheck` 全部可用。
  - **完成判据**：逐条执行，命令存在且不报「missing script」。

---

## P1 数据流水线与快照

- [ ] **P1.1 数据源常量与抓取**
  - `scripts/lib/sources.mjs`：`docs/DATA.md` §1 的全部 URL。
  - `scripts/fetch-data.mjs`：带重试（3 次）、15s 超时、User-Agent 的抓取；纯 JSON 解析（源文件虽为 `.js` 但内容是 JSON）。
  - **完成判据**：单独跑抓取，5 个主源全部 200 且能 `JSON.parse`。

- [ ] **P1.2 normalize —— 英雄与召唤师技能**
  - 英雄：173 条，字段与图标 URL 按 `docs/DATA.md` §2.1。
  - 技能：`gamemode` 含「经典」过滤 → 9 条，显式剔除标记/竞技场变体（§2.4）。
  - **完成判据**：产物条数与 `docs/DATA.md` 记录一致；输出中含 `4 闪现`、`11 惩戒`，不含 `32`/`39`/`13`。

- [ ] **P1.3 normalize —— 装备分组**
  - 按 §2.2 生成 `legendary`(107) / `boots`(7) / `bootsUpgraded`(7) / `bootsUpgradeMap`(7) / `starterGeneric`(8) / `starterJungle`(3) / `starterSupport` / `supportQuestUpgrades`(5)。
  - 传说池剔除任务专属 6 件；鞋池用显式 ID 列表 + `types` 含 `Boots` 双重认定。
  - **完成判据**：各池条数匹配；传说池中无任何 `types` 含 `Boots` 的装备、无 6 件任务专属件。

- [ ] **P1.4 normalize —— 符文树**
  - 5 个系根 → 基石排 + 3 排系内小符文（排顺序：基石在前，其余保持源文件顺序）。
  - 小符文三排按 CommunityDragon 口径（**不要用 `rune_list2.js` 自己的 `slotLabel`**）。
  - **完成判据**：恰好 5 系；每系基石 ≥ 3、系内小符文恰好 3 排 × 3 个；小符文恰好 3 排 × 3 个，第 1 排为 {适应之力, 攻击速度, 技能急速}。

- [ ] **P1.5 完整性断言与原子写入**
  - `docs/DATA.md` §4 第 3 步的全部断言；通过后先写 `.tmp` 再 rename；失败保留旧快照 + 非 0 退出。
  - `src/data/index.ts` 组装 `DataBundle`。
  - **完成判据**：`npm run fetch:data` 成功产出 `src/data/*.json` + `meta.json`；故意把某条期望常量改错时脚本以非 0 退出且不覆盖旧快照。

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
