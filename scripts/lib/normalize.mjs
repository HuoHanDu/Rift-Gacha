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

  /**
   * docs/RULES.md §5.4 —— 「唯一词条」互斥组。
   *
   * 组内任意两件不能同时出现在一个玩家的装备栏里（共享同一个「唯一：xxx」词条）。
   * 一件装备可以出现在多个组里：界弓同时带「唯一：枯萎」和「唯一：夺命」，
   * 所以它同时和两组的所有成员冲突；而两组之间（除界弓外）互不冲突。
   *
   * 这些「唯一」词条在官方资料里并不体现，只能按名字登记。
   */
  uniqueGroupsByName: [
    // 唯一：救主灵刃
    // 大天使之杖本身没有这条，但它叠满后进化的炽天使之杖有，所以也要算进来
    ['斯特拉克的挑战护手', '玛莫提乌斯之噬', '不朽盾弓', '原生质护带', '大天使之杖'],
    // 唯一：献祭
    ['璀璨回响', '日炎圣盾'],
    // 唯一：顺劈
    ['亵渎九头蛇', '挺进破坏者', '贪欲九头蛇', '巨型九头蛇'],
    // 唯一：咒刃
    ['巫妖之祸', '冰脉护手', '夺萃之镰', '三相之力', '黄昏与黎明'],
    // 唯一：枯萎
    ['放血者的诅咒', '虚空之杖', '蜕生', '界弓'],
    // 唯一：废除（法术护盾）
    ['女妖面纱', '夜之锋刃'],
    // 唯一：夺命
    ['凡性的提醒', '黑色切割者', '赛瑞尔达的怨恨', '多米尼克领主的致意', '界弓'],
  ],

  /**
   * 眼泪系装备（女神之泪升级件）。
   *
   * 这四件都带「法力流」，而它们叠满后的进化件**没有**这个效果，
   * 所以四件彼此**可以**同时出（游戏里只是必须先把一件叠满）。
   * 因此它们不在任何互斥组里——唯一例外是大天使之杖，
   * 它的进化件炽天使之杖带「救主灵刃」，所以出现在上面第一组里。
   */
  tearItemsByName: ['大天使之杖', '凛冬之临', '耳语头环', '魔宗'],

  /** docs/RULES.md §5.5 —— 只有远程英雄能出的装备 */
  rangedOnlyByName: ['卢安娜的飓风'],

  /**
   * 英雄近战/远程的抽样断言。
   *
   * 数据源是官方客户端分类（CD 的 `tacticalInfo.attackType`），**不能用攻击距离数值推断**：
   * 锤石射程 450 却属于远程，洛 300 却是近战。
   * LoL Wiki 的 Range type 页也写了「没有严格规则，可能是任意划分的」。
   * 这几条是防「数据源悄悄变了」的探针。
   */
  attackTypeProbes: [
    { heroId: '1', alias: 'Annie', ranged: true },
    { heroId: '55', alias: 'Katarina', ranged: false },
    { heroId: '6', alias: 'Urgot', ranged: true },
    { heroId: '412', alias: 'Thresh', ranged: true },
    { heroId: '497', alias: 'Rakan', ranged: false },
    { heroId: '10', alias: 'Kayle', ranged: false },
  ],

  /** 远程英雄数量的合理区间（用于发现数据源异常，不是精确断言） */
  rangedChampionBand: { min: 60, max: 110 },
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

/**
 * @param raw hero_list.js
 * @param attackTypes Map<heroId, 'melee'|'ranged'>，来自官方客户端数据（CD）。
 *   缺失时抛错——宁可失败也不要猜，猜错会让近战英雄随机出卢安娜的飓风。
 */
export function normalizeChampions(raw, attackTypes) {
  const list = raw?.hero
  expect(Array.isArray(list), 'hero_list.js 结构异常：缺少 hero 数组')
  expect(attackTypes instanceof Map, '缺少 attackType 数据，无法判定近战/远程')

  const champions = list
    .map((hero) => {
      const heroId = String(hero.heroId)
      const attackType = attackTypes.get(heroId)
      expect(
        attackType === 'melee' || attackType === 'ranged',
        `英雄 ${heroId} ${hero.alias} 缺少 attackType（实际：${attackType}）`,
      )
      return {
        heroId,
        name: hero.name ?? '',
        alias: hero.alias ?? '',
        title: hero.title ?? '',
        roles: toArray(hero.roles).map(String),
        icon: `${ICON_BASE}/champion/${hero.alias}.png`,
        ranged: attackType === 'ranged',
      }
    })
    .sort((a, b) => Number(a.heroId) - Number(b.heroId))

  // 探针：数据源悄悄变了要立刻发现，而不是等玩家发现「卡特能出飓风了」
  for (const probe of SPEC.attackTypeProbes) {
    const champion = champions.find((c) => c.heroId === probe.heroId)
    expect(champion, `探针英雄 ${probe.heroId} 不在英雄列表里`)
    expect(
      champion.ranged === probe.ranged,
      `英雄 ${probe.heroId} ${probe.alias} 的 attackType 与探针不符：期望 ${
        probe.ranged ? 'ranged' : 'melee'
      }，实际 ${champion.ranged ? 'ranged' : 'melee'}`,
    )
  }

  const rangedCount = champions.filter((c) => c.ranged).length
  const band = SPEC.rangedChampionBand
  expect(
    rangedCount >= band.min && rangedCount <= band.max,
    `远程英雄数 ${rangedCount} 落在合理区间 [${band.min}, ${band.max}] 之外，怀疑数据源异常`,
  )

  return champions
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

  // 把「按名字登记的互斥组 / 远程专属件」解析成 ID，并断言名字真的存在。
  // 用名字写是为了可读（和 docs/RULES.md 对齐），用 ID 输出是为了 core 不认中文。
  const legendaryIds = new Set(legendary.map((item) => item.id))
  const idByName = new Map(legendary.map((item) => [item.name, item.id]))

  const resolveName = (name, label) => {
    const id = idByName.get(name)
    expect(id, `${label}里的装备「${name}」不在传说池中（可能改名了或被移出池子）`)
    return id
  }

  const uniqueGroups = SPEC.uniqueGroupsByName.map((group, index) =>
    group.map((name) => resolveName(name, `唯一词条互斥组 #${index + 1}`)),
  )

  // 互斥组里的每件都必须在传说池里，否则 core 里的过滤会白做
  for (const group of uniqueGroups) {
    for (const id of group) expect(legendaryIds.has(id), `互斥组里的 ${id} 不在传说池中`)
  }

  const rangedOnly = SPEC.rangedOnlyByName.map((name) => resolveName(name, '远程专属'))

  return {
    legendary,
    boots,
    bootsUpgraded,
    bootsUpgradeMap,
    starterGeneric: SPEC.starterGeneric.map(starterRef),
    starterJungle: SPEC.starterJungle.map(starterRef),
    starterSupport: starterRef(SPEC.supportStarter),
    supportQuestUpgrades: SPEC.supportQuestUpgrades.map(starterRef),
    uniqueGroups,
    rangedOnly,
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
