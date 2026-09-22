<template>
  <view class="card" :class="{ 'card--active': active }">
    <!-- 表头：序号 / 名字 / 位置 / 队伍 -->
    <view class="card__head">
      <text class="card__index">{{ String(build.playerIndex + 1).padStart(2, '0') }}</text>
      <text class="card__name">{{ build.name }}</text>
      <view v-if="isHidden('position')" class="ph" :style="phStyle(46, false)" />
      <text v-else class="card__tag card__tag--position">{{
        textOf('position', SLOT_KEYS.position, positionLabel)
      }}</text>
      <text v-if="showTeam" class="card__tag" :class="`card__tag--team${build.team}`">{{
        build.team === 1 ? '蓝队' : '红队'
      }}</text>
    </view>

    <!-- 英雄 -->
    <view class="champion">
      <view v-if="isHidden('champion')" class="ph" :style="phStyle(56, true)" />
      <IconChip
        v-else
        :icon="iconOf('champion', SLOT_KEYS.champion, build.champion.icon)"
        :name="`${build.champion.title} · ${build.champion.name}`"
        :meta="championMeta"
        :desc="`官方定位：${championMeta}`"
        :size="56"
        round
        align="start"
        :rolling="isRolling('champion')"
      />
      <view class="champion__text">
        <template v-if="isDone('champion')">
          <text class="champion__name">{{ build.champion.title }}</text>
          <text class="champion__title">{{ build.champion.name }}</text>
        </template>
        <template v-else>
          <view class="ph ph--text-lg" />
          <view class="ph ph--text-sm" />
        </template>
      </view>
    </view>

    <!-- 召唤师技能 -->
    <view class="section">
      <text class="section__label">召唤师技能</text>
      <view class="row">
        <template v-for="(spell, index) in build.spells" :key="spell.id">
          <view v-if="isHidden('spells')" class="ph" :style="phStyle(34)" />
          <IconChip
            v-else
            :icon="iconOf('spells', SLOT_KEYS.spell(index), spell.icon)"
            :name="spell.name"
            :meta="spell.cooldown ? `冷却 ${spell.cooldown} 秒` : ''"
            :desc="spell.desc"
            :size="34"
            :align="index === 0 ? 'start' : 'end'"
            :rolling="isRolling('spells')"
          />
        </template>
      </view>
    </view>

    <!-- 出门装 -->
    <view class="section">
      <text class="section__label">出门装</text>
      <view class="row">
        <view v-if="isHidden('starter')" class="ph" :style="phStyle(34)" />
        <IconChip
          v-else-if="build.displayStarterItem"
          :icon="iconOf('starter', SLOT_KEYS.starter, build.displayStarterItem.icon)"
          :name="build.displayStarterItem.name"
          meta="云游图鉴 · 升级形态"
          :desc="build.displayStarterItem.desc"
          :size="34"
          align="start"
          :rolling="isRolling('starter')"
        />
        <IconChip
          v-else
          :icon="iconOf('starter', SLOT_KEYS.starter, build.starterItem.icon)"
          :name="build.starterItem.name"
          :meta="`${build.starterItem.gold} 金币`"
          :desc="build.starterItem.desc"
          :size="34"
          align="start"
          :rolling="isRolling('starter')"
        />
      </view>
    </view>

    <!-- 成装 + 鞋子 -->
    <view class="section">
      <text class="section__label">成装</text>
      <view class="row row--items">
        <template v-for="(item, index) in build.legendaryItems" :key="item.id">
          <view v-if="isHidden('items')" class="ph" :style="phStyle(34)" />
          <IconChip
            v-else
            :icon="iconOf('items', SLOT_KEYS.item(index), item.icon)"
            :name="item.name"
            :meta="`${item.gold} 金币`"
            :desc="item.desc"
            :size="34"
            :align="index === 0 ? 'start' : 'center'"
            :rolling="isRolling('items')"
          />
        </template>
        <view class="row__gap" />
        <view v-if="isHidden('items')" class="ph" :style="phStyle(34)" />
        <IconChip
          v-else
          :icon="iconOf('items', SLOT_KEYS.boots, build.boots.icon)"
          :name="build.boots.name"
          :meta="build.position === 'mid' ? '鞋子 · 中路已升级' : '鞋子'"
          :desc="build.boots.desc"
          :size="34"
          accent
          align="end"
          :rolling="isRolling('items')"
        />
      </view>
    </view>

    <!-- 签名元素：用主系符文图标打断的细分隔线，标出「装备 → 符文」的体系切换 -->
    <view v-if="!isHidden('runes')" class="divider">
      <view class="divider__rule" />
      <image
        class="divider__mark"
        :src="iconOf('runes', SLOT_KEYS.primaryStyle, build.runes.primaryStyle.icon)"
        mode="aspectFit"
      />
      <view class="divider__rule" />
    </view>

    <!-- 符文 -->
    <view class="section">
      <text class="section__label">符文</text>

      <view class="rune-line">
        <text class="rune-line__role">主系</text>
        <view v-if="isHidden('runes')" class="ph" :style="phStyle(26)" />
        <IconChip
          v-else
          :icon="iconOf('runes', SLOT_KEYS.primaryStyle, build.runes.primaryStyle.icon)"
          :name="build.runes.primaryStyle.name"
          meta="主系"
          :size="26"
          accent
          align="start"
          :rolling="isRolling('runes')"
        />
        <view v-if="isHidden('runes')" class="ph" :style="phStyle(30)" />
        <IconChip
          v-else
          :icon="iconOf('runes', SLOT_KEYS.keystone, build.runes.keystone.icon)"
          :name="build.runes.keystone.name"
          meta="基石"
          :detail="build.runes.keystone.long"
          :desc="build.runes.keystone.short"
          :size="30"
          accent
          :rolling="isRolling('runes')"
        />
        <template v-for="(rune, index) in build.runes.primaryMinors" :key="rune.id">
          <view v-if="isHidden('runes')" class="ph" :style="phStyle(26)" />
          <IconChip
            v-else
            :icon="iconOf('runes', SLOT_KEYS.primaryMinor(index), rune.icon)"
            :name="rune.name"
            meta="主系小符文"
            :detail="rune.long"
            :desc="rune.short"
            :size="26"
            :align="index === build.runes.primaryMinors.length - 1 ? 'end' : 'center'"
            :rolling="isRolling('runes')"
          />
        </template>
      </view>

      <view class="rune-line">
        <text class="rune-line__role">副系</text>
        <view v-if="isHidden('runes')" class="ph" :style="phStyle(26)" />
        <IconChip
          v-else
          :icon="iconOf('runes', SLOT_KEYS.secondaryStyle, build.runes.secondaryStyle.icon)"
          :name="build.runes.secondaryStyle.name"
          meta="副系"
          :size="26"
          align="start"
          :rolling="isRolling('runes')"
        />
        <template v-for="(rune, index) in build.runes.secondaryMinors" :key="rune.id">
          <view v-if="isHidden('runes')" class="ph" :style="phStyle(26)" />
          <IconChip
            v-else
            :icon="iconOf('runes', SLOT_KEYS.secondaryMinor(index), rune.icon)"
            :name="rune.name"
            meta="副系小符文"
            :detail="rune.long"
            :desc="rune.short"
            :size="26"
            :align="index === build.runes.secondaryMinors.length - 1 ? 'end' : 'center'"
            :rolling="isRolling('runes')"
          />
        </template>
      </view>

      <view class="row row--shards">
        <template v-for="(shard, index) in build.shards" :key="shard.id">
          <view v-if="isHidden('runes')" class="ph" :style="phStyle(28)" />
          <IconChip
            v-else
            :icon="iconOf('runes', SLOT_KEYS.shard(index), shard.icon)"
            :name="shard.name"
            :meta="shardRowLabel(index)"
            :detail="shard.long"
            :desc="shard.short"
            :size="28"
            :align="index === 0 ? 'start' : index === build.shards.length - 1 ? 'end' : 'center'"
            :rolling="isRolling('runes')"
          />
        </template>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import IconChip from './IconChip.vue'
