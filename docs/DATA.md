# 数据源与快照

> 用途：说明数据从哪来、怎么转成快照、怎么刷新。实现权威规范见 `docs/RULES.md`。
> 本文所有 URL、字段名、条目数均为 2026-09-21 实测结果（patch **16.18**）。

---

## 1. 数据源清单

101 数据站（`101.qq.com`）是一个 Vue SPA，页面本身不含数据，数据全部来自腾讯 CDN 的静态 JSON。我们直接取 CDN，等价于「爬 101 的两个页面」，但稳定得多。

| 用途 | URL | 实测大小 | 顶层结构 |
| --- | --- | --- | --- |
| 英雄列表 | `https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js` | 112 KB | `{ hero: [...], version, fileName, fileTime }` |
| 装备列表 | `https://game.gtimg.cn/images/lol/act/img/js/items/items.js` | 924 KB | `{ tree: [...], items: [...] }` |
| 装备分类扩展 | `https://game.gtimg.cn/images/lol/act/img/js/items_ext/items_ext.js` | 27 KB | `{ items_ext: [{ item_id, roles, category }] }` |
| 符文（含树结构） | `https://game.gtimg.cn/images/lol/act/img/js/runeList/rune_list2.js` | 100 KB | `{ rune: { id: node } }` |
| 召唤师技能 | `https://game.gtimg.cn/images/lol/act/img/js/summonerskillList/summonerskill_list.js` | 18 KB | `{ summonerskill: { id: {...} } }` |
| 英雄详情（悬停资料卡备用） | `https://game.gtimg.cn/images/lol/act/img/js/hero/{heroId}.js` | ~60 KB/个 | `{ hero, skins, spells, version }` |
| 符文交叉校验 | `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/zh_cn/v1/perkstyles.json` | 18 KB | `{ schemaVersion, styles: [...] }` |
| 符文文案交叉校验 | `.../global/zh_cn/v1/perks.json` | 102 KB | `[{ id, name, shortDesc, longDesc, iconPath }]` |

**关键发现**

- 文件后缀是 `.js`，内容是**纯 JSON**（不是 `var x = {...}`），直接 `JSON.parse` 即可，不需要 `eval`。
- `game.gtimg.cn` 响应头带 `Access-Control-Allow-Origin: *`、`Cache-Control: max-age=120`：浏览器可以直连，但 v1 仍选择构建期抓取（见 `docs/ARCHITECTURE.md` §1）。
- `rune_list.js`（107 条）是**扁平列表，没有树结构**；有树结构的是 `rune_list2.js`，务必用后者。
- `items_ext.js` 的 `category` / `roles` 字段**有时是字符串、有时是数组**，normalize 时必须先归一为数组。

---

## 2. 抓取口径（normalize 规则）

这些口径是**代码之外无法推导的领域规则**，全部集中在 `scripts/lib/normalize.mjs`。

### 2.1 英雄

- 取 `hero[]` 全部条目。实测 **173** 个。
- 保留字段：`heroId`、`name`（称号如「黑暗之女」）、`alias`（英文名如 `Annie`，用于拼图标 URL）、`title`（本名如「安妮」）、`roles`。
- 图标 URL：`https://game.gtimg.cn/images/lol/act/img/champion/{alias}.png`（已实测 200）。

### 2.2 装备

1. 先用 `maps` 含「召唤师峡谷」筛出 **399** 件。
2. 再与 `items_ext.js` 按 `item_id` 左连接，拿到 `category`（归一为数组）。
3. 结果分布：`legend` 113、`epic` 44、`ordinary` 48、**无分类 194**。
4. 那 194 件无分类条目**绝大多数是历史遗留 ID**（`77xxxx` 段，如 `773031 无尽之刃`、`773157 中娅沙漏`、`773512 兹若特传送门`），它们的 `maps` 标注不可靠。**判定当前版本的可用装备必须以 `items_ext` 的分类为准**，不能只看 `maps`。
5. 由此得到各语义池：

| 池 | 口径 | 实测条数 |
| --- | --- | --- |
| `legendary` 传说池 | `category` 含 `legend` 且 `maps` 含召唤师峡谷，**剔除** 6 件任务专属件 | **107** |
| 任务专属件（剔除项） | `4643` 警觉眼石、`3869` 星界据守、`3870` 圆梦使者、`3871` 扎兹沙克的溃口、`3876` 摩天雪橇、`3877` 血鸣 | 6 |
| `boots` 未升级鞋 | 见 `docs/RULES.md` §5.3 的 7 个 ID | 7 |
| `bootsUpgraded` 升级鞋 | 由 `into` 字段反查得到，7 个 | 7 |
| `starterGeneric` 通用出门装 | 多兰之盾/刃/戒、黑暗封印、萃取、多兰之弓、多兰之盔、女神之泪 | 8 |
| `starterJungle` 打野蛋 | 焰爪猫幼崽 `1101`、风行狐幼体 `1102`、踏苔蜥幼苗 `1103` | 3 |
| `supportQuestUpgrades` 辅助任务升级件 | `3869`/`3870`/`3871`/`3876`/`3877` | 5 |
| `supportStarter` 辅助出门装 | 云游图鉴 `3865`（固定） | 1 |

