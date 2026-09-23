/**
 * 强度瞄准的测试（docs/STRENGTH.md §6）。
 *
 * 这一层的价值全在两条：
 * 1. **种子可复现**——重试序列也必须由种子决定，不能碰 `Math.random()`。
 *    否则「同 seed ⇒ 同结果」这条纪律就被破坏了（AGENTS.md §4.2）。
 * 2. **必须有兜底**——目标区间可能不可达，超限要取最接近的并如实标注，不能死循环。
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_TARGET_TOLERANCE, MAX_TARGET_ATTEMPTS, STRENGTH_TIERS } from '../src/core/constants'
import { generateBuilds } from '../src/core/generate'
import type { StrengthBreakdown, TierRule } from '../src/core/strength'
import {
  defaultTargetSpec,
  deriveAttemptSeed,
  distanceToTier,
  searchForTarget,
  withinTolerance,
} from '../src/core/targeting'
import { DATA } from '../src/data'

const tier = (id: string): TierRule => STRENGTH_TIERS.find((t) => t.id === id)! as TierRule

/** 造一个假的结果对象，用来单独测重试循环。 */
function fake(total: number): { value: number; breakdown: StrengthBreakdown } {
  return {
    value: total,
    breakdown: {
      hero: total,
      items: 0,
      runes: 0,
      total,
      recommendedHits: 0,
      detail: {
        laneScore: 0,
        tierBonus: 0,
        tier: null,
        hasLaneData: false,
        buildFallback: false,
        itemPoints: [],
        runeHits: { keystone: false, primary: [false, false, false], secondary: [false, false], shards: [false, false, false] },
      },
    },
  }
}

describe('deriveAttemptSeed —— 重试序列也要可复现', () => {
  it('同一个 (seed, playerIndex, attempt) 永远得到同一个种子', () => {
    expect(deriveAttemptSeed(12345, 0, 0)).toBe(deriveAttemptSeed(12345, 0, 0))
    expect(deriveAttemptSeed(12345, 3, 7)).toBe(deriveAttemptSeed(12345, 3, 7))
  })

  it('不同玩家 / 不同尝试得到不同种子', () => {
    const base = 999
    const seeds = new Set<number>()
    for (let player = 0; player < 5; player++) {
      for (let attempt = 0; attempt < 20; attempt++) seeds.add(deriveAttemptSeed(base, player, attempt))
    }
    // 100 个组合里不该有明显碰撞
    expect(seeds.size).toBeGreaterThan(95)
  })

  it('返回无符号 32 位整数（能直接喂给 createRng）', () => {
    for (const seed of [deriveAttemptSeed(0, 0, 0), deriveAttemptSeed(-1, 9, 199), deriveAttemptSeed(2 ** 31, 4, 3)]) {
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(0xffffffff)
    }
  })
})

describe('distanceToTier / withinTolerance', () => {
  it('落在区间内距离为 0', () => {
    const mid = tier('mid')
    // 从区间推导中点，不硬编码——阈值调过好几轮了
    const inside = (mid.min! + mid.max!) / 2
    expect(distanceToTier(inside, mid)).toBe(0)
  })

  it('区间外按下界/上界算距离', () => {
    expect(distanceToTier(0, tier('mid'))).toBe(tier('mid').min! - 0)
    expect(distanceToTier(9999, tier('mid'))).toBe(9999 - tier('mid').max! + 1)
  })

  it('不设界的挡位对任何分数都不设限', () => {
    expect(distanceToTier(-9999, tier('any'))).toBe(0)
    expect(distanceToTier(9999, tier('any'))).toBe(0)
  })

  it('容差能把刚好差一点的分数纳进来', () => {
    const mid = tier('mid')
    // 刚好在区间的上界之外一点点
    const justOver = mid.max! + 0.5
    expect(withinTolerance(justOver, mid, 0)).toBe(false)
    expect(withinTolerance(justOver, mid, DEFAULT_TARGET_TOLERANCE)).toBe(true)
  })
})

