/**
 * 符文抽取（docs/RULES.md §6）。
 *
 * 主系：随机 1 系 → 基石 1 个 → 该系 3 排小符文各 1 个。
 * 副系：从其余 4 系随机 1 系 → 随机选 2 排 → 每排 1 个。
 * 小符文：3 排各 1 个（进攻 / 灵活 / 防御）。
 *
 * 海克斯科技闪现罗网（8306）在启迪系「巧具」排：只有「召唤师技能含闪现」且
 * 「主系或副系是启迪」时才进候选。因为该符文只在启迪系里，只要启迪被选中，
 * 条件就退化成「含闪现」——所以在抽这一排时把 8306 从候选里摘掉即可。
 */

import { HEXFLASH, SECONDARY_MINOR_SLOT_COUNT } from './constants'
import { pick, pickMany, type Rng } from './random'
import type { RuneRef, RuneSlot, RuneStyle, RunesSnapshot, StyleRef } from './types'

export interface RunePicks {
  primaryStyle: StyleRef
  keystone: RuneRef
  primaryMinors: RuneRef[]
  secondaryStyle: StyleRef
  secondaryMinors: RuneRef[]
  shards: RuneRef[]
}

function toStyleRef(style: RuneStyle): StyleRef {
  return { id: style.id, name: style.name, icon: style.icon }
}

/** 抽某一排时，若条件不满足则把海克斯科技闪现罗网摘出候选。 */
function candidatesFor(slot: RuneSlot, styleId: string, hasFlash: boolean): RuneRef[] {
  const isHexflashSlot = styleId === HEXFLASH.styleId && slot.slot === HEXFLASH.slotLabel
  if (!isHexflashSlot || hasFlash) return slot.runes

  const filtered = slot.runes.filter((rune) => rune.id !== HEXFLASH.runeId)
  if (filtered.length === 0) {
    throw new Error(`数据异常：启迪系「${HEXFLASH.slotLabel}」排在排除海克斯闪现罗网后没有候选`)
  }
  return filtered
}

export function pickRunes(
  options: { hasFlash: boolean },
  runes: RunesSnapshot,
  rng: Rng,
): RunePicks {
  const styles = runes.styles
  if (styles.length < 2) {
    throw new Error('数据异常：符文系少于 2 个，无法区分主副系')
  }

  const primaryStyle = pick(styles, rng)
  const keystone = pick(primaryStyle.keystones, rng)

  // 副系必须与主系不同。
  const secondaryPool = styles.filter((style) => style.id !== primaryStyle.id)
  const secondaryStyle = pick(secondaryPool, rng)

  // 主系：3 排各 1 个。
  const primaryMinors = primaryStyle.minors.map((slot) =>
    pick(candidatesFor(slot, primaryStyle.id, options.hasFlash), rng),
  )

  // 副系：随机 2 排，每排 1 个。
  const chosenSlots = pickMany(secondaryStyle.minors, SECONDARY_MINOR_SLOT_COUNT, rng)
  const secondaryMinors = chosenSlots.map((slot) =>
    pick(candidatesFor(slot, secondaryStyle.id, options.hasFlash), rng),
  )

  const shards = runes.shardRows.map((row) => pick(row.runes, rng))

  return {
    primaryStyle: toStyleRef(primaryStyle),
    keystone,
    primaryMinors,
    secondaryStyle: toStyleRef(secondaryStyle),
    secondaryMinors,
    shards,
  }
}
