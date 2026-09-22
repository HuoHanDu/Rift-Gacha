#!/usr/bin/env node
/**
 * 抓取官方公开数据 → 生成 src/data/*.json 快照。
 *
 * 口径见 docs/DATA.md §2，流程见 §4。
 * 设计取舍：**宁可失败也不静默漂移**。结构性不变量不满足时以非 0 退出且不覆盖旧快照；
 * 只有「随版本正常变化」的数量（英雄数、传说装备数）才允许漂移，且会打印新旧差异。
 */

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { championUrl, CROSS_CHECK, SOURCES } from './lib/sources.mjs'
import {
  SPEC,
  normalizeChampions,
  normalizeItems,
  normalizeRunes,
  normalizeSpells,
} from './lib/normalize.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'src', 'data')

// ---------------------------------------------------------------- 抓取

async function fetchJson(url, label, { retries = 3, timeoutMs = 20000 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'lol-random-build/0.1 (data snapshot script)' },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }
      const text = await response.text()
      // 源文件后缀是 .js，但内容是纯 JSON。
      return JSON.parse(text)
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        const wait = 500 * attempt
        process.stdout.write(`  ${label} 第 ${attempt} 次失败（${error.message}），${wait}ms 后重试\n`)
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
    }
  }
  throw new Error(`抓取 ${label} 失败（${retries} 次尝试）：${lastError?.message}`)
}

/**
 * 逐个抓英雄的 `tacticalInfo.attackType`，返回 Map<heroId, 'melee'|'ranged'>。
 *
 * 173 次请求，所以限并发（默认 8）并复用 fetchJson 的重试。
 * 任何一个英雄拿不到分类就整体失败——**宁可失败也不要猜**，
 * 猜错会让近战英雄随机出卢安娜的飓风。
 */
async function fetchAttackTypes(heroes, concurrency = 8) {
  const result = new Map()
  const queue = [...heroes]

  async function worker() {
    while (queue.length > 0) {
      const hero = queue.shift()
      const heroId = String(hero.heroId)
      const raw = await fetchJson(championUrl(heroId), `英雄 ${heroId} ${hero.alias}`)
      const attackType = raw?.tacticalInfo?.attackType
      if (attackType !== 'melee' && attackType !== 'ranged') {
        throw new Error(
          `英雄 ${heroId} ${hero.alias} 的 tacticalInfo.attackType 异常：${JSON.stringify(attackType)}`,
        )
      }
      result.set(heroId, attackType)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()))
  return result
}

// ---------------------------------------------------------------- 断言

