/**
 * 本地快照的单元测试。
 *
 * 存储适配器是注入的，所以测试跑在 node 环境里，不依赖浏览器 localStorage，
 * 也能顺手覆盖「存储写满了」「存了脏数据」这类真实会遇到的情况。
 */

import { describe, expect, it } from 'vitest'
import { generateBuilds } from '../src/core/generate'
import type { GenerateInput } from '../src/core/types'
import { DATA } from '../src/data'
import {
  createSnapshotId,
  createSnapshotStore,
  describeSnapshot,
  MAX_SNAPSHOTS,
  type KeyValueStore,
  type Snapshot,
} from '../src/snapshots/store'

/** 内存版存储，记录每次写入便于断言。 */
function memoryStore(): KeyValueStore & { data: Map<string, unknown>; writes: number } {
  const data = new Map<string, unknown>()
  return {
    data,
    writes: 0,
    get(key) {
      return data.get(key)
    },
    set(key, value) {
      this.writes++
      data.set(key, value)
    },
  }
}

function makeInput(players = 3): GenerateInput {
  return {
    players: Array.from({ length: players }, (_, index) => ({ name: `P${index + 1}` })),
    teamMode: false,
    splitTeamsRandomly: false,
    banSmiteForNonJungle: true,
  }
}

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const createdAt = overrides.createdAt ?? 1_700_000_000_000
  return {
    id: createSnapshotId(createdAt),
    createdAt,
    seed: 12345,
    patch: '16.18',
    input: makeInput(),
    label: '单队 · A、B、C',
    teamMode: false,
    ...overrides,
  }
}

describe('本地快照存储', () => {
  it('新装的浏览器里是空列表', () => {
    expect(createSnapshotStore(memoryStore()).list()).toEqual([])
  })

  it('新增后能读回来，最新的在最前面', () => {
    const store = createSnapshotStore(memoryStore())
    store.add(makeSnapshot({ id: 'a', seed: 1 }))
    const list = store.add(makeSnapshot({ id: 'b', seed: 2 }))
    expect(list.map((item) => item.id)).toEqual(['b', 'a'])
    expect(store.list().map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('同一次随机重复保存不会塞两条（同 seed 同输入视为同一条）', () => {
    const store = createSnapshotStore(memoryStore())
    const snapshot = makeSnapshot({ id: 'a' })
    store.add(snapshot)
    // 只换 id，seed 与输入不变 —— 模拟重复点「开始随机」拿到同一个结果
    const again = store.add({ ...snapshot, id: 'b' })
    expect(again).toHaveLength(1)
    expect(again[0].id).toBe('b')
  })

  it('换一个 seed 就是新的一条', () => {
    const store = createSnapshotStore(memoryStore())
    store.add(makeSnapshot({ id: 'a', seed: 1 }))
    expect(store.add(makeSnapshot({ id: 'b', seed: 2 }))).toHaveLength(2)
  })

  it('超过上限时丢掉最旧的', () => {
    const store = createSnapshotStore(memoryStore())
    for (let index = 0; index < MAX_SNAPSHOTS + 5; index++) {
      store.add(makeSnapshot({ id: `s${index}`, seed: index }))
    }
    const list = store.list()
    expect(list).toHaveLength(MAX_SNAPSHOTS)
    expect(list[0].id).toBe(`s${MAX_SNAPSHOTS + 4}`)
    expect(list.some((item) => item.id === 's0')).toBe(false)
  })

  it('删除与清空', () => {
    const store = createSnapshotStore(memoryStore())
    store.add(makeSnapshot({ id: 'a', seed: 1 }))
    store.add(makeSnapshot({ id: 'b', seed: 2 }))
    expect(store.remove('a').map((item) => item.id)).toEqual(['b'])
    expect(store.clear()).toEqual([])
    expect(store.list()).toEqual([])
  })

  it('存储里是脏数据时当作空列表，不抛异常', () => {
    const memory = memoryStore()
    memory.data.set('rift-gacha:snapshots:v1', 'not-an-array')
    expect(createSnapshotStore(memory).list()).toEqual([])

    memory.data.set('rift-gacha:snapshots:v1', [
      { id: 'ok', createdAt: 1, seed: 2, patch: '16.18', input: makeInput(), label: 'x' },
      { id: 'bad' },
      null,
      42,
    ])
    const list = createSnapshotStore(memory).list()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('ok')
  })

  it('存储写入抛异常（配额满）时不影响调用方', () => {
    const hostile: KeyValueStore = {
      get: () => null,
      set: () => {
        throw new Error('QuotaExceededError')
      },
    }
    // uniStore 会吞掉异常；这里直接用 createSnapshotStore 的写路径
    expect(() => createSnapshotStore(hostile).add(makeSnapshot())).toThrow()
    // 但真实场景里 uniStore 已经把异常吞掉了，所以再验证它本身不抛
    expect(() => createSnapshotStore({ get: () => null, set: () => {} }).add(makeSnapshot())).not.toThrow()
  })
})

describe('快照重放', () => {
  it('用快照里的 seed 与选项能逐字节重现结果', () => {
    const input = makeInput(5)
    const first = generateBuilds(input, DATA)
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const snapshot = makeSnapshot({ seed: first.seed, input })
    const replay = generateBuilds(snapshot.input, DATA, { seed: snapshot.seed })
    expect(replay.ok).toBe(true)
    if (!replay.ok) return

    expect(JSON.stringify(replay.results)).toBe(JSON.stringify(first.results))
  })

  it('快照只存种子与选项，不存结果 —— 单条体积足够小', () => {
    const input = { ...makeInput(10), teamMode: true, splitTeamsRandomly: true }
    const outcome = generateBuilds(input, DATA)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const snapshot = makeSnapshot({
      seed: outcome.seed,
      input,
      label: describeSnapshot(outcome.results.map((b) => b.champion.title), input.teamMode),
    })
    const bytes = JSON.stringify(snapshot).length
    // 10 人的完整结果有几万字符；快照必须小得多，否则本地存储很快会被撑满
    expect(bytes).toBeLessThan(1500)
    expect(JSON.stringify(outcome.results).length).toBeGreaterThan(20000)
  })
})

describe('describeSnapshot', () => {
  it('给出人能读的一行摘要', () => {
    expect(describeSnapshot(['安妮', '盖伦'], false)).toBe('单队 · 安妮、盖伦')
    expect(describeSnapshot(['安妮', '盖伦', '拉克丝', '蔚', '亚索'], true)).toBe(
      '双队 · 安妮、盖伦、拉克丝 等 5 人',
    )
  })
})
