/**
 * 强度评分（docs/STRENGTH.md）。
 *
 * 纯函数、无副作用、不依赖 DOM 与 Vue——`core/` 的分层铁律（AGENTS.md §4.1）。
 * 输入一份 `BuildResult` + 数据，输出分项明细。判档与目标分见 `TIERS`。
 *
 * ## 分值来源
 *
 * 全部由 `docs/STRENGTH.md` §2 的决策定下，并用 20000 次蒙特卡洛验证过：
 * 英雄 : 装备 : 符文 = 5.96 : 5.21 : 2.83（目标 6:5:3）。
 * **改任何数字都要重跑 `scripts/analyze-total-score.mjs` 复核比例**。
 *
 * ## 三块各怎么算
 *
 * - **英雄**：直接取 101 榜单记录里构建期算好的 `laneScore + tierBonus`。
 * - **装备**：命中核心 +10 / 命中其余成装或鞋 +5；不在推荐列表里则看**适配度**：
 *   强相容 +2 / 弱相容 +1 / 不相容 0。相容分只给 2 和 1 是因为
 *   **91.4% 的成装抽取都不在推荐列表里**，给 +4 会让装备项翻倍压过英雄项（实测过）。
 * - **符文**：随出的每一项在该英雄**前 5 页推荐**里出现过就算命中。
 */

import {
  LANE_K1,
  LANE_K2,
  RIFT_RUNE_TOP_N,
  RUNE_POINTS,
  SCORE_POINTS,
  STRENGTH_TIERS,
  TIER_BONUS,
  type StrengthTierId,
} from './constants'
import type {
  BuildResult,
  ChampionRef,
  ItemRef,
  ItemsSnapshot,
  RiftBuildEntry,
  RiftLaneRecord,
  RiftSnapshot,
  RuneRef,
  RunesSnapshot,
} from './types'

export interface StrengthData {
  items: ItemsSnapshot
  runes: RunesSnapshot
  rift: RiftSnapshot
}

export interface StrengthBreakdown {
  /** 位置英雄项（胜率/登场率 + T 挡位）。没有该分路数据时为 0。 */
  hero: number
  /** 装备项。 */
  items: number
  /** 符文项。 */
  runes: number
  total: number
  /** 六件成装里命中推荐列表的件数（T4 复合条件要用）。 */
  recommendedHits: number
  /** 便于界面展示与排查。 */
  detail: {
    laneScore: number
    tierBonus: number
    tier: string | null
    hasLaneData: boolean
    /** 构筑/符文是否回退到了常用分路（用于界面如实标注） */
    buildFallback: boolean
    itemPoints: number[]
    runeHits: { keystone: boolean; primary: boolean[]; secondary: boolean[]; shards: boolean[] }
  }
}

/** 榜单索引：`heroId:position` → 记录。 */
export function indexLaneRecords(ranks: readonly RiftLaneRecord[]): Map<string, RiftLaneRecord> {
  return new Map(ranks.map((record) => [`${record.heroId}:${record.position}`, record]))
}

/** 把 `ItemRef` / `RiftEquipmentSlot.itemIds`（数字）统一成字符串比较。 */
const asId = (value: string | number): string => String(value)

/**
 * 装备对英雄的适配度分。
 *
 * 判定用「伤害类型」与「定位」两条线：
 * - 伤害类型：装备有物理/法强类别时，是否与英雄的 `damageType` 相符
 * - 定位：坦度↔durability、辅助↔utility、暴击↔射手、攻速↔射手或高输出
 *
 * 装备没有伤害类别（纯坦度/辅助装）时伤害类型**不适用**，只看定位。
 */
