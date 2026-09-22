# 项目架构

> 决策日期：2026-09-21 ｜ 目标版本：v1（Web/H5 端）

---

## 1. 形态决定：v1 不分前后端

**结论：v1 是纯静态单页应用，没有运行时后端。** 数据抓取是一次性的构建期步骤。

理由：

1. 随机逻辑是**纯函数**——输入（人数/名字/位置/开关/seed）+ 数据快照 → 输出构筑结果。没有任何需要服务端状态、鉴权、持久化或跨用户共享的东西。
2. 数据源是公开 CDN 的静态 JSON，且带 `Access-Control-Allow-Origin: *`。运行时直连可行，但把抓取挪到构建期可以让首屏不必下载 900KB+ 的原始数据。
3. 多部署一个进程就多一份运维成本、多一个故障点。v1 的目标是「打开网页就能用」。
4. 架构上保留**接缝**（§6），将来真要加后端时不需要改核心逻辑。

`docs/RULES.md` 是随机逻辑的权威规范；`docs/DATA.md` 是数据流水线的权威说明。

---

## 2. 分层与数据流

```
                    ┌──────────────────────── 构建期（Node，一次性） ────────────────────────┐
  game.gtimg.cn ──▶ │ scripts/fetch-data.mjs  →  scripts/lib/normalize.mjs  →  src/data/*.json │
  CommunityDragon ─▶└───────────────────────────────────────────────────────────────────────┘
                                              │  （快照提交进仓库）
                                              ▼
  ┌──────────────────────── 运行时（浏览器） ────────────────────────────────────────────────┐
  │                                                                                          │
  │  pages/index/index.vue          输入表单、开关、触发、展示编排                              │
  │        │  GenerateInput                                                                  │
  │        ▼                                                                                 │
  │  core/generate.ts               编排流水线（§RULES.8）                                     │
  │        ├─ core/validate.ts      输入校验 → 结构化错误                                      │
  │        ├─ core/positions.ts     位置分配                                                   │
  │        ├─ core/champions.ts     英雄（全局去重）                                            │
  │        ├─ core/spells.ts        召唤师技能（依赖位置）                                       │
  │        ├─ core/items.ts         出门装 / 六件成装 / 鞋子                                     │
  │        ├─ core/runes.ts         主系 / 副系 / 小符文 / 海克斯闪现约束                        │
  │        └─ core/random.ts        可注入种子 RNG                                             │
  │        │  BuildResult[]                                                                   │
  │        ▼                                                                                 │
  │  reveal/plan.ts                 结果 → 轮盘剧本（每格一串候选，末项必是真实值）              │
  │  reveal/controller.ts           播放器状态机：逐玩家逐段推进 / 点击快进 / 跳过全部            │
  │        │  CardReveal | null（null = 不做动画）                                             │
  │        ▼                                                                                 │
  │  components/BuildCard.vue       单份结果卡片（隐藏 / 滚动 / 定格三态）                       │
  │  components/IconChip.vue        图标 + 悬停资料卡（数据全部来自快照）                        │
  └──────────────────────────────────────────────────────────────────────────────────────────┘
```

**铁律**：`core/` 不 import 任何 Vue / uni-app / DOM API，也不直接 import `src/data/*.json`。数据以 `DataBundle` 参数注入。因此：
- 它可以被 `vitest` 直接在 Node 里跑；
- 同一份逻辑将来可以原样搬进后端；
- 换数据源（换快照或改成后端返回）不需要动算法。

`reveal/` 受同样的约束（不碰 DOM、不参与随机结果），只是它用 Vue 的 `ref`/`reactive` 表达播放状态——核心资产是那个状态机，不是渲染。

---

## 3. 目录结构

