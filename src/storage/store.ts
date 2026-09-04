import { SecurityError, PluginLockedError } from '../core/errors'
import {
  DEFAULT_PBKDF2_ITERATIONS,
  decryptJson,
  deriveAesGcmKey,
  encryptJson,
  fromBase64,
  isEncryptedEnvelope,
  newSalt,
  toBase64
} from '../core/crypto'
import type {
  EncryptedEnvelope,
  ExtensionSettings,
  GameAccount,
  PluginState,
  SecurityConfig,
  SklandCredential,
  YituliuTokens
} from '../core/types'
import {
  clearSessionKey,
  defaultSessionArea,
  hasSessionKey,
  loadSessionKey,
  cacheSessionKey,
  type SessionArea
} from './sessionKey'

/**
 * chrome.storage.local 存取封装。
 * 所有数据只保存在浏览器本地；token 属敏感凭据，不写入日志、不上报。
 *
 * 一图流读写 token 存放在设置层（settings.yituliuTokens，全局共享，一个一图流账号一对）；
 * 历史版本曾挂在每个账号上，读取时自动迁移合并。
 *
 * 设置主密码后，账号的 skland / hgToken 字段与 settings.yituliuTokens 以 AES-GCM 信封落盘，
 * 其余字段（uid、昵称、区服、同步状态、其他设置）保持明文，便于锁定时展示账号列表。
 * 解锁密钥只存 chrome.storage.session（内存），锁定期间禁止写存储，防止脱敏数据覆盖密文。
 *
 * StorageArea / SessionArea 接口与 chrome.storage 结构兼容，测试中可注入内存实现。
 */

export interface StorageArea {
  get(callback: (items: Record<string, unknown>) => void): void
  set(items: Record<string, unknown>, callback?: () => void): void
}

export const STORAGE_KEY = 'yituliu-plugin-state'

export const DEFAULT_BACKEND_BASE_URL = 'https://backend.yituliu.cn'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  backendBaseUrl: DEFAULT_BACKEND_BASE_URL,
  autoSyncEnabled: false,
  autoSyncIntervalHours: 24,
  yituliuTokens: {},
  infoRefreshEnabled: true,
  infoRefreshIntervalMinutes: 30,
  refreshAllAccounts: false,
  recruitNotifyEnabled: true,
  sanityNotifyEnabled: false
}

export function defaultStorageArea(): StorageArea {
  return globalThis.chrome?.storage?.local as unknown as StorageArea
}

/** 用于校验主密码的固定明文：能解出它即口令正确，无需解密全部账号数据 */
const VERIFIER_PLAINTEXT = 'ark-token-verifier-v1'

/** PBKDF2 只能提高爆破成本，足够长的主密码才是根本 */
const MIN_PASSPHRASE_LENGTH = 8

/** 磁盘上的设置形态：开启加密后 yituliuTokens 为加密信封 */
type PersistedSettings = Omit<ExtensionSettings, 'yituliuTokens'> & { yituliuTokens?: unknown }

/** 磁盘上的账号形态：开启加密后 skland / hgToken 为加密信封；yituliu 为旧版遗留（读取时迁移） */
interface PersistedAccount {
  id: string
  uid: string
  nickName: string
  channelMasterId: number
  channelName: string
  skland: unknown
  hgToken?: unknown
  yituliu?: unknown
  lastSync?: GameAccount['lastSync']
}

interface PersistedState {
  accounts: PersistedAccount[]
  activeAccountId: string | null
  settings: PersistedSettings
  security?: SecurityConfig
}

function normalizePersisted(raw: unknown): PersistedState {
  if (!raw || typeof raw !== 'object') {
    // 不能直接展开默认 state：accounts 数组会被共享引用，随后被 push 污染
    return { accounts: [], activeAccountId: null, settings: { ...DEFAULT_SETTINGS } }
  }
  const partial = raw as Partial<PersistedState>
  const settings: PersistedSettings = { ...DEFAULT_SETTINGS, ...(partial.settings ?? {}) }
  const accounts = Array.isArray(partial.accounts) ? [...partial.accounts] : []
  const activeAccountId =
    partial.activeAccountId && accounts.some(account => account.id === partial.activeAccountId)
      ? partial.activeAccountId
      : (accounts[0]?.id ?? null)
  const result: PersistedState = { accounts, activeAccountId, settings }
  if (partial.security && typeof partial.security === 'object') {
    result.security = partial.security as SecurityConfig
  }
  return result
}

