#!/usr/bin/env node
/**
 * 批量抓取「单英雄 × 分路」的构筑与符文数据，生成 `src/data/rift-builds.json`。
 *
 * 依赖 `npm run fetch:101` 先跑过（需要 `src/data/rift-stats.json` 里的英雄×分路清单）。
 *
 * 接口参数与载荷格式见 `docs/STRENGTH.md` §7 与 `scripts/fetch-101.mjs` 顶部注释。
 * 这里只重复三个最容易再踩的坑：`lane` 大写且中单是 `MIDDLE`、
 * `version_id` 用版本号字符串、信封里的字符串本身还是 JSON。
 */

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { QQ101 } from './lib/sources.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'src', 'data')

/** 我们内部的位置名 → 101 的大写分路串。中单是 MIDDLE。 */
const POSITION_TO_LANE = {
  top: 'TOP',
  jungle: 'JUNGLE',
  mid: 'MIDDLE',
  adc: 'BOTTOM',
  support: 'SUPPORT',
}

/** 符文页只保留前 N 页，避免快照过大。分析阶段会再按 N 截断。 */
const KEEP_RUNE_PAGES = 12

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) rift-gacha/0.1',
  referer: 'https://101.qq.com/',
  accept: 'application/json',
}

async function get(url, timeoutMs = 30000, retries = 3) {
  let lastError
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 400 * attempt))
    }
  }
  throw lastError
}

function unwrap(payload, field) {
  const value = payload?.data?._fieldValues?.[field]
  return typeof value === 'string' ? value : ''
}

/** 信封里的字符串本身还是 JSON。空数据时返回 null。 */
function parseInner(rawString) {
  if (!rawString) return null
  try {
    const parsed = JSON.parse(rawString)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function buildUrl(version, lane, championId, suffix = '') {
  return (
    `${QQ101.base}${QQ101.rift}${suffix}` +
    `?itier=255&version_id=${encodeURIComponent(version)}` +
    `&lane=${lane}&championid=${championId}`
  )
}

/**
 * 解析 `装备id们_排名_登场率_胜率` 形式的列表。
 * `starting_details` / `shoes_details` / `core_details` / `forth|fifth|sixth_details` 都是这个格式。
 */
function parseEquipment(text) {
  if (!text || text === '-1') return []
  return text
    .split('#')
    .filter(Boolean)
    .map((row, index) => {
      const f = row.split('_')
      const itemIds = (f[0] ?? '')
        .split(',')
        .map((id) => Number.parseInt(id, 10))
        .filter((id) => Number.isFinite(id) && id > 0)
      return {
        rank: Number.parseInt(f[1], 10) || index + 1,
        itemIds,
        pickRate: Number.parseFloat(f[2]),
        winRate: Number.parseFloat(f[3]),
      }
    })
    .filter((slot) => slot.itemIds.length > 0)
}

/**
 * 解析符文页列表：`排名_基石_副系代码_9个id_登场率_胜率_场次`。
 * 9 个 id 的构成：主系 4（基石 + 3 排）+ 副系 2 + 小符文 3。
 */
function parseRunePages(text) {
  if (!text || text === '-1') return []
  return text
    .split('#')
    .filter(Boolean)
    .map((row) => {
      const f = row.split('_')
      const runeIds = (f[3] ?? '')
        .split(',')
        .map((id) => Number.parseInt(id, 10))
        .filter((id) => Number.isFinite(id) && id > 0)
      if (runeIds.length < 9) return null
      return {
        rank: Number.parseInt(f[0], 10) || 1,
        keystone: runeIds[0],
        secondaryStyleCode: f[2] ?? '',
        primaryRunes: runeIds.slice(0, 4),
        secondaryRunes: runeIds.slice(4, 6),
        shards: runeIds.slice(6, 9),
        pickRate: Number.parseFloat(f[4]),
        winRate: Number.parseFloat(f[5]),
        games: Number.parseInt(f[6], 10) || 0,
      }
    })
    .filter(Boolean)
    .slice(0, KEEP_RUNE_PAGES)
}

async function fetchOne(version, heroId, position) {
  const lane = POSITION_TO_LANE[position]
  // 注意：构筑端点是 `lol_101strategy_build`、符文是 `lol_101strategy_runeinfo`，
  // 都要带后缀。漏了后缀不会报错，只会**静默返回空**（踩过：符文对了、构筑全空）。
  const [buildJson, runeJson] = await Promise.all([
    get(buildUrl(version, lane, heroId, '_build')),
    get(buildUrl(version, lane, heroId, '_runeinfo')),
  ])

  const build = parseInner(unwrap(buildJson, QQ101.fields.build))
  const runes = parseInner(unwrap(runeJson, QQ101.fields.runes))

  return {
    heroId,
    position,
    build: build
      ? {
          date: build.dtstatdate ?? null,
          starting: parseEquipment(build.starting_details),
          shoes: parseEquipment(build.shoes_details),
          core: parseEquipment(build.core_details),
          forth: parseEquipment(build.forth_details),
          fifth: parseEquipment(build.fifth_details),
          sixth: parseEquipment(build.sixth_details),
        }
      : null,
    runePages: runes ? parseRunePages(runes.rune_top_details) : [],
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  let done = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
      done++
      if (done % 20 === 0) process.stdout.write(`  已抓 ${done}/${items.length}\n`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

async function writeJsonAtomic(fileName, value) {
  const target = path.join(OUT_DIR, fileName)
  const temp = `${target}.tmp`
  await writeFile(temp, `${JSON.stringify(value)}\n`, 'utf8')
  try {
    await rename(temp, target)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
}

async function main() {
  const stats = JSON.parse(await readFile(path.join(OUT_DIR, 'rift-stats.json'), 'utf8'))
  const version = stats.meta.version
  const pairs = stats.ranks.map((record) => ({ heroId: record.heroId, position: record.position }))

  process.stdout.write(`版本 ${version}，待抓 ${pairs.length} 个英雄×分路组合…\n`)

  const results = await mapLimit(pairs, 6, async (pair) => {
    try {
      return await fetchOne(version, pair.heroId, pair.position)
    } catch (error) {
      process.stdout.write(`  ✗ ${pair.heroId}/${pair.position}: ${error?.message ?? error}\n`)
      return { heroId: pair.heroId, position: pair.position, build: null, runePages: [], error: String(error?.message ?? error) }
    }
  })

  const withBuild = results.filter((r) => r.build).length
  const withRunes = results.filter((r) => r.runePages.length > 0).length
  if (withRunes < pairs.length * 0.8) {
    throw new Error(`只有 ${withRunes}/${pairs.length} 个组合拿到符文页，疑似参数或格式变化`)
  }

  // 索引键：`heroId:position`
  const index = {}
  for (const item of results) {
    index[`${item.heroId}:${item.position}`] = {
      build: item.build,
      runePages: item.runePages,
    }
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeJsonAtomic('rift-builds.json', {
    meta: {
      source: '101.qq.com',
      version,
      fetchedAt: new Date().toISOString(),
      combos: results.length,
      withBuild,
      withRunes,
      keepRunePages: KEEP_RUNE_PAGES,
      failed: results.filter((r) => r.error).length,
    },
    index,
  })

  process.stdout.write(`\n✓ 已写入 src/data/rift-builds.json\n`)
  process.stdout.write(`  组合 ${results.length}，有构筑 ${withBuild}，有符文页 ${withRunes}\n`)
}

main().catch((error) => {
  process.stderr.write(`\n✗ 抓取失败：${error?.message ?? error}\n`)
  process.exitCode = 1
})
