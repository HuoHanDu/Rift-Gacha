/**
 * 全项目对外类型的唯一出处。
 *
 * 只放类型，不放运行时值——常量在 `constants.ts`。
 */

// ---------------------------------------------------------------- 领域基础

/** 分路 / 位置。 */
export type Position = 'top' | 'jungle' | 'mid' | 'adc' | 'support'

/** 队伍编号。 */
export type TeamId = 1 | 2

// ---------------------------------------------------------------- 快照数据

export interface ChampionRef {
  heroId: string
  /** 称号，如「黑暗之女」。 */
  name: string
  /** 英文名，如 `Annie`，图标 URL 由它拼出。 */
  alias: string
  /** 本名，如「安妮」。 */
  title: string
  roles: string[]
  icon: string
  /**
   * 英雄侧画像（docs/STRENGTH.md §5.1），用于判装备适配度。
   * 来源：CD 的 `tacticalInfo.damageType` 与 `playstyleInfo` / `championTagInfo`。
   */
  profile?: {
    /** `kPhysical` / `kMagic` / `kMixed` */
    damageType: string | null
    /** 1~3 的输出倾向 */
    damage: number | null
    /** 1~3 的耐久倾向 */
    durability: number | null
    /** 1~3 的功能倾向 */
    utility: number | null
    /** 官方原型标签，如「耐久」「爆发」，用于交叉验证 */
    tags: string[]
  }
  /**
   * 远程还是近战。来源是官方客户端数据的 `tacticalInfo.attackType`
   * （CD，zh_cn），**不能用攻击距离数值推断**——锤石射程 450 但属于远程，
   * 洛 300 却是近战，Wiki 明确写了「没有严格规则，可能是任意划分的」。
   */
  ranged: boolean
}

export interface ItemRef {
  id: string
  name: string
  icon: string
  /** 总价（金币）。 */
  gold: number
  types: string[]
  /** 已剥掉游戏内富文本标签的纯文本说明，直接上屏用。 */
  desc: string
}

export interface RuneRef {
  id: string
  name: string
  icon: string
  /** 一句话说明（纯文本）。 */
  short: string
  /** 详细说明（纯文本）。 */
  long: string
}

export interface SpellRef {
  id: string
  name: string
  icon: string
  desc: string
  cooldown: string
}

/** 符文的一「排」（系内小符文排，或小符文三排之一）。 */
export interface RuneSlot {
  slot: string
  runes: RuneRef[]
}

/** 一个符文系。 */
export interface RuneStyle {
  id: string
  name: string
  icon: string
  keystones: RuneRef[]
  /** 系内 3 排小符文，顺序为官方客户端展示顺序。 */
  minors: RuneSlot[]
}

export interface ItemsSnapshot {
  /** 可在商店购买的传说装备（已剔除任务专属件）。 */
  legendary: ItemRef[]
  /** 7 双未升级鞋。 */
  boots: ItemRef[]
  /** 7 双升级鞋（中路任务完成后）。 */
  bootsUpgraded: ItemRef[]
  /** 未升级鞋 ID → 升级鞋 ID。 */
  bootsUpgradeMap: Record<string, string>
  /** 通用出门装（非辅助、非打野）。 */
  starterGeneric: ItemRef[]
  /** 打野蛋。 */
  starterJungle: ItemRef[]
  /** 辅助固定出门装：云游图鉴。 */
  starterSupport: ItemRef
  /** 辅助出门装的展示用升级件。 */
  supportQuestUpgrades: ItemRef[]
  /**
   * 「唯一词条」互斥组（docs/RULES.md §5.4）。
   *
   * 组内任意两件不能同时出现在一个玩家的装备栏里——它们共享一个「唯一：xxx」词条。
   * 一件装备可以出现在多个组里（例如界弓同时有「唯一：枯萎」和「唯一：夺命」），
   * 那时它和两个组的所有成员都冲突，但两个组之间（除界弓外）互不冲突。
   *
   * 判定方式是「两件装备是否同属任一组」，不是「组内所有装备两两冲突」的传递闭包。
   */
  uniqueGroups: string[][]
  /** 只有远程英雄能出的装备 ID（如卢安娜的飓风）。 */
  rangedOnly: string[]
  /**
   * 装备侧画像（docs/STRENGTH.md §9）：装备 ID → 六类标签
   * （`ad` / `ap` / `crit` / `attackSpeed` / `tank` / `support`）。
   * 一件装备可以属多类。构建期由 `types` 标签自动推导 + 少量人工覆盖。
   */
  categories: Record<string, string[]>
}

export interface RunesSnapshot {
  styles: RuneStyle[]
  /** 小符文三排，顺序固定为 进攻 / 灵活 / 防御。 */
  shardRows: RuneSlot[]
}

export interface SnapshotMeta {
  patch: string
  fetchedAt: string
  counts: Record<string, number>
  sources: Record<string, string>
}

/** 构建期生成、运行时只读的全部数据。 */
export interface DataBundle {
  meta: SnapshotMeta
  champions: ChampionRef[]
  items: ItemsSnapshot
  runes: RunesSnapshot
  spells: SpellRef[]
  /** 101 数据站的强度数据（docs/STRENGTH.md）。构建期抓取，见 scripts/fetch-101*.mjs */
  rift: RiftSnapshot
}

