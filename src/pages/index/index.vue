<template>
  <view class="smoke">
    <text class="smoke__title">峡谷全随机构筑器</text>
    <text class="smoke__hint">骨架就绪（P0）；数据与随机引擎见 todo.md 的 P1 / P2。</text>
  </view>
</template>

<script setup lang="ts"></script>

<style scoped>
.smoke {
  padding: 48px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.smoke__title {
  font-size: 24px;
  font-weight: 600;
  color: #e6e8ee;
}

.smoke__hint {
  font-size: 14px;
  color: #9aa3b2;
}
</style>
