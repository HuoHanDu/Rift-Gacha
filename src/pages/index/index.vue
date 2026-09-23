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

          <view class="control">
            <text class="control__label">强度</text>
            <view class="seg">
              <view
                v-for="option in strengthOptions"
                :key="option.id"
                class="seg__item"
                :class="{ 'seg__item--on': tierId === option.id }"
                @click="tierId = option.id"
              >
                <text class="seg__text">{{ option.label }}</text>
              </view>
            </view>
          </view>

          <view class="control">
          <text class="control__label">显示</text>
          <view class="seg">
            <view class="seg__item" :class="{ 'seg__item--on': animate }" @click="animate = !animate">
              <text class="seg__text">{{ animate ? '揭幕动画：开' : '揭幕动画：关' }}</text>
            </view>
            <view
              v-if="teamMode"
              class="seg__item"
              :class="{ 'seg__item--on': sortByTeam }"
              @click="sortByTeam = !sortByTeam"
            >
              <text class="seg__text">{{ sortByTeam ? '按队伍排序' : '按输入顺序' }}</text>
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
              @input="markInputDirty"
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
          <view v-if="revealing" class="btn btn--skip" @click.stop="skipAll">
            <text class="btn__text btn__text--primary">跳过动画</text>
          </view>
        </view>

        <text v-if="inputDirty" class="results__hint results__hint--warn">
          输入改动过了。下面显示的还是上一次的结果——点「开始随机」才会用新输入重新生成。
        </text>

        <text v-if="revealing" class="results__hint">
          点击画面可以立刻揭晓当前这一段，直接跳到下一段
        </text>

        <view class="results__body" @click="finishCurrentSection">
          <template v-for="group in groups" :key="group.key">
            <view v-if="group.team" class="team-head">
              <text class="team-head__text" :class="`team-head__text--${group.team}`">{{
                group.team === 1 ? '蓝队' : '红队'
              }}</text>
              <view class="team-head__rule" />
              <text class="team-head__count">{{ group.builds.length }} 人</text>
            </view>
            <view class="grid">
              <BuildCard
                v-for="build in group.builds"
                :key="build.playerIndex"
                :build="build"
                :show-team="teamMode"
                :reveal="revealFor(build.playerIndex)"
                :active="activePlayerIndex === build.playerIndex"
                  :strength="strengthFor(build.playerIndex)"
              />
            </view>
          </template>
        </view>
      </view>

      <view v-else class="empty">
        <text class="empty__text">还没有结果。填不填都行——直接点「开始随机」就是单人一把。</text>
      </view>

      <view class="footer">
        <!-- Riot 同人政策第 6 条要求的声明，必须原样保留英文，见 docs/RIGHTS.md -->
        <text class="footer__notice">{{ RIOT_FAN_NOTICE }}</text>
        <text class="footer__text">
          非官方娱乐工具。数据来自官方公开接口（game.gtimg.cn / CommunityDragon），
          英雄、装备、符文等美术资源版权归 Riot Games 与腾讯所有，图标实时取自官方 CDN。
        </text>
      </view>

      <SnapshotList
        :items="snapshots"
        :current-id="activeSnapshotId"
        :patch="patch"
        @restore="restoreSnapshot"
        @remove="removeSnapshot"
        @clear="clearSnapshots"
      />
    </view>

    <!-- 全局唯一的详情弹层：窄屏贴底、宽屏居中。点任意图标打开 -->
    <DetailSheet />
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import BuildCard from '../../components/BuildCard.vue'
import DetailSheet from '../../components/DetailSheet.vue'
import SnapshotList from '../../components/SnapshotList.vue'
import { POSITION_LABELS, POSITIONS, RIOT_FAN_NOTICE, STRENGTH_TIERS } from '../../core/constants'
import type { StrengthTierId } from '../../core/constants'
import { generateBuilds } from '../../core/generate'
import { createRng } from '../../core/random'
import type { BuildResult, GenerateInput, PlayerInput, Position, TeamId } from '../../core/types'
import { DATA } from '../../data'
import { classifyTier } from '../../core/strength'
import type { PlayerStrength } from '../../core/generate'
import { createRevealController, type CardReveal, type RevealController } from '../../reveal/controller'
import { buildPlans } from '../../reveal/plan'
import {
  createSnapshotId,
  createSnapshotStore,
  describeSnapshot,
  type Snapshot,
} from '../../snapshots/store'

/** 表单里的玩家：位置与队伍可以是「未选择」。 */
interface EditablePlayer {
  name: string
  position?: Position
  team?: TeamId
}

const teamMode = ref(false)
const splitTeamsRandomly = ref(true)
const banSmite = ref(true)

/** 本地快照（历史记录）。全部存在访问者浏览器里，没有后端。 */
const store = createSnapshotStore()
const snapshots = ref<Snapshot[]>(store.list())
const activeSnapshotId = ref<string | null>(null)
/** 结果还在、但输入已经被改动过——提示用户要不要重新随机。 */
const inputDirty = ref(false)