import { POSITION_LABELS, ROLE_LABELS } from '../core/constants'
import { DATA } from '../data'
import type { BuildResult } from '../core/types'
import type { CardReveal, SectionState } from '../reveal/controller'
import { SLOT_KEYS, type SlotFrame } from '../reveal/plan'
import type { SectionKey } from '../reveal/sections'

const props = defineProps<{
  build: BuildResult
  showTeam: boolean
  /** `null` 表示不做动画，直接显示最终结果。 */
  reveal: CardReveal | null
  /** 正在播放这一张卡（用于高亮）。 */
  active: boolean
}>()

const positionLabel = computed(() => POSITION_LABELS[props.build.position])

const championMeta = computed(() =>
  props.build.champion.roles.map((role) => ROLE_LABELS[role] ?? role).join(' · '),
)

function stateOf(section: SectionKey): SectionState {
  return props.reveal ? props.reveal.state[section] : 'done'
}

function isHidden(section: SectionKey): boolean {
  return stateOf(section) === 'hidden'
}

function isRolling(section: SectionKey): boolean {
  return stateOf(section) === 'rolling'
}

function isDone(section: SectionKey): boolean {
  return stateOf(section) === 'done'
}

/** 取该格子此刻该显示的帧；不在滚动就返回 null，调用方回退到真实值。 */
function frameAt(section: SectionKey, key: string): SlotFrame | null {
  if (!props.reveal || stateOf(section) !== 'rolling') return null
  const slot = props.reveal.plan[section].find((candidate) => candidate.key === key)
  if (!slot || slot.frames.length === 0) return null
  const tick = Math.min(Math.max(props.reveal.tick[section] ?? 0, 0), slot.frames.length - 1)
  return slot.frames[tick] ?? null
}

