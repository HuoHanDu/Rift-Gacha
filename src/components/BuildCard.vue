<template>
  <view class="card">
    <!-- 表头：序号 / 名字 / 位置 / 队伍 -->
    <view class="card__head">
      <text class="card__index">{{ String(build.playerIndex + 1).padStart(2, '0') }}</text>
      <text class="card__name">{{ build.name }}</text>
      <text class="card__tag card__tag--position">{{ positionLabel }}</text>
      <text v-if="showTeam" class="card__tag card__tag--team" :class="`card__tag--team${build.team}`">
        {{ build.team === 1 ? '蓝队' : '红队' }}
      </text>
    </view>

    <!-- 英雄 -->
    <view class="champion">
      <IconChip
        :icon="build.champion.icon"
        :name="`${build.champion.title} · ${build.champion.name}`"
        :meta="championMeta"
        :desc="`官方定位：${championMeta}`"
        :size="56"
        round
      />
      <view class="champion__text">
        <text class="champion__name">{{ build.champion.title }}</text>
        <text class="champion__title">{{ build.champion.name }}</text>
      </view>
    </view>

    <!-- 召唤师技能 -->
    <view class="section">
      <text class="section__label">召唤师技能</text>
      <view class="row">
        <IconChip
          v-for="spell in build.spells"
          :key="spell.id"
          :icon="spell.icon"
          :name="spell.name"
          :meta="spell.cooldown ? `冷却 ${spell.cooldown} 秒` : ''"
          :desc="spell.desc"
          :size="34"
        />
      </view>
    </view>

    <!-- 出门装 -->
    <view class="section">
      <text class="section__label">出门装</text>
      <view class="row">
        <IconChip
          v-if="build.displayStarterItem"
          :icon="build.displayStarterItem.icon"
          :name="build.displayStarterItem.name"
          meta="云游图鉴 · 升级形态"
          :desc="build.displayStarterItem.desc"
          :size="34"
        />
        <IconChip
          v-else
          :icon="build.starterItem.icon"
          :name="build.starterItem.name"
          :meta="`${build.starterItem.gold} 金币`"
          :desc="build.starterItem.desc"
          :size="34"
        />
      </view>
    </view>

    <!-- 成装 + 鞋子 -->
    <view class="section">
      <text class="section__label">成装</text>
      <view class="row row--items">
        <IconChip
          v-for="item in build.legendaryItems"
          :key="item.id"
          :icon="item.icon"
          :name="item.name"
          :meta="`${item.gold} 金币`"
          :desc="item.desc"
          :size="34"
        />
        <view class="row__gap" />
        <IconChip
          :icon="build.boots.icon"
          :name="build.boots.name"
          :meta="build.position === 'mid' ? '鞋子 · 中路已升级' : '鞋子'"
          :desc="build.boots.desc"
          :size="34"
          accent
        />
      </view>
    </view>

    <!-- 签名元素：用主系符文图标打断的细分隔线，标出「装备 → 符文」的体系切换 -->
    <view class="divider">
      <view class="divider__rule" />
      <image class="divider__mark" :src="build.runes.primaryStyle.icon" mode="aspectFit" />
      <view class="divider__rule" />
    </view>

    <!-- 符文 -->
    <view class="section">
      <text class="section__label">符文</text>

      <view class="rune-line">
        <text class="rune-line__role">主系</text>
        <IconChip
          :icon="build.runes.primaryStyle.icon"
          :name="build.runes.primaryStyle.name"
          meta="主系"
          :size="26"
          accent
        />
        <IconChip
          :icon="build.runes.keystone.icon"
          :name="build.runes.keystone.name"
          meta="基石"
          :desc="build.runes.keystone.short"
          :size="30"
          accent
        />
        <IconChip
          v-for="rune in build.runes.primaryMinors"
          :key="rune.id"
          :icon="rune.icon"
          :name="rune.name"
          meta="主系小符文"
          :desc="rune.short"
          :size="26"
        />
      </view>

      <view class="rune-line">
        <text class="rune-line__role">副系</text>
        <IconChip
          :icon="build.runes.secondaryStyle.icon"
          :name="build.runes.secondaryStyle.name"
          meta="副系"
          :size="26"
        />
        <IconChip
          v-for="rune in build.runes.secondaryMinors"
          :key="rune.id"
          :icon="rune.icon"
          :name="rune.name"
          meta="副系小符文"
          :desc="rune.short"
          :size="26"
        />
      </view>
    </view>

    <!-- 小符文 -->
    <view class="section section--last">
      <text class="section__label">小符文</text>
      <view class="row">
        <IconChip
          v-for="(shard, index) in build.shards"
          :key="shard.id"
          :icon="shard.icon"
          :name="shard.name"
          :meta="shardRowLabel(index)"
          :desc="shard.long"
          :size="28"
        />
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

const props = defineProps<{ build: BuildResult; showTeam: boolean }>()

const positionLabel = computed(() => POSITION_LABELS[props.build.position])

const championMeta = computed(() =>
  props.build.champion.roles.map((role) => ROLE_LABELS[role] ?? role).join(' · '),
)

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

.section--last {
  padding-bottom: 2px;
}
</style>
