import { describe, expect, it } from 'vitest'
import { SPELL_IDS } from '../src/core/constants'
import { generateBuilds } from '../src/core/generate'
import type { GenerateInput, GenerateResult, PlayerInput } from '../src/core/types'
import { DATA, assertInvariants } from './helpers/fixtures'

const SEEDS = 200

function ok(result: GenerateResult) {
  if (!result.ok) {
    throw new Error(`期望生成成功，实际报错：${result.errors.map((e) => e.message).join('; ')}`)
  }
  return result
}

function input(players: PlayerInput[], overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    players,
    teamMode: false,
    splitTeamsRandomly: false,
    banSmiteForNonJungle: true,
    ...overrides,
  }
}

describe('generateBuilds —— 可复现性', () => {
  it('同 seed 同输入两次运行结果完全一致', () => {
    const request = input([{}, { position: 'jungle' }, {}, {}, {}])
    const a = ok(generateBuilds(request, DATA, { seed: 20260921 }))
    const b = ok(generateBuilds(request, DATA, { seed: 20260921 }))
    expect(JSON.stringify(a.results)).toBe(JSON.stringify(b.results))
    expect(a.seed).toBe(b.seed)
  })

  it('不同 seed 结果不同', () => {
    const request = input([{}])
    const a = ok(generateBuilds(request, DATA, { seed: 1 }))
    const b = ok(generateBuilds(request, DATA, { seed: 2 }))
    expect(JSON.stringify(a.results)).not.toBe(JSON.stringify(b.results))
  })

  it('不传 seed 时返回实际使用的 seed，并可据此复现', () => {
    const request = input([{}, {}])
    const first = ok(generateBuilds(request, DATA))
    const replay = ok(generateBuilds(request, DATA, { seed: first.seed }))
    expect(JSON.stringify(replay.results)).toBe(JSON.stringify(first.results))
  })
})

describe('generateBuilds —— 单人', () => {
  it('不填任何输入时等价于单人生成，名字兜底为「玩家 1」', () => {
    const result = ok(generateBuilds(input([{}]), DATA, { seed: 7 }))
    expect(result.results).toHaveLength(1)
    expect(result.results[0].name).toBe('玩家 1')
    expect(result.results[0].team).toBe(1)
  })

  it('每个 seed 都满足全部不变量', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const result = ok(generateBuilds(input([{ name: '火寒毒' }]), DATA, { seed }))
      expect(result.results[0].name).toBe('火寒毒')
      assertInvariants(result.results[0], DATA)
    }
  })
})

describe('generateBuilds —— 5 人单队', () => {
  it('位置互不重复、英雄全场不重复，且每份结果满足不变量', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const result = ok(generateBuilds(input(Array.from({ length: 5 }, () => ({}))), DATA, { seed }))
      expect(result.results).toHaveLength(5)

      const positions = result.results.map((r) => r.position)
      expect(new Set(positions).size).toBe(5)

      const heroes = result.results.map((r) => r.champion.heroId)
      expect(new Set(heroes).size).toBe(5)

      for (const build of result.results) assertInvariants(build, DATA)
    }
  })

  it('指定的位置被尊重', () => {
    const result = ok(
      generateBuilds(
        input([{ position: 'top' }, { position: 'jungle' }, { position: 'mid' }, { position: 'adc' }, { position: 'support' }]),
        DATA,
        { seed: 11 },
      ),
    )
    expect(result.results.map((r) => r.position)).toEqual(['top', 'jungle', 'mid', 'adc', 'support'])
  })
})

