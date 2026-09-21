/**
 * 召唤师技能抽取（docs/RULES.md §4）。
 *
 * - 打野：必带惩戒，另一个从「池 − 惩戒」里取。
 * - 其他位置：开关开启（默认）时从「池 − 惩戒」里取 2 个，关闭时从全池取 2 个。
 * - 两个技能互不重复。
 */

import { SPELL_IDS } from './constants'
import { pick, pickMany, type Rng } from './random'
import type { Position, SpellRef } from './types'

export const SPELL_COUNT = 2

export function pickSpells(
  position: Position,
  spells: readonly SpellRef[],
  banSmiteForNonJungle: boolean,
  rng: Rng,
): SpellRef[] {
  const smite = spells.find((spell) => spell.id === SPELL_IDS.smite)
  if (!smite) {
    throw new Error(`数据异常：召唤师技能池里没有惩戒（id=${SPELL_IDS.smite}）`)
  }

  if (position === 'jungle') {
    const others = spells.filter((spell) => spell.id !== SPELL_IDS.smite)
    return [smite, pick(others, rng)]
  }

  const pool = banSmiteForNonJungle
    ? spells.filter((spell) => spell.id !== SPELL_IDS.smite)
    : spells

  if (pool.length < SPELL_COUNT) {
    throw new Error(`数据异常：可选召唤师技能不足 ${SPELL_COUNT} 个`)
  }
  return pickMany(pool, SPELL_COUNT, rng)
}
