<template>
  <view class="chip" tabindex="0">
    <image
      v-if="!failed"
      class="chip__img"
      :class="{ 'chip__img--accent': accent, 'chip__img--rolling': rolling }"
      :style="boxStyle"
      :src="icon"
      mode="aspectFill"
      @error="failed = true"
    />
    <view v-else class="chip__fallback" :style="boxStyle">
      <text class="chip__fallback-text">{{ initial }}</text>
    </view>

    <view v-if="!rolling" class="chip__tip" :style="tipStyle">
      <text class="chip__tip-name">{{ name }}</text>
      <text v-if="meta" class="chip__tip-meta">{{ meta }}</text>
      <text v-if="detail" class="chip__tip-desc">{{ detail }}</text>
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
    /** 首选用作资料卡正文的详细说明；为空时回退到 `desc`。 */
    detail?: string
    /** 资料卡的备选正文。 */
    desc?: string
    size?: number
    /** 圆形图标（英雄头像用）。 */
    round?: boolean
    /** 铜色描边，标记基石 / 主系这类「重点」。 */
    accent?: boolean
    /**
     * 资料卡相对图标的对齐方式。
     * 行首的图标必须用 `start`、行尾必须用 `end`，否则 232px 宽的浮层会溢出视口被裁掉。
     */
    align?: 'start' | 'center' | 'end'
    /** 轮盘滚动中：只显示当前帧，不出资料卡、也不做加载失败兜底。 */
    rolling?: boolean
  }>(),
  {
    meta: '',
    detail: '',
    desc: '',
    size: 34,
    round: false,
    accent: false,
    align: 'center',
    rolling: false,
  },
)

const failed = ref(false)

const boxStyle = computed(
  () =>
    `width:${props.size}px;height:${props.size}px;border-radius:${props.round ? '50%' : '5px'};`,
)

const tipStyle = computed(() => {
  if (props.align === 'start') return 'left:0;transform:none;'
  if (props.align === 'end') return 'left:auto;right:0;transform:none;'
  return 'left:50%;transform:translateX(-50%);'
})

const detail = computed(() => props.detail || props.desc)

const initial = computed(() => props.name.slice(0, 1))
</script>

<style scoped>
.chip {
  position: relative;
  display: block;
  flex: none;
}

.chip:focus {
  outline: 1px solid var(--brass);
  outline-offset: 2px;
  border-radius: 5px;
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

/* 滚动中的帧：压暗一点，和定格后的清晰状态区分开。 */
.chip__img--rolling {
  filter: brightness(0.72) saturate(0.85);
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

.chip__tip {
  display: none;
  position: absolute;
  bottom: calc(100% + 8px);
  width: 232px;
  padding: 10px 12px;
  background: #12151c;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
  z-index: 40;
}

/* 鼠标悬停与键盘聚焦都能看到资料卡。 */
.chip:hover .chip__tip,
.chip:focus .chip__tip {
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
