/**
 * 输入校验（docs/RULES.md §1 的 V1~V5）。
 *
 * 只做「不看随机结果就能判定」的检查；需要分队之后才知道的冲突
 * （随机分队时位置撞车）在 `positions.ts` 里判定。
 */

import { POSITION_LABELS, POSITIONS, TEAM_SIZE } from './constants'
import type { DataBundle, GenerateInput, PlayerInput, Position, ValidationError } from './types'

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) dup.add(value)
    seen.add(value)
  }
  return [...dup]
}

function label(position: string): string {
  return POSITION_LABELS[position as Position] ?? position
}

function specifiedPositions(players: readonly PlayerInput[], indexes: readonly number[]): Position[] {
  return indexes
    .map((index) => players[index].position)
    .filter((position): position is Position => position !== undefined)
}

export function validateInput(input: GenerateInput, data: DataBundle): ValidationError[] {
  const errors: ValidationError[] = []
  const players = input.players
  const maxPlayers = input.teamMode ? TEAM_SIZE * 2 : TEAM_SIZE

  if (players.length === 0) {
    return [{ code: 'NO_PLAYERS', message: '至少要有 1 名玩家' }]
  }

  if (players.length > maxPlayers) {
    errors.push({
      code: 'TOO_MANY_PLAYERS',
      message: input.teamMode
        ? `双队模式最多 ${maxPlayers} 人，当前 ${players.length} 人`
        : `单队最多 ${maxPlayers} 人，当前 ${players.length} 人`,
    })
  }

  if (players.length > data.champions.length) {
    errors.push({
      code: 'NOT_ENOUGH_CHAMPIONS',
      message: `英雄全场不重复需要至少 ${players.length} 个英雄，数据里只有 ${data.champions.length} 个`,
    })
  }

  const invalid = players
    .map((player, index) => (player.position !== undefined && !POSITIONS.includes(player.position) ? index : -1))
    .filter((index) => index >= 0)
  if (invalid.length > 0) {
    errors.push({
      code: 'DUPLICATE_POSITION',
      message: `位置取值非法（玩家 ${invalid.map((i) => i + 1).join('、')}）`,
      playerIndexes: invalid,
    })
  }

  if (!input.teamMode) {
    errors.push(...checkSingleTeam(players))
  } else if (!input.splitTeamsRandomly) {
    errors.push(...checkPreSplitTeams(players))
  }

  return errors
}

/** 单队：位置不能重复。 */
function checkSingleTeam(players: readonly PlayerInput[]): ValidationError[] {
  const all = players.map((_, index) => index)
  const dup = duplicates(specifiedPositions(players, all))
  if (dup.length === 0) return []

  return [
    {
      code: 'DUPLICATE_POSITION',
      message: `同一队内位置不能重复：${dup.map(label).join('、')}`,
      playerIndexes: players
        .map((player, index) =>
          player.position && dup.includes(player.position) ? index : -1,
        )
        .filter((index) => index >= 0),
    },
  ]
}

/** 双队 + 预先分队：每队人数上限、每队内位置不能重复、队伍必须已指定。 */
function checkPreSplitTeams(players: readonly PlayerInput[]): ValidationError[] {
  const errors: ValidationError[] = []

  const missing = players
    .map((player, index) => (player.team === undefined ? index : -1))
    .filter((index) => index >= 0)
  if (missing.length > 0) {
    return [
      {
        code: 'MISSING_TEAM',
        message: `已选择「预先分队」，玩家 ${missing.map((i) => i + 1).join('、')} 还没有选队伍`,
        playerIndexes: missing,
      },
    ]
  }

  for (const team of [1, 2] as const) {
    const indexes = players
      .map((player, index) => (player.team === team ? index : -1))
      .filter((index) => index >= 0)

    if (indexes.length > TEAM_SIZE) {
      errors.push({
        code: 'TOO_MANY_PER_TEAM',
        message: `第 ${team} 队最多 ${TEAM_SIZE} 人，当前 ${indexes.length} 人`,
        playerIndexes: indexes,
      })
    }

    const dup = duplicates(specifiedPositions(players, indexes))
    if (dup.length === 0) continue

    errors.push({
      code: 'DUPLICATE_POSITION',
      message: `第 ${team} 队内位置不能重复：${dup.map(label).join('、')}`,
      playerIndexes: indexes.filter((index) => {
        const position = players[index].position
        return position !== undefined && dup.includes(position)
      }),
    })
  }

  return errors
}