export function compatScore(item: ItemRef, champion: ChampionRef, categories: Record<string, string[]>): number {
  const cats = categories[item.id] ?? []
  const profile = champion.profile
  const roles = champion.roles ?? []

  const isAd = cats.includes('ad') || cats.includes('crit')
  const isAp = cats.includes('ap')
  const physical = profile?.damageType === 'kPhysical' || profile?.damageType === 'kMixed'
  const magic = profile?.damageType === 'kMagic' || profile?.damageType === 'kMixed'

  let damageMatch: boolean | null = null
  if (isAd && isAp) damageMatch = true
  else if (isAd) damageMatch = physical
  else if (isAp) damageMatch = magic

  const damage = profile?.damage ?? 0
  const durability = profile?.durability ?? 0
  const utility = profile?.utility ?? 0

  // 定位只看「坦度 / 辅助 / 暴击 / 攻速」四种亲和。
  // **不要把 `damage >= 2` 当成伤害装的定位匹配**——那样几乎所有英雄都算匹配，
  // 于是任何伤害装都至少拿到弱相容，AP 英雄出纯物理装也能得分（踩过这个坑）。
  // 伤害装的匹配与否由上面的 damageMatch 单独决定。
  const roleMatch =
    (cats.includes('tank') && (durability >= 2 || roles.includes('tank'))) ||
    (cats.includes('support') && (utility >= 2 || roles.includes('support'))) ||
    (cats.includes('crit') && roles.includes('marksman')) ||
    (cats.includes('attackSpeed') && (roles.includes('marksman') || damage >= 2))

  if (damageMatch === null) return roleMatch ? SCORE_POINTS.strongCompat : 0
  if (damageMatch && roleMatch) return SCORE_POINTS.strongCompat
  if (damageMatch || roleMatch) return SCORE_POINTS.weakCompat
  return 0
}

/** 符文 id → `${styleId}|${slot}`，用来把符文归到它所在的那一排。 */
function indexMinorRows(runes: RunesSnapshot): Map<string, string> {
  const index = new Map<string, string>()
  for (const style of runes.styles) {
    for (const slot of style.minors) {
      for (const rune of slot.runes) index.set(asId(rune.id), `${style.id}|${slot.slot}`)
    }
  }
  return index
}

/** 推荐页（前 N 页）覆盖到的符文 id 集合，按槽位分开。 */
function allowedRuneIds(entry: RiftBuildEntry) {
  const keystones = new Set<string>()
  const minors = new Set<string>()
  const shards = new Set<string>()
  for (const page of entry.runePages.slice(0, RIFT_RUNE_TOP_N)) {
    keystones.add(asId(page.keystone))
    for (const id of page.primaryRunes.slice(1)) minors.add(asId(id))
    for (const id of page.secondaryRunes) minors.add(asId(id))
    for (const id of page.shards) shards.add(asId(id))
  }
  return { keystones, minors, shards }
}

/** 一个符文是否命中推荐集合（先按 id 直判，主系小符文再按排归属兜底）。 */
function hitMinor(rune: RuneRef, allowed: Set<string>): boolean {
  return allowed.has(asId(rune.id))
}

