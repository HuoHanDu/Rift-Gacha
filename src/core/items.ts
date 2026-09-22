/**
 * 装备抽取（docs/RULES.md §5）。
 *
 * 出门装按位置分流；成装固定 6 件（同一玩家内不重复，跨玩家可重复）；
 * 鞋子 1 双，中路换成对应的升级款。
 *
 * 成装还要满足两条硬约束：
 * - **唯一词条互斥**（§5.4）：共享「唯一：xxx」词条的两件不能同时出。
 *   一件装备可能在多个组里（界弓），此时它和这些组的所有成员都冲突。
 * - **远程专属**（§5.5）：只有远程英雄能出卢安娜的飓风。
 *
 * 注意「六件成装 + 一双鞋」是**展示层**的组合：`legendaryItems` 与 `boots` 分开返回，
 * 因为六件传说池里本来就不含鞋子（数据脚本有断言兜底）。
 */

import { LEGENDARY_ITEM_COUNT } from './constants'
import { pick, randInt, type Rng } from './random'
import type { ChampionRef, ItemRef, ItemsSnapshot, Position } from './types'

export interface ItemPicks {
  starterItem: ItemRef
  /** 仅辅助非空。 */
  displayStarterItem: ItemRef | null
  legendaryItems: ItemRef[]
  boots: ItemRef
}

export function pickItems(
  position: Position,
  champion: ChampionRef,
  items: ItemsSnapshot,
  rng: Rng,
): ItemPicks {
  const { starterItem, displayStarterItem } = pickStarter(position, items, rng)

  const legendaryItems = pickLegendary(champion, items, rng)
  const boots = pickBoots(position, items, rng)

  // 结构性不变量：鞋子不能混进成装里。
  if (legendaryItems.some((item) => item.id === boots.id)) {
    throw new Error(`数据异常：鞋子 ${boots.name} 同时出现在成装池与鞋池中`)
  }

  return { starterItem, displayStarterItem, legendaryItems, boots }
}

/** itemId → 它所属的所有唯一词条组下标。 */
function buildGroupIndex(uniqueGroups: readonly string[][]): Map<string, number[]> {
  const index = new Map<string, number[]>()
  uniqueGroups.forEach((group, groupIndex) => {
    for (const id of group) {
      const list = index.get(id)
      if (list) {
        list.push(groupIndex)
      } else {
        index.set(id, [groupIndex])
      }
    }
  })
  return index
}

function pickLegendary(champion: ChampionRef, items: ItemsSnapshot, rng: Rng): ItemRef[] {
  const rangedOnly = new Set(items.rangedOnly)
  const pool = items.legendary.filter((item) => champion.ranged || !rangedOnly.has(item.id))

  if (pool.length < LEGENDARY_ITEM_COUNT) {
    throw new Error(
      `数据异常：${champion.title}（${champion.ranged ? '远程' : '近战'}）可用成装只有 ${pool.length} 件`,
    )
  }

  const groupIndex = buildGroupIndex(items.uniqueGroups)
  const usedGroups = new Set<number>()
  const picked: ItemRef[] = []
  const candidates = [...pool]

  while (picked.length < LEGENDARY_ITEM_COUNT) {
    if (candidates.length === 0) {
      throw new Error('数据异常：可用成装不足以凑齐六件（唯一词条互斥把池子吃空了）')
    }

    const [item] = candidates.splice(randInt(candidates.length, rng), 1)
    const groups = groupIndex.get(item.id)

    // 与已选装备共享任一唯一词条 ⇒ 不能再出。
    // 直接丢掉而不是留着：组一旦被占用就不会释放，它之后也不可能再被选中。
    if (groups && groups.some((group) => usedGroups.has(group))) continue

    picked.push(item)
    for (const group of groups ?? []) usedGroups.add(group)
  }

  return picked
}

function pickStarter(
  position: Position,
  items: ItemsSnapshot,
  rng: Rng,
): { starterItem: ItemRef; displayStarterItem: ItemRef | null } {
  if (position === 'support') {
    // 辅助出门装固定云游图鉴；展示时换成它的一件升级件（docs/RULES.md §5.1）。
    return {
      starterItem: items.starterSupport,
      displayStarterItem: pick(items.supportQuestUpgrades, rng),
    }
  }
  if (position === 'jungle') {
    return { starterItem: pick(items.starterJungle, rng), displayStarterItem: null }
  }
  return { starterItem: pick(items.starterGeneric, rng), displayStarterItem: null }
}

function pickBoots(position: Position, items: ItemsSnapshot, rng: Rng): ItemRef {
  const base = pick(items.boots, rng)
  if (position !== 'mid') return base

  const upgradedId = items.bootsUpgradeMap[base.id]
  if (!upgradedId) {
    throw new Error(`数据异常：鞋子 ${base.name}(${base.id}) 没有升级款`)
  }
  const upgraded = items.bootsUpgraded.find((item) => item.id === upgradedId)
  if (!upgraded) {
    throw new Error(`数据异常：升级鞋 ${upgradedId} 不在快照里`)
  }
  return upgraded
}
