<template>
  <view class="snapshots">
    <view class="snapshots__head">
      <text class="snapshots__title">历史快照</text>
      <text class="snapshots__hint">存在你自己的浏览器里，不会上传</text>
      <view v-if="items.length > 0" class="snapshots__clear" @click="emit('clear')">
        <text class="snapshots__clear-text">清空</text>
      </view>
    </view>

    <view v-if="items.length === 0" class="snapshots__empty">
      <text class="snapshots__empty-text">
        还没有快照。每次点「开始随机」都会自动存一条，只记录种子和选项（几百字节），点一下就能原样重现。
      </text>
    </view>

    <view v-else class="snapshots__list">
      <view
        v-for="item in items"
        :key="item.id"
        class="snapshot"
        :class="{ 'snapshot--current': item.id === currentId }"
        @click="emit('restore', item)"
      >
        <view class="snapshot__main">
          <text class="snapshot__label">{{ item.label }}</text>
          <text class="snapshot__meta">
            {{ formatTime(item.createdAt) }} · 种子 {{ item.seed }}
            <template v-if="item.patch !== patch"> · ⚠️ 补丁 {{ item.patch }}</template>
          </text>
        </view>
        <view class="snapshot__del" @click.stop="emit('remove', item)">
          <text class="snapshot__del-text">删除</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { Snapshot } from '../snapshots/store'

defineProps<{
  items: Snapshot[]
  /** 当前正在展示的那条快照 id，用于高亮。 */
  currentId: string | null
  /** 当前数据补丁，用来给跨版本快照打标。 */
  patch: string
}>()

const emit = defineEmits<{
  restore: [item: Snapshot]
  remove: [item: Snapshot]
  clear: []
}>()

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>

<style scoped>
.snapshots {
  margin-top: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.snapshots__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.snapshots__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.snapshots__hint {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--ink-muted);
}

.snapshots__clear {
  flex: none;
  padding: 4px 10px;
  border: 1px solid var(--line-strong);
  border-radius: 5px;
}

.snapshots__clear-text {
  font-size: 11px;
  color: var(--ink-muted);
}

.snapshots__empty-text {
  font-size: 12px;
  line-height: 1.6;
  color: #5d6675;
}

.snapshots__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
}

.snapshot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 7px;
  cursor: pointer;
}

.snapshot--current {
  border-color: var(--brass);
}

.snapshot__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.snapshot__label {
  font-size: 13px;
  color: var(--ink);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.snapshot__meta {
  font-size: 11px;
  color: var(--ink-muted);
  font-variant-numeric: tabular-nums;
}

.snapshot__del {
  flex: none;
  padding: 5px 9px;
  border: 1px solid var(--line-strong);
  border-radius: 5px;
}

.snapshot__del-text {
  font-size: 11px;
  color: var(--ink-muted);
}

/* 触屏上把可点区域放大，避免误触到「删除」 */
@media (hover: none) {
  .snapshot {
    padding: 12px;
  }

  .snapshot__del {
    padding: 9px 12px;
  }
}
</style>
