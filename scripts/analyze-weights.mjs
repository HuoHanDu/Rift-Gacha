#!/usr/bin/env node
/**
 * 算出三块分数（英雄 / 装备 / 符文）在**真实数据下的当前期望值**，
 * 并解出把它们对齐到目标比例所需的倍率。
 *
 * 用途：用户希望 英雄 : 装备 : 符文 ≈ 6 : 5 : 3。
 * 光调数字容易拍脑袋，所以先量化：
 *
 * - 英雄项：直接从 `rift-stats.json` 的 239 条记录统计（laneScore + tierBonus）
 * - 装备项：用 101 的推荐装备列表 ∩ 我们的 107 件传说池，算"随机一件命中推荐"的概率，
 *   再乘每件的分值。**只算「推荐命中」部分**，不含「强相容 +4 / 弱相容 +1」——
 *   后者要等装备分类表做出来才能算，所以下面的装备期望是**下界**。
 * - 符文项：复用 analyze-rune-score.mjs 的算法，N=5
 *
 * 用法：node scripts/analyze-weights.mjs
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'))

const stats = await read('src/data/rift-stats.json')
const builds = await read('src/data/rift-builds.json')
const items = await read('src/data/items.json')
const runes = await read('src/data/runes.json')

const LEGENDARY_POOL = new Set(items.legendary.map((i) => i.id))
const BOOTS = new Set(items.boots.map((i) => i.id))
const RUNE_N = 5

const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length
const pct = (x) => (x * 100).toFixed(1) + '%'

// ---------------------------------------------------------------- 英雄项

const heroScores = stats.ranks.map((r) => r.laneScore + r.tierBonus)
const HERO = { mean: mean(heroScores), median: [...heroScores].sort((a, b) => a - b)[Math.floor(heroScores.length / 2)] }

// ---------------------------------------------------------------- 装备项

/**
 * 对每个英雄×分路，算出"从 107 件传说池里随机抽一件，命中推荐列表"的概率。
 * 分两档：core（优先成装，+10）与 later（第 4/5/6 件，+5）。
 * core_details 是 3 件一组的捆绑，取其并集作为核心装备集合。
 */
const itemRows = []
for (const [key, value] of Object.entries(builds.index)) {
  const build = value.build
  if (!build) continue
  const core = new Set()
  for (const slot of build.core) for (const id of slot.itemIds) core.add(String(id))
  const later = new Set()
  for (const group of [build.forth, build.fifth, build.sixth]) {
    for (const slot of group) for (const id of slot.itemIds) later.add(String(id))
  }
  // 鞋子池与出门装池的命中率也顺手算
  const shoeHit = new Set(build.shoes.flatMap((s) => s.itemIds.map(String)))
  const starterHit = new Set(build.starting.flatMap((s) => s.itemIds.map(String)))

  const coreInPool = [...core].filter((id) => LEGENDARY_POOL.has(id)).length
  const laterInPool = [...later].filter((id) => LEGENDARY_POOL.has(id)).length

  itemRows.push({
    key,
    coreRate: coreInPool / LEGENDARY_POOL.size,
    laterRate: laterInPool / LEGENDARY_POOL.size,
    shoeRate: [...shoeHit].filter((id) => BOOTS.has(id)).length / BOOTS.size,
    starterRate: [...starterHit].length / items.starterGeneric.length,
  })
}

/** 单次随机的装备项期望分（只算推荐命中部分）。 */
const ITEM_POINTS = { core: 10, later: 5, shoe: 5, starter: 5 }
const itemScores = itemRows.map(
  (row) =>
    6 * (row.coreRate * ITEM_POINTS.core + row.laterRate * ITEM_POINTS.later) +
    row.shoeRate * ITEM_POINTS.shoe +
    row.starterRate * ITEM_POINTS.starter,
)
const ITEM = {
  mean: mean(itemScores),
  max: 6 * ITEM_POINTS.core + ITEM_POINTS.shoe + ITEM_POINTS.starter,
  avgCoreRate: mean(itemRows.map((r) => r.coreRate)),
  avgLaterRate: mean(itemRows.map((r) => r.laterRate)),
  avgShoeRate: mean(itemRows.map((r) => r.shoeRate)),
}

// ---------------------------------------------------------------- 符文项

const keystonesByStyle = new Map()
const minorRowOf = new Map()
for (const style of runes.styles) {
  keystonesByStyle.set(style.id, new Set(style.keystones.map((r) => String(r.id))))
  for (const slot of style.minors) {
    for (const rune of slot.runes) minorRowOf.set(String(rune.id), `${style.id}|${slot.slot}`)
  }
}
const shardRowOf = runes.shardRows.map((row) => new Set(row.runes.map((r) => String(r.id))))
const STYLE_IDS = runes.styles.map((s) => s.id)
const MINOR_ROWS = new Map(runes.styles.map((s) => [s.id, s.minors.map((m) => m.slot)]))

