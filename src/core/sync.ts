import { exchangeHgToken } from './hgAuth'
import { fetchCultivateData, isSklandCredentialExpired, type FetchLike } from './skland'
import { buildUploadPayload } from './format'
import { fetchOperatorInfo, uploadOperatorData } from './yituliuApi'
import type { GameAccount, LastSync, YituliuTokens } from './types'

/**
 * 单账号同步编排：森空岛拉数据 → 格式化 → 上传一图流 →（可选）读 token 校验。
 *
 * 一图流读写 token 存于全局设置（一个一图流账号一对，所有游戏账号共用），由调用方传入。
 * 森空岛凭证失效时，若账号存有官网 HG token 则自动换取新凭证并重试一次；
 * 否则向上抛错，由界面提示重新扫码/粘贴凭证。
 */

export interface SyncDeps {
  fetchFn?: FetchLike
  /** 跳过读 token 校验（默认按配置执行） */
  skipVerify?: boolean
}

export interface SyncOutcome {
  account: GameAccount
  operatorCount: number
  verifyNote?: string
}

async function fetchCultivateWithCredential(
  account: GameAccount,
  backendBaseUrl: string,
  fetchFn: FetchLike
): Promise<{ cultivate: Awaited<ReturnType<typeof fetchCultivateData>>; refreshed: GameAccount['skland'] | null }> {
  try {
    const cultivate = await fetchCultivateData(account.uid, account.skland.cred, account.skland.token, fetchFn)
    return { cultivate, refreshed: null }
  } catch (error) {
    const credentialExpired = isSklandCredentialExpired(error)
    if (!credentialExpired || !account.hgToken) {
      throw error
    }
    const refreshed = await exchangeHgToken(account.hgToken, backendBaseUrl, fetchFn)
    const cultivate = await fetchCultivateData(account.uid, refreshed.cred, refreshed.token, fetchFn)
    return { cultivate, refreshed }
  }
}

export async function syncAccount(
  account: GameAccount,
  yituliuTokens: YituliuTokens,
  backendBaseUrl: string,
  deps: SyncDeps = {}
): Promise<SyncOutcome> {
  const fetchFn = deps.fetchFn ?? globalThis.fetch

  if (!yituliuTokens.writeToken) {
    throw new Error('尚未配置一图流写 token：请到插件「设置」中自动获取或手动填写')
  }
  const writeToken = yituliuTokens.writeToken

  const { cultivate, refreshed } = await fetchCultivateWithCredential(account, backendBaseUrl, fetchFn)

  const effectiveAccount: GameAccount = refreshed
    ? { ...account, skland: refreshed }
    : account

  const payload = buildUploadPayload(effectiveAccount, cultivate)
  if (payload.operatorDataList.length === 0) {
    throw new Error('森空岛未返回任何干员数据（UID 可能未绑定该账号），已取消上传')
  }

  const uploadResult = await uploadOperatorData(payload, writeToken, backendBaseUrl, fetchFn)

  // 读 token 校验是软性检查：失败只提示，不影响同步结果
  let verifyNote: string | undefined
  if (!deps.skipVerify && yituliuTokens.readToken) {
    try {
      const remote = await fetchOperatorInfo(yituliuTokens.readToken, backendBaseUrl, fetchFn)
      verifyNote = remote.length === payload.operatorDataList.length
        ? `远端已保存 ${remote.length} 名干员，与本次上传一致`
        : `注意：远端保存 ${remote.length} 名干员，本次上传 ${payload.operatorDataList.length} 名（可能为统计口径差异）`
    } catch (error) {
      verifyNote = `读 token 校验未通过：${error instanceof Error ? error.message : String(error)}`
    }
  }

  const lastSync: LastSync = {
    time: Date.now(),
    status: 'success',
    operatorCount: payload.operatorDataList.length,
    message: refreshed
      ? `已更新 ${uploadResult.affectedRows} 条记录（森空岛凭证已自动刷新）`
      : `已更新 ${uploadResult.affectedRows} 条记录`
  }

  return {
    account: { ...effectiveAccount, lastSync },
    operatorCount: payload.operatorDataList.length,
    verifyNote
  }
}
