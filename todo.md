# 开发规划与进度

> 后续开发按本文顺序执行。每完成一项就把状态改为 `[x]`；**未达成「完成判据」不得勾选**。
> 规则实现以 `docs/RULES.md` 为准，数据口径以 `docs/DATA.md` 为准，分层约定以 `AGENTS.md` §4 为准。

## 进度总览

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 环境与仓库 | ✅ 完成 |
| P1 | 数据流水线与快照 | ✅ 完成 |
| P2 | 随机引擎（`core/`）+ 单元测试 | ✅ 完成 |
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

- [x] **P2.1 `core/types.ts` + `core/random.ts`**
  - `types.ts` 是全项目类型唯一出处（P1 已建）；`constants.ts` 放运行时常量与固定映射。
  - `random.ts`：`createRng`(mulberry32)、`pick`、`pickMany`（无放回）、`shuffle`、`pickFromGroups`、`createRandomSeed`。
  - **完成判据**：`tests/random.test.ts` 18 个用例通过。✅

- [x] **P2.2 `core/validate.ts` + `core/positions.ts`**
  - V1~V6（`NO_PLAYERS`/`TOO_MANY_PLAYERS`/`MISSING_TEAM`/`TOO_MANY_PER_TEAM`/`DUPLICATE_POSITION`/`NOT_ENOUGH_CHAMPIONS`）。
  - 随机分队改为**发牌算法**而非「洗牌切两半」：洗牌切两半在 10 人都指定位置时几乎必然撞车；发牌保证每队位置不重复，无解时返回可读错误。
  - **完成判据**：`tests/validate.test.ts` 11 个 + `tests/positions.test.ts` 12 个用例通过。✅

- [x] **P2.3 `core/champions.ts` + `core/spells.ts`**
  - 英雄全场去重（`usedHeroIds` 由编排层持有）；技能按位置与开关取池。
  - **完成判据**：`tests/generate.test.ts` 覆盖打野必带惩戒、开关开时非打野无惩戒、开关关时可出现惩戒、两技能不重复、多人英雄不重复。✅

- [x] **P2.4 `core/items.ts`**
  - 出门装分流（辅助展示件、打野蛋、8 件通用）、6 件成装（无放回）、鞋子（中路升级）。
  - **完成判据**：`tests/items.test.ts` 7 个用例，各 500 seed，覆盖全部池与全部鞋型。✅

- [x] **P2.5 `core/runes.ts`**
  - 主系 / 副系 / 小符文 / 海克斯科技闪现罗网约束。
  - **完成判据**：`tests/runes.test.ts` 10 个用例，3000 seed 扫描：无闪现阶段 8306 一次都不出现；有闪现阶段能抽到且主副系必含启迪；「巧具」排 3 个候选都能抽到。✅

- [x] **P2.6 `core/generate.ts` 编排**
  - 按 §8 固定顺序串起，返回 `GenerateResult`（错误以 `ok:false` 返回，不抛异常）。
  - **完成判据**：`tests/generate.test.ts` 15 个用例：同 seed 深比较相等、不传 seed 时返回的 seed 可复现、1/5/10 人（随机分队与预先分队）各 200 seed 全部满足不变量。✅
  - 全量：**73 个用例通过**，`typecheck` 与 `build:h5` 均通过。

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
