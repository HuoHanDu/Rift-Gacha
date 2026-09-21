/**
 * 装备抽取（docs/RULES.md §5）。
 *
 * 出门装按位置分流；成装固定 6 件（同一玩家内不重复，跨玩家可重复）；
 * 鞋子 1 双，中路换成对应的升级款。
 *
 * 注意「六件成装 + 一双鞋」是**展示层**的组合：`legendaryItems` 与 `boots` 分开返回，
 * 因为六件传说池里本来就不含鞋子（数据脚本有断言兜底）。
 */

import { LEGENDARY_ITEM_COUNT } from './constants'
import { pick, pickMany, type Rng } from './random'
import type { ItemRef, ItemsSnapshot, Position } from './types'

export interface ItemPicks {
  starterItem: ItemRef
  /** 仅辅助非空。 */
  displayStarterItem: ItemRef | null
  legendaryItems: ItemRef[]
  boots: ItemRef
}

export function pickItems(
  position: Position,
  items: ItemsSnapshot,
  rng: Rng,
): ItemPicks {
  const { starterItem, displayStarterItem } = pickStarter(position, items, rng)

  const legendaryItems = pickMany(items.legendary, LEGENDARY_ITEM_COUNT, rng)
  const boots = pickBoots(position, items, rng)

  // 结构性不变量：鞋子不能混进成装里。
  if (legendaryItems.some((item) => item.id === boots.id)) {
    throw new Error(`数据异常：鞋子 ${boots.name} 同时出现在成装池与鞋池中`)
  }

  return { starterItem, displayStarterItem, legendaryItems, boots }
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
