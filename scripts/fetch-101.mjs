#!/usr/bin/env node
/**
 * 抓取 101 数据站（`101.qq.com`）的峡谷数据，生成 `src/data/rift-stats.json`。
 *
 * ## 接口怎么解出来的
 *
 * 参数与响应格式不是猜的，是**对照开源项目 LeagueAkari 的实现**得到的
 * （`src/shared/http-api-axios-helper/qq101/index.ts` 与
 * `src/shared/data-adapter/champion-data/qq101-protocol.ts`，MIT/仓库公开）。
 * 靠它的 `parseInner(response, '18087')` 才知道那个
 * `{_fieldValues: {R18087: "…"}, result: ""}` 信封是**正常**的。
 *
 * ## 三个必须记住的坑（都是实测踩出来的）
 *
 * 1. **`lane` 必须大写**，且中单是 `MIDDLE` 不是 `MID`。
 *    小写 `top` 不会报错，只会**静默返回空数据**——最难查的一种失败。
 * 2. **`version_id` 用版本号字符串**（如 `16.18`），不是 id / vkey / key。
 * 3. **最新版本可能还没有数据**：`versionlist` 里 `16.19` 已发布，
 *    但榜单接口在 `16.19` 下返回空，得回退到 `16.18`。
 *    所以本脚本**从新到旧探测**，用第一个真的有数据的版本。
 *
 * ## 响应信封
 *
 * ```json
 * { "code": 0, "data": { "_fieldValues": { "R17960": "<JSON 字符串>" }, "result": "" } }
 * ```
 *
 * 真正的数据是 `_fieldValues` 里那**一个字段的字符串值**，且它本身还是 JSON。
 * 字段名按接口固定：榜单 `R17960`、构筑 `R18087`、符文 `R18119`。
 */

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { QQ101 } from './lib/sources.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'src', 'data')

/** 榜单接口在 `_fieldValues` 里的字段名。 */
const RANK_FIELD = 'R17960'

/** 101 的分路串 → 我们项目内部的位置名。注意中单是 MIDDLE。 */
const LANE_TO_POSITION = {
  TOP: 'top',
  JUNGLE: 'jungle',
  MIDDLE: 'mid',
  BOTTOM: 'adc',
  SUPPORT: 'support',
}

/** docs/STRENGTH.md §2 决策 6 —— T 挡位加分。没有该分路数据时为 0（决策 4/6）。 */
const TIER_BONUS = { T0: 20, T1: 14, T2: 8, T3: 3, T4: 0 }

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) rift-gacha/0.1',
  referer: 'https://101.qq.com/',
  accept: 'application/json',
}

async function post(url, timeoutMs = 30000) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/** 从信封里取出真正的载荷字符串。没有数据时返回空串（不是错误）。 */
function unwrap(payload, field) {
  const value = payload?.data?._fieldValues?.[field]
  return typeof value === 'string' ? value : ''
}

async function getVersions() {
  const json = await post(`${QQ101.base}/go/database/versionlist?zone=lol&from=h5`)
  const list = json?.data
  if (!Array.isArray(list) || list.length === 0) throw new Error('versionlist 为空')
  return list.map((item) => String(item.name))
}

/**
 * 信封里的字符串**本身还是 JSON**，真正的记录在它的 `datadetails` 字段里。
 *
 * 这就是第一版漏掉的一层：直接对整串 split('#') 会得到 0 条。
 * 榜单的载荷形如 `{"dtstatdate":"20260922","datadetails":"1_75_T0_TOP_…"}`
 */
function parseInner(rawString) {
  if (!rawString) return { dataDate: null, details: '' }
  try {
    const object = JSON.parse(rawString)
    return {
      dataDate: typeof object?.dtstatdate === 'string' ? object.dtstatdate : null,
      details: typeof object?.datadetails === 'string' ? object.datadetails : '',
    }
  } catch {
    return { dataDate: null, details: '' }
  }
}

/**
 * 从新到旧找第一个**真的有榜单数据**的版本。
 *
 * 这一步是必需的：`versionlist` 会把刚发布、数据还没铺上的版本排在第一位，
 * 直接用它会拿到空数据，而且**不报错**——静默失败。
 */
async function resolveVersion(versions) {
  for (const version of versions.slice(0, 4)) {
    const inner = parseInner(await fetchRankRaw(version))
    if (inner.details) {
      return {
        version,
        inner,
        skipped: versions.slice(0, versions.indexOf(version)),
      }
    }
    process.stdout.write(`  ${version} 暂无榜单数据，回退…\n`)
  }
  throw new Error(`探测了 ${versions.slice(0, 4).join(', ')} 都没有榜单数据`)
}

function fetchRankRaw(version) {
  const url =
    `${QQ101.base}${QQ101.rift}` +
    `?itier=255&version_id=${encodeURIComponent(version)}&lane=ALL&sort_metric=1&sort_order=2`
  return post(url).then((json) => unwrap(json, RANK_FIELD))
}

/**
 * 解析榜单载荷。
 *
 * 一行一条记录，字段用 `_` 分隔、记录之间用 `#` 分隔：
 *
 * ```
 * rank _ heroId _ tier _ LANE _ winRate _ pickRate _ banRate _ extraIds _ ? _ ?
 * 1    _ 75     _ T0   _ TOP  _ 51.57   _ 9.27     _ 23.75   _ 86,897,223 _ 0 _ 0
 * ```
 *
 * 尾部三个字段语义未确认（`-1` 表示空），本脚本不依赖它们。
 */