describe('generateBuilds —— 10 人双队', () => {
  it('随机分队：两队各 5 人、位置各自不重复、英雄全场不重复', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const result = ok(
        generateBuilds(
          input(Array.from({ length: 10 }, (_, i) => ({ name: `P${i + 1}` })), {
            teamMode: true,
            splitTeamsRandomly: true,
          }),
          DATA,
          { seed },
        ),
      )
      expect(result.results).toHaveLength(10)
      expect(new Set(result.results.map((r) => r.champion.heroId)).size).toBe(10)

      for (const team of [1, 2] as const) {
        const ofTeam = result.results.filter((r) => r.team === team)
        expect(ofTeam).toHaveLength(5)
        expect(new Set(ofTeam.map((r) => r.position)).size).toBe(5)
      }

      for (const build of result.results) assertInvariants(build, DATA)
    }
  })

  it('预先分队：按指定队伍分组，位置各自不重复', () => {
    const players: PlayerInput[] = Array.from({ length: 10 }, (_, index) => ({
      name: `P${index + 1}`,
      team: index < 5 ? 1 : 2,
    }))
    for (let seed = 1; seed <= SEEDS; seed++) {
      const result = ok(
        generateBuilds(
          input(players, { teamMode: true, splitTeamsRandomly: false }),
          DATA,
          { seed },
        ),
      )
      expect(result.results.filter((r) => r.team === 1)).toHaveLength(5)
      expect(result.results.filter((r) => r.team === 2)).toHaveLength(5)
      expect(new Set(result.results.map((r) => r.champion.heroId)).size).toBe(10)
      for (const team of [1, 2] as const) {
        const positions = result.results.filter((r) => r.team === team).map((r) => r.position)
        expect(new Set(positions).size).toBe(5)
      }
      for (const build of result.results) assertInvariants(build, DATA)
    }
  })

  it('预先分队且指定位置时，位置被尊重且不冲突', () => {
    const plan = ['top', 'jungle', 'mid', 'adc', 'support'] as const
    const players: PlayerInput[] = plan.flatMap((position, index) => [
      { name: `A${index}`, team: 1 as const, position },
      { name: `B${index}`, team: 2 as const, position },
    ])
    for (let seed = 1; seed <= 50; seed++) {
      const result = ok(
        generateBuilds(input(players, { teamMode: true, splitTeamsRandomly: false }), DATA, { seed }),
      )
      players.forEach((player, index) => {
        expect(result.results[index].position).toBe(player.position)
        expect(result.results[index].team).toBe(player.team)
      })
      for (const build of result.results) assertInvariants(build, DATA)
    }
  })
})

describe('generateBuilds —— 惩戒开关', () => {
  it('开关开启时非打野位置不会出现惩戒', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const result = ok(
        generateBuilds(input([{ position: 'top' }], { banSmiteForNonJungle: true }), DATA, { seed }),
      )
      expect(result.results[0].spells.some((s) => s.id === SPELL_IDS.smite)).toBe(false)
    }
  })

  it('开关关闭时非打野位置可以出现惩戒', () => {
    let hit = 0
    for (let seed = 1; seed <= SEEDS * 4; seed++) {
      const result = ok(
        generateBuilds(input([{ position: 'top' }], { banSmiteForNonJungle: false }), DATA, { seed }),
      )
      if (result.results[0].spells.some((s) => s.id === SPELL_IDS.smite)) hit++
    }
    expect(hit).toBeGreaterThan(0)
  })

  it('打野恒带惩戒，且另一个技能不是惩戒', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const result = ok(
        generateBuilds(input([{ position: 'jungle' }], { banSmiteForNonJungle: true }), DATA, { seed }),
      )
      const spells = result.results[0].spells
      expect(spells.some((s) => s.id === SPELL_IDS.smite)).toBe(true)
      expect(new Set(spells.map((s) => s.id)).size).toBe(2)
    }
  })
})

describe('generateBuilds —— 输入错误', () => {
  it('非法输入返回 ok:false 而不是抛异常', () => {
    const result = generateBuilds(input([{ position: 'top' }, { position: 'top' }]), DATA, { seed: 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].code).toBe('DUPLICATE_POSITION')
  })

  it('没有玩家时返回 NO_PLAYERS', () => {
    const result = generateBuilds(input([]), DATA, { seed: 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((e) => e.code)).toContain('NO_PLAYERS')
  })
})