const RUNE_POINTS = { keystone: 15, primaryMinor: 8, secondaryMinor: 5, shard: 5 }

function runeExpected(pages) {
  const top = pages.slice(0, RUNE_N)
  if (top.length === 0) return 0
  const keys = new Set()
  const minors = new Set()
  const shards = new Set()
  for (const page of top) {
    keys.add(String(page.keystone))
    for (const id of page.primaryRunes.slice(1)) minors.add(String(id))
    for (const id of page.secondaryRunes) minors.add(String(id))
    for (const id of page.shards) shards.add(String(id))
  }
  const rowIds = (styleId, slot) =>
    [...minorRowOf.entries()].filter(([, k]) => k === `${styleId}|${slot}`).map(([id]) => id)

  let keystoneHit = 0
  let primaryHit = 0
  let secondaryHit = 0
  for (const styleId of STYLE_IDS) {
    const pool = keystonesByStyle.get(styleId)
    keystoneHit += (1 / STYLE_IDS.length) * ([...pool].filter((id) => keys.has(id)).length / pool.size)
    for (const slot of MINOR_ROWS.get(styleId)) {
      const ids = rowIds(styleId, slot)
      primaryHit += (1 / STYLE_IDS.length) * (ids.filter((id) => minors.has(id)).length / ids.length)
    }
    const others = STYLE_IDS.filter((id) => id !== styleId)
    for (const otherId of others) {
      for (const slot of MINOR_ROWS.get(otherId)) {
        const ids = rowIds(otherId, slot)
        secondaryHit +=
          (1 / STYLE_IDS.length) * (1 / others.length) * (2 / 3) * (ids.filter((id) => minors.has(id)).length / ids.length)
      }
    }
  }
  let shardHit = 0
  for (const row of shardRowOf) shardHit += [...row].filter((id) => shards.has(id)).length / row.size

  return (
    RUNE_POINTS.keystone * keystoneHit +
    RUNE_POINTS.primaryMinor * primaryHit +
    RUNE_POINTS.secondaryMinor * secondaryHit +
    RUNE_POINTS.shard * shardHit
  )
}

const runeScores = Object.values(builds.index)
  .filter((v) => v.runePages.length > 0)
  .map((v) => runeExpected(v.runePages))
const RUNE = { mean: mean(runeScores), max: 64 }

// ---------------------------------------------------------------- 输出

console.log(`样本：${stats.ranks.length} 个英雄×分路组合（101 版本 ${stats.meta.version}）\n`)
console.log('=== 三块的当前期望值 ===')
console.log(`  英雄项  期望 ${HERO.mean.toFixed(2).padStart(6)}   中位 ${HERO.median.toFixed(2)}`)
console.log(`  装备项  期望 ${ITEM.mean.toFixed(2).padStart(6)}   （仅推荐命中部分，是下界；满分 ${ITEM.max}）`)
console.log(`  符文项  期望 ${RUNE.mean.toFixed(2).padStart(6)}   （N=${RUNE_N}，满分 ${RUNE.max}）`)
console.log(`  合计    期望 ${(HERO.mean + ITEM.mean + RUNE.mean).toFixed(2)}`)

const sum = HERO.mean + ITEM.mean + RUNE.mean
console.log('\n=== 当前实际比例 ===')
console.log(
  `  英雄 : 装备 : 符文 = ${((HERO.mean / sum) * 14).toFixed(2)} : ${((ITEM.mean / sum) * 14).toFixed(2)} : ${((RUNE.mean / sum) * 14).toFixed(2)}  （归一化到总和 14）`,
)

console.log('\n=== 装备项细节（说明为什么它这么大）===')
console.log(`  随机一件命中「优先成装」的概率  平均 ${pct(ITEM.avgCoreRate)}  （即平均 ${(ITEM.avgCoreRate * 107).toFixed(1)} 件核心装在池里）`)
console.log(`  随机一件命中「第4/5/6件」的概率 平均 ${pct(ITEM.avgLaterRate)}  （即平均 ${(ITEM.avgLaterRate * 107).toFixed(1)} 件）`)
console.log(`  鞋命中率 平均 ${pct(ITEM.avgShoeRate)}`)

console.log('\n=== 要对齐到 6 : 5 : 3，各块需要的倍率 ===')
const TOTAL = 14
const target = { hero: 6 / TOTAL, item: 5 / TOTAL, rune: 3 / TOTAL }
for (const [name, current, want] of [
  ['英雄', HERO.mean, target.hero],
  ['装备', ITEM.mean, target.item],
  ['符文', RUNE.mean, target.rune],
]) {
  console.log(`  ${name}：当前占比 ${pct(current / sum)} → 目标 ${pct(want)}，需 ×${(want * sum / current).toFixed(2)}`)
}