function assertSnapshot(snapshot) {
  const { champions, items, runes, spells } = snapshot
  const c = SPEC.expectedCounts
  const failures = []
  const check = (condition, message) => {
    if (!condition) failures.push(message)
  }
  const eq = (actual, expected, label) => {
    check(actual === expected, `${label}：期望 ${expected}，实际 ${actual}`)
  }

  // 英雄
  check(champions.length >= c.championsMin, `英雄数 ${champions.length} 少于下限 ${c.championsMin}`)
  eq(new Set(champions.map((x) => x.heroId)).size, champions.length, '英雄 ID 去重后数量')
  check(
    champions.every((x) => x.heroId !== '' && x.alias !== '' && x.icon !== ''),
    '存在缺少 alias 或 icon 的英雄（图标 URL 拼不出来）',
  )

  // 装备
  eq(items.boots.length, c.boots, '未升级鞋数量')
  eq(items.bootsUpgraded.length, c.boots, '升级鞋数量')
  eq(Object.keys(items.bootsUpgradeMap).length, c.boots, '鞋子升级映射条目数')
  eq(items.starterGeneric.length, c.starterGeneric, '通用出门装数量')
  eq(items.starterJungle.length, c.starterJungle, '打野蛋数量')
  eq(items.supportQuestUpgrades.length, c.supportQuestUpgrades, '辅助任务升级件数量')
  check(SPEC.boots.every((id) => items.boots.some((b) => b.id === id)), '鞋池与登记 ID 列表不一致')
  check(
    Object.entries(items.bootsUpgradeMap).every(([from, to]) => from !== to),
    '存在 from === to 的鞋子升级映射',
  )
  check(
    Object.values(items.bootsUpgradeMap).every((id) => items.bootsUpgraded.some((b) => b.id === id)),
    '升级鞋池与升级映射不闭合',
  )
  check(items.legendary.length > 0, '传说池为空')
  eq(new Set(items.legendary.map((i) => i.id)).size, items.legendary.length, '传说池去重后数量')
  const bootLeak = items.legendary.filter((i) => i.types.includes('Boots')).map((i) => i.id)
  check(bootLeak.length === 0, `传说池中出现了鞋子：${bootLeak.join(',')}`)
  const excluded = new Set(SPEC.excludedFromLegendary)
  const questLeak = items.legendary.filter((i) => excluded.has(i.id)).map((i) => i.id)
  check(questLeak.length === 0, `传说池中出现了任务专属件：${questLeak.join(',')}`)
  check(
    items.legendary.every((i) => i.id !== '' && i.name !== '' && i.icon !== ''),
    '存在缺少 id/name/icon 的传说装备',
  )

  // 符文
  eq(runes.styles.length, c.styles, '符文系数量')
  eq(runes.shardRows.length, c.shardRows, '小符文排数')
  for (const row of runes.shardRows) {
    eq(row.runes.length, c.shardRowSize, `小符文排「${row.slot}」的候选数`)
  }
  for (const style of runes.styles) {
    check(style.keystones.length >= 3, `系「${style.name}」的基石数 ${style.keystones.length} 少于 3`)
    eq(style.minors.length, c.minorSlotsPerStyle, `系「${style.name}」的系内小符文排数`)
    for (const slot of style.minors) {
      eq(slot.runes.length, c.minorSlotSize, `系「${style.name}」排「${slot.slot}」的候选数`)
    }
  }
  SPEC.expectedShardRows.forEach((expected, index) => {
    const actual = runes.shardRows[index]
    if (!actual) return
    eq(actual.slot, expected.slot, `第 ${index + 1} 排小符文的名称`)
    const got = actual.runes.map((r) => r.id).sort().join(',')
    const want = [...expected.ids].sort().join(',')
    check(got === want, `第 ${index + 1} 排小符文构成不符：期望 ${want}，实际 ${got}`)
  })
  const inspiration = runes.styles.find((s) => s.id === '8300')
  check(Boolean(inspiration), '缺少 8300 启迪系')
  const tools = inspiration?.minors.find((m) => m.slot === '巧具')
  check(Boolean(tools), '启迪系缺少「巧具」排（海克斯科技闪现罗网所在排）')
  check(
    Boolean(tools?.runes.some((r) => r.id === '8306')),
    '「巧具」排缺少 8306 海克斯科技闪现罗网',
  )

  // 召唤师技能
  eq(spells.length, c.spells, '峡谷可用召唤师技能数')
  const spellIds = new Set(spells.map((s) => s.id))
  check(spellIds.has(SPEC.requiredSpells.flash), '缺少 4 闪现')
  check(spellIds.has(SPEC.requiredSpells.smite), '缺少 11 惩戒')
  for (const bad of SPEC.excludedSpells) {
    check(!spellIds.has(bad), `出现了应排除的召唤师技能 ${bad}`)
  }

  return failures
}

// ---------------------------------------------------------------- 输出

async function readPreviousCounts() {
  try {
    const meta = JSON.parse(await readFile(path.join(OUT_DIR, 'meta.json'), 'utf8'))
    return meta?.counts ?? null
  } catch {
    return null
  }
}

