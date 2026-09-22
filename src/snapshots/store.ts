/**
 * 本地快照（历史记录）。
 *
 * **全部存在访问者本地**，没有任何网络请求、没有后端：
 * H5 底层是 `localStorage`，小程序是它自己的存储，都由 `uni.getStorageSync` /
 * `uni.setStorageSync` 统一封装。
 *
 * ## 为什么只存「种子 + 选项」而不存完整结果
 *
 * 随机引擎是**确定性的**：同一 seed + 同一份输入 + 同一份数据快照 ⇒ 逐字节相同的结果
 * （见 AGENTS.md §4.2，有回归用例守着）。所以一条快照只需要：
 *
 * ```
 * { seed, input, patch }   ← 几百字节
 * ```
 *
 * 点击时用同样的 seed 重放即可，比存几十 KB 的结果 JSON 省得多，也不会因为
 * 序列化/反序列化把展示层的数据结构绑死。
 *
 * **代价**：跨补丁重放时结果可能不同（数据快照变了）。所以 `patch` 必须一起存，
 * 重放时若与当前补丁不一致要明确提示用户，而不是假装还原成功。
 */

import type { GenerateInput } from '../core/types'

/** 快照列表最多保留多少条。太多会把本地存储撑满。 */
export const MAX_SNAPSHOTS = 30

const STORAGE_KEY = 'rift-gacha:snapshots:v1'

export interface Snapshot {
  /** 本地唯一 id，用于删除与选中。 */
  id: string
  /** 生成时间（毫秒时间戳）。 */
  createdAt: number
  seed: number
  /** 生成这条快照时的数据补丁，用于跨版本重放提示。 */
  patch: string
  input: GenerateInput
  /** 列表里显示的摘要，例如「5 人 · 安妮、盖伦…」。 */
  label: string
  /** 队伍模式，用于列表上打标。 */
  teamMode: boolean
}

/** 存储适配器：抽出来是为了能在测试里注入假实现，不必依赖浏览器环境。 */
export interface KeyValueStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

/** 默认实现：uni-app 的同步本地存储，两端通用。 */
export const uniStore: KeyValueStore = {
  get(key) {
    try {
      return uni.getStorageSync(key)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      uni.setStorageSync(key, value)
    } catch {
      // 配额满或被禁用时静默失败：快照是附加功能，不该影响主流程
    }
  },
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Snapshot>
  return (
    typeof item.id === 'string' &&
    typeof item.seed === 'number' &&
    typeof item.createdAt === 'number' &&
    typeof item.patch === 'string' &&
    typeof item.label === 'string' &&
    !!item.input &&
    Array.isArray((item.input as GenerateInput).players)
  )
}

export interface SnapshotStore {
  list(): Snapshot[]
  /** 新增一条，返回新列表（最新的在前）。同 seed + 同输入视为同一条，不重复添加。 */
  add(snapshot: Snapshot): Snapshot[]
  remove(id: string): Snapshot[]
  clear(): Snapshot[]
}

/** 两条快照是否等价：同 seed 且输入完全一致。 */
function sameRun(a: Snapshot, b: Snapshot): boolean {
  return a.seed === b.seed && JSON.stringify(a.input) === JSON.stringify(b.input)
}

export function createSnapshotStore(store: KeyValueStore = uniStore): SnapshotStore {
  function read(): Snapshot[] {
    const raw = store.get(STORAGE_KEY)
    if (!Array.isArray(raw)) return []
    // 存储里的东西可能被手改或被旧版本写入，逐条校验后再用
    return raw.filter(isSnapshot)
  }

  function write(list: Snapshot[]): Snapshot[] {
    const trimmed = list.slice(0, MAX_SNAPSHOTS)
    store.set(STORAGE_KEY, trimmed)
    return trimmed
  }

  return {
    list: read,
    add(snapshot) {
      const current = read()
      // 同一次随机重复点「开始随机」不该塞两条
      const deduped = current.filter((item) => !sameRun(item, snapshot))
      return write([snapshot, ...deduped])
    },
    remove(id) {
      return write(read().filter((item) => item.id !== id))
    },
    clear() {
      return write([])
    },
  }
}

/** 生成一个本地唯一 id。不用 crypto.randomUUID 是因为小程序端不一定有。 */
export function createSnapshotId(now: number): string {
  return `${now}-${Math.floor(Math.random() * 0xffffff).toString(36)}`
}

/** 把一次随机的输入与结果压成列表里显示的一行摘要。 */
export function describeSnapshot(names: readonly string[], teamMode: boolean): string {
  const head = names.slice(0, 3).join('、')
  const rest = names.length > 3 ? ` 等 ${names.length} 人` : ''
  return `${teamMode ? '双队' : '单队'} · ${head}${rest}`
}
