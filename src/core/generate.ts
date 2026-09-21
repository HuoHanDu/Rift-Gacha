/**
 * 随机引擎入口（docs/RULES.md §8 的流水线）。
 *
 * 唯一对外函数是 `generateBuilds`：吃 `GenerateInput` + `DataBundle`，吐 `GenerateResult`。
 * 页面不需要认识任何 ID 常量或规则细节。
 *
 * 可复现性：同一个 seed + 同一份快照 + 同一份输入 ⇒ 完全相同的结果。
 * 多人生成按玩家下标顺序串行，共享同一个 `rng` 与「已用英雄」集合。
 */

import { pickChampion } from './champions'
import { pickItems } from './items'
import { assignPlacements } from './positions'
import { createRandomSeed, createRng } from './random'
import { pickRunes } from './runes'
import { SPELL_IDS } from './constants'
import { pickSpells } from './spells'
import type {
  BuildResult,
  DataBundle,
  GenerateInput,
  GenerateResult,
  ValidationError,
} from './types'
import { validateInput } from './validate'

export function generateBuilds(
  input: GenerateInput,
  data: DataBundle,
  options: { seed?: number } = {},
): GenerateResult {
  const errors: ValidationError[] = validateInput(input, data)
  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const seed = options.seed ?? createRandomSeed()
  const rng = createRng(seed)

  const placementResult = assignPlacements(input.players, input, rng)
  if (!placementResult.ok) {
    return placementResult
  }
  const placements = placementResult.placements

  // 全场英雄不重复。
  const usedHeroIds = new Set<string>()

  const results: BuildResult[] = input.players.map((player, playerIndex) => {
    const { team, position } = placements[playerIndex]

    const champion = pickChampion(data.champions, usedHeroIds, rng)
    usedHeroIds.add(champion.heroId)

    const spells = pickSpells(position, data.spells, input.banSmiteForNonJungle, rng)

    const items = pickItems(position, data.items, rng)

    // 召唤师技能必须先于符文生成：海克斯科技闪现罗网要判断是否带闪现（docs/RULES.md §6.5）。
    const hasFlash = spells.some((spell) => spell.id === SPELL_IDS.flash)
    const runePicks = pickRunes({ hasFlash }, data.runes, rng)

    return {
      playerIndex,
      name: player.name?.trim() || `玩家 ${playerIndex + 1}`,
      team,
      position,
      champion,
      spells,
      starterItem: items.starterItem,
      displayStarterItem: items.displayStarterItem,
      legendaryItems: items.legendaryItems,
      boots: items.boots,
      runes: {
        primaryStyle: runePicks.primaryStyle,
        keystone: runePicks.keystone,
        primaryMinors: runePicks.primaryMinors,
        secondaryStyle: runePicks.secondaryStyle,
        secondaryMinors: runePicks.secondaryMinors,
      },
      shards: runePicks.shards,
    }
  })

  return { ok: true, seed, results }
}
