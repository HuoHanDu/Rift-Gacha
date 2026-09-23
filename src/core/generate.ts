/**
 * 随机引擎入口（docs/RULES.md §8 的流水线）。
 *
 * 唯一对外函数是 `generateBuilds`：吃 `GenerateInput` + `DataBundle`，吐 `GenerateResult`。
 * 页面不需要认识任何 ID 常量或规则细节。
 *
 * ## 可复现性（AGENTS.md §4.2）
 *
 * 同一个 seed + 同一份快照 + 同一份输入 ⇒ 完全相同的结果。
 *
 * **不控强度时**（默认）走单次串行路径：全程共享一个 `rng`，与历史行为逐字节一致。
 *
 * **控强度时**走 `generateTargeted`：位置分配仍由基础种子决定（所以「谁是中单」不会
 * 因为重试而变），然后每个玩家各自用 `deriveAttemptSeed(seed, playerIndex, attempt)`
 * 派生出的种子重试。**全程不碰 `Math.random()`**，所以重试序列本身也可复现。
 */

import { pickChampion } from './champions'
import { pickItems } from './items'
import { assignPlacements } from './positions'
import { createRandomSeed, createRng, type Rng } from './random'
import { pickRunes } from './runes'
import { SPELL_IDS, STRENGTH_TIERS } from './constants'
import { pickSpells } from './spells'
import { scoreBuild, type StrengthBreakdown } from './strength'
import { defaultTargetSpec, deriveAttemptSeed, searchForTarget } from './targeting'
import type {
  BuildResult,
  DataBundle,
  GenerateInput,
  Position,
  TeamId,
  ValidationError,
} from './types'
import { validateInput } from './validate'

export interface GenerateOptions {
  seed?: number
  /**
   * 每个玩家的强度挡位（`docs/STRENGTH.md` §2 决策 1/11）。
   * 不传、或全是 `any` ⇒ 不控强度，行为与历史一致。
   */
  tiers?: (string | undefined)[]
  /** 目标分容差比例，默认见 constants。 */
  tolerance?: number
  /** 每人最大尝试次数，默认见 constants。 */
  maxAttempts?: number
}

/** 单个玩家的生成结果 + 强度信息（仅在控强度时填充）。 */
export interface PlayerStrength {
  breakdown: StrengthBreakdown
  met: boolean
  attempts: number
}

/**
 * 生成结果 + 强度信息。**这里必须是联合类型不能用 interface extends**——
 * GenerateResult 本身是「成功 | 失败」的联合，interface 不能继承联合类型。
 */
export type GenerateResultWithStrength =
  | { ok: false; errors: ValidationError[]; strengths: [] }
  | { ok: true; seed: number; results: BuildResult[]; strengths: PlayerStrength[] }

export function generateBuilds(
  input: GenerateInput,
  data: DataBundle,
  options: GenerateOptions = {},
): GenerateResultWithStrength {
  const errors: ValidationError[] = validateInput(input, data)
  if (errors.length > 0) {
    return { ok: false, errors, strengths: [] }
  }

  const seed = options.seed ?? createRandomSeed()
  const wantsTargeting = Array.isArray(options.tiers) && options.tiers.some((tier) => tier && tier !== 'any')

  if (!wantsTargeting) {
    const plain = generateOnce(input, data, seed)
    return plain.ok ? { ...plain, strengths: [] } : { ...plain, strengths: [] }
  }

  return generateTargeted(input, data, seed, options)
}

/** 不控强度：单次串行，共享一个 rng。这是历史行为，不要改。 */
function generateOnce(
  input: GenerateInput,
  data: DataBundle,
  seed: number,
): { ok: true; seed: number; results: BuildResult[] } | { ok: false; errors: ValidationError[] } {
  const rng = createRng(seed)
  const placementResult = assignPlacements(input.players, input, rng)
  if (!placementResult.ok) return placementResult

  const usedHeroIds = new Set<string>()
  const results = input.players.map((player, playerIndex) =>
    buildOne(input, data, placementResult.placements[playerIndex], playerIndex, player.name, usedHeroIds, rng),
  )
  return { ok: true, seed, results }
}

