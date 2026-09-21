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
import type { BuildResult, GenerateInput } from '../src/core/types'
import { DATA } from '../src/data'

function makeInput(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    players: [{ name: '火寒毒', position: 'mid' }, { position: 'support' }],
    teamMode: false,
    splitTeamsRandomly: false,
    banSmiteForNonJungle: true,
    ...overrides,
  }
}

async function renderCard(build: BuildResult, showTeam: boolean): Promise<string> {
  const app = createSSRApp({ render: () => h(BuildCard, { build, showTeam }) })
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
    expect(html).toContain('还没有结果')
    // 未选到 5 个位置选项（随机 + 5 个位置）
    for (const label of ['随机', '上单', '打野', '中单', '下路', '辅助']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('非官方娱乐工具')
    expect(html).not.toContain('undefined')
  })
})
