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
