<template>
  <view class="page">
    <view class="wrap">
      <!-- 标题 -->
      <view class="masthead">
        <view class="masthead__left">
          <text class="masthead__title">峡谷全随机构筑器</text>
          <text class="masthead__sub">
            位置 · 英雄 · 召唤师技能 · 出门装 · 六件成装 · 主副系符文 · 小符文，一次全随机
          </text>
        </view>
        <text class="masthead__patch">补丁 {{ patch }}</text>
      </view>

      <!-- 输入区 -->
      <view class="panel">
        <view class="control">
          <text class="control__label">模式</text>
          <view class="seg">
            <view
              class="seg__item"
              :class="{ 'seg__item--on': !teamMode }"
              @click="setTeamMode(false)"
            >
              <text class="seg__text">单队 1–5 人</text>
            </view>
            <view
              class="seg__item"
              :class="{ 'seg__item--on': teamMode }"
              @click="setTeamMode(true)"
            >
              <text class="seg__text">双队最多 10 人</text>
            </view>
          </view>
          <text class="control__hint">{{ players.length }} / {{ maxPlayers }} 人</text>
        </view>

        <view v-if="teamMode" class="control">
          <text class="control__label">分队</text>
          <view class="seg">
            <view
              class="seg__item"
              :class="{ 'seg__item--on': splitTeamsRandomly }"
              @click="setSplitRandomly(true)"
            >
              <text class="seg__text">随机分队</text>
            </view>
            <view
              class="seg__item"
              :class="{ 'seg__item--on': !splitTeamsRandomly }"
              @click="setSplitRandomly(false)"
            >
              <text class="seg__text">预先分队</text>
            </view>
          </view>
        </view>

        <view class="control">
          <text class="control__label">规则</text>
          <view class="seg">
            <view
              class="seg__item"
              :class="{ 'seg__item--on': banSmite }"
              @click="banSmite = !banSmite"
            >
              <text class="seg__text">{{ banSmite ? '非打野位置不出现惩戒' : '任何位置都可能出惩戒' }}</text>
            </view>
          </view>
        </view>

        <!-- 玩家列表 -->
        <view class="roster">
          <view v-for="(player, index) in players" :key="index" class="row">
            <text class="row__no">{{ String(index + 1).padStart(2, '0') }}</text>
            <input
              v-model="player.name"
              class="row__name"
              type="text"
              placeholder="玩家名（选填）"
              placeholder-class="row__name-ph"
              @input="clearOutcome"
            />
            <view class="seg seg--compact">
              <view
                class="seg__item"
                :class="{ 'seg__item--on': !player.position }"
                @click="setPosition(index, undefined)"
              >
                <text class="seg__text">随机</text>
              </view>
              <view
                v-for="position in POSITIONS"
                :key="position"
                class="seg__item"
                :class="{ 'seg__item--on': player.position === position }"
                @click="setPosition(index, position)"
              >
                <text class="seg__text">{{ POSITION_LABELS[position] }}</text>
              </view>
            </view>

            <view v-if="teamMode && !splitTeamsRandomly" class="seg seg--compact">
              <view
                class="seg__item"
                :class="{ 'seg__item--on': player.team === 1 }"
                @click="setTeam(index, 1)"
              >
                <text class="seg__text">蓝队</text>
              </view>
              <view
                class="seg__item"
                :class="{ 'seg__item--on': player.team === 2 }"
                @click="setTeam(index, 2)"
              >
                <text class="seg__text">红队</text>
              </view>
            </view>
          </view>
        </view>

        <view class="actions">
          <view class="btn" @click="addPlayer">
            <text class="btn__text">添加玩家</text>
          </view>
          <view class="btn" @click="removePlayer">
            <text class="btn__text">移除末位</text>
          </view>
          <view class="btn btn--primary" @click="roll">
            <text class="btn__text btn__text--primary">开始随机</text>
          </view>
        </view>

        <view v-if="errors.length > 0" class="errors">
          <text v-for="(message, index) in errors" :key="index" class="errors__item">· {{ message }}</text>
        </view>
      </view>

      <!-- 结果区 -->
      <view v-if="results.length > 0" class="results">
        <view class="results__head">
          <text class="results__title">随机结果</text>
          <text class="results__seed">种子 {{ seed }} · 同一种子可复现</text>
        </view>
        <view class="grid">
          <BuildCard
            v-for="build in results"
            :key="build.playerIndex"
            :build="build"
            :show-team="teamMode"
          />
        </view>
      </view>

      <view v-else class="empty">
        <text class="empty__text">还没有结果。填不填都行——直接点「开始随机」就是单人一把。</text>
      </view>

      <view class="footer">
        <text class="footer__text">
          非官方娱乐工具。数据来自官方公开接口（game.gtimg.cn / CommunityDragon），
          版权归 Riot Games 与腾讯所有。图标实时取自官方 CDN。
        </text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import BuildCard from '../../components/BuildCard.vue'
import { POSITION_LABELS, POSITIONS } from '../../core/constants'
import { generateBuilds } from '../../core/generate'
import type { BuildResult, GenerateInput, PlayerInput, Position, TeamId } from '../../core/types'
import { DATA } from '../../data'

/** 表单里的玩家：位置与队伍可以是「未选择」。 */
interface EditablePlayer {
  name: string
  position?: Position
  team?: TeamId
}

const teamMode = ref(false)
const splitTeamsRandomly = ref(true)
const banSmite = ref(true)

