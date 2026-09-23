#!/usr/bin/env node
/**
 * 分析「符文命中」在不同 N（取前 N 个推荐页）下的分数分布。
 *
 * 用来回答一个具体问题：**N 取多少合适**。
 * 用户已定「路线 B = 逐项匹配」，即：随出的每一项只要在推荐页里出现过就算命中。
 * N 越大越容易命中、分数越虚高；N 太小则这项恒为 0。所以要看出方差再选。
 *
 * 期望值按**我们生成器的真实结构**算，而不是拍脑袋估：
 *   主系随机 1/5 系 → 基石该系等概率 → 3 排各等概率
 *   副系从其余 4 系随机 → 3 排里随机选 2 排 → 每排等概率
 *   小符文 3 排各等概率
 *
 * 用法：node scripts/analyze-rune-score.mjs
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'))

/** docs/STRENGTH.md §2 决策 8 */
const WEIGHT = { keystone: 15, primaryMinor: 8, secondaryMinor: 5, shard: 5 }

const runes = await read('src/data/runes.json')
const builds = await read('src/data/rift-builds.json')

// ---- 从 runes.json 建索引：符文 id → 它属于哪个系的哪一排 -------------------

/** 基石：styleId → Set<runeId> */
const keystonesByStyle = new Map()
/** 系内小符文：runeId → `${styleId}|${slot}` */
const minorRowOf = new Map()
for (const style of runes.styles) {
  keystonesByStyle.set(style.id, new Set(style.keystones.map((r) => String(r.id))))
  for (const slot of style.minors) {
    for (const rune of slot.runes) minorRowOf.set(String(rune.id), `${style.id}|${slot.slot}`)
  }
}
/** 小符文排：行下标 → Set<runeId> */
const shardRowOf = runes.shardRows.map((row) => new Set(row.runes.map((r) => String(r.id))))

const STYLE_IDS = runes.styles.map((s) => s.id)
const MINOR_ROWS_OF_STYLE = new Map(
  runes.styles.map((s) => [s.id, s.minors.map((m) => ({ slot: m.slot, size: m.runes.length }))]),
)

/**
 * 算某个英雄×分路在「取前 N 页」下的符文项期望分。
 * 返回 { expected, hitRate, keystoneHit } 便于看这一项到底贡献多少。
 */
function expectedScore(pages, n) {
  const top = pages.slice(0, n)
  if (top.length === 0) return { expected: 0, keystoneHit: 0 }

  // 允许集合：分别按「基石 / 系内排 / 小符文排」收集
  const allowedKeystones = new Set()
  const allowedMinors = new Set()
  const allowedShards = new Set()
  for (const page of top) {
    allowedKeystones.add(String(page.keystone))
    for (const id of page.primaryRunes.slice(1)) allowedMinors.add(String(id))
    for (const id of page.secondaryRunes) allowedMinors.add(String(id))
    for (const id of page.shards) allowedShards.add(String(id))
  }

  // 基石：Σ_S (1/5) × |允许 ∩ S.keystones| / |S.keystones|
  let keystoneHit = 0
  for (const styleId of STYLE_IDS) {
    const pool = keystonesByStyle.get(styleId)
    const hit = [...pool].filter((id) => allowedKeystones.has(id)).length
    keystoneHit += (1 / STYLE_IDS.length) * (hit / pool.size)
  }

  // 主系小符文：Σ_S (1/5) × Σ_{3 排} 命中率
  let primaryHit = 0
  for (const styleId of STYLE_IDS) {
    for (const row of MINOR_ROWS_OF_STYLE.get(styleId)) {
      const runeIds = [...minorRowOf.entries()]
        .filter(([, key]) => key === `${styleId}|${row.slot}`)
        .map(([id]) => id)
      const hit = runeIds.filter((id) => allowedMinors.has(id)).length
      primaryHit += (1 / STYLE_IDS.length) * (hit / runeIds.length)
    }
  }

  // 副系小符文：外乘 2/3（3 排随机选 2 排），且副系从其余 4 系里选
  let secondaryHit = 0
  for (const styleId of STYLE_IDS) {
    const others = STYLE_IDS.filter((id) => id !== styleId)
    for (const otherId of others) {
      for (const row of MINOR_ROWS_OF_STYLE.get(otherId)) {
        const runeIds = [...minorRowOf.entries()]
          .filter(([, key]) => key === `${otherId}|${row.slot}`)
          .map(([id]) => id)
        const hit = runeIds.filter((id) => allowedMinors.has(id)).length
        secondaryHit += (1 / STYLE_IDS.length) * (1 / others.length) * (2 / 3) * (hit / runeIds.length)
      }
    }
  }

  // 小符文：3 排各等概率
  let shardHit = 0
  for (const row of shardRowOf) {
    const hit = [...row].filter((id) => allowedShards.has(id)).length
    shardHit += hit / row.size
  }

  const expected =
    WEIGHT.keystone * keystoneHit +
    WEIGHT.primaryMinor * primaryHit +
    WEIGHT.secondaryMinor * secondaryHit +
    WEIGHT.shard * shardHit

  const max = WEIGHT.keystone + WEIGHT.primaryMinor * 3 + WEIGHT.secondaryMinor * 2 + WEIGHT.shard * 3
  return { expected, keystoneHit, hitRate: expected / max, max }
}

function quantile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
}

console.log(`组合数 ${builds.meta.combos}，101 版本 ${builds.meta.version}\n`)
console.log('符文项理论满分 = 15 + 8×3 + 5×2 + 5×3 = ' + (15 + 24 + 10 + 15) + ' 分\n')

const combos = Object.entries(builds.index).filter(([, v]) => v.runePages.length > 0)
const NS = [1, 3, 5, 8, 10, 12]

console.log('N  | 期望分 mean | median | p10   | p90   | 平均命中率 | 期望分/满分')
console.log('---|-------------|--------|-------|-------|-----------|-----------')
const table = {}
for (const n of NS) {
  const values = combos.map(([, v]) => expectedScore(v.runePages, n).expected)
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  table[n] = { mean, median: quantile(sorted, 0.5), p10: quantile(sorted, 0.1), p90: quantile(sorted, 0.9), min: sorted[0], max: sorted[sorted.length - 1] }
  console.log(
    `${String(n).padStart(2)} | ${mean.toFixed(2).padStart(11)} | ${table[n].median.toFixed(2).padStart(6)} | ` +
      `${table[n].p10.toFixed(2).padStart(5)} | ${table[n].p90.toFixed(2).padStart(5)} | ` +
      `${((mean / 64) * 100).toFixed(1).padStart(8)}% | ${mean.toFixed(1)}/64`,
  )
}

console.log('\n各 N 下「期望分」在 239 个组合间的极差（越大说明越不稳定）：')
for (const n of NS) {
  const t = table[n]
  console.log(`  N=${String(n).padStart(2)}  极差 ${(t.max - t.min).toFixed(2)}  (min ${t.min.toFixed(1)} ~ max ${t.max.toFixed(1)})`)
}

console.log('\n符文页数量分布（有多少组合给出几页）：')
const pageCounts = {}
for (const [, v] of combos) pageCounts[v.runePages.length] = (pageCounts[v.runePages.length] ?? 0) + 1
for (const [count, times] of Object.entries(pageCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count} 页：${times} 个组合`)
}
