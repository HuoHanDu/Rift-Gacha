#!/usr/bin/env node
/**
 * 把随机结果打印成人能读的文本，用来人工核对规则（todo.md P4.2）。
 *
 *   npm run sample                 # 单人
 *   npm run sample -- 5            # 5 人单队
 *   npm run sample -- 10           # 10 人双队（随机分队）
 *   npm run sample -- 10 --seed 42 # 指定种子复现
 *
 * 走 vite-node，因此可以直接 import `src/` 里的 TS 与 JSON 快照。
 */

import { POSITION_LABELS } from '../src/core/constants'
import { generateBuilds } from '../src/core/generate'
import type { BuildResult, GenerateInput } from '../src/core/types'
import { DATA } from '../src/data'

function parseArgs(argv: string[]): { count: number; seed?: number; preset: boolean } {
  const positional = argv.filter((arg) => !arg.startsWith('--'))
  const seedIndex = argv.indexOf('--seed')
  const count = Number(positional[0] ?? 1)

  return {
    count: Number.isFinite(count) && count > 0 ? Math.min(count, 10) : 1,
    seed: seedIndex >= 0 ? Number(argv[seedIndex + 1]) : undefined,
    preset: argv.includes('--preset'),
  }
}

function line(label: string, value: string): string {
  return `  ${label.padEnd(10)}${value}`
}

function formatBuild(build: BuildResult, showTeam: boolean): string {
  const { runes } = build
  const out: string[] = []

  const heading = showTeam
    ? `#${build.playerIndex + 1} ${build.name}　${build.team === 1 ? '蓝队' : '红队'}　${POSITION_LABELS[build.position]}`
    : `#${build.playerIndex + 1} ${build.name}　${POSITION_LABELS[build.position]}`

  out.push(heading)
  out.push(line('英雄', `${build.champion.title}（${build.champion.name}）`))
  out.push(line('召唤师技能', build.spells.map((s) => s.name).join(' + ')))
  out.push(
    line(
      '出门装',
      build.displayStarterItem
        ? `${build.starterItem.name} → 展示为 ${build.displayStarterItem.name}`
        : build.starterItem.name,
    ),
  )
  out.push(line('成装', build.legendaryItems.map((i) => i.name).join('、')))
  out.push(line('鞋子', build.boots.name))
  out.push(
    line(
      '符文',
      `主 ${runes.primaryStyle.name}｜基石 ${runes.keystone.name}｜${runes.primaryMinors
        .map((r) => r.name)
        .join('、')}`,
    ),
  )
  out.push(line('', `副 ${runes.secondaryStyle.name}｜${runes.secondaryMinors.map((r) => r.name).join('、')}`))
  out.push(line('小符文', build.shards.map((s) => s.name).join('、')))

  return out.join('\n')
}

function main() {
  const { count, seed, preset } = parseArgs(process.argv.slice(2))
  const teamMode = count > 5

  const input: GenerateInput = {
    players: Array.from({ length: count }, (_, index) => ({
      name: `玩家${index + 1}`,
      team: preset ? ((index < Math.ceil(count / 2) ? 1 : 2) as 1 | 2) : undefined,
    })),
    teamMode,
    splitTeamsRandomly: preset ? false : true,
    banSmiteForNonJungle: true,
  }

  const outcome = generateBuilds(input, DATA, seed === undefined ? {} : { seed })
  if (!outcome.ok) {
    process.stderr.write(`生成失败：\n${outcome.errors.map((e) => `  · ${e.message}`).join('\n')}\n`)
    process.exitCode = 1
    return
  }

  process.stdout.write(
    `补丁 ${DATA.meta.patch}　${count} 人${teamMode ? '（双队）' : ''}　种子 ${outcome.seed}\n\n`,
  )
  process.stdout.write(outcome.results.map((build) => formatBuild(build, teamMode)).join('\n\n'))
  process.stdout.write('\n')
}

main()
