import { describe, expect, it } from 'vitest'
import { validateInput } from '../src/core/validate'
import type { GenerateInput, PlayerInput } from '../src/core/types'
import { DATA, withChampions } from './helpers/fixtures'

function input(players: PlayerInput[], overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    players,
    teamMode: false,
    splitTeamsRandomly: false,
    banSmiteForNonJungle: true,
    ...overrides,
  }
}

function codes(errors: ReturnType<typeof validateInput>): string[] {
  return errors.map((error) => error.code)
}

describe('validateInput', () => {
  it('没有玩家时返回 NO_PLAYERS', () => {
    const errors = validateInput(input([]), DATA)
    expect(codes(errors)).toContain('NO_PLAYERS')
  })

  it('单队超过 5 人返回 TOO_MANY_PLAYERS', () => {
    const errors = validateInput(input(Array.from({ length: 6 }, () => ({}))), DATA)
    expect(codes(errors)).toEqual(['TOO_MANY_PLAYERS'])
  })

  it('双队超过 10 人返回 TOO_MANY_PLAYERS', () => {
    const errors = validateInput(
      input(Array.from({ length: 11 }, () => ({})), { teamMode: true, splitTeamsRandomly: true }),
      DATA,
    )
    expect(codes(errors)).toEqual(['TOO_MANY_PLAYERS'])
  })

  it('单队位置重复时返回 DUPLICATE_POSITION，并指出是哪几个玩家', () => {
    const errors = validateInput(
      input([{ position: 'top' }, { position: 'mid' }, { position: 'top' }]),
      DATA,
    )
    const dup = errors.find((error) => error.code === 'DUPLICATE_POSITION')
    expect(dup).toBeDefined()
    expect(dup?.playerIndexes).toEqual([0, 2])
  })

  it('合法单队输入没有任何错误', () => {
    const errors = validateInput(
      input([{ position: 'top' }, { position: 'mid' }, {}]),
      DATA,
    )
    expect(errors).toEqual([])
  })

  it('位置取值非法时返回 DUPLICATE_POSITION 并指向该玩家', () => {
    const errors = validateInput(
      input([{ position: 'top' }, { position: 'midlane' as never }]),
      DATA,
    )
    const dup = errors.find((error) => error.code === 'DUPLICATE_POSITION')
    expect(dup?.playerIndexes).toEqual([1])
  })

  it('预先分队但有人没选队伍时返回 MISSING_TEAM', () => {
    const errors = validateInput(
      input([{ team: 1 }, { team: undefined }], {
        teamMode: true,
        splitTeamsRandomly: false,
      }),
      DATA,
    )
    expect(codes(errors)).toEqual(['MISSING_TEAM'])
    expect(errors[0].playerIndexes).toEqual([1])
  })

  it('预先分队某队超过 5 人时返回 TOO_MANY_PER_TEAM', () => {
    const players: PlayerInput[] = [
      ...Array.from({ length: 6 }, () => ({ team: 1 as const })),
    ]
    const errors = validateInput(input(players, { teamMode: true, splitTeamsRandomly: false }), DATA)
    expect(codes(errors)).toContain('TOO_MANY_PER_TEAM')
  })

  it('预先分队某队位置重复时返回 DUPLICATE_POSITION', () => {
    const players: PlayerInput[] = [
      { team: 1, position: 'top' },
      { team: 1, position: 'top' },
      { team: 2, position: 'top' },
    ]
    const errors = validateInput(input(players, { teamMode: true, splitTeamsRandomly: false }), DATA)
    const dup = errors.find((error) => error.code === 'DUPLICATE_POSITION')
    expect(dup).toBeDefined()
    expect(dup?.playerIndexes).toEqual([0, 1])
  })

  it('随机分队时不校验队伍字段，也不因跨队同位置报错', () => {
    const players: PlayerInput[] = [
      { position: 'top' },
      { position: 'top' },
      { position: 'mid' },
    ]
    const errors = validateInput(input(players, { teamMode: true, splitTeamsRandomly: true }), DATA)
    expect(errors).toEqual([])
  })

  it('玩家数超过英雄池时返回 NOT_ENOUGH_CHAMPIONS', () => {
    const errors = validateInput(
      input(Array.from({ length: 3 }, () => ({}))),
      withChampions(2),
    )
    expect(codes(errors)).toEqual(['NOT_ENOUGH_CHAMPIONS'])
  })
})
