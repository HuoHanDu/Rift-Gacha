
/** 挡位 id。由弱到强；ny 表示「完全随机（不控强度）」。 */
export type StrengthTierId = 'any' | 'low' | 'mid' | 'high' | 'top'
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

// ---------------------------------------------------------------- 强度系统

/**
 * 各分值（docs/STRENGTH.md §2）。
 *
 * **改这里必须重跑 `scripts/analyze-total-score.mjs` 复核三块比例**
 * （目标 英雄 : 装备 : 符文 = 6 : 5 : 3，实测 5.96 : 5.21 : 2.83）。
 */
export const SCORE_POINTS = {
  /** 命中「优先成装」 */
  coreItem: 10,
  /** 命中「第 4/5/6 件」或鞋 */
  laterItem: 5,
  shoe: 5,
  starter: 5,
  /**
   * 适配度分。**只给 2 和 1**，因为 91.4% 的成装抽取都不在推荐列表里，
   * 给 +4 会让装备项翻倍、压过英雄项（模拟实测过）。
   */
  strongCompat: 2,
  weakCompat: 1,
} as const

/** 符文分。满分 = 7 + 4×3 + 2×2 + 2×3 = 29。 */
export const RUNE_POINTS = {
  keystone: 7,
  primaryMinor: 4,
  secondaryMinor: 2,
  shard: 2,
} as const

/** T 挡位加分。没有该分路数据时为 0（决策 6：不加分也不扣分）。 */
/**
 * 位置英雄分：(胜率 - 50) x LANE_K1 + 登场率 x LANE_K2（决策 4/5，比例 7:3）。
 *
 * **必须减掉 50 基线**，否则所有英雄白拿 50 分底分、区分度被压掉。
 *
 * 量级由 x3.5 定下（决策 11 的目标比例 英雄:装备:符文 = 6:5:3）。
 * 注意 rift-stats.json 里也存了一份构建期算好的 laneScore，但**评分不读它**，
 * 那一份只是快照里的参考值。所以改这里不需要重跑 fetch:101。
 */
export const LANE_K1 = 24.5
export const LANE_K2 = 10.5

/**
 * T 挡位加分。没有该分路数据时为 0（决策 6：不加分也不扣分）。
 *
 * **T 挡位贡献必须约等于胜率/登场率的 80%，不能压过它**——小代/主播会把胜率
 * 打高（如打野豹女），实测数据比官方分档更可信（决策 6）。
 */
export const TIER_BONUS: Record<string, number> = {
  T0: 95,
  T1: 67,
  T2: 39,
  T3: 14,
  T4: 0,
}

/** 符文「命中」取推荐页的前几页（§9：拐点在 5）。 */
export const RIFT_RUNE_TOP_N = 5

/**
 * 挡位（§4）。由弱到强，`any` 是「完全随机（不控强度）」。
 *
 * 最高档是**复合条件**（用户决策 C）：总分达标之外，还要求六件成装里
 * 至少命中 2 件推荐——否则高分可能只是靠一堆强相容的散件堆出来的。
 *
 * > ⚠️ 「人上人」这个名字是我按那个梗的惯用顺序先填的占位，**等用户确认/改名**。
 */
export const STRENGTH_TIERS: ReadonlyArray<{
  id: StrengthTierId
  label: string
  min: number | null
  max: number | null
  requireRecommended: number
}> = [
  { id: 'any', label: '完全随机', min: null, max: null, requireRecommended: 0 },
  { id: 'low', label: '区', min: null, max: 12, requireRecommended: 0 },
  { id: 'mid', label: '爬行动物', min: 12, max: 28, requireRecommended: 0 },
  { id: 'high', label: '类人', min: 28, max: null, requireRecommended: 0 },
  { id: 'top', label: '人上人', min: 116, max: null, requireRecommended: 2 },
]