function readRawState(area: StorageArea): Promise<unknown> {
  return new Promise(resolve => {
    area.get(items => resolve(items[STORAGE_KEY]))
  })
}

function writeRawState(persisted: PersistedState, area: StorageArea): Promise<void> {
  return new Promise(resolve => {
    area.set({ [STORAGE_KEY]: persisted }, () => resolve())
  })
}

/** 加密账号敏感字段；旧版挂在账号上的 yituliu token 不再落盘（读取时已迁移到设置层） */
async function encodeAccount(account: PersistedAccount, key: CryptoKey): Promise<PersistedAccount> {
  const { yituliu: _legacyYituliu, ...rest } = account
  const encoded = rest as PersistedAccount
  if (!isEncryptedEnvelope(encoded.skland)) {
    encoded.skland = await encryptJson(key, encoded.skland)
  }
  if (encoded.hgToken !== undefined && !isEncryptedEnvelope(encoded.hgToken)) {
    encoded.hgToken = await encryptJson(key, encoded.hgToken)
  }
  return encoded
}

/** 解出的内存账号与旧版遗留在账号上的 token（供迁移合并） */
interface DecodedAccount {
  account: GameAccount
  legacyTokens?: YituliuTokens
}

function extractLegacyTokens(yituliu: unknown): YituliuTokens | undefined {
  if (!yituliu || typeof yituliu !== 'object') {
    return undefined
  }
  const tokens = yituliu as Partial<YituliuTokens>
  if (!tokens.readToken && !tokens.writeToken) {
    return undefined
  }
  return {
    readToken: typeof tokens.readToken === 'string' ? tokens.readToken : undefined,
    writeToken: typeof tokens.writeToken === 'string' ? tokens.writeToken : undefined
  }
}

async function decodeAccount(account: PersistedAccount, key: CryptoKey): Promise<DecodedAccount> {
  const { yituliu, ...rest } = account
  const decoded = rest as unknown as GameAccount
  if (isEncryptedEnvelope(decoded.skland)) {
    decoded.skland = await decryptJson<SklandCredential>(key, decoded.skland)
  }
  if (decoded.hgToken !== undefined && isEncryptedEnvelope(decoded.hgToken)) {
    decoded.hgToken = await decryptJson<string>(key, decoded.hgToken)
  }
  const legacyTokens = isEncryptedEnvelope(yituliu)
    ? extractLegacyTokens(await decryptJson<YituliuTokens>(key, yituliu))
    : extractLegacyTokens(yituliu)
  return { account: decoded, legacyTokens }
}

/** 未设置主密码时的账号解码：凭据即明文，仅需剥离旧版 token 字段 */
function decodePlainAccount(account: PersistedAccount): DecodedAccount {
  const { yituliu, ...rest } = account
  return { account: rest as unknown as GameAccount, legacyTokens: extractLegacyTokens(yituliu) }
}

/** 加密设置层的一图流 token */
async function encodeSettings(settings: ExtensionSettings, key: CryptoKey): Promise<PersistedSettings> {
  const { yituliuTokens, ...rest } = settings
  return { ...rest, yituliuTokens: await encryptJson(key, yituliuTokens ?? {}) }
}

/** 解密设置层的一图流 token；未加密或空值按明文/空处理 */
async function decodeSettings(settings: PersistedSettings, key: CryptoKey): Promise<ExtensionSettings> {
  const { yituliuTokens, ...rest } = settings
  const decoded: ExtensionSettings = {
    ...(rest as Omit<ExtensionSettings, 'yituliuTokens'>),
    yituliuTokens: {}
  }
  if (isEncryptedEnvelope(yituliuTokens)) {
    decoded.yituliuTokens = await decryptJson<YituliuTokens>(key, yituliuTokens)
  } else if (yituliuTokens && typeof yituliuTokens === 'object') {
    decoded.yituliuTokens = yituliuTokens as YituliuTokens
  }
  return decoded
}

/** 旧版数据迁移：各账号上的读写 token 合并进设置层（设置层已有值优先，取首个非空） */
function mergeLegacyTokens(base: YituliuTokens, legacyList: (YituliuTokens | undefined)[]): YituliuTokens {
  const merged = { ...base }
  for (const legacy of legacyList) {
    if (!merged.readToken && legacy?.readToken) {
      merged.readToken = legacy.readToken
    }
    if (!merged.writeToken && legacy?.writeToken) {
      merged.writeToken = legacy.writeToken
    }
  }
  return merged
}

