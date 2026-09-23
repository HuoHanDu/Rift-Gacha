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
import riftBuilds from './rift-builds.json'
import rift101Meta from './rift-101-meta.json'
import riftStats from './rift-stats.json'
import runes from './runes.json'
import spells from './spells.json'

/**
 * 强度数据来自 101 数据站，分两个文件：
 * - `rift-stats.json` 榜单（英雄 × 分路的胜率/登场率/T 挡位）
 * - `rift-builds.json` 构筑与符文（以 `heroId:position` 为键）
 *
 * 它们由 `npm run fetch:101` 与 `npm run fetch:101:build` 生成，**不在 fetch:data 里**，
 * 因为那是 478 次额外请求。所以刷新装备/符文快照时不会连带刷新强度数据。
 */
export const DATA: DataBundle = {
  meta,
  champions,
  items,
  runes,
  spells,
  rift: {
    meta: rift101Meta,
    ranks: riftStats.ranks,
    builds: riftBuilds.index,
  } as DataBundle['rift'],
}

/** 当前快照对应的游戏版本，用于页面底部的声明。 */
export const SNAPSHOT_PATCH = DATA.meta.patch

/** 强度数据实际取到的 101 版本，可能落后于 SNAPSHOT_PATCH。 */
export const RIFT_DATA_VERSION = DATA.rift.meta.version