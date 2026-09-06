/** 森空岛接口业务错误（code !== 0，或 HTTP 层失败；凭证失效时通常为 HTTP 401 + code 10002） */
export class SklandError extends Error {
  readonly sklandCode: number
  /** HTTP 状态码；body 为 JSON 业务错误时也会带上，便于区分传输层与业务层失败 */
  readonly httpStatus: number | undefined

  constructor(message: string, sklandCode = -1, httpStatus?: number) {
    super(message)
    this.name = 'SklandError'
    this.sklandCode = sklandCode
    this.httpStatus = httpStatus
  }
}

/** 一图流后端业务错误（code !== 200） */
export class YituliuError extends Error {
  readonly code: number

  constructor(message: string, code: number) {
    super(message)
    this.name = 'YituliuError'
    this.code = code
  }
}

/** 鹰角官网 / 森空岛登录链路的错误 */
export class AuthFlowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthFlowError'
  }
}

/** 登录链路的网络层错误（无法连通或响应不可解析），可尝试改走一图流后端 */
export class NetworkFlowError extends AuthFlowError {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkFlowError'
  }
}

/** 主密码设置、校验或加解密失败 */
export class SecurityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecurityError'
  }
}

/** 插件处于锁定状态（未解锁就尝试读凭据或写存储） */
export class PluginLockedError extends Error {
  constructor(message = '插件已锁定：请先输入主密码解锁后再操作') {
    super(message)
    this.name = 'PluginLockedError'
  }
}

/** 一图流错误码到用户可读提示的映射（后端 ResultCode） */
export function describeYituliuError(code: number, msg: string): string {
  switch (code) {
    case 20001:
      return '一图流账号未登录或登录已过期：请在浏览器中打开一图流官网重新登录后再试，或手动生成 token'
    case 20027:
      return '一图流 token 无效或已过期，请在官网重新生成'
    case 20010:
      return 'token 权限不足：该操作需要对应权限的一图流 token'
    case 39007:
      return '上传过于频繁（同一账号 5 秒内只能上传一次），请稍候重试'
    case 10016:
      return '森空岛凭证错误或已失效，请重新扫码或粘贴凭证'
    default:
      return `一图流接口错误（${code}）${msg ? `：${msg}` : ''}`
  }
}