/** 强度挡位（docs/STRENGTH.md §4）。`any` = 不控强度。 */
const tierId = ref<StrengthTierId>('any')
const strengthOptions = STRENGTH_TIERS
/** 与 results 同序的强度信息；不控强度时为空。 */
const strengths = ref<PlayerStrength[]>([])

/** 给卡片用的强度展示数据（含实际落档与是否达标）。 */
function strengthFor(playerIndex: number) {
  const index = results.value.findIndex((build) => build.playerIndex === playerIndex)
  const target = index >= 0 ? strengths.value[index] : undefined
  if (!target) return null
  return {
    ...target.breakdown,
    met: target.met,
    attempts: target.attempts,
    tierLabel: classifyTier(target.breakdown)?.label ?? null,
    // 提到顶层给卡片用：回退到常用分路这件事必须让用户看得见
    // （实测约 70% 的随机结果会走回退，不说明的话用户会以为算错了）
    buildFallback: target.breakdown.detail.buildFallback,
  }
}
/** 揭幕动画：默认关闭，开了才逐段播放。 */
const animate = ref(false)
/** 双队模式下把结果按队伍分组显示。 */
const sortByTeam = ref(true)

/**
 * 玩家名走 `v-model`（而不是 `:value` + 手写 `@input`）：`v-model` 编译成 Vue 的 vModelText，
 * 它会处理 IME 组合事件（compositionstart / compositionend），中文输入法下不会被回写打断候选。
 * 模板上额外挂的 `@input="markInputDirty"` 只负责标记「输入已改动」，不清结果。
 */
const players = reactive<EditablePlayer[]>([{ name: '' }])

const results = ref<BuildResult[]>([])
const errors = ref<string[]>([])
const seed = ref<number | null>(null)

/**
 * 揭幕动画的播放器。`null` ⇒ 不做动画（等价于全部已揭晓）。
 * 用 shallowRef 是因为控制器内部自己管响应式，我们只需要它的引用。
 */
const controller = shallowRef<RevealController | null>(null)

const revealing = computed(() => controller.value?.isPlaying.value ?? false)
const activePlayerIndex = computed(() => (revealing.value ? controller.value?.activePlayer.value ?? -1 : -1))

/** 结果分组：双队 + 按队伍排序时拆成蓝/红两组，否则就是一组。 */
interface ResultGroup {
  key: string
  team: TeamId | null
  builds: BuildResult[]
}

const groups = computed<ResultGroup[]>(() => {
  if (!teamMode.value || !sortByTeam.value) {
    return [{ key: 'all', team: null, builds: results.value }]
  }
  return ([1, 2] as TeamId[]).map((team) => ({
    key: `team-${team}`,
    team,
    builds: results.value.filter((build) => build.team === team),
  }))
})

function revealFor(playerIndex: number): CardReveal | null {
  return controller.value ? controller.value.revealOf(playerIndex) : null
}

/** 卡片的显示顺序（按队伍排序后就是蓝队在前）。动画也按这个顺序播，否则卡片会乱跳。 */
const displayOrder = computed(() =>
  groups.value.flatMap((group) => group.builds.map((build) => build.playerIndex)),
)

/**
 * 播放到哪张卡就把它滚进视野。`block: 'nearest'` 只在需要时才滚，不会每段都晃一下。
 * 这段依赖 DOM，所以只在 H5 生效——其他平台没有 `document`，直接跳过。
 */
