import { describe, expect, it } from 'vitest'

import { renderBuffDescription } from './BuffDescription'

/**
 * 把渲染结果摊平成 [文本, 类名] 序列，便于断言着色归属。
 * 类名为 undefined 表示裸文本（不着色）。
 */
function flatten(nodes: unknown[], className?: string): [string, string | undefined][] {
  const out: [string, string | undefined][] = []
  for (const node of nodes) {
    if (typeof node === 'string') {
      out.push([node, className])
      continue
    }
    const element = node as { props?: { className?: string; children?: unknown } }
    const children = element.props?.children
    out.push(...flatten(Array.isArray(children) ? children : [children], element.props?.className ?? className))
  }
  return out
}

const parse = (text: string) => flatten(renderBuffDescription(text))

describe('renderBuffDescription', () => {
  it('着色标签只包住数值，正文保持裸文本', () => {
    // 图示样例（空·偶像）
    expect(parse('进驻宿舍时，心情每小时恢复<@cc.vup>+0.15</>（同种效果取最高）')).toEqual([
      ['进驻宿舍时，心情每小时恢复', undefined],
      ['+0.15', 'buff-vup'],
      ['（同种效果取最高）', undefined]
    ])
  })

  it('四类着色标签各自映射到类名', () => {
    expect(parse('<@cc.vup>a</><@cc.vdown>b</><@cc.kw>c</><@cc.rem>d</>')).toEqual([
      ['a', 'buff-vup'],
      ['b', 'buff-vdown'],
      ['c', 'buff-kw'],
      ['d', 'buff-rem']
    ])
  })

  it('$ 术语标签透传不着色，内层着色生效（嵌套）', () => {
    // 真实样例：<$cc.bd_mujica><@cc.rem>热情值</></>
    expect(parse('<$cc.bd_mujica><@cc.rem>热情值</></><@cc.vup>+10</>')).toEqual([
      ['热情值', 'buff-rem'],
      ['+10', 'buff-vup']
    ])
  })

  it('未知 @ 标签按无色渲染（上游新增标签不致整条描述丢失）', () => {
    expect(parse('效果<@cc.newtag>x</>后缀')).toEqual([
      ['效果', undefined],
      ['x', undefined],
      ['后缀', undefined]
    ])
  })

  it('容错：多余的 </> 忽略、未闭合标签自动收尾，内容都不丢', () => {
    expect(parse('a</>b')).toEqual([
      ['a', undefined],
      ['b', undefined]
    ])
    expect(parse('前<@cc.vup>未闭合')).toEqual([
      ['前', undefined],
      ['未闭合', 'buff-vup']
    ])
    // 上游实际存在的畸形标签 `<<$cc.bd_b1>`（多一个左尖括号）
    expect(parse('x<<$cc.bd_b1>y</>').map(([text]) => text).join('')).toContain('y')
  })

  it('无标签文本原样返回', () => {
    expect(parse('进驻发电站时')).toEqual([['进驻发电站时', undefined]])
  })
})
