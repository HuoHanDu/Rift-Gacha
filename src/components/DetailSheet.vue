<template>
  <!--
    全局唯一的详情弹层。
    窄屏是底部弹层（bottom sheet），宽屏是居中卡片——两种形态只靠 CSS 切换，
    模板与逻辑完全共用。点遮罩或右上角都能关闭。
  -->
  <view v-if="detailState.open && detailState.payload" class="sheet">
    <view class="sheet__backdrop" @click="closeDetail" />
    <view class="sheet__panel">
      <view class="sheet__head">
        <image
          class="sheet__icon"
          :class="{ 'sheet__icon--accent': detailState.payload.accent, 'sheet__icon--round': detailState.payload.round }"
          :src="detailState.payload.icon"
          mode="aspectFill"
        />
        <view class="sheet__titles">
          <text class="sheet__name">{{ detailState.payload.name }}</text>
          <text v-if="detailState.payload.meta" class="sheet__meta">{{ detailState.payload.meta }}</text>
        </view>
        <view class="sheet__close" @click="closeDetail">
          <text class="sheet__close-text">关闭</text>
        </view>
      </view>

      <scroll-view class="sheet__body" scroll-y>
        <text class="sheet__desc">{{ detailState.payload.detail || '暂无说明' }}</text>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { closeDetail, detailState } from './detailSheet'
</script>

<style scoped>
.sheet {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet__backdrop {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.55);
}

/* 窄屏：贴底的弹层，圆角只在上面两个角 */
.sheet__panel {
  position: relative;
  width: 100%;
  max-height: 62vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 12px 12px 0 0;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
  box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.5);
}

/* 宽屏：居中卡片，不再贴底 */
@media (min-width: 720px) {
  .sheet {
    align-items: center;
  }

  .sheet__panel {
    width: 420px;
    max-width: calc(100vw - 48px);
    max-height: 70vh;
    border-radius: 12px;
  }
}

.sheet__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.sheet__icon {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: #0b0d12;
}

.sheet__icon--accent {
  border-color: var(--brass);
}

.sheet__icon--round {
  border-radius: 50%;
}

.sheet__titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sheet__name {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.3;
}

.sheet__meta {
  font-size: 12px;
  color: var(--brass);
  line-height: 1.3;
}

.sheet__close {
  flex: none;
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
}

.sheet__close-text {
  font-size: 13px;
  color: var(--ink-muted);
}

.sheet__body {
  padding-top: 12px;
  /* scroll-view 需要一个可计算的高度，这里给个上限 */
  max-height: 40vh;
}

.sheet__desc {
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink-muted);
}
</style>
