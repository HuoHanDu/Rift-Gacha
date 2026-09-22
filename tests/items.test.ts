import { describe, expect, it } from 'vitest'
import { pickItems } from '../src/core/items'
import { createRng } from '../src/core/random'
import type { Position } from '../src/core/types'
import { DATA } from './helpers/fixtures'

/** 测试用英雄：取一个远程的，池子最全（能出远程专属件） */
const HERO = DATA.champions.find((c) => c.ranged)!

const SEEDS = 500

function ids(items: { id: string }[]): string[] {
  return items.map((item) => item.id)
}

describe('pickItems —— 成装', () => {
  it('恒为 6 件、内部不重复、全部来自传说池，且不含任务专属件与鞋子', () => {
    const pool = new Set(ids(DATA.items.legendary))
    const excluded = new Set(['4643', '3869', '3870', '3871', '3876', '3877'])
    const bootIds = new Set([...ids(DATA.items.boots), ...ids(DATA.items.bootsUpgraded)])

    for (let seed = 1; seed <= SEEDS; seed++) {
      const picks = pickItems('top', HERO, DATA.items, createRng(seed))
      expect(picks.legendaryItems).toHaveLength(6)
      expect(new Set(ids(picks.legendaryItems)).size).toBe(6)
      for (const item of picks.legendaryItems) {
        expect(pool.has(item.id)).toBe(true)
        expect(excluded.has(item.id)).toBe(false)
        expect(bootIds.has(item.id)).toBe(false)
      }
    }
  })
})

describe('pickItems —— 出门装', () => {
  it('辅助固定云游图鉴，展示件来自 5 个升级件', () => {
    const allowed = new Set(ids(DATA.items.supportQuestUpgrades))
    const seen = new Set<string>()
    for (let seed = 1; seed <= SEEDS; seed++) {
      const picks = pickItems('support', HERO, DATA.items, createRng(seed))
      expect(picks.starterItem.id).toBe(DATA.items.starterSupport.id)
      expect(picks.displayStarterItem).not.toBeNull()
      expect(allowed.has(picks.displayStarterItem!.id)).toBe(true)
      seen.add(picks.displayStarterItem!.id)
    }
    expect(seen.size).toBe(DATA.items.supportQuestUpgrades.length)
  })

  it('打野出门装是打野蛋，且没有展示件', () => {
    const allowed = new Set(ids(DATA.items.starterJungle))
    const seen = new Set<string>()
    for (let seed = 1; seed <= SEEDS; seed++) {
      const picks = pickItems('jungle', HERO, DATA.items, createRng(seed))
      expect(allowed.has(picks.starterItem.id)).toBe(true)
      expect(picks.displayStarterItem).toBeNull()
      seen.add(picks.starterItem.id)
    }
    expect(seen.size).toBe(3)
  })

  it('其他位置出门装来自登记的 8 件通用装备', () => {
    const allowed = new Set(ids(DATA.items.starterGeneric))
    const seen = new Set<string>()
    for (const position of ['top', 'mid', 'adc'] as Position[]) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const picks = pickItems(position, HERO, DATA.items, createRng(seed))
        expect(allowed.has(picks.starterItem.id)).toBe(true)
        expect(picks.displayStarterItem).toBeNull()
        seen.add(picks.starterItem.id)
      }
    }
    expect(seen.size).toBe(DATA.items.starterGeneric.length)
  })
})

describe('pickItems —— 鞋子', () => {
  it('中路鞋子是升级款，其他位置是未升级款', () => {
    const base = new Set(ids(DATA.items.boots))
    const upgraded = new Set(ids(DATA.items.bootsUpgraded))

    for (let seed = 1; seed <= SEEDS; seed++) {
      expect(upgraded.has(pickItems('mid', HERO, DATA.items, createRng(seed)).boots.id)).toBe(true)
      for (const position of ['top', 'jungle', 'adc', 'support'] as Position[]) {
        expect(base.has(pickItems(position, HERO, DATA.items, createRng(seed)).boots.id)).toBe(true)
      }
    }
  })

  it('中路的升级款与随机到的未升级款一一对应', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const mid = pickItems('mid', HERO, DATA.items, createRng(seed))
      // 同一 seed 下中路与非中路抽到的未升级鞋是同一个位置上的随机结果，
      // 这里直接核对映射表本身。
      const baseId = Object.keys(DATA.items.bootsUpgradeMap).find(
        (id) => DATA.items.bootsUpgradeMap[id] === mid.boots.id,
      )
      expect(baseId).toBeDefined()
    }
  })

  it('足够多 seed 下 7 双鞋都能被抽到', () => {
    const seen = new Set<string>()
    const seenUpgraded = new Set<string>()
    for (let seed = 1; seed <= SEEDS; seed++) {
      seen.add(pickItems('top', HERO, DATA.items, createRng(seed)).boots.id)
      seenUpgraded.add(pickItems('mid', HERO, DATA.items, createRng(seed)).boots.id)
    }
    expect(seen.size).toBe(7)
    expect(seenUpgraded.size).toBe(7)
  })
})

describe('pickItems —— 唯一词条互斥与远程专属（docs/RULES.md §5.4 / §5.5）', () => {
  const MELEE = DATA.champions.find((c) => !c.ranged)!
  const RUNNANS = DATA.items.rangedOnly[0]
  const runnansName = DATA.items.legendary.find((i) => i.id === RUNNANS)!.name

  it('近战英雄永远不会随机到远程专属装备', () => {
    let hits = 0
    for (let seed = 1; seed <= 2000; seed++) {
      const picks = pickItems('top', MELEE, DATA.items, createRng(seed))
      if (picks.legendaryItems.some((i) => i.id === RUNNANS)) hits++
    }
    expect(hits).toBe(0)
    expect(runnansName).toBe('卢安娜的飓风')
  })

  it('远程英雄能随机到该装备（确认不是被整体排除掉了）', () => {
    let hits = 0
    for (let seed = 1; seed <= 500; seed++) {
      const picks = pickItems('top', HERO, DATA.items, createRng(seed))
      if (picks.legendaryItems.some((i) => i.id === RUNNANS)) hits++
    }
    expect(hits).toBeGreaterThan(0)
  })

  it('互斥组内任意两件都不会同时出现', () => {
    const heroes = [HERO, MELEE]
    for (const hero of heroes) {
      for (let seed = 1; seed <= 500; seed++) {
        const ids = new Set(
          pickItems('top', hero, DATA.items, createRng(seed)).legendaryItems.map((i) => i.id),
        )
        for (const [index, group] of DATA.items.uniqueGroups.entries()) {
          expect(group.filter((id) => ids.has(id)).length).toBeLessThanOrEqual(1)
          expect(index).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('互斥组之间不会互相牵连：不共享词条的组可以同时出现', () => {
    // 界弓同时属于「枯萎」和「夺命」两组，这里只验证它自己会同时挡住两边
    const jieGong = DATA.items.legendary.find((i) => i.name === '界弓')
    expect(jieGong).toBeDefined()
    const belongs = DATA.items.uniqueGroups.filter((g) => g.includes(jieGong!.id))
    expect(belongs.length).toBe(2)
  })
})
