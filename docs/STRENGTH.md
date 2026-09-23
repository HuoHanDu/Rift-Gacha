# 强度系统设计规范

> 状态：**设计已定，待实现**。2026-09-22 与用户逐条确认。
> 本文是强度算法的实现权威规范；随机规则本身见 `docs/RULES.md`。
> 装备适配度已于同日验证定案（§5.1）：DDragon `vars` 走不通，退到用 `playstyleInfo` + `championTagInfo` + `damageType` 做适配度判定。

---

## 1. 目标

十人内战里两边的构筑强度可能相差很大。所以引入「强度」：给每支队伍和每个玩家设定期望强度，
随机时**主动往目标靠**，而不是纯均匀随机。

---

## 2. 已确认决策（2026-09-22）

| # | 项 | 决定 |
| --- | --- | --- |
| 1 | 挡位 | **三档 + 一个「完全随机（不控强度）」**。三档名字与顺序：**区 → 爬行动物 → 类人**（由弱到强）。选「完全随机」时退化为现在的不控强度随机 |
| 2 | 队伍 vs 个人 | **队伍总分 + 个人上下限区间**。个人**不设精确值**，只设「不低于 X、不高于 Y」，由系统自行安排谁强谁弱来凑队伍总分——这就是"弱的被强的弥补" |
| 3 | 刻度 | **自定义点数，0 起步、不封顶**。三个挡位只是分数区间的别名 |
| 4 | 位置英雄强度 | `(胜率 − 50) × k1 + 登场率 × k2`。**必须减掉 50 基线**，否则所有英雄白拿 50 分底分、区分度被压掉 |
| 5 | 权重 | 胜率 : 登场率 = **7 : 3** |
| 6 | 分路 T 挡位 | **T0 +20 / T1 +14 / T2 +8 / T3 +3 / T4 +0**；**该英雄在该分路没有数据 = 0 分**（不扣分） |
| 7 | 装备适配度 | 命中推荐 +10/+5；不在推荐里则按适配度 **强相容 +4 / 弱相容 +1 / 不相容 0**（见 §5.1） |
| 8 | 符文 | 主系基石命中 **+15**；主系 3 个小符文各 **+8**；副系 2 个各 **+5**；3 个属性碎片各 **+5**（重合才加） |
| 9 | 实时调整 | **目标分 + 容差，反复重试直到落进区间**。默认容差 ±10%，界面可调 |
| 10 | 数据版本 | **装备/符文快照与胜率数据一起升到 16.19** |

> 决策 6 与规则 4 原本有冲突（"默认 T3/T4" vs "不加分"），已统一为：**没有该分路数据的英雄一律 0 分**。

---

## 3. 分数构成

单个玩家的强度分 = 以下各项之和：

```
位置英雄强度   = (胜率 − 50) × 0.7 + 登场率 × 0.3
               + T 挡位加分（T0 +20 / T1 +14 / T2 +8 / T3 +3 / T4 +0，无数据 0）
出门装         = 待定（101 的 itemout 也带 pickRate/winRate）
鞋             = 命中"其余成装"列表 +5，否则待定
6 件成装       = 命中"优先成装" +10 / 命中"其余成装" +5 / 其余见 §5
符文           = 基石 +15 / 主系小符文 +8 each / 副系 +5 each / 属性碎片 +5 each
```

### 待补充的口径

- **`k1`/`k2` 的具体取值**：决策 4/5 定了形式与比例（7:3），但没定绝对量级。
  建议由「三档区间的边界」反推，见 §4。
- **出门装怎么算分**：101 的 `itemout` 也带 `pickRate`/`winRate`，可以直接沿用装备那套。
- **无数据英雄的胜率项**：英雄没有该分路数据时，位置英雄强度**整项为 0**（不是只把 T 挡位记 0）。

---

## 4. 挡位与分数区间（提案，待定数字）

挡位只是分数区间的别名。区间边界定了，`k1`/`k2` 的量级才能反推。

| 挡位 | 建议区间 | 含义 |
| --- | --- | --- |
| 完全随机 | — | 不控强度，忽略目标分 |
| 区 | 待定 | 最弱 |
| 爬行动物 | 待定 | 中 |
| 类人 | 待定 | 最强 |

> 数字需要「用真实数据算一批结果、看分布」之后才能定——否则区间边界会与真实分数的实际范围错配
> （可能全部结果都落在同一档里）。这一步依赖 101 接口打通。

---

## 5. 装备适配度（**未定案，当前阻塞项**）

已确认的部分：命中 101 的 `itemcore_json`（优先成装）+10、`itemone_json`（其余成装）+5、鞋子同剩余。

**问题**：107 件传说池里，大多数装备不会出现在某个英雄的任何推荐列表里。用户要求这些**按"对这位英雄是否真的有用"**来判：

- AP 加成英雄出纯物理装 → 基本没用 → **0 分**
- 辅助装带法强加成、而该英雄吃法强 → **有帮助但不多** → 少量分