**注意的坑**

- `戒备眼石`（`4638`，`epic`）在当前版本**不存在于商店**，用户已明确要求不得使用；它的升级件 `警觉眼石`（`4643`）同属任务专属，一并剔除。
- 鞋子在 `items_ext` 里被标成 `ordinary` 而非独立类别，所以鞋池**必须按显式 ID 列表 + `types` 含 `Boots` 双重认定**，不能靠 `category`。
- 同名装备存在多个 ID（如 `3006 狂战士胫甲` 与 `773006`、`223006`），脚本按上面「只用 `items_ext` 覆盖到的当前 ID」原则自然排除掉旧 ID。
- `3865 云游图鉴` 的 `into` 字段为空，升级链在数据里是断的；辅助任务升级件靠 `from=3867` 指向一个未公开的内部 ID。因此辅助的「出门装 → 升级件」映射按 `docs/RULES.md` §5.1 显式写死。

### 2.3 符文

- 取 `rune_list2.js` 的 `rune` 对象。
- 5 个 `type="3"` 的节点是**符文系根**：`8000` 精密、`8100` 主宰、`8200` 巫术、`8300` 启迪、`8400` 坚决。
- 每个根的 `childs` 是**数组**，元素形如 `{ name: "基石"|"英武"|..., childs: { 符文ID: 符文节点 } }`——即「排 → 符文字典」。子节点 `type="1"`。注意 `childs` 在根上是数组、在排上是对象，normalize 要分别处理。
- `type="2"` 的顶层节点是**小符文（属性碎片）**。
- 排与候选（与 CommunityDragon `perkstyles.json` 完全一致，已交叉校验）：

| 系 | 基石 | 系内 3 排 |
| --- | --- | --- |
| 8000 精密 | 8005 强攻 / 8008 致命节奏 / 8021 迅捷步法 / 8010 征服者 | 英武、战斗、传说 |
| 8100 主宰 | 8112 电刑 / 8128 黑暗收割 / 9923 丛刃 | 预谋、追踪、狩猎 |
| 8200 巫术 | 8214 召唤：艾黎 / 8229 奥术彗星 / 8230 风暴掠袭者的狂涌 / 8992 冥火之触 | 宝物、卓越、威能 |
| 8300 启迪 | 8351 冰川增幅 / 8360 启封的秘籍 / 8369 先攻 | 巧具、未来、超越 |
| 8400 坚决 | 8437 不灭之握 / 8439 余震 / 8465 守护者 | 蛮力、抵抗、生机 |

> `rune_list2.js` 里各系的排顺序与官方客户端展示顺序不一致（例如主宰的「狩猎」排在「基石」之前）。normalize 后按「基石排在前，其余 3 排保持源文件顺序」输出。

- **小符文三排**（以 CommunityDragon 为准，`rune_list2.js` 自己的 `slotLabel` 标注有误，不要用）：

| 排 | 候选 |
| --- | --- |
| 进攻 | `5008` 适应之力、`5005` 攻击速度、`5007` 技能急速 |
| 灵活 | `5008` 适应之力、`5010` 移动速度、`5001` 成长生命值 |
| 防御 | `5011` 生命值、`5013` 韧性和减速抗性、`5001` 成长生命值 |

- 「巧具」排含 `8306` 海克斯科技闪现罗网，约束见 `docs/RULES.md` §6.5。

### 2.4 召唤师技能

- 取 `summonerskill` 对象，筛出 `gamemode` 含「经典」的条目。实测得到 9 个：

| ID | 名称 |
| --- | --- |
| 1 | 净化 |
| 3 | 虚弱 |
| 4 | 闪现 |
| 6 | 幽灵疾步 |
| 7 | 治疗术 |
| 11 | 惩戒 |
| 12 | 传送 |
| 14 | 引燃 |
| 21 | 屏障 |

