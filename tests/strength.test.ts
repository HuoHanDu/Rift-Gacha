/**
 * 强度评分的单元测试（docs/STRENGTH.md）。
 *
 * 重点覆盖两类容易错的地方：
 * 1. **适配度判定**的方向性——AP 英雄该认法强装、不该认纯物理装；
 * 2. **最高档的复合条件**（用户决策 C）——光靠总分不够，还要命中推荐装备，
 *    否则「高分」可能只是一堆强相容散件堆出来的。
 */

import { describe, expect, it } from 'vitest'
import { STRENGTH_TIERS, TIER_BONUS } from '../src/core/constants'
import { generateBuilds } from '../src/core/generate'
import {
  classifyTier,
  compatScore,
  indexLaneRecords,
  meetsTier,
  scoreBuild,
  type TierRule,
} from '../src/core/strength'
import type { ChampionRef, ItemRef } from '../src/core/types'
import { DATA } from '../src/data'
import { assertInvariants } from './helpers/fixtures'

const tier = (id: string): TierRule =>
  STRENGTH_TIERS.find((t) => t.id === id)! as TierRule

function championOf(title: string): ChampionRef {
  const found = DATA.champions.find((c) => c.title === title)
  if (!found) throw new Error(`快照里没有英雄 ${title}`)
  return found
}


/** 从真实快照里挑一件「含某类别」的装备。 */
function itemWithCategory(category: string): ItemRef {
  const found = DATA.items.legendary.find((i) => (DATA.items.categories[i.id] ?? []).includes(category))
  if (!found) throw new Error(`快照里没有 ${category} 类装备`)
  return found
}

describe('compatScore —— 装备适配度', () => {
  it('AP 英雄认法强装、不认纯物理装', () => {
    const annie = championOf('安妮') // kMagic
    const ap = itemWithCategory('ap')
    const ad = itemWithCategory('ad')
    expect(compatScore(ap, annie, DATA.items.categories)).toBeGreaterThan(0)
    // 找一个既非 ad 也非 crit 的纯物理装，确保拿到 0 而不是弱相容
    const pureAd = DATA.items.legendary.find((i) => {
      const c = DATA.items.categories[i.id] ?? []
      return c.includes('ad') && !c.includes('ap') && !c.includes('support') && !c.includes('tank')
    })
    if (pureAd) expect(compatScore(pureAd, annie, DATA.items.categories)).toBe(0)
    expect(ad.id).toBeTruthy()
  })

  it('物理英雄认物理装、不认纯法强装', () => {
    const nasus = championOf('内瑟斯') // kPhysical
    const pureAp = DATA.items.legendary.find((i) => {
      const c = DATA.items.categories[i.id] ?? []
      return c.includes('ap') && !c.includes('ad') && !c.includes('tank') && !c.includes('support')
    })
    if (pureAp) expect(compatScore(pureAp, nasus, DATA.items.categories)).toBe(0)
    const ad = itemWithCategory('ad')
    expect(compatScore(ad, nasus, DATA.items.categories)).toBeGreaterThan(0)
  })

  it('坦克英雄认坦度装', () => {
    const nasus = championOf('内瑟斯') // durability 3
    const tank = itemWithCategory('tank')
    expect(compatScore(tank, nasus, DATA.items.categories)).toBeGreaterThan(0)
  })

  it('分数只可能是 0 / 1 / 2 三档', () => {
    for (const champion of DATA.champions.slice(0, 30)) {
      for (const item of DATA.items.legendary.slice(0, 40)) {
        const score = compatScore(item, champion, DATA.items.categories)
        expect([0, 1, 2]).toContain(score)
      }
    }
  })

  it('所有英雄都有画像（否则适配度会退化成只看定位）', () => {
    const missing = DATA.champions.filter((c) => !c.profile?.damageType)
    expect(missing.map((c) => c.title)).toEqual([])
  })
})