async function writeJsonAtomic(fileName, value) {
  const target = path.join(OUT_DIR, fileName)
  const temp = `${target}.tmp`
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  try {
    await rename(temp, target)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
}

async function main() {
  process.stdout.write('抓取数据源…\n')
  const [heroRaw, itemsRaw, itemsExtRaw, runesRaw, spellsRaw, cdStyles, cdPerks] = await Promise.all([
    fetchJson(SOURCES.champions, '英雄列表'),
    fetchJson(SOURCES.items, '装备列表'),
    fetchJson(SOURCES.itemsExt, '装备分类扩展'),
    fetchJson(SOURCES.runes, '符文列表'),
    fetchJson(SOURCES.spells, '召唤师技能'),
    fetchJson(CROSS_CHECK.perkStyles, '符文交叉校验(perkstyles)'),
    fetchJson(CROSS_CHECK.perks, '符文交叉校验(perks)'),
  ])

  process.stdout.write('抓取英雄近战/远程分类（每人一次请求，约 173 次）…\n')
  const attackTypes = await fetchAttackTypes(heroRaw.hero)

  process.stdout.write('规格化…\n')
  const snapshot = {
    champions: normalizeChampions(heroRaw, attackTypes),
    items: normalizeItems(itemsRaw, itemsExtRaw),
    runes: normalizeRunes(runesRaw, cdStyles, cdPerks),
    spells: normalizeSpells(spellsRaw),
  }

  process.stdout.write('校验…\n')
  const failures = assertSnapshot(snapshot)
  if (failures.length > 0) {
    process.stderr.write(`\n✗ 快照校验未通过，共 ${failures.length} 项：\n`)
    for (const failure of failures) process.stderr.write(`  · ${failure}\n`)
    process.stderr.write(
      '\n已保留旧快照，未写入任何文件。\n' +
        '若这是版本更新导致的口径变化，请修改 scripts/lib/normalize.mjs 的 SPEC 常量，' +
        '并同步 docs/DATA.md 与 docs/RULES.md。\n',
    )
    process.exitCode = 1
    return
  }

  const counts = {
    champions: snapshot.champions.length,
    legendary: snapshot.items.legendary.length,
    boots: snapshot.items.boots.length,
    bootsUpgraded: snapshot.items.bootsUpgraded.length,
    starterGeneric: snapshot.items.starterGeneric.length,
    starterJungle: snapshot.items.starterJungle.length,
    supportQuestUpgrades: snapshot.items.supportQuestUpgrades.length,
    spells: snapshot.spells.length,
    styles: snapshot.runes.styles.length,
    shardRows: snapshot.runes.shardRows.length,
  }

  const meta = {
    patch: String(heroRaw.version ?? 'unknown'),
    fetchedAt: new Date().toISOString(),
    counts,
    sources: { ...SOURCES, ...CROSS_CHECK },
  }

  // 必须在新 meta.json 落盘之前读，否则读到的就是刚写进去的自己。
  const previous = await readPreviousCounts()

  await mkdir(OUT_DIR, { recursive: true })
  await writeJsonAtomic('champions.json', snapshot.champions)
  await writeJsonAtomic('items.json', snapshot.items)
  await writeJsonAtomic('runes.json', snapshot.runes)
  await writeJsonAtomic('spells.json', snapshot.spells)
  await writeJsonAtomic('meta.json', meta)

  process.stdout.write(`\n✓ 快照已写入 src/data/（patch ${meta.patch}）\n`)
  for (const [key, value] of Object.entries(counts)) {
    const before = previous?.[key]
    const drift = before === undefined ? '' : before === value ? '（未变）' : `  ← 上次 ${before}`
    process.stdout.write(`  ${key.padEnd(22)} ${String(value).padStart(4)}${drift}\n`)
  }

  // 允许正常漂移的量：只提示，不失败。
  const drifting = Object.entries(counts).filter(
    ([key, value]) => previous && previous[key] !== undefined && previous[key] !== value,
  )
  if (drifting.length > 0) {
    process.stdout.write(
      `\n注意：${drifting.map(([k]) => k).join('、')} 与上次快照不同。` +
        '若属于版本正常变化，请同步更新 docs/DATA.md 中记录的条数。\n',
    )
  }
}

main().catch((error) => {
  process.stderr.write(`\n✗ 数据刷新失败：${error?.stack ?? error}\n`)
  process.exitCode = 1
})