### 现有可用数据（已核实）

| 数据 | 有无 | 说明 |
| --- | --- | --- |
| CD `tacticalInfo.damageType` | ✅ | `kPhysical` / `kMagic` / `kMixed`，**只区分伤害类型，区分不了"靠技能还是靠普攻"** |
| CD `roles` | ✅ | fighter / tank / mage / support / marksman / assassin |
| CD `tacticalInfo.style` | ✅ | 1~10 的玩法风格编号 |
| CD `recommendedItemDefaults` | ❌ **空的** | zh_cn 与 default 两种语系都实测为空 |
| CD `spells[].description` | ❌ 无用 | 只是风味文案，不含加成数值（内瑟斯实测 0 次"法术强度/攻击力"） |
| 装备 `types` 标签 | ✅ | `SpellDamage`/`Damage`/`CriticalStrike`/`Armor`/`SpellBlock`/`Health`/`AttackSpeed`/`AbilityHaste`/`Mana`/`OnHit`/`LifeSteal`… |
| 装备 `description` | ✅ | 富文本，可解析出「75 攻击力 / 25% 暴击几率」这类具体数值 |
| CD `spells[].coefficients` / `effectAmounts` | ❓ 未验证 | 可能含加成系数，需要确认 |

### 三条可选路线

**路线 A —— 只用现有数据做粗判（不引新数据源）**

用 `damageType` + `roles` + 装备 `types` 做「相容性」判断：
把装备归到 法强 / 攻击力 / 暴击 / 攻速 / 坦度 / 辅助 六类，把英雄归到物理 / 魔法 / 坦克 / 辅助 / 射手，
命中相容类别给少量分（如 +2），明显不相容给 0。

- 优点：不引新数据源，实现快
- 缺点：**只能挡住大错**（AP 英雄出暴击装），挡不住细的——例如 AP 英雄出「巫妖之祸」其实很强，
  但这套判不出"强"，只能给个中庸分

**路线 B —— 用技能的加成类型建"英雄属性画像"（更准，但需验证数据源）**

Data Dragon 的 `championFull.json` 里每个技能带 `vars`，其 `link` 字段形如
`spelldamage` / `attackdamage` / `bonusattackdamage` / `health` / `armor`，
**这正是"这个技能吃什么加成"的权威数据**。据此算出英雄的画像（几个技能吃 AP、几个吃 AD、
有无生命/护甲加成），再与装备画像匹配。

- 优点：准，且天然处理混伤英雄（厄加特、凯尔这类）
- 缺点：**⚠️ 我还没验证这个版本里 `vars` 是否有值**（本轮没来得及），且要新引一个数据源

**路线 C —— 不动分数，改候选池**

不判分，而是把随机池收窄到「该英雄的 101 推荐装备 ∪ 同定位英雄的通用装备」，
从源头避免抽到明显不合适的装备。

- 优点：实现最简单，且一定能保证"不出现废装"
- 缺点：**与"全随机"的娱乐属性冲突**——装备多样性会明显下降，而且"完全随机"挡位又该怎么办？

---

## 5.1 验证结果与最终路线（2026-09-22）

按决策「先验证 DDragon 的 `spells[].vars`，能成就走 B，不成退 A」，实测结论：

**路线 B 不可行**——三个数据源全部落空：

| 数据源 | 实测结果 |
| --- | --- |
| DDragon `champion/{id}.json` 的 `spells[].vars` | 字段**存在但为空**（`(无)`）。内瑟斯的 4 个技能全是空 |
| DDragon `spells[].tooltip` | 用**具名占位符**：`造成 {{ totaldamage }}物理伤害`。占位符由客户端自行解析，API 不提供映射，解析不出"吃什么加成" |
| CD `spells[].coefficients` | `{"coefficient1":0.0,"coefficient2":1.0}` —— **全是 0，没有加成类型信息** |
| CD `spells[].effectAmounts` | 全部为 `0.0` |
| CD `spells[].dynamicDescription` | `造成 @TotalDamage@物理伤害`，同样是不可解析的占位符 |

**所以退到路线 A，但原料比我原先估计的好。** CD 里还有两个干净的结构化字段（本轮才发现）：

```jsonc
// 内瑟斯（坦克/物理）
"playstyleInfo":  { "damage": 2, "durability": 3, "crowdControl": 2, "mobility": 1, "utility": 1 },
"championTagInfo": { "championTagPrimary": "耐久", "championTagSecondary": "大后期" },
"tacticalInfo":   { "damageType": "kPhysical", "attackType": "melee" },
"roles": ["fighter", "tank"]
```

`playstyleInfo` 是 1~3 的**玩法画像**（输出 / 耐久 / 控制 / 机动 / 功能），`championTagInfo` 是官方原型标签。
有了它们，路线 A 足以支撑「+4 / +1」两档粒度，而不只是挡大错。

### 最终判定表

