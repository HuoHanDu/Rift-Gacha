/**
 * 展示层的渲染冒烟测试。
 *
 * 用 SSR 把 `BuildCard` 用**真实生成的构筑结果**渲染成 HTML，验证：
 * 组件能渲染、数据能流到界面上、中文文案没被吃掉。
 * 这不是视觉回归测试——视觉仍然要靠人眼看。
 */

import { renderToString } from '@vue/server-renderer'
import { createSSRApp, h } from 'vue'
import { describe, expect, it } from 'vitest'
import BuildCard from '../src/components/BuildCard.vue'
import IndexPage from '../src/pages/index/index.vue'
import { generateBuilds } from '../src/core/generate'
import { createRng } from '../src/core/random'
import type { BuildResult, GenerateInput } from '../src/core/types'
import { DATA } from '../src/data'
import type { CardReveal, SectionState } from '../src/reveal/controller'
import { buildCardPlan, SLOT_KEYS, type CardPlan } from '../src/reveal/plan'
import { SECTION_ORDER, type SectionKey } from '../src/reveal/sections'

function makeInput(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    players: [{ name: '火寒毒', position: 'mid' }, { position: 'support' }],
    teamMode: false,
    splitTeamsRandomly: false,
    banSmiteForNonJungle: true,
    ...overrides,
  }
}

function sample(seed: number, overrides: Partial<GenerateInput> = {}): BuildResult[] {
  const outcome = generateBuilds(makeInput(overrides), DATA, { seed })
  if (!outcome.ok) throw new Error('生成失败')
  return outcome.results
}

async function renderCard(build: BuildResult, showTeam: boolean): Promise<string> {
  const app = createSSRApp({
    render: () => h(BuildCard, { build, showTeam, reveal: null, active: false }),
  })
  return renderToString(app)
}

/** 手搓一份揭幕状态，绕开定时器，测试只关心渲染结果。 */
function manualReveal(
  plan: CardPlan,
  states: Partial<Record<SectionKey, SectionState>>,
  tick = 0,
): CardReveal {
  const state = {
    position: 'hidden',
    champion: 'hidden',
    spells: 'hidden',
    starter: 'hidden',
    items: 'hidden',
    runes: 'hidden',
    ...states,
  } as Record<SectionKey, SectionState>
  const ticks = Object.fromEntries(SECTION_ORDER.map((key) => [key, tick])) as Record<
    SectionKey,
    number
  >
  return { state, tick: ticks, plan }
}

async function renderCardWithReveal(
  build: BuildResult,
  reveal: CardReveal | null,
  active = false,
): Promise<string> {
  const app = createSSRApp({
    render: () => h(BuildCard, { build, showTeam: false, reveal, active }),
  })
  return renderToString(app)
}

describe('BuildCard 渲染', () => {
  it('把单人结果完整渲染出来', async () => {
    const outcome = generateBuilds(makeInput(), DATA, { seed: 42 })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const build = outcome.results[0]
    const html = await renderCard(build, false)

    expect(html).toContain(build.name)
    expect(html).toContain(build.champion.title)
    expect(html).toContain(build.champion.name)
    expect(html).toContain('中单')

    for (const spell of build.spells) expect(html).toContain(spell.name)
    expect(html).toContain(build.starterItem.name)
    for (const item of build.legendaryItems) expect(html).toContain(item.name)
    expect(html).toContain(build.boots.name)

    expect(html).toContain(build.runes.primaryStyle.name)
    expect(html).toContain(build.runes.keystone.name)
    for (const rune of build.runes.primaryMinors) expect(html).toContain(rune.name)
    expect(html).toContain(build.runes.secondaryStyle.name)
    for (const rune of build.runes.secondaryMinors) expect(html).toContain(rune.name)
    for (const shard of build.shards) expect(html).toContain(shard.name)

    expect(html).not.toContain('undefined')
    expect(html).not.toContain('[object Object]')
  })

  it('辅助的出门装展示为云游图鉴的升级件', async () => {
    const outcome = generateBuilds(makeInput(), DATA, { seed: 7 })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const support = outcome.results.find((build) => build.position === 'support')
    expect(support).toBeDefined()
    const html = await renderCard(support!, false)

    expect(html).toContain('云游图鉴 · 升级形态')
    expect(html).toContain(support!.displayStarterItem!.name)
  })

  it('双队模式下渲染队伍标签', async () => {
    const outcome = generateBuilds(
      makeInput({
        players: Array.from({ length: 10 }, (_, index) => ({ name: `P${index + 1}` })),
        teamMode: true,
        splitTeamsRandomly: true,
      }),
      DATA,
      { seed: 3 },
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const html = await renderCard(outcome.results[0], true)
    expect(html).toMatch(/蓝队|红队/)
  })

  it('全部 10 人、多个 seed 都能渲染且不出现 undefined', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const outcome = generateBuilds(
        makeInput({
          players: Array.from({ length: 10 }, () => ({})),
          teamMode: true,
          splitTeamsRandomly: true,
        }),
        DATA,
        { seed },
      )
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return

      for (const build of outcome.results) {
        const html = await renderCard(build, true)
        expect(html).not.toContain('undefined')
        expect(html.length).toBeGreaterThan(500)
      }
    }
  })
})