/** 锁定时的脱敏占位：凭据置空，账号基础信息保留以展示列表 */
function stripAccount(account: PersistedAccount): GameAccount {
  return {
    id: account.id,
    uid: account.uid,
    nickName: account.nickName,
    channelMasterId: account.channelMasterId,
    channelName: account.channelName,
    skland: { cred: '', token: '', obtainedAt: 0 },
    lastSync: account.lastSync
  }
}

/** 原始数据 → 内存状态：未加密直接用；已加密时需解锁，锁定则返回脱敏状态 */
async function decodeState(raw: unknown, session: SessionArea | undefined): Promise<PluginState> {
  const persisted = normalizePersisted(raw)
  if (!persisted.security) {
    // 未设置主密码：兼容旧数据，凭据即明文
    const decoded = persisted.accounts.map(decodePlainAccount)
    const settingsTokens = persisted.settings.yituliuTokens as YituliuTokens | undefined
    return {
      accounts: decoded.map(item => item.account),
      activeAccountId: persisted.activeAccountId,
      settings: {
        ...(persisted.settings as Omit<ExtensionSettings, 'yituliuTokens'>),
        yituliuTokens: mergeLegacyTokens(settingsTokens ?? {}, decoded.map(item => item.legacyTokens))
      }
    }
  }
  const key = await loadSessionKey(session)
  if (!key) {
    return {
      ...persisted,
      accounts: persisted.accounts.map(stripAccount),
      settings: { ...(persisted.settings as Omit<ExtensionSettings, 'yituliuTokens'>), yituliuTokens: {} }
    }
  }
  const decoded = await Promise.all(persisted.accounts.map(account => decodeAccount(account, key)))
  const settings = await decodeSettings(persisted.settings, key)
  return {
    accounts: decoded.map(item => item.account),
    activeAccountId: persisted.activeAccountId,
    settings: {
      ...settings,
      yituliuTokens: mergeLegacyTokens(settings.yituliuTokens, decoded.map(item => item.legacyTokens))
    },
    security: persisted.security
  }
}

/** 内存状态 → 磁盘数据：配置了主密码就加密敏感字段；锁定时禁止写入防止脱敏数据覆盖密文 */
async function encodeState(state: PluginState, session: SessionArea | undefined): Promise<PersistedState> {
  const persisted: PersistedState = {
    accounts: state.accounts,
    activeAccountId: state.activeAccountId,
    settings: state.settings
  }
  if (state.security) {
    const key = await loadSessionKey(session)
    if (!key) {
      throw new PluginLockedError()
    }
    persisted.security = state.security
    persisted.accounts = await Promise.all(state.accounts.map(account => encodeAccount(account, key)))
    persisted.settings = await encodeSettings(state.settings, key)
  }
  return persisted
}

export async function loadState(
  area: StorageArea = defaultStorageArea(),
  session: SessionArea | undefined = defaultSessionArea()
): Promise<PluginState> {
  return decodeState(await readRawState(area), session)
}

export async function saveState(
  state: PluginState,
  area: StorageArea = defaultStorageArea(),
  session: SessionArea | undefined = defaultSessionArea()
): Promise<void> {
  return writeRawState(await encodeState(state, session), area)
}

/** 新增或更新账号（按 id 匹配）；首个账号自动设为激活 */
export async function upsertAccount(
  account: GameAccount,
  area: StorageArea = defaultStorageArea(),
  session: SessionArea | undefined = defaultSessionArea()
): Promise<PluginState> {
  const state = await loadState(area, session)
  const index = state.accounts.findIndex(item => item.id === account.id)
  if (index >= 0) {
    state.accounts[index] = account
  } else {
    state.accounts.push(account)
  }
  if (!state.activeAccountId) {
    state.activeAccountId = account.id
  }
  await saveState(state, area, session)
  return state
}

/** 重新读取最新状态后，仅更新指定账号的森空岛凭证，避免旧页面快照覆盖其他字段。 */
export async function patchAccountCredential(
  accountId: string,
  skland: SklandCredential,
  area: StorageArea = defaultStorageArea(),
  session: SessionArea | undefined = defaultSessionArea()
): Promise<PluginState> {
  const state = await loadState(area, session)
  const account = state.accounts.find(item => item.id === accountId)
  if (!account) {
    return state
  }
  account.skland = skland
  await saveState(state, area, session)
  return state
}

