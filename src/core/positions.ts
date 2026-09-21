/**
 * 分队与位置分配（docs/RULES.md §2）。
 *
 * 两条路径：
 * - **随机分队**：把玩家洗牌后，逐个「发牌」给还能接纳他的队伍——队伍必须还有空位，
 *   且不能已经有同位置的队友。优先发给当前人数少的一队，并列时随机。这样既保证随机性，
 *   又满足「每队 5 个位置互不重复」；确实无解时（例如 6 个人都要上单）返回明确错误。
 * - **预先分队**：按玩家指定的队伍分组，每队分别用「固定位置先占位、其余随机补齐」的方式填满。
 */

import { POSITION_LABELS, POSITIONS, TEAM_SIZE } from './constants'
import { pick, shuffle, type Rng } from './random'
import type { PlayerInput, Position, TeamId, ValidationError } from './types'

export interface Placement {
  team: TeamId
  position: Position
}

export type PlacementResult =
  | { ok: true; placements: Placement[] }
  | { ok: false; errors: ValidationError[] }

const TEAMS: readonly TeamId[] = [1, 2]

function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index)
}

/** 从池子里取前 n 个（池子已洗牌），用于「未指定位置」的补齐。 */
function dealPositions(available: readonly Position[], count: number): Position[] {
  return available.slice(0, count)
}

export function assignPlacements(
  players: readonly PlayerInput[],
  options: { teamMode: boolean; splitTeamsRandomly: boolean },
  rng: Rng,
): PlacementResult {
  if (players.length === 0) {
    return { ok: false, errors: [{ code: 'NO_PLAYERS', message: '至少要有 1 名玩家' }] }
  }
  if (!options.teamMode) {
    return assignSingleTeam(players, rng)
  }
  return options.splitTeamsRandomly
    ? assignRandomTeams(players, rng)
    : assignPresetTeams(players, rng)
}

function assignSingleTeam(players: readonly PlayerInput[], rng: Rng): PlacementResult {
  const wanted = players.map((player) => player.position ?? null)
  const taken = wanted.filter((position): position is Position => position !== null)

  if (new Set(taken).size !== taken.length) {
    return {
      ok: false,
      errors: [
        { code: 'DUPLICATE_POSITION', message: '同一队内位置不能重复' },
      ],
    }
  }

  const free = shuffle(
    POSITIONS.filter((position) => !taken.includes(position)),
    rng,
  )
  const fill = dealPositions(free, wanted.filter((position) => position === null).length)

  let cursor = 0
  const placements = wanted.map<Placement>((position) => ({
    team: 1,
    position: position ?? fill[cursor++],
  }))

  return { ok: true, placements }
}

function assignRandomTeams(players: readonly PlayerInput[], rng: Rng): PlacementResult {
  const order = shuffle(range(players.length), rng)
  const capacity: Record<TeamId, number> = {
    1: Math.ceil(players.length / 2),
    2: Math.floor(players.length / 2),
  }
  const used: Record<TeamId, Set<Position>> = { 1: new Set(), 2: new Set() }
  const counts: Record<TeamId, number> = { 1: 0, 2: 0 }
  const pending: Record<TeamId, number[]> = { 1: [], 2: [] }

  const placements: Placement[] = new Array(players.length)

  for (const index of order) {
    const want = players[index].position ?? null
    const candidates = TEAMS.filter(
      (team) => counts[team] < capacity[team] && (want === null || !used[team].has(want)),
    )

    if (candidates.length === 0) {
      const conflicts = TEAMS.filter((team) => want !== null && used[team].has(want))
      return {
        ok: false,
        errors: [
          {
            code: 'DUPLICATE_POSITION',
            message:
              conflicts.length > 0 && want !== null
                ? `无法分队：指定「${POSITION_LABELS[want]}」的玩家太多，两队各只能有 1 个（玩家 ${index + 1} 放不下）`
                : `无法分队：每队最多 ${TEAM_SIZE} 人，玩家 ${index + 1} 放不下`,
            playerIndexes: [index],
          },
        ],
      }
    }

    // 优先发给人数较少的一队，并列时随机——这样两队人数自然均衡。
    const leastLoaded = candidates.filter(
      (team) => counts[team] === Math.min(...candidates.map((t) => counts[t])),
    )
    const team = pick(leastLoaded, rng)

    counts[team] += 1
    if (want === null) {
      pending[team].push(index)
    } else {
      used[team].add(want)
    }
    placements[index] = { team, position: want ?? POSITIONS[0] }
  }

  for (const team of TEAMS) {
    const free = shuffle(
      POSITIONS.filter((position) => !used[team].has(position)),
      rng,
    )
    const fill = dealPositions(free, pending[team].length)
    pending[team].forEach((index, offset) => {
      placements[index] = { team, position: fill[offset] }
    })
  }

  return { ok: true, placements }
}

function assignPresetTeams(players: readonly PlayerInput[], rng: Rng): PlacementResult {
  const placements: Placement[] = new Array(players.length)

  for (const team of TEAMS) {
    // 未指定队伍的玩家兜底算 1 队（validateInput 会先报 MISSING_TEAM）。
    const indexes = range(players.length).filter(
      (index) => (players[index].team ?? 1) === team,
    )
    if (indexes.length > TEAM_SIZE) {
      return {
        ok: false,
        errors: [
          {
            code: 'TOO_MANY_PER_TEAM',
            message: `第 ${team} 队最多 ${TEAM_SIZE} 人，当前 ${indexes.length} 人`,
            playerIndexes: indexes,
          },
        ],
      }
    }

    const taken = indexes
      .map((index) => players[index].position)
      .filter((position): position is Position => position !== undefined)
    if (new Set(taken).size !== taken.length) {
      return {
        ok: false,
        errors: [
          { code: 'DUPLICATE_POSITION', message: `第 ${team} 队内位置不能重复`, playerIndexes: indexes },
        ],
      }
    }

    const free = shuffle(POSITIONS.filter((position) => !taken.includes(position)), rng)
    const blanks = indexes.filter((index) => players[index].position === undefined)
    const fill = dealPositions(free, blanks.length)

    indexes.forEach((index) => {
      const position = players[index].position
      placements[index] = {
        team,
        position: position ?? fill[blanks.indexOf(index)],
      }
    })
  }

  return { ok: true, placements }
}
