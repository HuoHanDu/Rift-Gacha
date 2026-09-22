/**
 * 详情弹层的共享状态。
 *
 * 为什么不把弹层塞在 `IconChip` 里各自管理：
 * - 每张卡片上有几十个图标，各开各的会有几十份状态，而且同时只能开一个；
 * - 点第二个图标时前一个要自动关闭，用组件内状态做不到（父级不知道）。
 *
 * 所以做成「模块级单例状态」：`IconChip` 只负责写入，页面里渲染**唯一一个**
 * `DetailSheet` 负责展示。这样零 props 传递，也天然保证同时只有一个弹层。
 */

import { reactive, readonly } from 'vue'

export interface DetailPayload {
  icon: string
  name: string
  /** 第二行：价格、冷却、符文系之类的元信息。 */
  meta?: string
  /** 正文：优先长文本，回退短文本。 */
  detail?: string
  /** 铜色描边标记（基石 / 主系这类重点）。 */
  accent?: boolean
  /** 圆形图标（英雄头像）。 */
  round?: boolean
}

interface DetailState {
  open: boolean
  payload: DetailPayload | null
}

const state = reactive<DetailState>({
  open: false,
  payload: null,
})

export const detailState = readonly(state) as Readonly<DetailState>

export function openDetail(payload: DetailPayload): void {
  state.payload = payload
  state.open = true
}

export function closeDetail(): void {
  state.open = false
  // 关掉时保留 payload，让收起动画期间内容不闪烁
}
