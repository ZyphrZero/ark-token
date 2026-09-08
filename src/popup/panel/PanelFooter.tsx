import type { LastSync } from '../../core/types'
import { formatTimeAgo } from '../../utils/time'
import { RefreshIcon } from '../../ui/icons'
import { openOptions } from '../panelActions'

function describeSyncStatus(lastSync?: LastSync): { text: string; className: string } | null {
  if (!lastSync) {
    return null
  }
  if (lastSync.status === 'syncing') {
    return { text: '一图流同步中…', className: 'syncing' }
  }
  if (lastSync.status === 'success') {
    return {
      text: `${formatTimeAgo(lastSync.time)}同步${lastSync.operatorCount != null ? ` ${lastSync.operatorCount} 名干员` : '成功'}${lastSync.message ? `（${lastSync.message}）` : ''}`,
      className: 'success'
    }
  }
  return { text: `${formatTimeAgo(lastSync.time)}同步失败：${lastSync.message ?? '未知原因'}`, className: 'failed' }
}

/** 底栏：数据更新时间 + 立即刷新（面板缓存） + 同步到一图流 + 同步状态 */
export default function PanelFooter({ fetchedAt, refreshing, onRefresh, canSync, syncing, onSync, lastSync, note }: {
  fetchedAt?: number
  refreshing: boolean
  onRefresh: () => void
  /** 一图流写 token 已在「设置」中配置 */
  canSync: boolean
  syncing: boolean
  onSync: () => void
  lastSync?: LastSync
  /** 刷新失败等提示 */
  note?: string | null
}) {
  const syncStatus = describeSyncStatus(lastSync)

  return (
    <footer className="panel-footer">
      <div className="footer-row">
        <span className="footer-time" title={fetchedAt ? new Date(fetchedAt).toLocaleString() : undefined}>
          {fetchedAt ? `数据更新于 ${formatTimeAgo(fetchedAt)}，可能与游戏内存在延迟` : '尚未拉取面板数据'}
        </span>
        {canSync
          ? (
              <button type="button" className="btn btn-sm btn-primary" disabled={syncing} onClick={onSync}>
                {syncing ? '同步中…' : '同步到一图流'}
              </button>
            )
          : (
              <button type="button" className="btn btn-sm btn-warn" onClick={() => openOptions('#settings')}>
                未配置写 token
              </button>
            )}
        <button type="button" className="icon-btn" title="立即刷新面板数据" disabled={refreshing} onClick={onRefresh}>
          <span className={refreshing ? 'spin' : undefined}>
            <RefreshIcon size={14} />
          </span>
        </button>
      </div>
      {(note || syncStatus) && (
        <div className="footer-row">
          <span className={`footer-status ${note ? 'failed' : syncStatus?.className ?? ''}`}>{note ?? syncStatus?.text}</span>
        </div>
      )}
    </footer>
  )
}