export function scoreBuild(result: BuildResult, data: StrengthData): StrengthBreakdown {
  const heroId = result.champion.heroId
  const laneKey = `${heroId}:${result.position}`
  // 英雄分只在**真实分路**里查；查不到就是 0（决策 4：不在这个位置就是弱）。
  const lane = indexLaneRecords(data.rift.ranks).get(laneKey)

  // 构筑与符文：当前分路没数据时**回退到该英雄的常用分路**（用户定的口径）。
  // 101 每分路只收录约 50 个英雄，不回退的话 72% 的随机结果符文项会直接归零。
  const primary = data.rift.primaryPositions?.[heroId]
  const fallbackKey = primary ? `${heroId}:${primary}` : null
  const usedKey = data.rift.builds[laneKey] ? laneKey : fallbackKey && data.rift.builds[fallbackKey] ? fallbackKey : laneKey
  const entry = data.rift.builds[usedKey]
  const buildFallback = usedKey !== laneKey

  // ---- 英雄项 ----
  // 从原始胜率/登场率**现算**，不读快照里那份构建期算好的 laneScore——
  // 否则改分值要同时改 constants.ts 与 fetch-101.mjs 两处，漏一处就静默算错（踩过）。
  const laneScore = lane ? (lane.winRate - 50) * LANE_K1 + (lane.pickRate ?? 0) * LANE_K2 : 0
  const tierBonus = lane ? (lane.tier ? (TIER_BONUS[lane.tier] ?? 0) : 0) : 0
  const hero = laneScore + tierBonus

  // ---- 装备项 ----
  const coreIds = new Set<string>()
  for (const slot of entry?.build?.core ?? []) for (const id of slot.itemIds) coreIds.add(asId(id))
  const laterIds = new Set<string>()
  for (const group of [entry?.build?.forth, entry?.build?.fifth, entry?.build?.sixth]) {
    for (const slot of group ?? []) for (const id of slot.itemIds) laterIds.add(asId(id))
  }
  const shoeIds = new Set<string>()
  for (const slot of entry?.build?.shoes ?? []) for (const id of slot.itemIds) shoeIds.add(asId(id))
  const starterIds = new Set<string>()
  for (const slot of entry?.build?.starting ?? []) for (const id of slot.itemIds) starterIds.add(asId(id))

  const itemPoints: number[] = []
  let recommendedHits = 0
  for (const item of result.legendaryItems) {
    if (coreIds.has(item.id)) {
      itemPoints.push(SCORE_POINTS.coreItem)
      recommendedHits++
    } else if (laterIds.has(item.id)) {
      itemPoints.push(SCORE_POINTS.laterItem)
      recommendedHits++
    } else {
      itemPoints.push(compatScore(item, result.champion, data.items.categories))
    }
  }

  // 鞋子与出门装：命中推荐列表才加分（与成装同一套口径）
  if (shoeIds.has(result.boots.id)) itemPoints.push(SCORE_POINTS.shoe)
  const starterId = result.starterItem.id
  if (starterIds.has(starterId)) itemPoints.push(SCORE_POINTS.starter)

  const items = itemPoints.reduce((sum, value) => sum + value, 0)

  // ---- 符文项 ----
  const allowed = entry ? allowedRuneIds(entry) : null
  const runeHits = {
    keystone: false,
    primary: [false, false, false],
    secondary: [false, false],
    shards: [false, false, false],
  }
  let runes = 0

  if (allowed) {
    const minorRows = indexMinorRows(data.runes)
    if (allowed.keystones.has(asId(result.runes.keystone.id))) {
      runeHits.keystone = true
      runes += RUNE_POINTS.keystone
    }
    result.runes.primaryMinors.forEach((rune, index) => {
      if (hitMinor(rune, allowed.minors)) {
        runeHits.primary[index] = true
        runes += RUNE_POINTS.primaryMinor
      }
    })
    result.runes.secondaryMinors.forEach((rune, index) => {
      if (hitMinor(rune, allowed.minors)) {
        runeHits.secondary[index] = true
        runes += RUNE_POINTS.secondaryMinor
      }
    })
    result.shards.forEach((rune, index) => {
      if (allowed.shards.has(asId(rune.id))) {
        runeHits.shards[index] = true
        runes += RUNE_POINTS.shard
      }
    })
    // minorRows 目前只用于排查，保留引用避免「算了没用」
    void minorRows
  }

  return {
    hero,
    items,
    runes,
    total: hero + items + runes,
    recommendedHits,
    detail: {
      laneScore,
      tierBonus,
      tier: lane?.tier ?? null,
      hasLaneData: Boolean(lane),
      /** 构筑/符文是否回退到了常用分路 */
      buildFallback,
      itemPoints,
      runeHits,
    },
  }
}

// ---------------------------------------------------------------- 挡位

export type { StrengthTierId }

export interface TierRule {
  id: StrengthTierId
  label: string
  /** 目标分下界；`null` 表示不控强度。 */
  min: number | null
  /** 目标分上界（不含）；`null` 表示不封顶。 */
  max: number | null
  /** 复合条件：六件成装至少命中几件推荐（0 表示无要求）。 */
  requireRecommended: number
}

/**
 * 判断一份结果是否达到指定挡位。
 *
 * 最高档是**复合条件**（用户定的 C）：光靠总分不够，还要求六件成装里
 * 至少命中 2 件推荐——否则「高分」可能只是靠一堆强相容的散件堆出来的，
 * 而不是真的照着一个成型的构筑走。
 */
export function meetsTier(breakdown: StrengthBreakdown, tier: TierRule): boolean {
  // min=null 表示「不控下界」，但 max 仍然要生效（`区` 就是 min=null / max=26）。
  // 早期写成 `min === null 直接 return true`，结果 `区` 变成无约束、匹配一切（踩过）。
  if (tier.min === null && tier.max === null) return true
  if (tier.min !== null && breakdown.total < tier.min) return false
  if (tier.max !== null && breakdown.total >= tier.max) return false
  if (tier.requireRecommended > 0 && breakdown.recommendedHits < tier.requireRecommended) return false
  return true
}

/** 按总分与复合条件定档（用于展示）。 */
export function classifyTier(breakdown: StrengthBreakdown): TierRule | null {
  const ordered = [...(STRENGTH_TIERS as readonly TierRule[])].reverse()
  for (const tier of ordered) {
    if (meetsTier(breakdown, tier)) return tier
  }
  return null
}