export function parseRanks(raw) {
  const records = []
  const skipped = []

  for (const row of raw.split('#').filter(Boolean)) {
    const f = row.split('_')
    if (f.length < 7) {
      skipped.push(row)
      continue
    }
    const heroIdNum = Number.parseInt(f[1], 10)
    const lane = String(f[3]).toUpperCase()
    const position = LANE_TO_POSITION[lane]
    const winRate = Number.parseFloat(f[4])
    const pickRate = Number.parseFloat(f[5])
    const banRate = Number.parseFloat(f[6])

    // 注意：判 finite 必须用**数值**，不能先 String() 再判——
    // Number.isFinite('112') 恒为 false，会把所有记录当脏数据跳过（这个坑踩过）。
    if (!position || !Number.isFinite(heroIdNum) || !Number.isFinite(winRate)) {
      skipped.push(row)
      continue
    }

    const safePickRate = Number.isFinite(pickRate) ? pickRate : 0
    const tier = TIER_BONUS[f[2]] === undefined ? null : String(f[2])
    records.push({
      heroId: String(heroIdNum),
      position,
      rank: Number.parseInt(f[0], 10) || null,
      tier,
      winRate,
      pickRate: Number.isFinite(pickRate) ? pickRate : null,
      banRate: Number.isFinite(banRate) ? banRate : null,
      /**
       * docs/STRENGTH.md §5.1 —— 位置英雄分。
       * k1/k2 已放大 4 倍（保持 7:3）：(胜率 − 50) × 2.8 + 登场率 × 1.2
       */
      laneScore: Math.round(((winRate - 50) * 2.8 + safePickRate * 1.2) * 100) / 100,
      tierBonus: tier ? TIER_BONUS[tier] : 0,
    })
  }
  return { records, skipped }
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(path.join(OUT_DIR, 'rift-stats.json'), 'utf8'))
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
  process.stdout.write('抓取 101 版本列表…\n')
  const versions = await getVersions()
  process.stdout.write(`  最新 ${versions[0]}，共 ${versions.length} 个版本\n`)

  process.stdout.write('探测有数据的版本…\n')
  const { version, inner, skipped: skippedVersions } = await resolveVersion(versions)
  const behind = skippedVersions.length > 0
  process.stdout.write(
    `  使用 ${version}${behind ? `（${skippedVersions.join(', ')} 数据未铺，胜率数据落后 ${behind ? skippedVersions.length : 0} 个版本）` : ''}\n`,
  )

  const { records, skipped } = parseRanks(inner.details)
  if (records.length < 100) {
    throw new Error(`只解析出 ${records.length} 条记录，疑似格式变化`)
  }

  // 完整性断言：每个分路都要有数据，否则说明 lane 映射又错了（大写/MIDDLE 那两个坑）
  const byPosition = {}
  for (const record of records) {
    byPosition[record.position] = (byPosition[record.position] ?? 0) + 1
  }
  for (const position of ['top', 'jungle', 'mid', 'adc', 'support']) {
    if (!byPosition[position]) {
      throw new Error(`分路 ${position} 一条记录都没有，检查 101 的 lane 取值是否又变了`)
    }
  }

  const scores = records.map((r) => r.laneScore + r.tierBonus)
  scores.sort((a, b) => a - b)
  const quantile = (q) => scores[Math.min(scores.length - 1, Math.floor(scores.length * q))]

  const previous = await readPrevious()
  const meta = {
    source: '101.qq.com',
    fetchedAt: new Date().toISOString(),
    /** 101 的版本列表里最新的是哪个 */
    latestPublished: versions[0],
    /** 实际取到数据的版本 —— 可能落后于 latestPublished */
    version,
    /** 是否落后（用户已确认：落后就如实标注即可） */
    behind,
    dataDate: inner.dataDate,
    counts: { records: records.length, ...byPosition },
    /** 用于给 docs/STRENGTH.md 的挡位区间提供真实分布 */
    laneHeroScore: {
      min: scores[0],
      p25: quantile(0.25),
      median: quantile(0.5),
      p75: quantile(0.75),
      p90: quantile(0.9),
      max: scores[scores.length - 1],
    },
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeJsonAtomic('rift-stats.json', { meta, ranks: records })
  await writeJsonAtomic('rift-101-meta.json', meta)

  process.stdout.write(`\n✓ 已写入 src/data/rift-stats.json（${version}，数据日 ${meta.dataDate}）\n`)
  process.stdout.write(`  记录 ${records.length} 条，跳过 ${skipped.length} 条\n`)
  for (const [position, count] of Object.entries(byPosition)) {
    process.stdout.write(`    ${position.padEnd(8)} ${String(count).padStart(4)}\n`)
  }
  process.stdout.write('\n  位置英雄分（laneScore + tierBonus）分布：\n')
  for (const [key, value] of Object.entries(meta.laneHeroScore)) {
    process.stdout.write(`    ${key.padEnd(8)} ${value}\n`)
  }
  if (previous?.meta?.version && previous.meta.version !== version) {
    process.stdout.write(`\n  注意：版本从 ${previous.meta.version} 变为 ${version}\n`)
  }
}

main().catch((error) => {
  process.stderr.write(`\n✗ 抓取 101 数据失败：${error?.message ?? error}\n`)
  process.exitCode = 1
})