describe('首页渲染', () => {
  it('初始状态下渲染出标题、输入区与空状态', async () => {
    const app = createSSRApp({ render: () => h(IndexPage) })
    const html = await renderToString(app)

    expect(html).toContain('峡谷全随机构筑器')
    expect(html).toContain(`补丁 ${DATA.meta.patch}`)
    expect(html).toContain('开始随机')
    expect(html).toContain('单队 1–5 人')
    expect(html).toContain('双队最多 10 人')
    expect(html).toContain('非打野位置不出现惩戒')
    expect(html).toContain('揭幕动画：关')
    expect(html).toContain('还没有结果')
    // 未选到 5 个位置选项（随机 + 5 个位置）
    for (const label of ['随机', '上单', '打野', '中单', '下路', '辅助']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('非官方娱乐工具')
    expect(html).not.toContain('undefined')
  })
})

describe('揭幕动画的渲染', () => {
  it('全部隐藏时只剩序号和玩家名，格子都是占位块', async () => {
    const [build] = sample(42)
    const plan = buildCardPlan(build, DATA, createRng(1))
    const html = await renderCardWithReveal(build, manualReveal(plan, {}))

    expect(html).toContain(build.name)
    expect(html).toContain('01')
    // 位置、英雄、装备、符文都不应泄露
    expect(html).not.toContain(build.champion.title)
    expect(html).not.toContain(build.runes.keystone.name)
    for (const item of build.legendaryItems) expect(html).not.toContain(item.name)
    // 占位块出现了
    expect(html).toContain('class="ph"')
    expect(html).toContain('section__label')
  })

  it('英雄滚动中显示的是轮盘帧，不是最终英雄', async () => {
    const [build] = sample(42)
    const plan = buildCardPlan(build, DATA, createRng(1))
    const html = await renderCardWithReveal(
      build,
      manualReveal(plan, { champion: 'rolling' }, 0),
    )

    const frame = plan.champion.find((slot) => slot.key === SLOT_KEYS.champion)!.frames[0]
    expect(html).toContain(frame.icon)
    expect(frame.icon).not.toBe(build.champion.icon)
    // 英雄名字要等定格才出现
    expect(html).not.toContain(build.champion.title)
  })

  it('位置滚动中显示的是候选位置文案', async () => {
    const [build] = sample(7)
    const plan = buildCardPlan(build, DATA, createRng(2))
    const html = await renderCardWithReveal(build, manualReveal(plan, { position: 'rolling' }, 0))
    const frame = plan.position.find((slot) => slot.key === SLOT_KEYS.position)!.frames[0]
    expect(html).toContain(frame.text)
  })

  it('全部定格后与「不用动画」渲染完全一致', async () => {
    const [build] = sample(99)
    const plan = buildCardPlan(build, DATA, createRng(3))
    const allDone = Object.fromEntries(
      SECTION_ORDER.map((key) => [key, 'done' as SectionState]),
    ) as Record<SectionKey, SectionState>

    const withReveal = await renderCardWithReveal(build, manualReveal(plan, allDone))
    const without = await renderCardWithReveal(build, null)
    expect(withReveal).toBe(without)
    expect(withReveal).not.toContain('class="ph"')
  })

  it('滚动中不出资料卡，避免悬停看到未揭晓的内容', async () => {
    const [build] = sample(5)
    const plan = buildCardPlan(build, DATA, createRng(4))
    const html = await renderCardWithReveal(build, manualReveal(plan, { champion: 'rolling' }, 0))
    expect(html).not.toContain('chip__tip')
  })
})
