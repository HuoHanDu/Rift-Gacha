/**
 * 可注入的种子随机源。
 *
 * 约定（见 AGENTS.md §4.2）：项目内所有随机都必须走这里。
 * 唯一允许直接使用 Math.random 的地方是本文件的 createRandomSeed()——
 * 它负责为一次全新的随机会话产生种子。
 */

export type Rng = () => number

/**
 * mulberry32：32 位状态的短小 PRNG。
 * 选它的理由是无依赖、分布足够均匀、同种子完全可复现。
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 默认随机源：不可复现，用于页面上「随便来一次」。 */
export const defaultRng: Rng = () => Math.random()

/** 为一次新会话产生种子。 */
export function createRandomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
}

/** 返回 [0, maxExclusive) 的整数。 */
export function randInt(maxExclusive: number, rng: Rng): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error(`randInt: maxExclusive 必须是正整数，收到 ${maxExclusive}`)
  }
  // rng() 理论上可能返回恰好 1（实现瑕疵），取模兜底避免越界。
  return Math.floor(rng() * maxExclusive) % maxExclusive
}

/** 等概率取 1 个。 */
export function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) {
    throw new Error('pick: 候选集合为空')
  }
  return items[randInt(items.length, rng)]
}

/** Fisher-Yates，返回新数组，不修改入参。 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1, rng)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/** 无放回地取 n 个。 */
export function pickMany<T>(items: readonly T[], n: number, rng: Rng): T[] {
  if (!Number.isInteger(n) || n < 0 || n > items.length) {
    throw new Error(`pickMany: 需要 0 <= n <= ${items.length}，收到 ${n}`)
  }
  return shuffle(items, rng).slice(0, n)
}

/**
 * 加权等概率地从多个候选集中选一个集合，再从该集合里取 1 个。
 * 用于「先随机排、再随机符」这类两步抽取，避免把两步写成两处随机调用。
 */
export function pickFromGroups<T>(groups: readonly (readonly T[])[], rng: Rng): T {
  const nonEmpty = groups.filter((g) => g.length > 0)
  if (nonEmpty.length === 0) {
    throw new Error('pickFromGroups: 所有候选集都为空')
  }
  return pick(pick(nonEmpty, rng), rng)
}