export async function removeAccount(
  accountId: string,
  area: StorageArea = defaultStorageArea(),
  session: SessionArea | undefined = defaultSessionArea()
): Promise<PluginState> {
  const state = await loadState(area, session)
  state.accounts = state.accounts.filter(account => account.id !== accountId)
  if (state.activeAccountId === accountId) {
    state.activeAccountId = state.accounts[0]?.id ?? null
  }
  await saveState(state, area, session)
  return state
}

export async function setActiveAccount(
  accountId: string,
  area: StorageArea = defaultStorageArea(),
  session: SessionArea | undefined = defaultSessionArea()
): Promise<PluginState> {
  const state = await loadState(area, session)
  if (!state.accounts.some(account => account.id === accountId)) {
    return state
  }
  state.activeAccountId = accountId
  await saveState(state, area, session)
  return state
}

export async function updateSettings(
  patch: Partial<ExtensionSettings>,
  area: StorageArea = defaultStorageArea(),
  session: SessionArea | undefined = defaultSessionArea()
): Promise<PluginState> {
  const state = await loadState(area, session)
  state.settings = { ...state.settings, ...patch }
  await saveState(state, area, session)
  return state
}

export interface SecurityOptions {
  area?: StorageArea
  session?: SessionArea
  /** 测试可调低迭代次数；生产默认 60 万次 PBKDF2 */
  iterations?: number
}

function resolveSecurityOptions(options: SecurityOptions): {
  area: StorageArea
  session: SessionArea | undefined
  iterations: number
} {
  return {
    area: options.area ?? defaultStorageArea(),
    session: options.session ?? defaultSessionArea(),
    iterations: options.iterations ?? DEFAULT_PBKDF2_ITERATIONS
  }
}

function normalizePassphrase(passphrase: string): string {
  // 首尾空白基本来自粘贴误操作，统一去掉以免锁死；内部空格视为口令的一部分
  return passphrase.trim()
}

function assertPassphraseUsable(passphrase: string): string {
  const normalized = normalizePassphrase(passphrase)
  if (normalized.length < MIN_PASSPHRASE_LENGTH) {
    throw new SecurityError(`主密码至少需要 ${MIN_PASSPHRASE_LENGTH} 个字符`)
  }
  return normalized
}

async function deriveKeyWithConfig(passphrase: string, security: SecurityConfig): Promise<CryptoKey> {
  return deriveAesGcmKey(passphrase, fromBase64(security.kdf.salt), security.kdf.iterations)
}

/** 校验口令并返回派生密钥；不匹配时抛 SecurityError */
async function verifyPassphrase(passphrase: string, security: SecurityConfig): Promise<CryptoKey> {
  const key = await deriveKeyWithConfig(passphrase, security)
  let verified = false
  try {
    verified = (await decryptJson<string>(key, security.verifier)) === VERIFIER_PLAINTEXT
  } catch {
    verified = false
  }
  if (!verified) {
    throw new SecurityError('主密码不正确')
  }
  return key
}

/** 用新盐派生密钥并生成对应的安全配置；两者必须同源，否则校验必然失败 */
async function buildSecurityConfig(
  passphrase: string,
  iterations: number
): Promise<{ security: SecurityConfig; key: CryptoKey }> {
  const salt = newSalt()
  const key = await deriveAesGcmKey(passphrase, salt, iterations)
  const security: SecurityConfig = {
    version: 1,
    kdf: { iterations, salt: toBase64(salt) },
    verifier: await encryptJson(key, VERIFIER_PLAINTEXT)
  }
  return { security, key }
}

export interface SecurityStatus {
  /** 是否已设置主密码（未设置时凭据仍为明文存储） */
  configured: boolean
  /** 已设置主密码时，本次浏览器会话内是否已解锁 */
  unlocked: boolean
}

export async function getSecurityStatus(options: SecurityOptions = {}): Promise<SecurityStatus> {
  const { area, session } = resolveSecurityOptions(options)
  const configured = Boolean(normalizePersisted(await readRawState(area)).security)
  return { configured, unlocked: !configured || (await hasSessionKey(session)) }
}