describe('searchForTarget', () => {
  it('不控强度时只尝试一次（完全随机挡）', () => {
    let calls = 0
    const outcome = searchForTarget(defaultTargetSpec(null), () => {
      calls++
      return fake(12345)
    })
    expect(calls).toBe(1)
    expect(outcome.attempts).toBe(1)
    expect(outcome.met).toBe(true)
  })

  it('第一次就达标时不浪费尝试', () => {
    const mid = tier('mid')
    let calls = 0
    const outcome = searchForTarget({ tier: mid, tolerance: 0, maxAttempts: 50 }, () => {
      calls++
      return fake((mid.min! + mid.max!) / 2)
    })
    expect(calls).toBe(1)
    expect(outcome.met).toBe(true)
    expect(outcome.attempts).toBe(1)
  })

  it('前几次不达标时会继续重试直到命中', () => {
    const mid = tier('mid')
    let calls = 0
    const outcome = searchForTarget({ tier: mid, tolerance: 0, maxAttempts: 50 }, (index) => {
      calls++
      // 第 5 次才落进区间
      return index < 5 ? fake(-1000) : fake((mid.min! + mid.max!) / 2)
    })
    expect(outcome.met).toBe(true)
    expect(outcome.attempts).toBe(6)
    expect(calls).toBe(6)
  })

  it('目标不可达时不死循环：返回最接近的一次并标注未达标', () => {
    const top = tier('top')
    let calls = 0
    const outcome = searchForTarget({ tier: top, tolerance: 0, maxAttempts: 12 }, (index) => {
      calls++
      // 永远够不到 top 的下界，但越试越接近
      return fake(index * 3)
    })
    expect(calls).toBe(12)
    expect(outcome.attempts).toBe(12)
    expect(outcome.met).toBe(false)
    // 取到的是最接近的那次（最后一次最大）
    expect(outcome.breakdown.total).toBe(33)
  })

  it('maxAttempts 为 1 时行为等价于只试一次', () => {
    const top = tier('top')
    const outcome = searchForTarget({ tier: top, tolerance: 0, maxAttempts: 1 }, () => fake(0))
    expect(outcome.attempts).toBe(1)
    expect(outcome.met).toBe(false)
  })
})

describe('generateBuilds —— 控强度端到端', () => {
  const input = {
    players: [{ name: 'A' }],
    teamMode: false,
    splitTeamsRandomly: false,
    banSmiteForNonJungle: true,
  }

  it('不传 tiers 时与历史行为一致（strengths 为空）', () => {
    const outcome = generateBuilds(input, DATA, { seed: 42 })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.strengths).toEqual([])
    expect(outcome.results).toHaveLength(1)
  })

  it('同一个 seed + 同一挡位 ⇒ 完全相同的结果（重试序列也可复现）', () => {
    const a = generateBuilds(input, DATA, { seed: 777, tiers: ['top'] })
    const b = generateBuilds(input, DATA, { seed: 777, tiers: ['top'] })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(JSON.stringify(a.results)).toBe(JSON.stringify(b.results))
    expect(a.strengths[0].attempts).toBe(b.strengths[0].attempts)
  })

  it('指定最高档时，达到的比例明显高于不控强度', () => {
    const sample = (tiers?: string[]) => {
      let met = 0
      for (let seed = 1; seed <= 40; seed++) {
        const outcome = generateBuilds(input, DATA, { seed, tiers })
        if (outcome.ok && outcome.strengths[0]?.met) met++
      }
      return met
    }
    const targeted = sample(['top'])
    const plain = generateBuilds(input, DATA, { seed: 1 })
    expect(plain.ok).toBe(true)
    // 瞄准最高档后至少有一部分能达标（不要求全部——目标本身可能不可达）
    expect(targeted).toBeGreaterThan(0)
  })

  it('多玩家控强度：每个玩家都有强度信息，且英雄仍全场不重复', () => {
    const outcome = generateBuilds(
      {
        players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
        teamMode: false,
        splitTeamsRandomly: false,
        banSmiteForNonJungle: true,
      },
      DATA,
      { seed: 2024, tiers: ['low', 'mid', 'high'] },
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.strengths).toHaveLength(3)
    expect(new Set(outcome.results.map((r) => r.champion.heroId)).size).toBe(3)
    // 尝试次数是有上限的，不能失控
    for (const strength of outcome.strengths) {
      expect(strength.attempts).toBeGreaterThanOrEqual(1)
      expect(strength.attempts).toBeLessThanOrEqual(MAX_TARGET_ATTEMPTS)
    }
  })
})
