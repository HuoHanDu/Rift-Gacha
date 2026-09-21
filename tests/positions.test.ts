import { describe, expect, it } from 'vitest'
import { POSITIONS } from '../src/core/constants'
import { assignPlacements } from '../src/core/positions'
import { createRng } from '../src/core/random'
import type { PlayerInput, Position } from '../src/core/types'

function run(players: PlayerInput[], options: { teamMode: boolean; splitTeamsRandomly: boolean }, seed = 1) {
  return assignPlacements(players, options, createRng(seed))
}

describe('assignPlacements —— 单队', () => {
  it('未指定的位置会被随机补齐，且互不重复', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const result = run([{ position: 'jungle' }, {}, {}], {
        teamMode: false,
        splitTeamsRandomly: false,
      }, seed)
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const positions = result.placements.map((p) => p.position)
      expect(new Set(positions).size).toBe(3)
      expect(positions).toContain('jungle')
      expect(result.placements.every((p) => p.team === 1)).toBe(true)
    }
  })

  it('全部指定时结果就是指定的位置', () => {
    const result = run(
      [{ position: 'top' }, { position: 'adc' }],
      { teamMode: false, splitTeamsRandomly: false },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.placements.map((p) => p.position)).toEqual(['top', 'adc'])
  })

  it('同一队位置重复时返回错误', () => {
    const result = run([{ position: 'top' }, { position: 'top' }], {
      teamMode: false,
      splitTeamsRandomly: false,
    })
    expect(result.ok).toBe(false)
  })

  it('未指定位置时最终覆盖的位置都来自合法集合', () => {
    const result = run([{}, {}, {}, {}, {}], { teamMode: false, splitTeamsRandomly: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const positions = result.placements.map((p) => p.position)
    expect([...positions].sort()).toEqual([...POSITIONS].sort())
  })
})

describe('assignPlacements —— 双队随机分队', () => {
  it('10 人分成两队，每队 5 个互不重复的位置', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const result = run(Array.from({ length: 10 }, () => ({})), {
        teamMode: true,
        splitTeamsRandomly: true,
      }, seed)
      expect(result.ok).toBe(true)
      if (!result.ok) return

      for (const team of [1, 2] as const) {
        const positions = result.placements
          .filter((p) => p.team === team)
          .map((p) => p.position)
        expect(positions).toHaveLength(5)
        expect(new Set(positions).size).toBe(5)
      }
    }
  })

  it('每队各 1 个位置的指定输入能被满足', () => {
    const players: PlayerInput[] = [...POSITIONS, ...POSITIONS].map((position, index) => ({
      name: `P${index}`,
      position,
    }))
    for (let seed = 1; seed <= 200; seed++) {
      const result = run(players, { teamMode: true, splitTeamsRandomly: true }, seed)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      for (const team of [1, 2] as const) {
        const positions = result.placements
          .filter((p) => p.team === team)
          .map((p) => p.position)
        expect(new Set(positions).size).toBe(5)
      }
      // 指定的位置必须被尊重
      players.forEach((player, index) => {
        expect(result.placements[index].position).toBe(player.position)
      })
    }
  })

  it('无解时返回明确错误（6 个人都要上单）', () => {
    const players: PlayerInput[] = Array.from({ length: 6 }, () => ({ position: 'top' as Position }))
    const result = run(players, { teamMode: true, splitTeamsRandomly: true })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].code).toBe('DUPLICATE_POSITION')
    expect(result.errors[0].message).toContain('上单')
  })

  it('人数为奇数时两队按 ceil/floor 分配', () => {
    const result = run(Array.from({ length: 7 }, () => ({})), {
      teamMode: true,
      splitTeamsRandomly: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.placements.filter((p) => p.team === 1)).toHaveLength(4)
    expect(result.placements.filter((p) => p.team === 2)).toHaveLength(3)
  })
})

describe('assignPlacements —— 双队预先分队', () => {
  it('按指定队伍分组，指定的位置被尊重，其余随机补齐', () => {
    const players: PlayerInput[] = [
      { team: 1, position: 'top' },
      { team: 1 },
      { team: 1 },
      { team: 2, position: 'support' },
      { team: 2 },
    ]
    for (let seed = 1; seed <= 100; seed++) {
      const result = run(players, { teamMode: true, splitTeamsRandomly: false }, seed)
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.placements[0]).toEqual({ team: 1, position: 'top' })
      expect(result.placements[3]).toEqual({ team: 2, position: 'support' })

      for (const team of [1, 2] as const) {
        const positions = result.placements
          .filter((p) => p.team === team)
          .map((p) => p.position)
        expect(new Set(positions).size).toBe(positions.length)
      }
    }
  })

  it('某队超过 5 人时返回错误', () => {
    const players: PlayerInput[] = Array.from({ length: 6 }, () => ({ team: 1 as const }))
    const result = run(players, { teamMode: true, splitTeamsRandomly: false })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].code).toBe('TOO_MANY_PER_TEAM')
  })

  it('某队位置重复时返回错误', () => {
    const players: PlayerInput[] = [
      { team: 1, position: 'mid' },
      { team: 1, position: 'mid' },
    ]
    const result = run(players, { teamMode: true, splitTeamsRandomly: false })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].code).toBe('DUPLICATE_POSITION')
  })

  it('没选队伍的玩家兜底算 1 队', () => {
    const players: PlayerInput[] = [{ position: 'top' }, { position: 'mid' }]
    const result = run(players, { teamMode: true, splitTeamsRandomly: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.placements.every((p) => p.team === 1)).toBe(true)
  })
})