/** 首次设置主密码：同时把已有明文凭据全部加密迁移；成功后本会话自动解锁 */
export async function setupSecurity(passphrase: string, options: SecurityOptions = {}): Promise<PluginState> {
  const { area, session, iterations } = resolveSecurityOptions(options)
  const normalized = assertPassphraseUsable(passphrase)
  const current = await loadState(area, session)
  if (current.security) {
    throw new SecurityError('主密码已设置，如需更换请在设置中使用「修改主密码」')
  }
  const { security, key } = await buildSecurityConfig(normalized, iterations)
  // 此时尚未解锁（密钥还没进会话缓存），不能走 encodeState，需用新密钥直接加密
  const persisted: PersistedState = {
    accounts: await Promise.all(current.accounts.map(account => encodeAccount(account, key))),
    activeAccountId: current.activeAccountId,
    settings: await encodeSettings(current.settings, key),
    security
  }
  await writeRawState(persisted, area)
  await cacheSessionKey(key, session)
  return loadState(area, session)
}

/** 输入主密码解锁：校验通过后密钥只写入会话内存 */
export async function unlockSecurity(passphrase: string, options: SecurityOptions = {}): Promise<void> {
  const { area, session } = resolveSecurityOptions(options)
  const persisted = normalizePersisted(await readRawState(area))
  if (!persisted.security) {
    throw new SecurityError('尚未设置主密码')
  }
  const key = await verifyPassphrase(normalizePassphrase(passphrase), persisted.security)
  await cacheSessionKey(key, session)
}

/** 立即锁定：清除会话内存中的密钥；重启浏览器也会自动锁定 */
export async function lockSecurity(options: SecurityOptions = {}): Promise<void> {
  const { session } = resolveSecurityOptions(options)
  await clearSessionKey(session)
}

/** 修改主密码：用旧口令解出全部凭据后立即用新口令重编 */
export async function changeSecurityPassphrase(
  oldPassphrase: string,
  newPassphrase: string,
  options: SecurityOptions = {}
): Promise<PluginState> {
  const { area, session, iterations } = resolveSecurityOptions(options)
  const normalizedNew = assertPassphraseUsable(newPassphrase)
  const persisted = normalizePersisted(await readRawState(area))
  if (!persisted.security) {
    throw new SecurityError('尚未设置主密码')
  }
  const oldKey = await verifyPassphrase(normalizePassphrase(oldPassphrase), persisted.security)
  const decoded = await Promise.all(persisted.accounts.map(account => decodeAccount(account, oldKey)))
  const settings = await decodeSettings(persisted.settings, oldKey)
  const { security, key: newKey } = await buildSecurityConfig(normalizedNew, iterations)
  const next: PersistedState = {
    accounts: await Promise.all(decoded.map(item => encodeAccount(item.account, newKey))),
    activeAccountId: persisted.activeAccountId,
    settings: await encodeSettings(settings, newKey),
    security
  }
  await writeRawState(next, area)
  await cacheSessionKey(newKey, session)
  return loadState(area, session)
}

/**
 * 忘记主密码的唯一兜底：凭据已无法解密，清空所有账号并移除安全配置（保留其他设置）。
 * 账号可重新添加，一图流 token 密文已不可解，一并清空需重新获取。
 */
export async function resetSecurity(options: SecurityOptions = {}): Promise<PluginState> {
  const { area, session } = resolveSecurityOptions(options)
  const current = await loadState(area, session)
  const next: PersistedState = {
    accounts: [],
    activeAccountId: null,
    settings: { ...current.settings, yituliuTokens: {} }
  }
  await writeRawState(next, area)
  await clearSessionKey(session)
  return loadState(area, session)
}

/** 监听本地存储变化（弹窗/管理页实时刷新）；按解锁状态解密后回调；返回取消订阅函数 */
export function subscribeState(
  callback: (state: PluginState) => void,
  area: StorageArea = defaultStorageArea(),
  session: SessionArea | undefined = defaultSessionArea()
): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName === 'local' && changes[STORAGE_KEY]) {
      void decodeState(changes[STORAGE_KEY].newValue, session).then(callback)
    }
  }
  globalThis.chrome?.storage?.onChanged?.addListener(listener)
  return () => {
    globalThis.chrome?.storage?.onChanged?.removeListener(listener)
  }
}
