<template>
  <view class="chip">
    <image
      v-if="!failed"
      class="chip__img"
      :class="{ 'chip__img--accent': accent }"
      :style="boxStyle"
      :src="icon"
      mode="aspectFill"
      @error="failed = true"
    />
    <view v-else class="chip__fallback" :style="boxStyle">
      <text class="chip__fallback-text">{{ initial }}</text>
    </view>

    <view class="chip__tip">
      <text class="chip__tip-name">{{ name }}</text>
      <text v-if="meta" class="chip__tip-meta">{{ meta }}</text>
      <text v-if="desc" class="chip__tip-desc">{{ desc }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    icon: string
    name: string
    /** 资料卡第二行：价格、冷却、符文系之类的元信息。 */
    meta?: string
    desc?: string
    size?: number
    /** 圆形图标（英雄头像用）。 */
    round?: boolean
    /** 铜色描边，标记基石 / 主系这类「重点」。 */
    accent?: boolean
  }>(),
  { meta: '', desc: '', size: 34, round: false, accent: false },
)

const failed = ref(false)

const boxStyle = computed(
  () =>
    `width:${props.size}px;height:${props.size}px;border-radius:${props.round ? '50%' : '5px'};`,
)

const initial = computed(() => props.name.slice(0, 1))
</script>

<style scoped>
.chip {
  position: relative;
  display: block;
  flex: none;
}

.chip__img,
.chip__fallback {
  display: block;
  border: 1px solid var(--line);
  background: #0b0d12;
  box-sizing: border-box;
}

.chip__img--accent {
  border-color: var(--brass);
}

.chip__fallback {
  display: flex;
  align-items: center;
  justify-content: center;
}

.chip__fallback-text {
  font-size: 12px;
  color: var(--ink-muted);
}

/* 图标不可达时的兜底已经在模板里处理，这里只负责悬停资料卡。 */
.chip__tip {
  display: none;
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 232px;
  padding: 10px 12px;
  background: #12151c;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
  z-index: 40;
}

.chip:hover .chip__tip {
  display: block;
}

.chip__tip-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.4;
}

.chip__tip-meta {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--brass);
  line-height: 1.4;
}

.chip__tip-desc {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--ink-muted);
  line-height: 1.55;
}
</style>