function iconOf(section: SectionKey, key: string, fallback: string): string {
  const frame = frameAt(section, key)
  return frame && frame.icon ? frame.icon : fallback
}

function textOf(section: SectionKey, key: string, fallback: string): string {
  const frame = frameAt(section, key)
  return frame && frame.text ? frame.text : fallback
}

function phStyle(size: number, round = false): string {
  return `width:${size}px;height:${size}px;border-radius:${round ? '50%' : '5px'};`
}

function shardRowLabel(index: number): string {
  return DATA.runes.shardRows[index]?.slot ?? ''
}
</script>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 正在播放动画的那张卡亮一下铜色边框，多人随机时能一眼找到。 */
.card--active {
  border-color: var(--brass);
  box-shadow: 0 0 0 1px rgba(200, 151, 63, 0.25);
}

/* 尚未揭晓的格子：留空但可感知，避免看起来像坏了。 */
.ph {
  flex: none;
  background: var(--surface-2);
  border: 1px solid var(--line);
  box-sizing: border-box;
  animation: ph-breathe 1.4s ease-in-out infinite;
}

.ph--text-lg {
  width: 96px;
  height: 20px;
  border-radius: 4px;
}

.ph--text-sm {
  width: 64px;
  height: 12px;
  border-radius: 3px;
}

@keyframes ph-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ph {
    animation: none;
  }
}

.card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card__index {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--ink-muted);
  letter-spacing: 0.06em;
}

.card__name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card__tag {
  flex: none;
  font-size: 11px;
  line-height: 1;
  padding: 5px 8px;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  color: var(--ink-muted);
}

.card__tag--position {
  border-color: var(--brass);
  color: var(--brass);
}

.card__tag--team1 {
  border-color: #3f6fa8;
  color: #7fb0e4;
}

.card__tag--team2 {
  border-color: #a8503f;
  color: #e4937f;
}

.champion {
  display: flex;
  align-items: center;
  gap: 12px;
}

.champion__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.champion__name {
  font-size: 20px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.15;
}

.champion__title {
  font-size: 12px;
  color: var(--ink-muted);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.section__label {
  font-size: 11px;
  color: var(--ink-muted);
  letter-spacing: 0.14em;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.row--shards {
  margin-top: 2px;
}

/* 成装一行放 6 件，和鞋子之间用一小段留白隔开——对应游戏里多出来的鞋子格。 */
.row--items {
  flex-wrap: nowrap;
}

.row__gap {
  flex: none;
  width: 4px;
  height: 22px;
  border-left: 1px solid var(--line-strong);
  margin: 0 2px;
}

.divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0;
}

.divider__rule {
  flex: 1;
  height: 1px;
  background: var(--line);
}

.divider__mark {
  flex: none;
  width: 16px;
  height: 16px;
  opacity: 0.85;
}

.rune-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.rune-line__role {
  flex: none;
  width: 26px;
  font-size: 11px;
  color: var(--ink-muted);
}
</style>
