#!/usr/bin/env node
/**
 * 完整总分的蒙特卡洛模拟（docs/STRENGTH.md §3）。
 *
 * 目的有两个：
 * 1. **反推装备相容分**：现在只有「推荐命中」是确定的，`强相容/弱相容` 给几分还没定。
 *    这里先按 +4/+1 跑，再看装备项期望落在哪，据此解出该给几分才能对齐 6:5:3。
 * 2. **给出总分分布**，供定三个挡位的区间（§4 一直缺这个）。
 *
 * 按生成器的真实结构抽样（不是按期望值近似）：
 *   位置英雄 → 抽 6 件成装 + 1 鞋 + 1 出门装 → 抽一页符文
 *
 * 用法：node scripts/analyze-total-score.mjs [试验次数]
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'))

const items = await read('src/data/items.json')
const runes = await read('src/data/runes.json')
const champions = await read('src/data/champions.json')
const stats = await read('src/data/rift-stats.json')
const builds = await read('src/data/rift-builds.json')

const TRIALS = Number(process.argv[2] ?? 20000)
const RUNE_N = 5

// 分值（docs/STRENGTH.md §2 决策 5/6/8）
const POINTS = {
  core: 10,
  later: 5,
  shoe: 5,
  starter: 5,
  strong: 2,
  weak: 1,
  runeKeystone: 7,
  runePrimaryMinor: 4,
  runeSecondaryMinor: 2,
  runeShard: 2,
}

const POSITIONS = ['top', 'jungle', 'mid', 'adc', 'support']
const championById = new Map(champions.map((c) => [c.heroId, c]))
const legendaryById = new Map(items.legendary.map((i) => [i.id, i]))
const LEGENDARY_IDS = items.legendary.map((i) => i.id)

/** heroId:position → { core:Set, later:Set, shoes:Set, starters:Set, runePages } */
const combos = []
const combosByKey = new Map()
for (const record of stats.ranks) {
  const key = `${record.heroId}:${record.position}`
  const entry = builds.index[key]
  const champion = championById.get(record.heroId)
  if (!entry || !champion) continue

  const core = new Set()
  for (const slot of entry.build?.core ?? []) for (const id of slot.itemIds) core.add(String(id))
  const later = new Set()
  for (const group of [entry.build?.forth, entry.build?.fifth, entry.build?.sixth]) {
    for (const slot of group ?? []) for (const id of slot.itemIds) later.add(String(id))
  }
  const shoes = new Set()
  for (const slot of entry.build?.shoes ?? []) for (const id of slot.itemIds) shoes.add(String(id))
  const starters = new Set()
  for (const slot of entry.build?.starting ?? []) for (const id of slot.itemIds) starters.add(String(id))

  const comboEntry = {
    champion,
    core,
    later,
    shoes,
    starters,
    runePages: entry.runePages,
    heroScore: record.laneScore + record.tierBonus,
  }
  combos.push(comboEntry)
  combosByKey.set(key, comboEntry)
}

// ---------------------------------------------------------------- 装备相容度

/** 装备对英雄的相容度 → 分数。判定规则见 docs/STRENGTH.md §5.1。 */
function compatScore(itemId, champion) {
  const cats = items.categories[itemId] ?? []
  const p = champion.profile ?? {}
  const roles = champion.roles ?? []

  const isAd = cats.includes('ad') || cats.includes('crit')
  const isAp = cats.includes('ap')
  const phys = p.damageType === 'kPhysical' || p.damageType === 'kMixed'
  const magic = p.damageType === 'kMagic' || p.damageType === 'kMixed'

  // 伤害类型匹配；装备没有伤害类别时为 null（不适用）
  let damageMatch = null
  if (isAd && isAp) damageMatch = true
  else if (isAd) damageMatch = phys
  else if (isAp) damageMatch = magic

  const tankish = cats.includes('tank') && ((p.durability ?? 0) >= 2 || roles.includes('tank'))
  const supportish = cats.includes('support') && ((p.utility ?? 0) >= 2 || roles.includes('support'))
  const marksmanish = cats.includes('crit') && roles.includes('marksman')
  const speedish =
    cats.includes('attackSpeed') && (roles.includes('marksman') || (p.damage ?? 0) >= 2)
  const damageRole = (isAd || isAp) && (p.damage ?? 0) >= 2
  const roleMatch = tankish || supportish || marksmanish || speedish || damageRole

  if (damageMatch === null) return roleMatch ? POINTS.strong : 0
  if (damageMatch && roleMatch) return POINTS.strong
  if (damageMatch || roleMatch) return POINTS.weak
  return 0
}

