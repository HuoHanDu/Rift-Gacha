import { describe, expect, it } from 'vitest'
import {
  createRandomSeed,
  createRng,
  defaultRng,
  pick,
  pickFromGroups,
  pickMany,
  randInt,
  shuffle,
} from '../src/core/random'

describe('createRng', () => {
  it('同一种子产生完全相同的序列', () => {
    const a = createRng(20260921)
    const b = createRng(20260921)
    const seqA = Array.from({ length: 32 }, () => a())
    const seqB = Array.from({ length: 32 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('不同种子产生不同的序列', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  it('输出恒在 [0, 1) 区间内', () => {
    const rng = createRng(0)
    for (let i = 0; i < 20000; i++) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('createRandomSeed', () => {
  it('返回 32 位无符号整数', () => {
    for (let i = 0; i < 50; i++) {
      const seed = createRandomSeed()
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(0xffffffff)
    }
  })
})

describe('randInt', () => {
  it('覆盖 [0, maxExclusive) 的全部取值且不越界', () => {
    const rng = createRng(42)
    const seen = new Set<number>()
    for (let i = 0; i < 5000; i++) {
      const value = randInt(7, rng)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(7)
      seen.add(value)
    }
    expect(seen.size).toBe(7)
  })

  it('maxExclusive 非正整数时抛错', () => {
    const rng = createRng(1)
    expect(() => randInt(0, rng)).toThrow()
    expect(() => randInt(-1, rng)).toThrow()
    expect(() => randInt(1.5, rng)).toThrow()
  })
})

describe('pick', () => {
  it('返回值来自候选集合', () => {
    const rng = createRng(7)
    const pool = ['a', 'b', 'c', 'd']
    for (let i = 0; i < 200; i++) {
      expect(pool).toContain(pick(pool, rng))
    }
  })

  it('足够多次抽取后覆盖到全部候选', () => {
    const rng = createRng(99)
    const pool = ['a', 'b', 'c', 'd', 'e']
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) seen.add(pick(pool, rng))
    expect(seen.size).toBe(pool.length)
  })

  it('空集合抛错', () => {
    expect(() => pick([], createRng(1))).toThrow()
  })
})

describe('shuffle', () => {
  it('结果是原集合的排列', () => {
    const rng = createRng(2024)
    const source = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    for (let i = 0; i < 200; i++) {
      const result = shuffle(source, rng)
      expect(result).toHaveLength(source.length)
      expect([...result].sort((x, y) => x - y)).toEqual(source)
    }
  })

  it('不修改入参', () => {
    const rng = createRng(5)
    const source = [1, 2, 3, 4, 5]
    shuffle(source, rng)
    expect(source).toEqual([1, 2, 3, 4, 5])
  })

  it('确实打乱了顺序（固定种子下不是恒等排列）', () => {
    const source = Array.from({ length: 50 }, (_, i) => i)
    const rng = createRng(123)
    expect(shuffle(source, rng)).not.toEqual(source)
  })
})

describe('pickMany', () => {
  it('无放回：结果互不重复且长度为 n', () => {
    const rng = createRng(11)
    const pool = Array.from({ length: 30 }, (_, i) => i)
    for (let i = 0; i < 200; i++) {
      const result = pickMany(pool, 6, rng)
      expect(result).toHaveLength(6)
      expect(new Set(result).size).toBe(6)
      for (const value of result) expect(pool).toContain(value)
    }
  })

  it('n = 0 返回空数组，n = 池大小返回全排列', () => {
    const rng = createRng(3)
    const pool = [1, 2, 3]
    expect(pickMany(pool, 0, rng)).toEqual([])
    expect([...pickMany(pool, 3, rng)].sort()).toEqual([1, 2, 3])
  })

  it('n 越界时抛错', () => {
    const rng = createRng(1)
    expect(() => pickMany([1, 2], 3, rng)).toThrow()
    expect(() => pickMany([1, 2], -1, rng)).toThrow()
    expect(() => pickMany([1, 2], 1.5, rng)).toThrow()
  })
})

describe('pickFromGroups', () => {
  it('跳过空集合，只从非空集合里取', () => {
    const rng = createRng(8)
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const value = pickFromGroups<string>([[], ['a', 'b'], []], rng)
      expect(['a', 'b']).toContain(value)
      seen.add(value)
    }
    expect(seen.size).toBe(2)
  })

  it('全部为空时抛错', () => {
    expect(() => pickFromGroups<string>([[], []], createRng(1))).toThrow()
  })
})

describe('defaultRng', () => {
  it('输出在 [0, 1) 区间内', () => {
    for (let i = 0; i < 1000; i++) {
      const value = defaultRng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
