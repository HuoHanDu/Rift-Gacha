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

/** 官方英雄定位标签的中文名。 */
export const ROLE_LABELS: Record<string, string> = {
  fighter: '战士',
  tank: '坦克',
  mage: '法师',
  assassin: '刺客',
  marksman: '射手',
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

/** 项目标题：也是下面那份 Riot 声明里 [The title of your Project] 的取值。 */
export const PROJECT_TITLE = '峡谷全随机构筑器'

/**
 * Riot 同人政策（Legal Jibber Jabber）第 6 条要求「醒目地」包含的声明。
 *
 * 政策原文：
 *   If you share your Project with others, please conspicuously include the following notice:
 *   [The title of your Project] was created under Riot Games' "Legal Jibber Jabber" policy
 *   using assets owned by Riot Games.  Riot Games does not endorse or sponsor this project.
 *
 * 来源：https://www.riotgames.com/en/legal （Last Updated: August 2018）
 *
 * 这段是**法律声明**：必须原样保留英文，不要翻译、改写或省略。
 * 相关合规要点见 docs/RIGHTS.md。
 */
export const RIOT_FAN_NOTICE = `${PROJECT_TITLE} was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.`