```
lol/
├── AGENTS.md                   # 需求意图 + 已确认决策 + 项目约定（agent 上下文入口）
├── todo.md                     # 开发规划与进度
├── README.md                   # 面向人类的使用说明
├── docs/
│   ├── RULES.md                # 随机规则实现权威规范
│   ├── ARCHITECTURE.md         # 本文
│   ├── DATA.md                 # 数据源、快照 schema、刷新流程
│   └── DEPLOY.md               # 部署文档
├── scripts/
│   ├── fetch-data.mjs          # 抓取 + 生成快照
│   └── lib/
│       ├── sources.mjs         # 所有数据源 URL 常量
│       └── normalize.mjs       # 原始数据 → 快照 schema（含口径过滤规则）
├── src/
│   ├── data/                   # 构建期生成物（提交进仓库）
│   │   ├── meta.json           # patch 版本、抓取时间、各文件条目数
│   │   ├── champions.json
│   │   ├── items.json          # 已按位置语义分组：传说池/鞋子/出门装/打野蛋/辅助任务件
│   │   ├── runes.json          # 五系 + 三排小符文，已整理成树
│   │   ├── spells.json         # 峡谷可用召唤师技能
│   │   └── index.ts            # 组装成 DataBundle
│   ├── core/                   # 纯逻辑层（无框架依赖）
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   ├── random.ts
│   │   ├── validate.ts
│   │   ├── positions.ts
│   │   ├── champions.ts
│   │   ├── spells.ts
│   │   ├── items.ts
│   │   ├── runes.ts
│   │   └── generate.ts
│   ├── reveal/                 # 揭幕动画层（不碰 DOM，不影响随机结果）
│   │   ├── sections.ts         # 分幕顺序、每幕帧数、先快后慢的帧间隔
│   │   ├── plan.ts             # 结果 → 轮盘剧本（陪跑项由同一个 seed 派生，动画也可复现）
│   │   └── controller.ts       # 播放器状态机：逐玩家逐段推进 / 点击快进 / 跳过全部
│   ├── components/
│   │   ├── IconChip.vue        # 图标 + 悬停资料卡 + 图标加载失败的兜底 + 滚动态
│   │   └── BuildCard.vue       # 单份结果卡片（隐藏 / 滚动 / 定格）
│   ├── pages/index/index.vue   # 输入面板 + 结果网格（表单状态就地管理）
│   ├── static/
│   ├── App.vue                 # 全局样式与设计令牌（CSS 自定义属性）
│   ├── main.ts
│   ├── manifest.json
│   ├── pages.json
│   └── uni.scss
├── tests/
│   ├── random.test.ts
│   ├── validate.test.ts
│   ├── generate.test.ts
│   ├── runes.test.ts
│   └── items.test.ts
├── index.html
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
└── package.json
```

---

## 4. 核心模块接口

```ts
// core/types.ts —— 所有对外类型的唯一出处（只有类型，没有运行时值）
export type { Position, TeamId, PlayerInput, GenerateInput, BuildResult,
              ValidationError, GenerateResult, DataBundle,
              ChampionRef, ItemRef, RuneRef, SpellRef, StyleRef, RunePage }

// core/constants.ts —— 运行时常量：位置顺序、中文标签、惩戒/闪现 ID、海克斯闪现罗网坐标
export const POSITIONS, POSITION_LABELS, ROLE_LABELS, TEAM_SIZE,
             LEGENDARY_ITEM_COUNT, SECONDARY_MINOR_SLOT_COUNT, SPELL_IDS, HEXFLASH

// core/generate.ts —— 唯一入口
export function generateBuilds(
  input: GenerateInput,
  data: DataBundle,
  options?: { seed?: number },
): GenerateResult

export type GenerateResult =
  | { ok: true;  seed: number; results: BuildResult[] }
  | { ok: false; errors: ValidationError[] }

// core/random.ts
export type Rng = () => number
export function createRng(seed: number): Rng
export const defaultRng: Rng
export function createRandomSeed(): number
export function pick<T>(arr: readonly T[], rng: Rng): T
export function pickMany<T>(arr: readonly T[], n: number, rng: Rng): T[]  // 无放回
export function shuffle<T>(arr: readonly T[], rng: Rng): T[]
export function pickFromGroups<T>(groups: readonly (readonly T[])[], rng: Rng): T
```

设计取向：**深模块**——`generateBuilds` 一个函数吞掉整个规则体系，调用方（页面）只需要知道 `GenerateInput` 和 `BuildResult`。规则细节全部封在 `core/` 内部，页面不认识任何 ID 常量。

---

## 5. 状态与展示

