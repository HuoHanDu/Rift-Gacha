import { describe, expect, it } from 'vitest'
import { HEXFLASH } from '../src/core/constants'
import { createRng } from '../src/core/random'
import { pickRunes } from '../src/core/runes'
import type { RuneRef } from '../src/core/types'
import { DATA } from './helpers/fixtures'

const SEEDS = 3000

function allMinors(picks: ReturnType<typeof pickRunes>): RuneRef[] {
  return [...picks.primaryMinors, ...picks.secondaryMinors]
}

describe('pickRunes —— 主系与副系', () => {
  it('副系永远与主系不同', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const picks = pickRunes({ hasFlash: true }, DATA.runes, createRng(seed))
      expect(picks.secondaryStyle.id).not.toBe(picks.primaryStyle.id)
    }
  })

  it('基石属于主系，主系 3 个小符文分属 3 个不同的排', () => {
    const styleById = new Map(DATA.runes.styles.map((style) => [style.id, style]))
    for (let seed = 1; seed <= SEEDS; seed++) {
      const picks = pickRunes({ hasFlash: true }, DATA.runes, createRng(seed))
      const primary = styleById.get(picks.primaryStyle.id)
      expect(primary).toBeDefined()
      expect(primary!.keystones.some((r) => r.id === picks.keystone.id)).toBe(true)

      expect(picks.primaryMinors).toHaveLength(3)
      const slots = new Set(
        picks.primaryMinors.map(
          (rune) => primary!.minors.find((m) => m.runes.some((r) => r.id === rune.id))?.slot,
        ),
      )
      expect(slots.size).toBe(3)
      expect(slots.has(undefined)).toBe(false)
    }
  })

  it('副系 2 个小符文分属 2 个不同的排', () => {
    const styleById = new Map(DATA.runes.styles.map((style) => [style.id, style]))
    for (let seed = 1; seed <= SEEDS; seed++) {
      const picks = pickRunes({ hasFlash: true }, DATA.runes, createRng(seed))
      const secondary = styleById.get(picks.secondaryStyle.id)
      expect(secondary).toBeDefined()

      expect(picks.secondaryMinors).toHaveLength(2)
      const slots = new Set(
        picks.secondaryMinors.map(
          (rune) => secondary!.minors.find((m) => m.runes.some((r) => r.id === rune.id))?.slot,
        ),
      )
      expect(slots.size).toBe(2)
      expect(slots.has(undefined)).toBe(false)
    }
  })

  it('足够多 seed 下 5 个系都能当主系', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= SEEDS; seed++) {
      seen.add(pickRunes({ hasFlash: true }, DATA.runes, createRng(seed)).primaryStyle.id)
    }
    expect(seen.size).toBe(5)
  })
})

describe('pickRunes —— 小符文', () => {
  it('3 个，每个都来自对应的那一排', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const picks = pickRunes({ hasFlash: true }, DATA.runes, createRng(seed))
      expect(picks.shards).toHaveLength(3)
      picks.shards.forEach((shard, index) => {
        const row = DATA.runes.shardRows[index]
        expect(row.runes.some((r) => r.id === shard.id)).toBe(true)
      })
    }
  })

  it('每一排的所有候选都能被抽到', () => {
    const seen = DATA.runes.shardRows.map(() => new Set<string>())
    for (let seed = 1; seed <= SEEDS; seed++) {
      const picks = pickRunes({ hasFlash: true }, DATA.runes, createRng(seed))
      picks.shards.forEach((shard, index) => seen[index].add(shard.id))
    }
    seen.forEach((set, index) => {
      expect(set.size).toBe(DATA.runes.shardRows[index].runes.length)
    })
  })
})

describe('pickRunes —— 海克斯科技闪现罗网的充要条件', () => {
  it('没带闪现时，扫描 3000 个 seed 都不会出现', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const picks = pickRunes({ hasFlash: false }, DATA.runes, createRng(seed))
      expect(allMinors(picks).some((r) => r.id === HEXFLASH.runeId)).toBe(false)
    }
  })

  it('没带闪现时，「巧具」排依然能正常出符文（只是不会是海克斯闪现罗网）', () => {
    let sawToolsSlot = false
    for (let seed = 1; seed <= SEEDS; seed++) {
      const picks = pickRunes({ hasFlash: false }, DATA.runes, createRng(seed))
      const tools = allMinors(picks).find((rune) =>
        DATA.runes.styles
          .find((style) => style.id === HEXFLASH.styleId)
          ?.minors.find((m) => m.slot === HEXFLASH.slotLabel)
          ?.runes.some((r) => r.id === rune.id),
      )
      if (tools) {
        sawToolsSlot = true
        expect(tools.id).not.toBe(HEXFLASH.runeId)
      }
    }
    expect(sawToolsSlot).toBe(true)
  })

  it('带闪现时能被抽到，且此时主系或副系必是启迪', () => {
    let hit = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const picks = pickRunes({ hasFlash: true }, DATA.runes, createRng(seed))
      if (allMinors(picks).some((r) => r.id === HEXFLASH.runeId)) {
        hit++
        const involved =
          picks.primaryStyle.id === HEXFLASH.styleId ||
          picks.secondaryStyle.id === HEXFLASH.styleId
        expect(involved).toBe(true)
      }
    }
    expect(hit).toBeGreaterThan(0)
  })

  it('带闪现时，启迪系「巧具」排的 3 个候选都能被抽到', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= SEEDS * 2; seed++) {
      const picks = pickRunes({ hasFlash: true }, DATA.runes, createRng(seed))
      for (const rune of allMinors(picks)) {
        if (rune.id === '8306' || rune.id === '8304' || rune.id === '8321') seen.add(rune.id)
      }
    }
    expect(seen.size).toBe(3)
  })
})