// ---------------------------------------------------------------- 101 强度数据

/**
 * 101 榜单里的一条「英雄 × 分路」记录。
 *
 * 注意 `laneScore`/`tierBonus` 是**构建期按当时的分值算好存下来的**，
 * 所以改了分值必须重跑 `npm run fetch:101`，否则快照里是旧值（这个坑踩过）。
 */
export interface RiftLaneRecord {
  heroId: string
  position: Position
  rank: number | null
  tier: string | null
  winRate: number
  pickRate: number | null
  banRate: number | null
  laneScore: number
  tierBonus: number
}

/** 101 的一组装备推荐（出门装 / 鞋 / 核心 / 第 4、5、6 件）。 */
export interface RiftEquipmentSlot {
  rank: number
  /**
   * 装备 id。**这里存的是数字**——101 返回的就是数字，抓取脚本直接 parseInt 存下来，
   * 而快照里的 `ItemRef.id` 是字符串。比较时统一 String()（见 core/strength.ts）。
   */
  itemIds: number[]
  pickRate: number
  winRate: number
}

export interface RiftRunePage {
  rank: number
  keystone: number
  secondaryStyleCode: string
  /** 主系 4 个：基石 + 3 排 */
  primaryRunes: number[]
  /** 副系 2 个 */
  secondaryRunes: number[]
  /** 属性碎片 3 个 */
  shards: number[]
  pickRate: number
  winRate: number
  games: number
}

export interface RiftBuild {
  date: string | null
  starting: RiftEquipmentSlot[]
  shoes: RiftEquipmentSlot[]
  core: RiftEquipmentSlot[]
  forth: RiftEquipmentSlot[]
  fifth: RiftEquipmentSlot[]
  sixth: RiftEquipmentSlot[]
}

/** 以 `heroId:position` 为键，例如 `75:top`。 */
export interface RiftBuildEntry {
  build: RiftBuild | null
  runePages: RiftRunePage[]
}

export interface RiftSnapshot {
  meta: {
    source: string
    fetchedAt: string
    /** 101 版本列表里最新的是哪个 */
    latestPublished: string
    /** 实际取到数据的版本，可能落后于 latestPublished */
    version: string
    behind: boolean
    dataDate: string | null
    counts: Record<string, number>
    laneHeroScore: Record<string, number>
  }
  ranks: RiftLaneRecord[]
  /** 键为 `heroId:position` */
  builds: Record<string, RiftBuildEntry>
}

// ---------------------------------------------------------------- 输入

export interface PlayerInput {
  /** 选填，空白则显示「玩家 N」。 */
  name?: string
  /** 选填，留空表示随机。 */
  position?: Position
  /** 仅双队模式且「不随机分队」时使用。 */
  team?: TeamId
}

export interface GenerateInput {
  players: PlayerInput[]
  /** false = 单队（1~5 人）；true = 双队（最多 10 人）。 */
  teamMode: boolean
  /** 仅双队模式生效：true 时随机分队。 */
  splitTeamsRandomly: boolean
  /** true 时非打野位置不会随机到惩戒。默认 true。 */
  banSmiteForNonJungle: boolean
}

// ---------------------------------------------------------------- 输出

export interface StyleRef {
  id: string
  name: string
  icon: string
}

export interface RunePage {
  primaryStyle: StyleRef
  keystone: RuneRef
  /** 主系 3 排各 1 个，顺序与 `primaryStyle` 的排顺序一致。 */
  primaryMinors: RuneRef[]
  secondaryStyle: StyleRef
  /** 副系随机选中的 2 排各 1 个。 */
  secondaryMinors: RuneRef[]
}

export interface BuildResult {
  playerIndex: number
  /** 已兜底：空白名字会变成「玩家 N」。 */
  name: string
  team: TeamId
  position: Position
  champion: ChampionRef
  /** 恰好 2 个，互不重复。 */
  spells: SpellRef[]
  starterItem: ItemRef
  /**
   * 仅辅助非空：`starterItem` 固定为云游图鉴，
   * 这里放它的升级件（星界据守 / 圆梦使者 / 扎兹沙克的溃口 / 摩天雪橇 / 血鸣），用于展示。
   */
  displayStarterItem: ItemRef | null
  /** 恰好 6 件，互不重复。 */
  legendaryItems: ItemRef[]
  /** 恰好 1 双。中路为升级款。 */
  boots: ItemRef
  runes: RunePage
  /** 恰好 3 个，顺序固定为 进攻 / 灵活 / 防御。 */
  shards: RuneRef[]
}

export type ValidationCode =
  | 'NO_PLAYERS'
  | 'TOO_MANY_PLAYERS'
  | 'DUPLICATE_POSITION'
  | 'TOO_MANY_PER_TEAM'
  | 'MISSING_TEAM'
  | 'NOT_ENOUGH_CHAMPIONS'

export interface ValidationError {
  code: ValidationCode
  message: string
  /** 出问题的玩家下标，便于页面高亮。 */
  playerIndexes?: number[]
}

export type GenerateResult =
  | { ok: true; seed: number; results: BuildResult[] }
  | { ok: false; errors: ValidationError[] }
