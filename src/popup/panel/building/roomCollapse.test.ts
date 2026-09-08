import { describe, expect, it } from 'vitest'

import { loadCollapsedKeys, persistKeys, ROOM_COLLAPSE_STORAGE_KEY } from './roomCollapse'
import type { RoomCollapseStorage } from './roomCollapse'

/** 内存版存储，模拟 localStorage 行为 */
function memoryStorage(initial: Record<string, string> = {}): RoomCollapseStorage & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value
    }
  }
}

describe('loadCollapsedKeys', () => {
  it('无存储记录时返回空集（默认全部展开）', () => {
    expect(loadCollapsedKeys(memoryStorage())).toEqual(new Set())
  })

  it('读已折叠的房间 key', () => {
    const storage = memoryStorage({ [ROOM_COLLAPSE_STORAGE_KEY]: JSON.stringify(['manufacture:slot_25', 'power:slot_26']) })
    expect(loadCollapsedKeys(storage)).toEqual(new Set(['manufacture:slot_25', 'power:slot_26']))
  })

  it('数据损坏/非数组时退回空集，不抛错', () => {
    expect(loadCollapsedKeys(memoryStorage({ [ROOM_COLLAPSE_STORAGE_KEY]: '{bad json' }))).toEqual(new Set())
    expect(loadCollapsedKeys(memoryStorage({ [ROOM_COLLAPSE_STORAGE_KEY]: '"a字符串"' }))).toEqual(new Set())
    expect(loadCollapsedKeys(memoryStorage({ [ROOM_COLLAPSE_STORAGE_KEY]: JSON.stringify([1, 'x', null]) }))).toEqual(
      new Set(['x'])
    )
  })

  it('存储不可用（null）时返回空集', () => {
    expect(loadCollapsedKeys(null)).toEqual(new Set())
    expect(loadCollapsedKeys(undefined)).toEqual(new Set())
  })

  it('存储 getItem 抛错时返回空集', () => {
    const broken: RoomCollapseStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {}
    }
    expect(loadCollapsedKeys(broken)).toEqual(new Set())
  })
})

describe('persistKeys', () => {
  it('写入 JSON 数组，round-trip 一致', () => {
    const storage = memoryStorage()
    persistKeys(storage, new Set(['control', 'training:training']))
    expect(storage.data[ROOM_COLLAPSE_STORAGE_KEY]).toBe(JSON.stringify(['control', 'training:training']))
    expect(loadCollapsedKeys(storage)).toEqual(new Set(['control', 'training:training']))
  })

  it('存储 setItem 抛错时不外泄（静默）', () => {
    const broken: RoomCollapseStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      }
    }
    expect(() => persistKeys(broken, new Set(['a']))).not.toThrow()
  })
})
