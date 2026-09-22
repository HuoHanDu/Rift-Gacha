/**
 * 把一份最终结果翻译成「老虎机轮盘」：每一幕的每个格子都准备一串候选，
 * 前面是陪跑的干扰项，**最后一项一定是真实结果**。
 *
 * 干扰项用注入的 rng 生成，所以同一个 seed 既决定结果、也决定动画，重放完全一致。
 */

import { POSITION_LABELS } from '../core/constants'
import { pick, type Rng } from '../core/random'
import type { BuildResult, DataBundle, Position } from '../core/types'
import { ROLL_TICKS, SECTION_ORDER, type SectionKey } from './sections'

export interface SlotFrame {
  /** 图标 URL；纯文字槽位为空串。 */
  icon: string
  /** 文字；图标槽位为空串。 */
  text: string
}

export interface SlotFrames {
  key: string
  /** 长度 = `ROLL_TICKS[section]`，最后一项一定是真实结果。 */
  frames: SlotFrame[]
}

export type CardPlan = Record<SectionKey, SlotFrames[]>

/** 格子的稳定标识，卡面按它取当前帧。 */
export const SLOT_KEYS = {
  position: 'position',
  champion: 'champion',
  spell: (index: number) => `spell${index}`,
  starter: 'starter',
  item: (index: number) => `item${index}`,
  boots: 'boots',
  primaryStyle: 'primaryStyle',
  keystone: 'keystone',
  primaryMinor: (index: number) => `primaryMinor${index}`,
  secondaryStyle: 'secondaryStyle',
  secondaryMinor: (index: number) => `secondaryMinor${index}`,
  shard: (index: number) => `shard${index}`,
} as const

function iconFrame(icon: string): SlotFrame {
  return { icon, text: '' }
}

function textFrame(text: string): SlotFrame {
  return { icon: '', text }
}

function sameFrame(a: SlotFrame, b: SlotFrame): boolean {
  return a.icon === b.icon && a.text === b.text
}

function makeSlot(
  section: SectionKey,
  key: string,
  final: SlotFrame,
  candidates: readonly SlotFrame[],
  rng: Rng,
): SlotFrames {
  const total = ROLL_TICKS[section]
  // 陪跑项要排除真实结果，否则会在中途「提前揭晓」。
  const pool = candidates.filter((candidate) => !sameFrame(candidate, final))

  const frames: SlotFrame[] = []
  for (let index = 0; index < total - 1; index++) {
    frames.push(pool.length > 0 ? pick(pool, rng) : final)
  }
  frames.push(final)
  return { key, frames }
}

/** 出门装的候选池按位置分流，和真实随机一致。 */
function starterPool(position: Position, data: DataBundle) {
  if (position === 'support') return data.items.supportQuestUpgrades
  if (position === 'jungle') return data.items.starterJungle
  return data.items.starterGeneric
}

export function buildCardPlan(build: BuildResult, data: DataBundle, rng: Rng): CardPlan {
  const plan = {} as CardPlan
  for (const section of SECTION_ORDER) plan[section] = []

  const push = (
    section: SectionKey,
    key: string,
    final: SlotFrame,
    candidates: readonly SlotFrame[],
  ) => {
    plan[section].push(makeSlot(section, key, final, candidates, rng))
  }

  // 位置（纯文字）
  push(
    'position',
    SLOT_KEYS.position,
    textFrame(POSITION_LABELS[build.position]),
    Object.values(POSITION_LABELS).map(textFrame),
  )

  // 英雄
  push(
    'champion',
    SLOT_KEYS.champion,
    iconFrame(build.champion.icon),
    data.champions.map((champion) => iconFrame(champion.icon)),
  )

  // 两个召唤师技能
  const spellFrames = data.spells.map((spell) => iconFrame(spell.icon))
  build.spells.forEach((spell, index) => {
    push('spells', SLOT_KEYS.spell(index), iconFrame(spell.icon), spellFrames)
  })

  // 出门装（辅助展示的是升级件）
  const shownStarter = build.displayStarterItem ?? build.starterItem
  push(
    'starter',
    SLOT_KEYS.starter,
    iconFrame(shownStarter.icon),
    starterPool(build.position, data).map((item) => iconFrame(item.icon)),
  )

  // 六件成装 + 鞋子
  const legendaryFrames = data.items.legendary.map((item) => iconFrame(item.icon))
  build.legendaryItems.forEach((item, index) => {
    push('items', SLOT_KEYS.item(index), iconFrame(item.icon), legendaryFrames)
  })
  const bootPool = build.position === 'mid' ? data.items.bootsUpgraded : data.items.boots
  push(
    'items',
    SLOT_KEYS.boots,
    iconFrame(build.boots.icon),
    bootPool.map((item) => iconFrame(item.icon)),
  )

  // 符文：主系 / 副系 / 小符文
  const styleFrames = data.runes.styles.map((style) => iconFrame(style.icon))
  push('runes', SLOT_KEYS.primaryStyle, iconFrame(build.runes.primaryStyle.icon), styleFrames)
  push(
    'runes',
    SLOT_KEYS.keystone,
    iconFrame(build.runes.keystone.icon),
    data.runes.styles.flatMap((style) => style.keystones.map((rune) => iconFrame(rune.icon))),
  )
  const minorFrames = data.runes.styles.flatMap((style) =>
    style.minors.flatMap((slot) => slot.runes.map((rune) => iconFrame(rune.icon))),
  )
  build.runes.primaryMinors.forEach((rune, index) => {
    push('runes', SLOT_KEYS.primaryMinor(index), iconFrame(rune.icon), minorFrames)
  })
  push('runes', SLOT_KEYS.secondaryStyle, iconFrame(build.runes.secondaryStyle.icon), styleFrames)
  build.runes.secondaryMinors.forEach((rune, index) => {
    push('runes', SLOT_KEYS.secondaryMinor(index), iconFrame(rune.icon), minorFrames)
  })
  build.shards.forEach((shard, index) => {
    const row = data.runes.shardRows[index]
    push(
      'runes',
      SLOT_KEYS.shard(index),
      iconFrame(shard.icon),
      (row?.runes ?? data.runes.shardRows.flatMap((r) => r.runes)).map((rune) =>
        iconFrame(rune.icon),
      ),
    )
  })

  return plan
}

export function buildPlans(
  builds: readonly BuildResult[],
  data: DataBundle,
  rng: Rng,
): CardPlan[] {
  return builds.map((build) => buildCardPlan(build, data, rng))
}
