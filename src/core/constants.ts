/**
 * 运行时常量：规则里被写死、且不属于「数据口径」的东西。
 *
 * 数据口径（哪些装备属于哪个池）在 `scripts/lib/normalize.mjs` 里，
 * 因为那是构建期决定的事。这里只放随机引擎自己要用的固定映射。
 */

import type { Position, TeamId } from './types'

/** 五个位置的固定顺序。 */
export const POSITIONS: readonly Position[] = ['top', 'jungle', 'mid', 'adc', 'support']

export const POSITION_LABELS: Record<Position, string> = {
  top: '上单',
  jungle: '打野',
  mid: '中单',
  adc: '下路',
  support: '辅助',
}

/** 每队人数上限。 */
export const TEAM_SIZE = 5

/** docs/RULES.md §5.2 —— 成装件数。 */
export const LEGENDARY_ITEM_COUNT = 6

/** docs/RULES.md §6.3 —— 副系随机选中的排数。 */
export const SECONDARY_MINOR_SLOT_COUNT = 2

/** 单队模式的人数上限；双队模式是它的两倍。 */
export const MAX_TEAMS: readonly TeamId[] = [1, 2]

/** docs/RULES.md §4 —— 惩戒与闪现的 ID。 */
export const SPELL_IDS = {
  smite: '11',
  flash: '4',
} as const

/** docs/RULES.md §6.5 —— 海克斯科技闪现罗网，以及它所在的系与排。 */
export const HEXFLASH = {
  runeId: '8306',
  styleId: '8300',
  slotLabel: '巧具',
} as const

/** 默认队伍编号（单队模式下所有人都是 1 队）。 */
export const DEFAULT_TEAM: TeamId = 1