- **状态**：全部就地放在 `pages/index/index.vue` 里（`ref`/`reactive`），不引 Pinia。状态只有五块：玩家表单、显示开关、揭幕播放器、结果、当前 seed。
- **揭幕动画**：`reveal/controller.ts` 是唯一有定时器的地方，页面只把它转成 `CardReveal` 传给卡片；卡片按 `hidden / rolling / done` 三态渲染。动画开关关闭时直接传 `null`，卡片走「全部定格」这条路径，与播放到结尾完全等价（有测试保证渲染结果逐字节相同）。
- **展示**：`BuildCard.vue` 负责单份结果的排布，布局对齐 `hexfuser.com` 的卡片：表头（序号/名字/位置/队伍）→ 英雄 → 召唤师技能 → 出门装 → 成装一行 + 鞋子 → 符文分隔 → 主/副系与详细点法 → 三个小符文。
- **分组显示**：双队模式下按队伍分组渲染，并带一条队伍分隔头；这也决定了动画的播放顺序（按显示顺序播，避免卡片乱跳）。
- **资料卡**：`IconChip.vue` 自带的浮层，**纯 CSS `:hover`** 实现，不需要任何 JS 事件绑定。内容取自快照里的 `desc` / `short` / `long`，不请求任何第三方接口。代价是 v1 只对鼠标悬停生效，移动端要改成点击展开（P6）。
- **图标兜底**：`<image>` 的 `@error` 置一个 flag，渲染成带首字的占位块，避免 CDN 不可达时整卡崩坏。
- **设计令牌**：颜色只在 `App.vue` 的 `page` 选择器里定义一次（黑钢底 + 单点黄铜色），组件用 `var(--…)` 取用。

---

## 6. 未来的接缝（v1 不做，但留好口子）

| 变化 | 需要改动的地方 | 不需要改动的地方 |
| --- | --- | --- |
| 加运行时后端（`GET /api/data` 返回 `DataBundle`） | `src/data/index.ts` 改成 async 加载 + 一个 loading 态 | `core/**`、`components/**` |
| 后端托管随机（`POST /api/random`） | 页面把 `generateBuilds()` 换成 fetch；`core/` 直接搬到服务端复用 | 规则实现 |
| 分享/复现某次随机（URL 带 seed） | 页面读写 query 参数 | `core/`（seed 已是输入） |
| 上移动端 App / 小程序 | 复用同一份 uni-app 代码，补 `manifest.json` 平台配置与布局断点 | `core/**` |

---

## 7. 技术选型与风险

| 项 | 选择 | 说明 |
| --- | --- | --- |
| 框架 | uni-app `3.0.0-5020620260917001`（Vue 3） | 用户指定；同一份代码可出 H5 / 小程序 / App |
| 构建 | Vite `5.2.8`（由 uni-app 预设锁定） | 不要手动升到 Vite 8，`@dcloudio/vite-plugin-uni` 只兼容其预设版本 |
| 语言 | TypeScript | `core/` 全类型覆盖 |
| 测试 | Vitest `^1.6`（与 Vite 5 对齐） | 只测 `core/`，不测组件 |
| 样式 | 原生 CSS + scoped | 不引 UI 库，保持扁平与简单 |

**风险与对策**

1. **uni-app 版本是 alpha 线（`3.0.0-*`）**：`package.json` 里所有 `@dcloudio/*` 必须**锁死同一个版本号**，禁止用 `^` 或 `latest`，否则预设与插件版本错配会直接构建失败。
2. **Vue 必须锁死 `3.5.43` 且三包同版本**：`vue` / `@vue/runtime-core` / `@vue/server-renderer` 都用精确版本，**不要写 `^`**。整个 `@dcloudio/*` 套件依赖 `@vue/shared@3.4.21`，而 uni-app 的编译产物需要 3.5 的导出；只有显式钉住 3.5.43，npm 才会把 3.5.43 的 `@vue/shared` 嵌套到各 Vue 包下、同时让 `@dcloudio/*` 用顶层的 3.4.21。踩错的症状很隐蔽：**H5 能构建，小程序构建失败**（Vite/esbuild 对缺失的具名导出宽松，Rollup 严格报错）。详见 `docs/MINIPROGRAM.md` §1。
3. **Vite 必须停在 5.2.8**：`@dcloudio/vite-plugin-uni` 依赖其预设的 Vite 与 Rollup 版本。
4. **数据会随版本变化**：快照里记录 patch 版本；刷新脚本失败时保留旧快照并在 `meta.json` 标注，页面不会因此白屏。
5. **图标热链 CDN**：`game.gtimg.cn` 不可达时图标会裂。用 `image` 的 `@error` 兜底为占位块，避免整卡崩坏。
6. **ID 常量藏在快照里**：`core/` 只按语义分组取池（`data.items.legendary` 等），不硬编码行为——唯一例外是 `docs/RULES.md` 明文列出的固定映射（打野蛋、辅助任务件、鞋子升级表、海克斯闪现罗网 ID），这些在 `core/` 里以命名的常量表出现并附注释指回规范小节。
