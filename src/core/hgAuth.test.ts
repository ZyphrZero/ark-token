import { describe, expect, it } from 'vitest'

import { parseHgTokenInput, parseSklandCredentialInput } from './hgAuth'

describe('parseHgTokenInput 官网 token 输入解析', () => {
  it('从完整 JSON 中提取 data.content', () => {
    const json = JSON.stringify({ status: 0, data: { content: 'hg-token-abc' } })
    expect(parseHgTokenInput(json)).toBe('hg-token-abc')
  })

  it('兼容纯 token 字符串（自动去空白）', () => {
    expect(parseHgTokenInput('  hg-token-abc \n')).toBe('hg-token-abc')
  })

  it('JSON 缺少 content 时报错', () => {
    expect(() => parseHgTokenInput(JSON.stringify({ status: 0 }))).toThrow(/data\.content/)
  })

  it('非法 JSON 报错且不抛出解析异常', () => {
    expect(() => parseHgTokenInput('{broken')).toThrow(/JSON/)
  })

  it('空输入报错', () => {
    expect(() => parseHgTokenInput('   ')).toThrow(/请先粘贴/)
  })
})

describe('parseSklandCredentialInput 森空岛凭证解析', () => {
  it('解析 cred,token 逗号串（去空白与引号）', () => {
    expect(parseSklandCredentialInput('"cred-abc", token-xyz ')).toEqual({
      cred: 'cred-abc',
      token: 'token-xyz'
    })
  })

  it('缺少逗号时报错', () => {
    expect(() => parseSklandCredentialInput('onlyonepart')).toThrow(/逗号/)
  })

  it('逗号两侧缺失时报错', () => {
    expect(() => parseSklandCredentialInput('abc,')).toThrow(/有效凭证/)
  })

  it('内容为 null,null（未登录森空岛时复制的典型结果）报错并提示改用扫码', () => {
    expect(() => parseSklandCredentialInput('null,null')).toThrow(/扫码登录/)
    expect(() => parseSklandCredentialInput('null,undefined')).toThrow(/扫码登录/)
    expect(() => parseSklandCredentialInput('undefined,undefined')).toThrow(/扫码登录/)
  })
})
