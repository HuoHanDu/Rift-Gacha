/**
 * 强度瞄准（docs/STRENGTH.md §6）。
 *
 * 用户选一个挡位后，随机出来的结果要往那个挡位的目标分靠。做法是
 * **反复重试直到落进目标区间**，超过上限就取「最接近目标」的那次并如实标注未达标。
 *
 * ## 为什么做成「注入生成函数」的形状
 *
 * 这一层不认识随机引擎，只认识「给我第 N 次尝试的结果」。好处有两个：
 * 1. 重试逻辑可以**独立测试**，不用构造真实数据；
 * 2. **种子可复现这条纪律不被破坏**（AGENTS.md §4.2）——尝试次数由调用方
 *    从 `(seed, playerIndex, attempt)` 派生，全程不碰 `Math.random()`。
 *    所以「同 seed ⇒ 同结果」依然成立，连重试序列都一样。
 *
 * ## 必须有的兜底
 *
 * 目标区间**可能本身不可达**（例如要求六件全是核心装，但该英雄只有 3 件核心）。
 * 所以超限不能死循环，要取最接近的那次、并让界面能如实显示「未达标」。
 */

import { DEFAULT_TARGET_TOLERANCE, MAX_TARGET_ATTEMPTS } from './constants'
import { meetsTier, type StrengthBreakdown, type TierRule } from './strength'

export interface TargetSpec {
  /** `null` 表示不控强度（`完全随机` 挡），此时只尝试一次。 */
  tier: TierRule | null
  /** 容差比例，围绕目标区间放宽。默认见 constants。 */
  tolerance: number
  /** 最大尝试次数。 */
  maxAttempts: number
}

export interface TargetOutcome<T> {
  value: T
  breakdown: StrengthBreakdown
  /** 实际尝试了几次（至少 1）。 */
  attempts: number
  /** 是否满足了目标；`false` 时 `value` 是「最接近」的那一次。 */
  met: boolean
}

/**
 * 分数到目标区间的距离。0 表示落在区间内。
 *
 * 区间是 `[min, max)`；两端可以为 `null`（不设界）。上界宽、下界紧，
 * 所以离区间越近越好，落在区间内就是 0。
 */
export function distanceToTier(total: number, tier: TierRule): number {
  const { min, max } = tier
  if (min !== null && total < min) return min - total
  if (max !== null && total >= max) return total - max + 1
  return 0
}

/**
 * 带容差地判断是否达标。
 *
 * 容差的意义：目标区间本身很窄时（例如「爬行动物」只有十几分宽），
 * 严格命中会很困难、重试次数飙升。按比例放宽之后既容易命中，
 * 又不会跑到别的挡位里去。**容差不会越过相邻挡位的边界**——
 * 那由 `meetsTier` 的原始区间兜底检查。
 */
export function withinTolerance(total: number, tier: TierRule, tolerance: number): boolean {
  if (tier.min === null && tier.max === null) return true
  const span = (tier.max ?? tier.min ?? 0) - (tier.min ?? 0)
  const slack = Math.abs(span) * tolerance
  const low = tier.min === null ? Number.NEGATIVE_INFINITY : tier.min - slack
  const high = tier.max === null ? Number.POSITIVE_INFINITY : tier.max + slack
  return total >= low && total < high
}

/**
 * 反复尝试直到满足挡位；超限则返回最接近的一次。
 *
 * `attempt(n)` 必须对同一个 `n` 返回完全相同的结果（调用方负责从种子派生），
 * 否则「同 seed 同结果」不再成立。
 */
export function searchForTarget<T>(
  spec: TargetSpec,
  attempt: (attemptIndex: number) => { value: T; breakdown: StrengthBreakdown },
): TargetOutcome<T> {
  const first = attempt(0)

  // 「完全随机」挡：只生成一次，不做任何瞄准。
  if (!spec.tier) return { ...first, attempts: 1, met: true }

  if (meetsTier(first.breakdown, spec.tier) || withinTolerance(first.breakdown.total, spec.tier, spec.tolerance)) {
    return { ...first, attempts: 1, met: true }
  }

  let best = first
  let bestDistance = distanceToTier(first.breakdown.total, spec.tier)

  for (let index = 1; index < spec.maxAttempts; index++) {
    const candidate = attempt(index)
    if (
      meetsTier(candidate.breakdown, spec.tier) ||
      withinTolerance(candidate.breakdown.total, spec.tier, spec.tolerance)
    ) {
      return { ...candidate, attempts: index + 1, met: true }
    }
    const distance = distanceToTier(candidate.breakdown.total, spec.tier)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }

  // 超限：取最接近的那次，并如实标注未达标。
  return { ...best, attempts: spec.maxAttempts, met: false }
}

/** 从基础种子派生「第 n 次尝试」的种子，保证重试序列本身也可复现。 */
export function deriveAttemptSeed(baseSeed: number, playerIndex: number, attemptIndex: number): number {
  // 简单可逆的混合：不同的 (playerIndex, attemptIndex) 落到明显不同的种子上。
  // 不用 Math.random——那会破坏「同 seed ⇒ 同结果」。
  let value = (baseSeed ^ Math.imul(playerIndex + 1, 0x9e3779b1) ^ Math.imul(attemptIndex + 1, 0x85ebca6b)) | 0
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d)
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b)
  return (value ^ (value >>> 16)) >>> 0
}

export function defaultTargetSpec(tier: TierRule | null): TargetSpec {
  return {
    tier,
    tolerance: DEFAULT_TARGET_TOLERANCE,
    maxAttempts: MAX_TARGET_ATTEMPTS,
  }
}
