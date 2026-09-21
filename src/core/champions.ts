/**
 * 英雄抽取（docs/RULES.md §3）。
 *
 * 全场去重：任何英雄在整场（含两队）里只出现一次。
 * 做法是调用方持有一个 `usedHeroIds`，每次从「池 − 已用」里等概率取一个。
 */

import { pick, type Rng } from './random'
import type { ChampionRef } from './types'

export function pickChampion(
  champions: readonly ChampionRef[],
  usedHeroIds: ReadonlySet<string>,
  rng: Rng,
): ChampionRef {
  const pool = champions.filter((champion) => !usedHeroIds.has(champion.heroId))
  if (pool.length === 0) {
    throw new Error('英雄池已耗尽：玩家数超过了可用英雄数')
  }
  return pick(pool, rng)
}