watch(
  activePlayerIndex,
  (index) => {
    if (index < 0 || typeof document === 'undefined') return
    document.querySelector('.card--active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  },
  { flush: 'post' },
)

function disposeReveal() {
  controller.value?.dispose()
  controller.value = null
}

/** 点击画面：让当前这一段立刻定格，接着播下一段。 */
function finishCurrentSection() {
  controller.value?.finishCurrent()
}

/** 跳过：全部直接出结果，等同没开动画。 */
function skipAll() {
  const current = controller.value
  if (!current) return
  current.skipAll()
  current.dispose()
  controller.value = null
}

onUnmounted(disposeReveal)

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
  markInputDirty()
}

function setSplitRandomly(value: boolean) {
  splitTeamsRandomly.value = value
  if (!value) autoAssignTeams()
  markInputDirty()
}

function autoAssignTeams() {
  const half = Math.ceil(players.length / 2)
  players.forEach((player, index) => {
    player.team = index < half ? 1 : 2
  })
}

function setPosition(index: number, position: Position | undefined) {
  players[index].position = position
  markInputDirty()
}

function setTeam(index: number, team: TeamId) {
  players[index].team = team
  markInputDirty()
}

function addPlayer() {
  if (players.length >= maxPlayers.value) return
  players.push({ name: '', team: splitTeamsRandomly.value ? undefined : 1 })
  if (teamMode.value && !splitTeamsRandomly.value) autoAssignTeams()
  markInputDirty()
}

function removePlayer() {
  if (players.length <= 1) return
  players.pop()
  if (teamMode.value && !splitTeamsRandomly.value) autoAssignTeams()
  markInputDirty()
}

/**
 * 改动输入时**不再清空已有结果**。
 *
 * 原来的行为是「动一下输入，结果就没了」——手滑点到「添加玩家」就白随机一次。
 * 现在结果留着，只在旁边提示「输入已变，点开始随机重新生成」，由用户自己决定。
 */
function markInputDirty() {
  if (results.value.length > 0) inputDirty.value = true
}

function clearOutcome() {
  disposeReveal()
  results.value = []
  errors.value = []
  seed.value = null
  strengths.value = []
  inputDirty.value = false
  activeSnapshotId.value = null
}

function roll() {
  // 连点「开始随机」时必须先把上一轮的定时器停掉，否则会叠出并发的播放。
  disposeReveal()

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

  // 挡位作用于每个玩家；`any` 表示不控强度，走与历史一致的单次路径。
  const outcome = generateBuilds(input, DATA, { tiers: players.map(() => tierId.value) })
  if (!outcome.ok) {
    clearOutcome()
    errors.value = outcome.errors.map((error) => error.message)
    return
  }

  errors.value = []
  seed.value = outcome.seed
  results.value = outcome.results
  strengths.value = outcome.strengths
  inputDirty.value = false
  saveSnapshot(input, outcome.seed, outcome.results)

  if (animate.value) {
    // 轮盘的陪跑项也由同一个 seed 派生：同一个 seed 连动画都能重放。
    const plans = buildPlans(outcome.results, DATA, createRng(outcome.seed))
    const next = createRevealController(plans, displayOrder.value)
    controller.value = next
    next.start()
  }
}

// ---------------------------------------------------------------- 本地快照

/**
 * 每次成功随机都自动存一条快照。
 *
 * 只存 **种子 + 选项 + 数据补丁**，不存结果本身：引擎是确定性的，同 seed 重放
 * 得到逐字节相同的结果，所以一条快照只有几百字节而不是几十 KB。
 */
function saveSnapshot(input: GenerateInput, runSeed: number, builds: BuildResult[]) {
  const createdAt = Date.now()
  const snapshot: Snapshot = {
    id: createSnapshotId(createdAt),
    createdAt,
    seed: runSeed,
    patch: DATA.meta.patch,
    input,
    label: describeSnapshot(builds.map((build) => build.champion.title), input.teamMode),
    teamMode: input.teamMode,
  }
  snapshots.value = store.add(snapshot)
  activeSnapshotId.value = snapshot.id
}

/** 点快照：把当时的选项填回表单，再用同一个 seed 重放。 */
function restoreSnapshot(snapshot: Snapshot) {
  disposeReveal()

  teamMode.value = snapshot.input.teamMode
  splitTeamsRandomly.value = snapshot.input.splitTeamsRandomly
  banSmite.value = snapshot.input.banSmiteForNonJungle
  players.splice(
    0,
    players.length,
    ...snapshot.input.players.map((player) => ({
      name: player.name ?? '',
      position: player.position,
      team: player.team,
    })),
  )

  const outcome = generateBuilds(snapshot.input, DATA, { seed: snapshot.seed })
  if (!outcome.ok) {
    errors.value = outcome.errors.map((error) => error.message)
    return
  }
  errors.value = []
  seed.value = outcome.seed
  results.value = outcome.results
  strengths.value = outcome.strengths
  inputDirty.value = false
  activeSnapshotId.value = snapshot.id
}

function removeSnapshot(snapshot: Snapshot) {
  snapshots.value = store.remove(snapshot.id)
  if (activeSnapshotId.value === snapshot.id) activeSnapshotId.value = null
}

function clearSnapshots() {
  snapshots.value = store.clear()
  activeSnapshotId.value = null
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
  align-items: center;
  gap: 12px;
}

.results__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}

.results__seed {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--ink-muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.results__hint {
  font-size: 11px;
  color: var(--ink-muted);
}

.results__hint--warn {
  color: var(--brass);
}

.results__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  /* 动画期间整块是「可点击快进」的热区 */
  cursor: default;
}

.team-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 8px;
}

.team-head__text {
  flex: none;
  font-size: 12px;
  letter-spacing: 0.12em;
}

.team-head__text--1 {
  color: #7fb0e4;
}

.team-head__text--2 {
  color: #e4937f;
}

.team-head__rule {
  flex: 1;
  height: 1px;
  background: var(--line);
}

.team-head__count {
  flex: none;
  font-size: 11px;
  color: var(--ink-muted);
  font-variant-numeric: tabular-nums;
}

.btn--skip {
  flex: none;
  border-color: var(--brass);
  background: rgba(200, 151, 63, 0.12);
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
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Riot 同人政策要求的声明：要比周围文字显眼，不能藏 */
.footer__notice {
  font-size: 12px;
  color: var(--ink-muted);
  line-height: 1.6;
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

/*
 * 触控设备：把可点区域放大到接近 44px（手指点得准的常规下限）。
 * 用 `hover: none` 而不是宽度断点——平板也会有宽屏，但它们同样是触屏。
 */
@media (hover: none) {
  .seg__item {
    padding: 10px 12px;
  }

  .btn {
    padding: 11px 16px;
  }

  .row__name {
    height: 38px;
  }
}
</style>
