/**
 * 全部数据源 URL。
 *
 * 口径与实测结果见 docs/DATA.md §1。
 * 这些文件后缀是 .js，但内容是纯 JSON，直接 JSON.parse 即可。
 */

const GTIMG_JS = 'https://game.gtimg.cn/images/lol/act/img/js'

/** 主数据源：决定快照内容。任一不可用即视为刷新失败。 */
export const SOURCES = {
  champions: `${GTIMG_JS}/heroList/hero_list.js`,
  items: `${GTIMG_JS}/items/items.js`,
  itemsExt: `${GTIMG_JS}/items_ext/items_ext.js`,
  runes: `${GTIMG_JS}/runeList/rune_list2.js`,
  spells: `${GTIMG_JS}/summonerskillList/summonerskill_list.js`,
}

/**
 * 交叉校验源：只用于断言，不作为快照内容来源。
 * 官方符文数据工程，用来验证「五系 / 基石集合 / 系内小符文排 / 小符文三排」的口径。
 */
export const CROSS_CHECK = {
  perkStyles:
    'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/zh_cn/v1/perkstyles.json',
  perks:
    'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/zh_cn/v1/perks.json',
}

/** 图标 CDN 前缀（英雄头像 / 装备 / 符文 / 召唤师技能都从这里取，不落盘）。 */
export const ICON_BASE = 'https://game.gtimg.cn/images/lol/act/img'

/**
 * 英雄近战/远程分类：官方客户端数据的 `tacticalInfo.attackType`。
 *
 * 为什么必须单独抓、且**不能**用 gtimg 的 `attackrange` 数值推断：
 * 锤石射程 450 却属于**远程**，洛 300 却是**近战**——数值分不出来。
 * LoL Wiki 的 Range type 页也写明「没有严格规则，可能是任意划分的」。
 *
 * 代价是每个英雄一次请求（约 173 次）。只在刷新快照时跑，可以接受；
 * 用并发限制 + 重试控制压力。
 */
export function championUrl(heroId) {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/zh_cn/v1/champions/${heroId}.json`
}

/**
 * 101 数据站（`101.qq.com`）的峡谷数据接口。
 *
 * 参数与响应格式是**对照开源项目 LeagueAkari 的实现**解出来的，不是猜的：
 * - `src/shared/http-api-axios-helper/qq101/index.ts`
 * - `src/shared/data-adapter/champion-data/qq101-protocol.ts`
 *
 * **三个必须记住的坑**（详见 `scripts/fetch-101.mjs` 顶部注释）：
 * 1. `lane` 必须大写，中单是 `MIDDLE` 不是 `MID`；小写会**静默返回空**
 * 2. `version_id` 用版本号字符串（`16.18`），不是 id / vkey / key
 * 3. 最新版本可能还没铺数据，要**从新到旧探测**
 */
export const QQ101 = {
  base: 'https://mlol.qt.qq.com',
  /** 各位置榜单 + 单英雄构筑 + 单英雄符文共用的前缀 */
  rift: '/go/battle_info/odp_proxy/lol_101strategy',
  versions: '/go/database/versionlist',
  /** 榜单载荷在 `_fieldValues` 里的字段名 */
  fields: { rank: 'R17960', build: 'R18087', runes: 'R18119' },
}