- 显式剔除：`32`/`39` 标记（雪球，峡谷不存在）；Jade/竞技场变体（`7xx` 段、`2201`~`2203`、`30`/`31` 魄罗、`54`/`55` 占位、`4294967295` 原初惩戒）。
- `13 清晰术` 的 `gamemode` 是「,一对一模式,极地大乱斗」，不含「经典」，因此被 §2.4 的过滤自动排除——这也符合当前版本峡谷没有清晰术的事实。

---

## 3. 快照 schema

`src/data/` 下的 JSON 是**为渲染裁剪过**的形态，不保留原始冗余字段。

```ts
// meta.json
{ "patch": "16.18", "fetchedAt": "2026-09-21T17:30:00.000Z",
  "counts": { "champions": 173, "legendary": 107, "boots": 7, "spells": 9, "styles": 5 },
  "sources": { "heroList": "<url>", "items": "<url>", ... } }

// champions.json
[{ "heroId": "1", "name": "黑暗之女", "alias": "Annie", "title": "安妮",
   "roles": ["mage","support"], "icon": "https://.../champion/Annie.png" }]

// items.json —— 按语义分组，页面与 core 只认分组名，不认 ID 段
{ "legendary":     [ItemRef...],   // 107
  "boots":         [ItemRef...],
  "bootsUpgraded": [ItemRef...],
  "bootsUpgradeMap": { "3006": "3172", ... },
  "starterGeneric": [ItemRef...],
  "starterJungle":  [ItemRef...],
  "starterSupport": ItemRef,        // 3865
  "supportQuestUpgrades": [ItemRef...] }

// ItemRef
{ "id": "3031", "name": "无尽之刃", "icon": "https://.../item/3031.png",
  "gold": 3500, "types": ["CriticalStrike","Damage"],
  "desc": "…纯文本（已剥标签）", "descHtml": "…原始 HTML（资料卡用）" }

// runes.json
{ "styles": [{ "id": "8000", "name": "精密", "icon": "…",
               "keystones": [RuneRef...],
               "minors": [{ "slot": "英武", "runes": [RuneRef...] }, ...] }],
  "shardRows": [{ "slot": "进攻", "runes": [RuneRef...] }, ...] }

// RuneRef
{ "id": "8005", "name": "强攻", "icon": "…", "short": "…", "long": "…" }

// spells.json
[{ "id": "4", "name": "闪现", "icon": "…", "desc": "…", "cooldown": "300" }]
```

> `description` 里含 `<mainText>`、`<attention>`、`<br>` 等游戏内富文本标签。快照同时保留 `desc`（剥标签纯文本，用于 `HoverCard` 的纯文本行）与 `descHtml`（原始串，若将来要还原官方样式再用）。

---

## 4. 刷新流程

```bash
npm run fetch:data        # 抓取 → 写 src/data/*.json + meta.json
```

脚本行为：

1. 顺序拉取 §1 的 5 个主数据源（每个 3 次重试、15s 超时），以及 CommunityDragon 的两个校验源。
2. 执行 §2 的 normalize，得到各池。
3. **完整性断言**（任一失败即中止，不写文件、不破坏旧快照）：
   - 英雄数 ≥ 150
   - 传说池 = 107 且不含任务专属 6 件、不含任何 `types` 含 `Boots` 的装备
   - 未升级鞋恰好 7、升级鞋恰好 7、`bootsUpgradeMap` 覆盖全部 7 双
   - 符文系恰好 5，每系基石 ≥ 3，每系系内小符文排恰好 3 排 × 3 个
   - 小符文排恰好 3 排 × 3 个，且第 1 排为 {适应之力, 攻击速度, 技能急速}
   - 峡谷召唤师技能中必须含 `4 闪现` 与 `11 惩戒`，且不含 `32`/`39`/`13`
   - 与 CommunityDragon 交叉校验：5 个系 ID 与各系基石 ID 集合一致
4. 断言全过后原子写入（先写 `.tmp` 再 rename）。
5. 失败时在控制台打印**具体是哪条断言、期望值、实际值**，保留旧快照，并以非 0 退出码结束。

因为阈值是硬编码的，**版本更新导致数量变化时脚本会失败**——这是有意为之：宁可让人来看一眼，也不要静默地把口径漂移写进快照。届时改 `scripts/lib/normalize.mjs` 里的期望常量并同步 `docs/RULES.md` 与 `AGENTS.md` 的版本口径。

---

## 5. 版权与声明

- 数据来自腾讯 `game.gtimg.cn` 公开 CDN 与 Riot 公开的 CommunityDragon 数据工程。
- 项目为非商业娱乐用途；所有美术资源**热链**官方 CDN，不打包进仓库。
- 页面须展示「非官方，数据来源于官方公开接口，版权归 Riot Games / 腾讯所有」的声明。
