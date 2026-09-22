/**
 * 揭幕动画的逻辑测试。
 *
 * 只测纯逻辑（轮盘剧本 + 播放器状态机），不测视觉。
 * 播放器用假定时器推进，因此不会真的等几秒。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateBuilds } from '../src/core/generate'
import { createRng } from '../src/core/random'
import type { GenerateInput } from '../src/core/types'
import { DATA } from '../src/data'
import { createRevealController } from '../src/reveal/controller'
import { buildCardPlan, buildPlans, SLOT_KEYS } from '../src/reveal/plan'
import {
  PLAYER_GAP_MS,
  playerDuration,
  ROLL_TICKS,
  SECTION_GAP_MS,
  SECTION_ORDER,
  sectionDuration,
  tickDelay,
  type SectionKey,
} from '../src/reveal/sections'

function input(players: number, overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    players: Array.from({ length: players }, (_, index) => ({ name: `P${index + 1}` })),
    teamMode: false,
    splitTeamsRandomly: false,
    banSmiteForNonJungle: true,
    ...overrides,
  }
}

function builds(count = 1, seed = 42) {
  const outcome = generateBuilds(input(count), DATA, { seed })
  if (!outcome.ok) throw new Error('生成失败')
  return outcome.results
}

/** 造一个已经装好剧本的播放器。 */
function controllerFor(count = 1) {
  const list = builds(count)
  const plans = buildPlans(list, DATA, createRng(1))
  return { controller: createRevealController(plans), list }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('tickDelay', () => {
  it('先快后慢，最后一帧明显拖住', () => {
    const delays = Array.from({ length: 8 }, (_, index) => tickDelay(index, 8))
    for (let index = 1; index < delays.length; index++) {
      expect(delays[index]).toBeGreaterThanOrEqual(delays[index - 1])
    }
    expect(delays[0]).toBeLessThan(60)
    expect(delays[delays.length - 1]).toBeGreaterThan(200)
  })

  it('单帧时没有延迟', () => {
    expect(tickDelay(0, 1)).toBe(0)
  })
})

describe('时长预估', () => {
  it('每一段都在 0.3~1.2 秒之间，整体不至于让人等太久', () => {
    for (const section of SECTION_ORDER) {
      expect(sectionDuration(section)).toBeGreaterThan(300)
      expect(sectionDuration(section)).toBeLessThan(1200)
    }
    expect(playerDuration()).toBeGreaterThan(2000)
    expect(playerDuration()).toBeLessThan(6000)
  })

  it('段间停顿被算进了单人总时长', () => {
    const rolling = SECTION_ORDER.reduce((sum, section) => sum + sectionDuration(section), 0)
    expect(playerDuration()).toBe(rolling + (SECTION_ORDER.length - 1) * SECTION_GAP_MS)
  })

  it('换人那一拍比段间停顿更长', () => {
    expect(PLAYER_GAP_MS).toBeGreaterThan(SECTION_GAP_MS)
  })
})

describe('buildCardPlan', () => {
  it('每一段都建出了预期数量的格子，帧数与 ROLL_TICKS 一致', () => {
    const build = builds(1)[0]
    const plan = buildCardPlan(build, DATA, createRng(1))

    const expectedCounts = {
      position: 1,
      champion: 1,
      spells: build.spells.length,
      starter: 1,
      items: build.legendaryItems.length + 1, // 六件成装 + 鞋子
      runes:
        2 + // 主系、副系图标
        1 + // 基石
        build.runes.primaryMinors.length +
        build.runes.secondaryMinors.length +
        build.shards.length,
    }

    for (const section of SECTION_ORDER) {
      expect(plan[section]).toHaveLength(expectedCounts[section])
      for (const slot of plan[section]) {
        expect(slot.frames).toHaveLength(ROLL_TICKS[section])
      }
    }
  })

  it('每个格子的最后一帧就是真实结果', () => {
    const build = builds(3)[1]
    const plan = buildCardPlan(build, DATA, createRng(9))
    const last = (section: (typeof SECTION_ORDER)[number], key: string) => {
      const slot = plan[section].find((candidate) => candidate.key === key)
      expect(slot, `缺少格子 ${section}/${key}`).toBeDefined()
      return slot!.frames[slot!.frames.length - 1]
    }

    expect(last('position', SLOT_KEYS.position).text).toBe(
      { top: '上单', jungle: '打野', mid: '中单', adc: '下路', support: '辅助' }[build.position],
    )
    expect(last('champion', SLOT_KEYS.champion).icon).toBe(build.champion.icon)
    build.spells.forEach((spell, index) => {
      expect(last('spells', SLOT_KEYS.spell(index)).icon).toBe(spell.icon)
    })
    const starter = build.displayStarterItem ?? build.starterItem
    expect(last('starter', SLOT_KEYS.starter).icon).toBe(starter.icon)
    build.legendaryItems.forEach((item, index) => {
      expect(last('items', SLOT_KEYS.item(index)).icon).toBe(item.icon)
    })
    expect(last('items', SLOT_KEYS.boots).icon).toBe(build.boots.icon)
    expect(last('runes', SLOT_KEYS.primaryStyle).icon).toBe(build.runes.primaryStyle.icon)
    expect(last('runes', SLOT_KEYS.keystone).icon).toBe(build.runes.keystone.icon)
    build.runes.primaryMinors.forEach((rune, index) => {
      expect(last('runes', SLOT_KEYS.primaryMinor(index)).icon).toBe(rune.icon)
    })
    expect(last('runes', SLOT_KEYS.secondaryStyle).icon).toBe(build.runes.secondaryStyle.icon)
    build.runes.secondaryMinors.forEach((rune, index) => {
      expect(last('runes', SLOT_KEYS.secondaryMinor(index)).icon).toBe(rune.icon)
    })
    build.shards.forEach((shard, index) => {
      expect(last('runes', SLOT_KEYS.shard(index)).icon).toBe(shard.icon)
    })
  })

  it('中途的陪跑帧不会提前泄露真实结果', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const build = builds(1, seed)[0]
      const plan = buildCardPlan(build, DATA, createRng(seed))
      for (const section of SECTION_ORDER) {
        for (const slot of plan[section]) {
          const final = slot.frames[slot.frames.length - 1]
          for (const frame of slot.frames.slice(0, -1)) {
            expect(frame.icon === final.icon && frame.text === final.text).toBe(false)
          }
        }
      }
    }
  })

  it('同一个 rng 种子产生同一份剧本（动画也可复现）', () => {
    const build = builds(1)[0]
    const a = buildCardPlan(build, DATA, createRng(123))
    const b = buildCardPlan(build, DATA, createRng(123))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('buildPlans 给每位玩家各出一份剧本', () => {
    const list = builds(5)
    const plans = buildPlans(list, DATA, createRng(7))
    expect(plans).toHaveLength(5)
    plans.forEach((plan, index) => {
      const final = plan.champion[0].frames[plan.champion[0].frames.length - 1]
      expect(final.icon).toBe(list[index].champion.icon)
    })
  })
})

describe('段与段之间的停顿', () => {
  /** 把当前这一幕刚好播到定格那一刻。 */
  function advancePastSection(section: SectionKey) {
    vi.advanceTimersByTime(sectionDuration(section) + 1)
  }

  it('第一幕不等：点了开始就在转', () => {
    const { controller } = controllerFor()
    controller.start()
    expect(controller.revealOf(0).state.position).toBe('rolling')
    controller.dispose()
  })

  it('一幕定格后会先空一拍，此时没有任何一段在滚动', () => {
    const { controller } = controllerFor()
    controller.start()
    advancePastSection('position')

    const reveal = controller.revealOf(0)
    expect(reveal.state.position).toBe('done')
    expect(reveal.state.champion).toBe('hidden')
    expect(controller.isPlaying.value).toBe(true)
    controller.dispose()
  })

  it('那一拍没走完之前，下一段不会提前开转', () => {
    const { controller } = controllerFor()
    controller.start()
    advancePastSection('position')

    vi.advanceTimersByTime(SECTION_GAP_MS - 40)
    expect(controller.revealOf(0).state.champion).toBe('hidden')
    controller.dispose()
  })

  it('空完那一拍，下一段才开始滚动', () => {
    const { controller } = controllerFor()
    controller.start()
    advancePastSection('position')

    vi.advanceTimersByTime(SECTION_GAP_MS + 40)
    expect(controller.revealOf(0).state.champion).toBe('rolling')
    controller.dispose()
  })

  it('整段播放期间，每一幕之间都确实存在没有幕在滚动的空档', () => {
    const { controller } = controllerFor()
    controller.start()

    let gapSamples = 0
    const totalMs = playerDuration() + PLAYER_GAP_MS + 500
    for (let elapsed = 0; elapsed < totalMs; elapsed += 20) {
      vi.advanceTimersByTime(20)
      const reveal = controller.revealOf(0)
      const anyRolling = SECTION_ORDER.some((section) => reveal.state[section] === 'rolling')
      const allDone = SECTION_ORDER.every((section) => reveal.state[section] === 'done')
      // 还没播完、又没有幕在滚，那就是夹在两幕之间的空档
      if (!anyRolling && !allDone) gapSamples++
    }

    // 6 幕之间有 5 个空档，每个 170ms，按 20ms 采样至少能采到若干次
    expect(gapSamples).toBeGreaterThanOrEqual(5)
    controller.dispose()
  })

  it('换人时停得更久，这一拍里下一位玩家还没开始', () => {
    const { controller } = controllerFor(2)
    controller.start()
    vi.advanceTimersByTime(playerDuration() + 1)

    for (const section of SECTION_ORDER) {
      expect(controller.revealOf(0).state[section]).toBe('done')
    }
    expect(controller.revealOf(1).state.position).toBe('hidden')
    expect(controller.isPlaying.value).toBe(true)

    vi.advanceTimersByTime(PLAYER_GAP_MS + 40)
    expect(controller.revealOf(1).state.position).toBe('rolling')
    controller.dispose()
  })

  it('停顿期间点一下会立刻开始下一段，不再等', () => {
    const { controller } = controllerFor()
    controller.start()
    advancePastSection('position')
    expect(controller.revealOf(0).state.champion).toBe('hidden')

    controller.finishCurrent()
    expect(controller.revealOf(0).state.champion).toBe('rolling')
    controller.dispose()
  })

  it('手动快进的段与段之间不留停顿', () => {
    const { controller } = controllerFor()
    controller.start()
    vi.advanceTimersByTime(30)

    controller.finishCurrent()
    expect(controller.revealOf(0).state.position).toBe('done')
    expect(controller.revealOf(0).state.champion).toBe('rolling')
    controller.dispose()
  })

  it('跳过和销毁都会掐掉还没到期的停顿', () => {
    for (const stop of ['skipAll', 'dispose'] as const) {
      const { controller } = controllerFor()
      controller.start()
      advancePastSection('position')

      controller[stop]()
      const snapshot = JSON.stringify(controller.revealOf(0).state)
      vi.advanceTimersByTime(3000)
      expect(JSON.stringify(controller.revealOf(0).state)).toBe(snapshot)
      controller.dispose()
    }
  })
})

describe('createRevealController', () => {
  it('起步时只有第一段在滚动，其余都是隐藏', () => {
    const { controller } = controllerFor()
    controller.start()
    const reveal = controller.revealOf(0)
    expect(reveal.state.position).toBe('rolling')
    expect(reveal.state.champion).toBe('hidden')
    expect(reveal.state.runes).toBe('hidden')
    expect(controller.isPlaying.value).toBe(true)
    controller.dispose()
  })

  it('不干预的话会自动播完所有玩家', () => {
    const { controller } = controllerFor(2)
    controller.start()
    vi.advanceTimersByTime(20000)
    for (const index of [0, 1]) {
      const reveal = controller.revealOf(index)
      for (const section of SECTION_ORDER) expect(reveal.state[section]).toBe('done')
    }
    expect(controller.isPlaying.value).toBe(false)
    controller.dispose()
  })

  it('播放过程中任意时刻，每一段的状态都只有 hidden/rolling/done 三种', () => {
    const { controller } = controllerFor(1)
    controller.start()
    for (let step = 0; step < 200; step++) {
      vi.advanceTimersByTime(60)
      const reveal = controller.revealOf(0)
      for (const section of SECTION_ORDER) {
        expect(['hidden', 'rolling', 'done']).toContain(reveal.state[section])
        expect(reveal.tick[section]).toBeGreaterThanOrEqual(0)
        expect(reveal.tick[section]).toBeLessThan(ROLL_TICKS[section])
      }
    }
    controller.dispose()
  })

  it('点击快进：当前这段立刻定格，并接着播下一段', () => {
    const { controller } = controllerFor()
    controller.start()
    vi.advanceTimersByTime(60)
    expect(controller.revealOf(0).state.position).toBe('rolling')

    controller.finishCurrent()
    const reveal = controller.revealOf(0)
    expect(reveal.state.position).toBe('done')
    expect(reveal.state.champion).toBe('rolling')
    controller.dispose()
  })

  it('连续快进可以一路推到终点', () => {
    const { controller } = controllerFor(1)
    controller.start()
    for (let guard = 0; guard < SECTION_ORDER.length * 2 && controller.isPlaying.value; guard++) {
      controller.finishCurrent()
    }
    expect(controller.isPlaying.value).toBe(false)
    const reveal = controller.revealOf(0)
    for (const section of SECTION_ORDER) expect(reveal.state[section]).toBe('done')
    controller.dispose()
  })

  it('跳过：所有玩家、所有段直接定格', () => {
    const { controller } = controllerFor(3)
    controller.start()
    vi.advanceTimersByTime(100)
    controller.skipAll()

    for (const index of [0, 1, 2]) {
      const reveal = controller.revealOf(index)
      for (const section of SECTION_ORDER) {
        expect(reveal.state[section]).toBe('done')
        expect(reveal.tick[section]).toBe(ROLL_TICKS[section] - 1)
      }
    }
    expect(controller.isPlaying.value).toBe(false)
    controller.dispose()
  })

  it('跳过之后定时器不再改变任何状态', () => {
    const { controller } = controllerFor(1)
    controller.start()
    controller.skipAll()
    const before = JSON.stringify(controller.revealOf(0).state)
    vi.advanceTimersByTime(5000)
    expect(JSON.stringify(controller.revealOf(0).state)).toBe(before)
    controller.dispose()
  })

  it('dispose 会停掉播放，避免重复随机时叠出并发动画', () => {
    const { controller } = controllerFor(1)
    controller.start()
    vi.advanceTimersByTime(80)
    controller.dispose()
    expect(controller.isPlaying.value).toBe(false)

    const snapshot = JSON.stringify(controller.revealOf(0).state)
    vi.advanceTimersByTime(5000)
    expect(JSON.stringify(controller.revealOf(0).state)).toBe(snapshot)
  })

  it('可以按自定义顺序播放（双队分组后按显示顺序）', () => {
    const list = builds(3)
    const plans = buildPlans(list, DATA, createRng(1))
    const ordered = createRevealController(plans, [2, 0, 1])

    ordered.start()
    expect(ordered.activePlayer.value).toBe(2)

    const seen = [ordered.activePlayer.value]
    for (let guard = 0; guard < SECTION_ORDER.length * 3 && ordered.isPlaying.value; guard++) {
      ordered.finishCurrent()
      if (ordered.isPlaying.value) seen.push(ordered.activePlayer.value)
    }

    expect([...new Set(seen)]).toEqual([2, 0, 1])
    expect(ordered.isPlaying.value).toBe(false)
    ordered.dispose()
  })

  it('同一时刻最多只有一段在滚动', () => {
    const { controller } = controllerFor(2)
    controller.start()
    for (let step = 0; step < 300; step++) {
      vi.advanceTimersByTime(40)
      let rolling = 0
      for (const player of [0, 1]) {
        const reveal = controller.revealOf(player)
        for (const section of SECTION_ORDER) {
          if (reveal.state[section] === 'rolling') rolling++
        }
      }
      expect(rolling).toBeLessThanOrEqual(1)
    }
    controller.dispose()
  })
})