// ---------------------------------------------------------------- 符文

const keystonesByStyle = new Map()
const minorRowOf = new Map()
for (const style of runes.styles) {
  keystonesByStyle.set(style.id, style.keystones.map((r) => String(r.id)))
  for (const slot of style.minors) {
    for (const rune of slot.runes) minorRowOf.set(String(rune.id), `${style.id}|${slot.slot}`)
  }
}
const STYLE_IDS = runes.styles.map((s) => s.id)
const MINOR_ROWS = new Map(runes.styles.map((s) => [s.id, s.minors.map((m) => m.slot)]))
const minorIdsOf = (styleId, slot) =>
  [...minorRowOf.entries()].filter(([, k]) => k === `${styleId}|${slot}`).map(([id]) => id)
const shardRows = runes.shardRows.map((row) => row.runes.map((r) => String(r.id)))

/** 从推荐页（前 N 页）算出各槽位的「允许集合」。 */
function allowedSets(pages) {
  const keys = new Set()
  const minors = new Set()
  const shards = new Set()
  for (const page of pages.slice(0, RUNE_N)) {
    keys.add(String(page.keystone))
    for (const id of page.primaryRunes.slice(1)) minors.add(String(id))
    for (const id of page.secondaryRunes) minors.add(String(id))
    for (const id of page.shards) shards.add(String(id))
  }
  return { keys, minors, shards }
}

const pickFrom = (list, rng) => list[Math.floor(rng() * list.length)]

/** 按生成器结构抽一页符文并算分。 */
function rollRunes(allowed, rng) {
  const primary = pickFrom(STYLE_IDS, rng)
  let score = 0
  if (allowed.keys.has(pickFrom(keystonesByStyle.get(primary), rng))) score += POINTS.runeKeystone

  for (const slot of MINOR_ROWS.get(primary)) {
    if (allowed.minors.has(pickFrom(minorIdsOf(primary, slot), rng))) score += POINTS.runePrimaryMinor
  }

  const others = STYLE_IDS.filter((id) => id !== primary)
  const secondary = pickFrom(others, rng)
  const rows = [...MINOR_ROWS.get(secondary)]
  // 3 排里随机选 2 排
  rows.splice(Math.floor(rng() * rows.length), 1)
  for (const slot of rows) {
    if (allowed.minors.has(pickFrom(minorIdsOf(secondary, slot), rng))) score += POINTS.runeSecondaryMinor
  }

  for (const row of shardRows) {
    if (allowed.shards.has(pickFrom(row, rng))) score += POINTS.runeShard
  }
  return score
}

// ---------------------------------------------------------------- 模拟

let seed = 20260923
const rng = () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const totals = []
const parts = { hero: 0, item: 0, rune: 0 }
const compatHit = { strong: 0, weak: 0, none: 0, recommended: 0 }
let itemDraws = 0
let fallback = 0

