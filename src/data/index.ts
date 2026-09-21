/**
 * 运行时数据入口：把构建期生成的快照 JSON 组装成 `DataBundle`。
 *
 * 这是 `core/` 与「数据从哪来」之间唯一的耦合点。
 * 将来若改成从后端拉数据，只需要把这里换成异步加载，`core/` 一行都不用动。
 * 见 docs/ARCHITECTURE.md §6。
 */

import type { DataBundle } from '../core/types'
import champions from './champions.json'
import items from './items.json'
import meta from './meta.json'
import runes from './runes.json'
import spells from './spells.json'

export const DATA: DataBundle = {
  meta,
  champions,
  items,
  runes,
  spells,
}

/** 当前快照对应的游戏版本，用于页面底部的声明。 */
export const SNAPSHOT_PATCH = DATA.meta.patch