/**
 * 玩家名走 `v-model`（而不是 `:value` + 手写 `@input`）：`v-model` 编译成 Vue 的 vModelText，
 * 它会处理 IME 组合事件（compositionstart / compositionend），中文输入法下不会被回写打断候选。
 * 模板上额外挂的 `@input="clearOutcome"` 只负责在改名字时清掉上一次的结果。
 */
const players = reactive<EditablePlayer[]>([{ name: '' }])

const results = ref<BuildResult[]>([])
const errors = ref<string[]>([])
const seed = ref<number | null>(null)

const patch = DATA.meta.patch
const maxPlayers = computed(() => (teamMode.value ? 10 : 5))

function setTeamMode(value: boolean) {
  teamMode.value = value
  if (!value) {
    splitTeamsRandomly.value = true
    players.forEach((player) => {
      player.team = undefined
    })
  } else if (!splitTeamsRandomly.value) {
    autoAssignTeams()
  }
  while (players.length > maxPlayers.value) players.pop()
  clearOutcome()
}

function setSplitRandomly(value: boolean) {
  splitTeamsRandomly.value = value
  if (!value) autoAssignTeams()
  clearOutcome()
}

function autoAssignTeams() {
  const half = Math.ceil(players.length / 2)
  players.forEach((player, index) => {
    player.team = index < half ? 1 : 2
  })
}

function setPosition(index: number, position: Position | undefined) {
  players[index].position = position
  clearOutcome()
}

function setTeam(index: number, team: TeamId) {
  players[index].team = team
  clearOutcome()
}

function addPlayer() {
  if (players.length >= maxPlayers.value) return
  players.push({ name: '', team: splitTeamsRandomly.value ? undefined : 1 })
  if (teamMode.value && !splitTeamsRandomly.value) autoAssignTeams()
  clearOutcome()
}

function removePlayer() {
  if (players.length <= 1) return
  players.pop()
  if (teamMode.value && !splitTeamsRandomly.value) autoAssignTeams()
  clearOutcome()
}

function clearOutcome() {
  results.value = []
  errors.value = []
  seed.value = null
}

function roll() {
  const input: GenerateInput = {
    players: players.map<PlayerInput>((player) => ({
      name: player.name,
      position: player.position,
      team: teamMode.value && !splitTeamsRandomly.value ? player.team : undefined,
    })),
    teamMode: teamMode.value,
    splitTeamsRandomly: splitTeamsRandomly.value,
    banSmiteForNonJungle: banSmite.value,
  }

  const outcome = generateBuilds(input, DATA)
  if (!outcome.ok) {
    results.value = []
    seed.value = null
    errors.value = outcome.errors.map((error) => error.message)
    return
  }

  errors.value = []
  seed.value = outcome.seed
  results.value = outcome.results
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
}

.wrap {
  max-width: 1280px;
  margin: 0 auto;
  padding: 28px 24px 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ---------------------------------------------------------------- 标题 */

.masthead {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.masthead__left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.masthead__title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--ink);
  line-height: 1.2;
}

.masthead__sub {
  font-size: 12px;
  color: var(--ink-muted);
  line-height: 1.5;
}

.masthead__patch {
  flex: none;
  font-size: 11px;
  color: var(--brass);
  border: 1px solid var(--brass);
  border-radius: 4px;
  padding: 4px 8px;
  line-height: 1;
}

/* ---------------------------------------------------------------- 输入面板 */

.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control__label {
  flex: none;
  width: 32px;
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--ink-muted);
}

.control__hint {
  font-size: 11px;
  color: var(--ink-muted);
  font-variant-numeric: tabular-nums;
}

.seg {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.seg__item {
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface-2);
  cursor: pointer;
}

.seg__item--on {
  border-color: var(--brass);
  color: var(--brass);
}

.seg__text {
  font-size: 12px;
  color: var(--ink-muted);
}

.seg__item--on .seg__text {
  color: var(--brass);
}

.roster {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.row__no {
  flex: none;
  width: 22px;
  font-size: 12px;
  color: var(--ink-muted);
  font-variant-numeric: tabular-nums;
}

.row__name {
  flex: none;
  width: 168px;
  height: 30px;
  padding: 0 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--ink);
  font-size: 13px;
}

.row__name-ph {
  color: #5d6675;
  font-size: 13px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}

.btn {
  padding: 8px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 5px;
  background: var(--surface-2);
  cursor: pointer;
}

.btn--primary {
  border-color: var(--brass);
  background: rgba(200, 151, 63, 0.12);
  margin-left: auto;
}

.btn__text {
  font-size: 13px;
  color: var(--ink-muted);
}

.btn__text--primary {
  color: var(--brass);
  font-weight: 600;
}

.errors {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--danger);
  border-radius: 6px;
  background: rgba(224, 87, 95, 0.08);
}

.errors__item {
  font-size: 12px;
  color: var(--danger);
  line-height: 1.5;
}

/* ---------------------------------------------------------------- 结果 */

.results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.results__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.results__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}

.results__seed {
  font-size: 11px;
  color: var(--ink-muted);
  font-variant-numeric: tabular-nums;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(336px, 1fr));
  gap: 14px;
}

.empty {
  padding: 36px 20px;
  border: 1px dashed var(--line-strong);
  border-radius: 10px;
  text-align: center;
}

.empty__text {
  font-size: 13px;
  color: var(--ink-muted);
}

.footer {
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.footer__text {
  font-size: 11px;
  color: #5d6675;
  line-height: 1.6;
}

@media (max-width: 720px) {
  .wrap {
    padding: 20px 14px 36px;
  }

  .masthead {
    flex-direction: column;
    align-items: flex-start;
  }

  .masthead__title {
    font-size: 21px;
  }

  .row__name {
    width: 100%;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