for (let trial = 0; trial < TRIALS; trial++) {
  // **按游戏的真实抽样方式**：先随机英雄、再随机分路，然后去查有没有数据。
  // 早期版本是从「已覆盖的 239 条」里均匀抽，等于把覆盖率当成 100%，
  // 把英雄项高估了约 3.6 倍（239/865 = 27.6%）。
  const champion = champions[Math.floor(rng() * champions.length)]
  const position = POSITIONS[Math.floor(rng() * POSITIONS.length)]
  // 英雄分只在真实分路里查（查不到就是 0，决策 4）；
  // 构筑与符文在当前分路没数据时回退到该英雄的常用分路（用户定的口径）。
  const laneCombo = combosByKey.get(`${champion.heroId}:${position}`) ?? null
  const primary = stats.primaryPositions?.[champion.heroId]
  const combo = laneCombo ?? (primary ? combosByKey.get(`${champion.heroId}:${primary}`) ?? null : null)
  if (!laneCombo && combo) fallback++

  // 6 件成装：从 107 件池里抽（不重复，忽略唯一词条/远程专属以简化——它们不改变量级）
  const pool = [...LEGENDARY_IDS]
  let itemScore = 0
  for (let i = 0; i < 6; i++) {
    const id = String(pool.splice(Math.floor(rng() * pool.length), 1)[0])
    itemDraws++
    if (combo && combo.core.has(id)) itemScore += POINTS.core
    else if (combo && combo.later.has(id)) itemScore += POINTS.later
    else {
      const s = compatScore(id, champion)
      if (s === POINTS.strong) compatHit.strong++
      else if (s === POINTS.weak) compatHit.weak++
      else compatHit.none++
      itemScore += s
    }
  }
  // 鞋与出门装
  const boot = pickFrom(items.boots, rng).id
  if (combo && combo.shoes.has(boot)) itemScore += POINTS.shoe
  const starter = pickFrom(items.starterGeneric, rng).id
  if (combo && combo.starters.has(starter)) itemScore += POINTS.starter

  const runeScore = combo ? rollRunes(allowedSets(combo.runePages), rng) : 0

  const heroScore = laneCombo ? laneCombo.heroScore : 0
  parts.hero += heroScore
  parts.item += itemScore
  parts.rune += runeScore
  totals.push(heroScore + itemScore + runeScore)
}

totals.sort((a, b) => a - b)
const q = (p) => totals[Math.min(totals.length - 1, Math.floor(totals.length * p))]
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length

const T = mean(totals)
const ratioUnits = (v) => (v / T) * 14

console.log(`模拟 ${TRIALS} 次（${combos.length} 个英雄×分路组合，真实 101 数据）\n`)
console.log(`  其中构筑/符文回退到常用分路的比例：${((fallback / TRIALS) * 100).toFixed(1)}%\n`)
console.log('=== 三块的平均贡献 ===')
console.log(`  英雄  ${(parts.hero / TRIALS).toFixed(2)}`)
console.log(`  装备  ${(parts.item / TRIALS).toFixed(2)}`)
console.log(`  符文  ${(parts.rune / TRIALS).toFixed(2)}`)
console.log(`  总分  ${T.toFixed(2)}`)
console.log('\n=== 实际比例（归一化到总和 14；目标 6 : 5 : 3）===')
console.log(
  `  ${ratioUnits(parts.hero / TRIALS).toFixed(2)} : ${ratioUnits(parts.item / TRIALS).toFixed(2)} : ${ratioUnits(parts.rune / TRIALS).toFixed(2)}`,
)

console.log('\n=== 装备项拆解（用来反推相容分）===')
const totalDraws = compatHit.recommended + compatHit.strong + compatHit.weak + compatHit.none
console.log(`  成装抽取 ${itemDraws} 次；其中不在推荐列表里的 ${totalDraws} 次，占比 ${((totalDraws / itemDraws) * 100).toFixed(1)}%`)
console.log(`    强相容 ${((compatHit.strong / totalDraws) * 100).toFixed(1)}%`)
console.log(`    弱相容 ${((compatHit.weak / totalDraws) * 100).toFixed(1)}%`)
console.log(`    不相容 ${((compatHit.none / totalDraws) * 100).toFixed(1)}%`)

console.log('\n=== 总分分布（用于切挡位区间）===')
for (const p of [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 1]) {
  console.log(`  p${String(Math.round(p * 100)).padStart(2)}  ${q(p).toFixed(1)}`)
}

console.log('\n=== 若三档按分位切（仅供参考，最终由用户定）===')
console.log(`  区        p0  ~ p33  ${q(0).toFixed(0)} ~ ${q(0.33).toFixed(0)}`)
console.log(`  爬行动物   p33 ~ p66  ${q(0.33).toFixed(0)} ~ ${q(0.66).toFixed(0)}`)
console.log(`  类人      p66 ~ p100 ${q(0.66).toFixed(0)} ~ ${q(1).toFixed(0)}`)