describe('挡位', () => {
  // 这些用例**从常量推导期望值**，不硬编码阈值——
  // 否则每次按真实分布调参（已经调过两轮）都要跟着改测试。
  it('最高档需要复合条件：总分够但没命中推荐装 → 不算最高档', () => {
    const top = tier('top')
    const enough = (top.min ?? 0) + 20
    const base = { hero: 0, items: 0, runes: 0, total: enough, detail: {} as never }

    expect(top.requireRecommended).toBeGreaterThan(0)
    expect(meetsTier({ ...base, recommendedHits: 0 }, top)).toBe(false)
    expect(meetsTier({ ...base, recommendedHits: top.requireRecommended - 1 }, top)).toBe(false)
    expect(meetsTier({ ...base, recommendedHits: top.requireRecommended }, top)).toBe(true)
    // 命中够但总分不够，也不行
    expect(
      meetsTier({ ...base, total: (top.min ?? 0) - 1, recommendedHits: 6 }, top),
    ).toBe(false)
  })

  it('完全随机挡位对任何分数都成立', () => {
    const any = tier('any')
    for (const total of [-1000, -100, 0, 50, 200]) {
      expect(meetsTier({ total, recommendedHits: 0 } as never, any)).toBe(true)
    }
  })

  it('低档按分数区间判定，边界是「下界含、上界不含」，且互不重叠', () => {
    const low = tier('low')
    const mid = tier('mid')
    const boundary = low.max!

    // 边界左边属于 low、不属于 mid
    expect(meetsTier({ total: boundary - 1, recommendedHits: 0 } as never, low)).toBe(true)
    expect(meetsTier({ total: boundary - 1, recommendedHits: 0 } as never, mid)).toBe(false)
    // 边界本身属于 mid（含下界、不含上界）
    expect(meetsTier({ total: boundary, recommendedHits: 0 } as never, low)).toBe(false)
    expect(meetsTier({ total: boundary, recommendedHits: 0 } as never, mid)).toBe(true)
    // low 是 min=null / max=有值，不能被当成「无约束」
    expect(meetsTier({ total: 9999, recommendedHits: 0 } as never, low)).toBe(false)
  })

  it('T 挡位加分单调递减、T4 为 0、T0 最高（防手滑改错表）', () => {
    const order = ['T0', 'T1', 'T2', 'T3', 'T4']
    for (let i = 1; i < order.length; i++) {
      expect(TIER_BONUS[order[i]]).toBeLessThan(TIER_BONUS[order[i - 1]])
    }
    expect(TIER_BONUS.T4).toBe(0)
    expect(TIER_BONUS.T0).toBeGreaterThan(0)
  })
})

describe('scoreBuild', () => {
  it('真实随机结果的分数拆解自洽，且落在合理范围内', () => {
    let scored = 0
    let withLaneData = 0
    for (let seed = 1; seed <= 60; seed++) {
      const outcome = generateBuilds(
        {
          players: [{ name: 'A' }],
          teamMode: false,
          splitTeamsRandomly: false,
          banSmiteForNonJungle: true,
        },
        DATA,
        { seed },
      )
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) continue

      const breakdown = scoreBuild(outcome.results[0], DATA)
      assertInvariants(outcome.results[0], DATA)

      expect(breakdown.total).toBe(breakdown.hero + breakdown.items + breakdown.runes)
      expect(Number.isFinite(breakdown.total)).toBe(true)
      // 六件成装里最多 6 件命中推荐
      expect(breakdown.recommendedHits).toBeGreaterThanOrEqual(0)
      expect(breakdown.recommendedHits).toBeLessThanOrEqual(6)
      // 装备项：最多 6 件核心 + 鞋 + 出门装
      expect(breakdown.items).toBeLessThanOrEqual(6 * 10 + 5 + 5)
      expect(breakdown.items).toBeGreaterThanOrEqual(0)
      // 符文项满分 29
      expect(breakdown.runes).toBeGreaterThanOrEqual(0)
      expect(breakdown.runes).toBeLessThanOrEqual(29)

      scored++
      if (breakdown.detail.hasLaneData) withLaneData++
    }
    expect(scored).toBe(60)
    // 101 只覆盖 239 / (173 英雄 × 5 分路) ≈ 27.6% 的组合，
    // 所以随机抽取**大部分是拿不到分路数据的**（英雄项为 0）。
    // 这里不断言一个很高的命中数，只确认「不是全都没有」。
    expect(withLaneData).toBeGreaterThan(2)
    expect(withLaneData).toBeLessThan(60)
  })

  it('没有该分路数据时英雄项为 0（决策 6：不加分也不扣分）', () => {
    const outcome = generateBuilds(
      {
        players: [{ name: 'A' }],
        teamMode: false,
        splitTeamsRandomly: false,
        banSmiteForNonJungle: true,
      },
      DATA,
      { seed: 7 },
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    // 造一份「榜单里查不到该组合」的数据
    const stripped = {
      ...DATA,
      rift: { ...DATA.rift, ranks: [] },
    }
    const breakdown = scoreBuild(outcome.results[0], stripped)
    expect(breakdown.hero).toBe(0)
    expect(breakdown.detail.hasLaneData).toBe(false)
  })

  it('classifyTier 对同一份结果给出确定的一档', () => {
    const breakdown = {
      hero: 20,
      items: 15,
      runes: 8,
      total: 43,
      recommendedHits: 0,
      detail: {} as never,
    }
    const result = classifyTier(breakdown)
    expect(result?.id).toBe('high') // 43 ≥ 41 且不满足 top 的复合条件
  })

  it('indexLaneRecords 的键是 heroId:position', () => {
    const index = indexLaneRecords(DATA.rift.ranks)
    expect(index.size).toBe(DATA.rift.ranks.length)
    const first = DATA.rift.ranks[0]
    expect(index.get(`${first.heroId}:${first.position}`)).toBe(first)
  })
})