**英雄侧画像**（全部来自已抓取的 CD 数据，不引新数据源）：

| 维度 | 来源 | 用途 |
| --- | --- | --- |
| 伤害类型 | `tacticalInfo.damageType` | `kPhysical` → 只认同物理装；`kMagic` → 只认同法强装；`kMixed` → 两者都认 |
| 伤害定位 | `playstyleInfo.damage` ≥ 2 | 认同输出装 |
| 坦度定位 | `playstyleInfo.durability` ≥ 2 | 认同坦度装 |
| 功能定位 | `playstyleInfo.utility` ≥ 2 | 认同辅助装 |
| 职业 | `roles` | `marksman` → 认同攻速/暴击装；`support` → 认同辅助装；`tank` → 坦度装 |
| 原型标签 | `championTagInfo` | 交叉验证，处理上面几条都没覆盖的情况 |

**装备侧画像**：从 `items.js` 的 `types` 标签 + `description` 富文本解析（例如
`["CriticalStrike","Damage"]` + "75 攻击力 / 25% 暴击几率" → 物理暴击装）。

### 打分规则

| 情形 | 分数 |
| --- | --- |
| 命中 101 的 `itemcore_json`（优先成装） | **+10** |
| 命中 101 的 `itemone_json`（其余成装）或鞋 | **+5** |
| 不在推荐里，但**强相容**（伤害类型匹配 **且** 定位匹配，如 AP 英雄拿到高法强核心装） | **+4** |
| 不在推荐里，但**弱相容**（只有一边匹配，如辅助装带法强给吃法强的英雄） | **+1** |
| 明显不相容（AP 英雄拿纯物理装） | **0** |
| 两处列表都没出现且两边都不匹配 | **0** |

**出门装**沿用同一套：命中 101 的 `itemout` 才加分，否则按适配度判。

**待办**：装备画像的"六类分类表"要人工核对一遍（哪些装备归物理/法强/暴击/攻速/坦度/辅助），
这份表随版本变化，需要在 `scripts/lib/normalize.mjs` 里登记并加断言。

---

## 6. 实时调整机制

```
1. 由挡位 / 队伍总分 / 个人区间 推出"当前玩家的目标分区间"
2. 随机生成 → 算分
3. 落进区间 → 采用；否则重试
4. 超过重试上限仍不满足 → 采用"最接近目标"的那一次，并在卡片上标注"未达标"
```

**上限已定**：**最多 200 次或 1.5 秒**，先到者为准。超限就取最接近目标的那次并在卡片上标注，
**绝不卡死页面**。

**必须有兜底的原因**：目标区间可能本身不可达（例如要求六件全是核心装，但该英雄只有 3 件核心）。
所以第 4 步不能省，而且要如实告诉用户"没达到"，而不是无限重试。

---

## 7. 101 接口侦察结果（已核实）

基址：`https://mlol.qt.qq.com/go`（来自 bundle 的 `window.ZMProjectConfig.ZMSERVICE`）

| 接口 | 参数 | 返回字段 |
| --- | --- | --- |
| `database/versionlist` | `zone=lol&from=h5` | `id` / `name` / `vkey` / `key` / `public_date` |
| `battle_info/odp_proxy/lol_101strategy` | `itier`、`version_id`、`lane`、`sort_metric`、`sort_order` | `hero_id`、`win_rate`、`pick_rate`、`ban_rate`、`tierNumber`、`bestTier` |
| `battle_info/odp_proxy/lol_101strategy_build` | `championid`、`lane`、`version_id`、`itier` | `itemout`、`itemshoes`、`itemcore_json`、`itemone_json`、`championid_json`、`dtstatdate` |
| `battle_info/odp_proxy/lol_101strategy_runeinfo` | 同上 | `rune_top_details`、`rune_details`、`rune_single_details`、`keyperkId` |

**已核实的细节**

- `lane` 取值是 `top / jungle / mid / bottom / support / ALL` —— **`bottom` 对应我们的 `adc`，需要映射**。
- 成装天然分成 `itemcore_json`（优先成装）与 `itemone_json`（其余成装），与"+10 / +5"的分档一致，不用自己分类。
- 两个成装字段各带 `showrate`（登场率）与 `winrate`（胜率）；`itemout`/`itemshoes` 是
  `itemIds$pickRate$winRate` 的 `#` 分隔串。
- 参数是**按顺序校验**的：漏传会得到 `arg version_id is required` / `arg itier is required` 这类明确报错。

**未打通**：参数齐全后返回空信封 `{"data":{"_fieldValues":{…},"result":""}}`，不是报错。
候选原因是 `version_id` 的形态（`name` / `id` / `vkey` / `key` 都试过）或缺少 `region` 之类的参数。
**这是实现问题，不是设计阻塞**——字段表已经拿到，解参数只是耐心活。

**版本提醒**：101 最新是 **16.19**（2026-09-23 发布），我们的快照是 16.18。按决策 10 两者要一起升。
