/**
 * 揭幕动画的「剧本」定义：分几幕、每幕滚几帧、帧间隔怎么变慢。
 *
 * 这些是纯数据与纯函数，不依赖 Vue 也不依赖 DOM，可以直接单测。
 */

export type SectionKey =
  | 'position'
  | 'champion'
  | 'spells'
  | 'starter'
  | 'items'
  | 'runes'

/**
 * 一名玩家的揭幕顺序（docs/RULES.md §8 的生成顺序，也是需求里指定的播放顺序）：
 * 位置 → 英雄头像 → 两个召唤师技能 → 出门装 → 成装 + 鞋子 → 符文
 */
export const SECTION_ORDER: readonly SectionKey[] = [
  'position',
  'champion',
  'spells',
  'starter',
  'items',
  'runes',
]

export const SECTION_LABELS: Record<SectionKey, string> = {
  position: '位置',
  champion: '英雄',
  spells: '召唤师技能',
  starter: '出门装',
  items: '成装',
  runes: '符文',
}

/**
 * 每一幕滚动的帧数。帧数越多，这一幕停留越久。
 * 同一幕里所有格子共用同一条时间线，所以「两个召唤师技能同时开转、同时停下」是天然的。
 */
export const ROLL_TICKS: Record<SectionKey, number> = {
  position: 6,
  champion: 9,
  spells: 7,
  starter: 6,
  items: 9,
  runes: 8,
}

/** 第 tick 帧之后隔多久进下一帧：先快后慢，最后一帧明显拖住。 */
export function tickDelay(tick: number, total: number): number {
  if (total <= 1) return 0
  const progress = Math.min(1, Math.max(0, tick / (total - 1)))
  return Math.round(40 + progress * progress * 240)
}

/** 一幕从开始到定格的总时长（毫秒），用于给用户一个心理预期。 */
export function sectionDuration(section: SectionKey): number {
  const total = ROLL_TICKS[section]
  let sum = 0
  for (let tick = 0; tick < total - 1; tick++) sum += tickDelay(tick, total)
  return sum
}

/** 一名玩家全部揭幕完的时长。 */
export function playerDuration(): number {
  return SECTION_ORDER.reduce((sum, section) => sum + sectionDuration(section), 0)
}
