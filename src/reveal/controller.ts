/**
 * 揭幕动画的播放器。
 *
 * 状态机很小但有几个必须守住的约束：
 * - 一次只有一幕在滚动；同一幕里所有格子共用一条时间线（所以「两个召唤师技能同时停下」是天然的）。
 * - 一幕播完自动接下一幕；一名玩家播完自动接下一位。
 * - 点击画面 = 让**当前这一幕**立刻定格，然后照常接下一幕。
 * - 「跳过」= 全部直接定格，等同于没开动画。
 *
 * 定时器必须在重置/卸载时清掉，否则连点「开始随机」会叠出一堆并发的播放。
 */

import { reactive, ref, type Ref } from 'vue'
import type { CardPlan } from './plan'
import {
  PLAYER_GAP_MS,
  ROLL_TICKS,
  SECTION_GAP_MS,
  SECTION_ORDER,
  tickDelay,
  type SectionKey,
} from './sections'

export type SectionState = 'hidden' | 'rolling' | 'done'

/** 传给卡面的揭幕状态；`null` 表示「不用动画，直接给最终结果」。 */
export interface CardReveal {
  state: Record<SectionKey, SectionState>
  tick: Record<SectionKey, number>
  plan: CardPlan
}

export interface RevealController {
  /** 某个玩家某一段的状态，供卡面查询。 */
  revealOf: (playerIndex: number) => CardReveal
  /** 是否还有动画在播。 */
  isPlaying: Ref<boolean>
  /** 当前正在播的玩家下标（用于自动滚动定位）。 */
  activePlayer: Ref<number>
  start: () => void
  /** 让当前这一幕立刻定格，并接着播下一幕。 */
  finishCurrent: () => void
  /** 跳过全部动画。 */
  skipAll: () => void
  /** 停掉定时器（重新随机或页面卸载时调用）。 */
  dispose: () => void
}

function stateKey(playerIndex: number, section: SectionKey): string {
  return `${playerIndex}:${section}`
}

function emptyRecord<T>(value: T): Record<SectionKey, T> {
  return {
    position: value,
    champion: value,
    spells: value,
    starter: value,
    items: value,
    runes: value,
  }
}

export function createRevealController(
  plans: readonly CardPlan[],
  order?: readonly number[],
): RevealController {
  const states = reactive<Record<string, SectionState>>({})
  const ticks = reactive<Record<string, number>>({})
  const isPlaying = ref(false)
  const activePlayer = ref(0)

  // 播放顺序默认按下标；传了 order 就按显示顺序播（双队分组后卡片顺序和下标不一致）。
  const playOrder =
    order && order.length === plans.length ? [...order] : plans.map((_, index) => index)

  let cursor: { step: number; section: number } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  /** 正处在两幕之间的停顿里。这一拍明确没有幕在滚动，点击可以直接把它掐掉。 */
  let pendingGap = false

  for (let player = 0; player < plans.length; player++) {
    for (const section of SECTION_ORDER) {
      states[stateKey(player, section)] = 'hidden'
      ticks[stateKey(player, section)] = 0
    }
  }

  const lastTick = (section: SectionKey) => ROLL_TICKS[section] - 1

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function settle(player: number, section: SectionKey) {
    const key = stateKey(player, section)
    ticks[key] = lastTick(section)
    states[key] = 'done'
  }

  function begin() {
    if (!cursor) return
    pendingGap = false
    const player = playOrder[cursor.step]
    const section = SECTION_ORDER[cursor.section]
    const key = stateKey(player, section)
    activePlayer.value = player
    states[key] = 'rolling'
    ticks[key] = 0
    schedule(player, cursor.step, cursor.section)
  }

  function schedule(player: number, step: number, sectionIndex: number) {
    const section = SECTION_ORDER[sectionIndex]
    const key = stateKey(player, section)
    timer = setTimeout(() => {
      timer = null
      if (!cursor || cursor.step !== step || cursor.section !== sectionIndex) return

      const next = ticks[key] + 1
      if (next >= lastTick(section)) {
        settle(player, section)
        cursor = { step, section: sectionIndex + 1 }
        advance(false)
        return
      }
      ticks[key] = next
      schedule(player, step, sectionIndex)
    }, tickDelay(ticks[key], ROLL_TICKS[section]))
  }

  /**
   * 走到游标指向的下一幕；越界就换下一位玩家，全播完就收工。
   *
   * `immediate` 为 false 时会先停 `SECTION_GAP_MS`（换人时停 `PLAYER_GAP_MS`）再开始下一幕——
   * 这一拍是刻意的，否则上一幕刚停、下一幕立刻开转，节奏糊成一片。
   * 用户点画面快进时传 true，跳过这一拍：点下去就该立刻有反应。
   */
  function advance(immediate: boolean) {
    clearTimer()
    if (!cursor) {
      isPlaying.value = false
      return
    }

    let gap = SECTION_GAP_MS
    if (cursor.section >= SECTION_ORDER.length) {
      const nextStep = cursor.step + 1
      if (nextStep >= playOrder.length) {
        cursor = null
        isPlaying.value = false
        return
      }
      cursor = { step: nextStep, section: 0 }
      gap = PLAYER_GAP_MS
    }

    if (immediate || gap <= 0) {
      begin()
      return
    }

    // 停在原地一拍：上一幕已定格，下一幕还是隐含状态，视觉上就是「顿一下」。
    pendingGap = true
    timer = setTimeout(() => {
      timer = null
      if (!pendingGap) return
      begin()
    }, gap)
  }

  function start() {
    clearTimer()
    for (let player = 0; player < plans.length; player++) {
      for (const section of SECTION_ORDER) {
        states[stateKey(player, section)] = 'hidden'
        ticks[stateKey(player, section)] = 0
      }
    }
    if (plans.length === 0) {
      isPlaying.value = false
      return
    }
    pendingGap = false
    isPlaying.value = true
    activePlayer.value = playOrder[0]
    cursor = { step: 0, section: 0 }
    // 第一幕不等：点了「开始随机」就该马上看到东西在转。
    begin()
  }

  function finishCurrent() {
    if (!cursor) return

    // 正卡在段间停顿里：这一下点击的意思就是「别等了，马上开始下一段」。
    if (pendingGap) {
      clearTimer()
      begin()
      return
    }

    if (cursor.section >= SECTION_ORDER.length) return
    const player = playOrder[cursor.step]
    const { step, section: index } = cursor
    clearTimer()
    settle(player, SECTION_ORDER[index])
    cursor = { step, section: index + 1 }
    // 手动快进不留停顿，点了就要立刻看到下一段开转。
    advance(true)
  }

  function skipAll() {
    clearTimer()
    pendingGap = false
    cursor = null
    for (let player = 0; player < plans.length; player++) {
      for (const section of SECTION_ORDER) settle(player, section)
    }
    isPlaying.value = false
  }

  function dispose() {
    clearTimer()
    pendingGap = false
    cursor = null
    isPlaying.value = false
  }

  function revealOf(playerIndex: number): CardReveal {
    const state = emptyRecord<SectionState>('hidden')
    const tick = emptyRecord(0)
    for (const section of SECTION_ORDER) {
      state[section] = states[stateKey(playerIndex, section)] ?? 'hidden'
      tick[section] = ticks[stateKey(playerIndex, section)] ?? 0
    }
    return { state, tick, plan: plans[playerIndex] }
  }

  return { revealOf, isPlaying, activePlayer, start, finishCurrent, skipAll, dispose }
}