/**
 * 控强度：位置先由基础种子定死，再逐玩家重试到落进目标区间。
 *
 * 每个玩家的英雄都会加进 `usedHeroIds`，所以**先定下来的玩家会影响后面玩家的可选英雄**——
 * 这是「全场英雄不重复」的必然结果，也让「谁拿强、谁拿弱」有了确定性顺序。
 */
function generateTargeted(
  input: GenerateInput,
  data: DataBundle,
  seed: number,
  options: GenerateOptions,
): GenerateResultWithStrength {
  const placementRng = createRng(seed)
  const placementResult = assignPlacements(input.players, input, placementRng)
  if (!placementResult.ok) return { ...placementResult, strengths: [] }

  const usedHeroIds = new Set<string>()
  const results: BuildResult[] = []
  const strengths: PlayerStrength[] = []

  input.players.forEach((player, playerIndex) => {
    const placement = placementResult.placements[playerIndex]
    const tierId = options.tiers?.[playerIndex]
    const tier = tierId && tierId !== 'any' ? (STRENGTH_TIERS.find((t) => t.id === tierId) ?? null) : null

    const spec = {
      ...defaultTargetSpec(tier as never),
      ...(options.tolerance === undefined ? {} : { tolerance: options.tolerance }),
      ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
    }

    const outcome = searchForTarget(spec, (attemptIndex) => {
      // 每次尝试都用独立种子，且只影响本玩家——其它玩家的结果不受影响。
      const rng = createRng(deriveAttemptSeed(seed, playerIndex, attemptIndex))
      const value = buildOne(input, data, placement, playerIndex, player.name, usedHeroIds, rng)
      return { value, breakdown: scoreBuild(value, data) }
    })

    results.push(outcome.value)
    strengths.push({ breakdown: outcome.breakdown, met: outcome.met, attempts: outcome.attempts })
  })

  return { ok: true, seed, results, strengths }
}

/** 生成单个玩家。抽牌顺序固定，见 docs/RULES.md §8。 */
function buildOne(
  input: GenerateInput,
  data: DataBundle,
  placement: { team: TeamId; position: Position },
  playerIndex: number,
  rawName: string | undefined,
  usedHeroIds: Set<string>,
  rng: Rng,
): BuildResult {
  const { team, position } = placement

  // 抽完立刻登记，否则「全场英雄不重复」失效——pickChampion 自己不登记（这个坑踩过：
  // 抽 buildOne 时漏搬这一行，5 人只出 4 个不同英雄）。
  const champion = pickChampion(data.champions, usedHeroIds, rng)
  usedHeroIds.add(champion.heroId)

  const spells = pickSpells(position, data.spells, input.banSmiteForNonJungle, rng)
  const items = pickItems(position, champion, data.items, rng)

  // 召唤师技能必须先于符文生成：海克斯科技闪现罗网要判断是否带闪现（docs/RULES.md §6.5）。
  const hasFlash = spells.some((spell) => spell.id === SPELL_IDS.flash)
  const runePicks = pickRunes({ hasFlash }, data.runes, rng)

  return {
    playerIndex,
    name: rawName?.trim() || `玩家 ${playerIndex + 1}`,
    team,
    position,
    champion,
    spells,
    starterItem: items.starterItem,
    displayStarterItem: items.displayStarterItem,
    legendaryItems: items.legendaryItems,
    boots: items.boots,
    runes: {
      primaryStyle: runePicks.primaryStyle,
      keystone: runePicks.keystone,
      primaryMinors: runePicks.primaryMinors,
      secondaryStyle: runePicks.secondaryStyle,
      secondaryMinors: runePicks.secondaryMinors,
    },
    shards: runePicks.shards,
  }
}
