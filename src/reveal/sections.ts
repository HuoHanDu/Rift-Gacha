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

/**
 * 两幕之间的呼吸间隔。
 *
 * 没有它的话，上一幕刚停下、下一幕立刻开始转，看起来像一串连续抖动而不是「一格一格揭晓」。
 * 停这一下之后，节奏才读得出来：定格 → 空一拍 → 下一段开转。
 */
export const SECTION_GAP_MS = 170

/** 换到下一位玩家时停得更久一点，让「这个人的结果出完了」这件事有落点。 */
export const PLAYER_GAP_MS = 340

/** 一幕从开始到定格的总时长（毫秒）。 */
export function sectionDuration(section: SectionKey): number {
  const total = ROLL_TICKS[section]
  let sum = 0
  for (let tick = 0; tick < total - 1; tick++) sum += tickDelay(tick, total)
  return sum
}

/** 一名玩家全部揭幕完的时长（含段间停顿，不含换人时那一拍）。 */
export function playerDuration(): number {
  const rolling = SECTION_ORDER.reduce((sum, section) => sum + sectionDuration(section), 0)
  const gaps = (SECTION_ORDER.length - 1) * SECTION_GAP_MS
  return rolling + gaps
}
