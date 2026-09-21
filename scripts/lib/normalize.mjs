/**
 * 原始数据 → 快照 的规格化与口径过滤。
 *
 * 口径取自 docs/DATA.md §2，规则取自 docs/RULES.md。
 * 所有领域常量集中在 SPEC，改动这里必须同步改文档。
 */

import { ICON_BASE } from './sources.mjs'

const SR_MAP = '召唤师峡谷'

/** 领域口径常量（代码之外无法推导，改这里必须同步改文档）。 */
export const SPEC = {
  /** docs/RULES.md §5.3 —— 未升级的 7 双鞋 */
  boots: ['3006', '3008', '3009', '3020', '3047', '3111', '3158'],

  /** docs/RULES.md §5.1 —— 通用出门装 */
  starterGeneric: ['1054', '1055', '1056', '1082', '1083', '1086', '1120', '3070'],

  /** docs/RULES.md §5.1 —— 打野蛋 */
  starterJungle: ['1101', '1102', '1103'],

  /** docs/RULES.md §5.1 —— 辅助固定出门装与其展示用升级件 */
  supportStarter: '3865',
  supportQuestUpgrades: ['3869', '3870', '3871', '3876', '3877'],

  /** docs/RULES.md §5.2 —— 任务专属，必须从传说池剔除（含 4643 警觉眼石） */
  excludedFromLegendary: ['4643', '3869', '3870', '3871', '3876', '3877'],

  /** docs/RULES.md §4 —— 峡谷不存在的召唤师技能：32/39 标记（雪球）、13 清晰术 */
  excludedSpells: ['32', '39', '13'],
  requiredSpells: { flash: '4', smite: '11' },

  /** docs/RULES.md §6.4 —— 小符文三排的期望构成（与官方数据交叉校验） */
  expectedShardRows: [
    { slot: '进攻', ids: ['5008', '5005', '5007'] },
    { slot: '灵活', ids: ['5008', '5010', '5001'] },
    { slot: '防御', ids: ['5011', '5013', '5001'] },
  ],

  /** 结构性不变量：这些池的大小随版本几乎不变，变动即视为口径需要人工复核 */
  expectedCounts: {
    boots: 7,
    starterGeneric: 8,
    starterJungle: 3,
    supportQuestUpgrades: 5,
    supportStarter: 1,
    spells: 9,
    styles: 5,
    shardRows: 3,
    shardRowSize: 3,
    minorSlotsPerStyle: 3,
    minorSlotSize: 3,
    championsMin: 150,
  },
}

