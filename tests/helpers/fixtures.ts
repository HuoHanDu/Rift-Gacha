/**
 * 测试用数据。
 *
 * 用**真实的构建期快照**而不是手搓 fixture：
 * 规则能不能在真实数据上跑通，本身就是 P1 口径的一部分。
 */

import { DATA } from '../../src/data'
import { HEXFLASH, POSITION_LABELS, SPELL_IDS } from '../../src/core/constants'
import type { BuildResult, DataBundle, GenerateInput } from '../../src/core/types'

export { DATA, HEXFLASH, POSITION_LABELS, SPELL_IDS }

/** 复制一份数据但替换英雄池，用于构造「英雄不够」这类场景。 */
export function withChampions(count: number): DataBundle {
  return { ...DATA, champions: DATA.champions.slice(0, count) }
}

export function singleInput(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    players: [{}],
    teamMode: false,
    splitTeamsRandomly: false,
    banSmiteForNonJungle: true,
    ...overrides,
  }
}

export function players(count: number, positions?: (string | undefined)[]) {
  return Array.from({ length: count }, (_, index) => ({
    name: `P${index + 1}`,
    position: positions?.[index] as never,
  }))
}

/** 断言一份结果满足 docs/RULES.md §10 的全部不变量。 */
export function assertInvariants(result: BuildResult, data: DataBundle): void {
  const legendaryPool = new Set(data.items.legendary.map((item) => item.id))
  const bootIds = new Set(data.items.boots.map((item) => item.id))
  const upgradedBootIds = new Set(data.items.bootsUpgraded.map((item) => item.id))
  const excluded = new Set(['4643', '3869', '3870', '3871', '3876', '3877'])

  const fail = (message: string): never => {
    throw new Error(`玩家 ${result.playerIndex + 1}（${POSITION_LABELS[result.position]}）：${message}`)
  }

  // 召唤师技能
  if (result.spells.length !== 2) fail(`召唤师技能不是 2 个，实际 ${result.spells.length}`)
  if (new Set(result.spells.map((s) => s.id)).size !== 2) fail('两个召唤师技能重复')
  const hasSmite = result.spells.some((s) => s.id === SPELL_IDS.smite)
  if (result.position === 'jungle' && !hasSmite) fail('打野没有带惩戒')

  // 成装
  if (result.legendaryItems.length !== 6) {
    fail(`成装不是 6 件，实际 ${result.legendaryItems.length}`)
  }
  if (new Set(result.legendaryItems.map((i) => i.id)).size !== 6) fail('成装内部有重复')
  for (const item of result.legendaryItems) {
    if (!legendaryPool.has(item.id)) fail(`成装 ${item.name}(${item.id}) 不在传说池里`)
    if (excluded.has(item.id)) fail(`成装出现了任务专属件 ${item.name}`)
    if (bootIds.has(item.id) || upgradedBootIds.has(item.id)) fail(`成装里出现了鞋子 ${item.name}`)
  }

  // 唯一词条互斥（docs/RULES.md §5.4）：同属任一组的两件不能同时出现
  const pickedIds = new Set(result.legendaryItems.map((i) => i.id))
  data.items.uniqueGroups.forEach((group, index) => {
    const hit = group.filter((id) => pickedIds.has(id))
    if (hit.length > 1) {
      const names = hit.map((id) => data.items.legendary.find((i) => i.id === id)?.name ?? id)
      fail(`唯一词条组 #${index + 1} 同时出现了 ${names.join(' 与 ')}`)
    }
  })

  // 远程专属（docs/RULES.md §5.5）
  if (!result.champion.ranged) {
    for (const id of data.items.rangedOnly) {
      if (pickedIds.has(id)) {
        const name = data.items.legendary.find((i) => i.id === id)?.name ?? id
        fail(`近战英雄 ${result.champion.title} 出了远程专属装备 ${name}`)
      }
    }
  }

  // 鞋子
  if (result.position === 'mid') {
    if (!upgradedBootIds.has(result.boots.id)) fail(`中路鞋子 ${result.boots.name} 不是升级款`)
  } else if (!bootIds.has(result.boots.id)) {
    fail(`非中路鞋子 ${result.boots.name} 不应是升级款`)
  }

  // 出门装
  if (result.position === 'support') {
    if (result.starterItem.id !== data.items.starterSupport.id) fail('辅助出门装不是云游图鉴')
    if (!result.displayStarterItem) fail('辅助缺少展示用的升级件')
    const allowed = new Set(data.items.supportQuestUpgrades.map((i) => i.id))
    if (result.displayStarterItem && !allowed.has(result.displayStarterItem.id)) {
      fail(`辅助展示件 ${result.displayStarterItem.name} 不在升级件池里`)
    }
  } else if (result.position === 'jungle') {
    if (!data.items.starterJungle.some((i) => i.id === result.starterItem.id)) {
      fail('打野出门装不是打野蛋')
    }
    if (result.displayStarterItem !== null) fail('非辅助不应有展示用升级件')
  } else if (!data.items.starterGeneric.some((i) => i.id === result.starterItem.id)) {
    fail('通用出门装不属于登记的 8 件')
  }

  // 符文
  const { runes } = result
  if (runes.secondaryStyle.id === runes.primaryStyle.id) fail('副系与主系相同')
  const primaryStyle = data.runes.styles.find((s) => s.id === runes.primaryStyle.id)
  const secondaryStyle = data.runes.styles.find((s) => s.id === runes.secondaryStyle.id)
  if (!primaryStyle) fail(`主系 ${runes.primaryStyle.id} 不在快照里`)
  if (!secondaryStyle) fail(`副系 ${runes.secondaryStyle.id} 不在快照里`)

  if (!primaryStyle?.keystones.some((k) => k.id === runes.keystone.id)) {
    fail(`基石 ${runes.keystone.name} 不属于主系 ${runes.primaryStyle.name}`)
  }
  if (runes.primaryMinors.length !== 3) {
    fail(`主系小符文不是 3 个，实际 ${runes.primaryMinors.length}`)
  }
  // 主系 3 个必须分属 3 个不同的排
  const primarySlots = new Set<string>()
  for (const rune of runes.primaryMinors) {
    const slot = primaryStyle?.minors.find((m) => m.runes.some((r) => r.id === rune.id))
    if (!slot) fail(`主系小符文 ${rune.name} 不属于主系 ${runes.primaryStyle.name}`)
    if (slot) primarySlots.add(slot.slot)
  }
  if (primarySlots.size !== 3) fail(`主系 3 个小符文没有分属 3 个不同排：${[...primarySlots].join('、')}`)

  if (runes.secondaryMinors.length !== 2) {
    fail(`副系小符文不是 2 个，实际 ${runes.secondaryMinors.length}`)
  }
  const secondarySlots = new Set<string>()
  for (const rune of runes.secondaryMinors) {
    const slot = secondaryStyle?.minors.find((m) => m.runes.some((r) => r.id === rune.id))
    if (!slot) fail(`副系小符文 ${rune.name} 不属于副系 ${runes.secondaryStyle.name}`)
    if (slot) secondarySlots.add(slot.slot)
  }
  if (secondarySlots.size !== 2) fail(`副系 2 个小符文没有分属 2 个不同排：${[...secondarySlots].join('、')}`)

  // 海克斯科技闪现罗网
  const pickedHexflash = [...runes.primaryMinors, ...runes.secondaryMinors].some(
    (r) => r.id === HEXFLASH.runeId,
  )
  if (pickedHexflash) {
    const hasFlash = result.spells.some((s) => s.id === SPELL_IDS.flash)
    const inspirationInvolved =
      runes.primaryStyle.id === HEXFLASH.styleId || runes.secondaryStyle.id === HEXFLASH.styleId
    if (!hasFlash) fail('随机到了海克斯科技闪现罗网，但没有带闪现')
    if (!inspirationInvolved) fail('随机到了海克斯科技闪现罗网，但主副系都不是启迪')
  }

  // 小符文
  if (result.shards.length !== 3) fail(`小符文不是 3 个，实际 ${result.shards.length}`)
  result.shards.forEach((shard, index) => {
    const row = data.runes.shardRows[index]
    if (!row) fail(`快照缺少第 ${index + 1} 排小符文`)
    if (row && !row.runes.some((r) => r.id === shard.id)) {
      fail(`第 ${index + 1} 排小符文 ${shard.name} 不属于该排`)
    }
  })
}