// ---------------------------------------------------------------- 工具

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text) {
  return String(text).replace(/&([a-zA-Z#0-9]+);/g, (match, code) => {
    const key = String(code).toLowerCase()
    return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : match
  })
}

/**
 * 把游戏内富文本压成可读纯文本。
 *
 * 坑：源数据里的 HTML 本身还被实体编码过一层（`&lt;br&gt;` 才是换行，
 * 少数符文甚至是二次编码 `&amp;lt;`），所以必须**先解码、再剥标签**。
 */
export function stripHtml(input) {
  if (!input) return ''
  const decoded = decodeEntities(decodeEntities(input))
  return decoded
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<hr\s*\/?>/gi, ' ')
    // 块级闭合标签补一个空格；行内标签直接删掉，避免把词切出多余空格。
    .replace(/<\/(stats|mainText|li|p|div)>/gi, ' ')
    .replace(/<\/(attention|scaleLevel|scaleAD|scaleAP|speed|b|i|font)>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null || value === '') return []
  return [value]
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

// ---------------------------------------------------------------- 英雄

export function normalizeChampions(raw) {
  const list = raw?.hero
  expect(Array.isArray(list), 'hero_list.js 结构异常：缺少 hero 数组')

  return list
    .map((hero) => ({
      heroId: String(hero.heroId),
      name: hero.name ?? '',
      alias: hero.alias ?? '',
      title: hero.title ?? '',
      roles: toArray(hero.roles).map(String),
      icon: `${ICON_BASE}/champion/${hero.alias}.png`,
    }))
    .sort((a, b) => Number(a.heroId) - Number(b.heroId))
}

// ---------------------------------------------------------------- 召唤师技能

export function normalizeSpells(raw) {
  const dict = raw?.summonerskill
  expect(dict && typeof dict === 'object', 'summonerskill_list.js 结构异常：缺少 summonerskill')

  const excluded = new Set(SPEC.excludedSpells)
  return Object.entries(dict)
    .filter(([id, node]) => {
      if (excluded.has(String(id))) return false
      // 峡谷 = gamemode 含「经典」。Jade/竞技场/魄罗变体的 gamemode 为空，会被这里滤掉。
      return String(node?.gamemode ?? '').includes('经典')
    })
    .map(([id, node]) => ({
      id: String(id),
      name: node.name ?? '',
      icon: node.icon ?? '',
      desc: stripHtml(node.description),
      cooldown: String(node.cooldown ?? ''),
    }))
    .sort((a, b) => Number(a.id) - Number(b.id))
}

// ---------------------------------------------------------------- 装备

export function normalizeItems(rawItems, rawItemsExt) {
  const items = rawItems?.items
  expect(Array.isArray(items), 'items.js 结构异常：缺少 items 数组')
  const extList = rawItemsExt?.items_ext
  expect(Array.isArray(extList), 'items_ext.js 结构异常：缺少 items_ext 数组')

  const catById = new Map(extList.map((e) => [String(e.item_id), toArray(e.category).map(String)]))
  const byId = new Map(items.map((i) => [String(i.itemId), i]))
  const isSR = (item) => toArray(item.maps).includes(SR_MAP)

  const get = (id) => {
    const item = byId.get(String(id))
    expect(item, `装备 ${id} 在 items.js 中不存在`)
    return item
  }

  const toRef = (item) => ({
    id: String(item.itemId),
    name: item.name ?? '',
    icon: item.iconPath ?? '',
    gold: Number(item.total ?? item.price ?? 0),
    types: toArray(item.types).map(String),
    desc: firstNonEmpty(stripHtml(item.description), item.plaintext, item.item_desc),
  })

  const boots = SPEC.boots.map((id) => toRef(get(id)))

  // 升级映射直接读源数据的 into 字段，保证与游戏内一致
  const bootsUpgradeMap = {}
  for (const id of SPEC.boots) {
    const targets = toArray(get(id).into).map(String)
    expect(
      targets.length === 1,
      `鞋子 ${id} ${get(id).name} 的 into 应恰好 1 项，实际 ${targets.length} 项（${targets.join(',')}）`,
    )
    bootsUpgradeMap[id] = targets[0]
  }
  const bootsUpgraded = Object.values(bootsUpgradeMap).map((id) => toRef(get(id)))

  // 传说池：items_ext 标为 legend + 召唤师峡谷 + 剔除任务专属件。
  // 注意必须以 items_ext 的分类为准——历史遗留的 77xxxx 段 ID 的 maps 标注不可靠。
  const excluded = new Set(SPEC.excludedFromLegendary)
  const legendary = items
    .filter(isSR)
    .filter((item) => (catById.get(String(item.itemId)) ?? []).includes('legend'))
    .filter((item) => !excluded.has(String(item.itemId)))
    .map(toRef)

  const starterRef = (id) => toRef(get(id))

  return {
    legendary,
    boots,
    bootsUpgraded,
    bootsUpgradeMap,
    starterGeneric: SPEC.starterGeneric.map(starterRef),
    starterJungle: SPEC.starterJungle.map(starterRef),
    starterSupport: starterRef(SPEC.supportStarter),
    supportQuestUpgrades: SPEC.supportQuestUpgrades.map(starterRef),
  }
}

// ---------------------------------------------------------------- 符文

/** rune_list2.js 的符文散落在「顶层」与「系的排里」两层，这里统一建索引。 */
function indexRunes(dict) {
  const index = new Map()
  for (const [id, node] of Object.entries(dict)) {
    index.set(String(id), node)
    const slots = Array.isArray(node?.childs) ? node.childs : []
    for (const slot of slots) {
      const children = slot?.childs
      if (children && typeof children === 'object' && !Array.isArray(children)) {
        for (const [runeId, runeNode] of Object.entries(children)) {
          index.set(String(runeId), runeNode)
        }
      }
    }
  }
  return index
}

/**
 * 结构（五系的排顺序、小符文三排的构成与顺序）以官方符文数据为准；
 * 名称/图标/文案来自 rune_list2.js，缺失时回退到官方数据。
 *
 * 之所以不直接用 rune_list2.js 的顺序：它的排顺序与客户端展示顺序不一致，
 * 且各排 childs 是「数字样式字符串做键」的对象，JS 会按数值升序迭代，丢掉原顺序。
 */
export function normalizeRunes(rawRunes, cdPerkStyles, cdPerks) {
  const dict = rawRunes?.rune
  expect(dict && typeof dict === 'object', 'rune_list2.js 结构异常：缺少 rune 对象')
  expect(Array.isArray(cdPerkStyles?.styles), 'perkstyles.json 结构异常：缺少 styles 数组')

  const index = indexRunes(dict)
  const perkById = new Map(toArray(cdPerks).map((p) => [String(p.id), p]))

  const toRef = (id) => {
    const key = String(id)
    const node = index.get(key)
    expect(node, `符文 ${key} 在 rune_list2.js 中不存在`)
    const cd = perkById.get(key)
    // 符文文案里同样带 <i>/<br>/<font>/<lol-uikit-...> 等游戏内富文本，一律压成纯文本。
    const tooltip = stripHtml(node.tooltip)
    const shortHtml = firstNonEmpty(node.shortdesc, node.tooltip, cd?.shortDesc)
    const longHtml = firstNonEmpty(node.longdesc, node.tooltip, cd?.longDesc)
    return {
      id: key,
      name: firstNonEmpty(node.name, cd?.name),
      icon: node.icon ?? '',
      short: stripHtml(shortHtml) || tooltip,
      long: stripHtml(longHtml) || tooltip,
    }
  }

  const styles = []
  let shardRows = []
  let shardSignature = null

  for (const cdStyle of toArray(cdPerkStyles.styles)) {
    const slots = toArray(cdStyle.slots)
    const keystoneSlot = slots.find((s) => s.type === 'kKeyStone')
    const minorSlots = slots.filter((s) => s.type === 'kMixedRegularSplashable')

    if (!keystoneSlot && minorSlots.length === 0) continue

    // 小符文三排挂在每个系上，内容应当完全一致；不一致说明官方改了结构，要人工看。
    const statSlots = slots.filter((s) => s.type === 'kStatMod')
    if (statSlots.length > 0) {
      const rows = statSlots.map((s) => ({
        slot: s.slotLabel ?? '',
        runes: toArray(s.perks).map(toRef),
      }))
      const signature = JSON.stringify(rows.map((r) => [r.slot, r.runes.map((x) => x.id)]))
      if (shardSignature === null) {
        shardSignature = signature
        shardRows = rows
      } else {
        expect(
          signature === shardSignature,
          `各系挂载的小符文三排不一致：\n  期望 ${shardSignature}\n  实际 ${signature}`,
        )
      }
    }

    const styleId = String(cdStyle.id)
    const styleNode = dict[styleId]
    expect(styleNode, `符文系 ${styleId} 在 rune_list2.js 中不存在`)

    styles.push({
      id: styleId,
      name: firstNonEmpty(styleNode.name, cdStyle.name),
      icon: styleNode.icon ?? '',
      keystones: toArray(keystoneSlot?.perks).map(toRef),
      minors: minorSlots.map((s) => ({
        slot: s.slotLabel ?? '',
        runes: toArray(s.perks).map(toRef),
      })),
    })
  }

  return { styles, shardRows }
}
