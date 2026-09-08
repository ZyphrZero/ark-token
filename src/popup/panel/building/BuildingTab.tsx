import type { ReactNode } from 'react'

import type {
  SklandBindingInfo,
  SklandBuildingManufacture,
  SklandBuildingTrading
} from '../../../core/skland-info'
import type { PowerPlantCharge } from '../../../core/status/building'
import {
  CLUE_OWN_MAX,
  clueBoardSlots,
  dormitoryCurrentAp,
  estimateManufactureWeight,
  hireWorkCapSec,
  manufactureWorkCapSec,
  MANUFACTURE_FORMULAS,
  meetingWorkCapSec,
  powerOutput,
  powerPlantChargePercent,
  powerSharePercent,
  roomSlotNumber,
  slotNumberOf,
  specializeLevelText,
  trainingCompleteTimeSec,
  trainingSkillInfo,
  trainingSpeedBonusPercent,
  tradingStrategyName,
  trainingWorkCapSec,
  workingCurrentAp
} from '../../../core/status/building'
import { formatDuration } from '../../../utils/time'
import { LevelMark } from '../../../ui/icons'
import { useNow } from '../../useNow'
import controlIcon from '../../assets/rooms/control.svg'
import dormitoryIcon from '../../assets/rooms/dormitory.svg'
import hireIcon from '../../assets/rooms/hire.svg'
import manufactureIcon from '../../assets/rooms/manufacture.svg'
import meetingIcon from '../../assets/rooms/meeting.svg'
import powerIcon from '../../assets/rooms/power.svg'
import tradingIcon from '../../assets/rooms/trading.svg'
import trainingIcon from '../../assets/rooms/training.svg'
import formulaRecordIcon from '../../assets/icons/polygon.svg'
import strategyGoldIcon from '../../assets/icons/Vector.svg'
import comfortIcon from '../../assets/icons/fenwei.svg'
import droneChargeIcon from '../../assets/icons/无人机.svg'
import powerStatIcon from '../../assets/icons/电力图标.svg'
import ResidentCharacter from './ResidentCharacter'
import type { CharMap } from './ResidentCharacter'
import { useRoomCollapse } from './roomCollapse'
import type { RoomCollapse } from './roomCollapse'

/**
 * 基建设施卡片骨架：头部（语义色条 + 折叠箭头 + 中英文名 + 菱形等级刻度）+
 * 主体（60×60 设施图标作底层铺在卡片左侧，info 信息行叠加覆盖在图标上方靠左显示）+
 * 进驻干员（右侧）。info/extra 走 prop、children 只放干员，避免信息块被混进干员列。
 * 语义色由 tone 对应的 room--{tone} 类提供（--room-accent），视图层不内联色值。
 *
 * 可折叠：整卡头部可点击切换，折叠后只保留头部一行（露出下面的房间），
 * 状态由调用方用 useRoomCollapse（localStorage 持久化）统一管理。
 */
function RoomCard({ title, en, level, tone, icon, info, extra, children, collapsed, onToggle, toggleable = true }: {
  title: string
  en: string
  level: number
  tone: 'manufacture' | 'trading' | 'meeting' | 'dormitory' | 'hire' | 'training' | 'power' | 'control'
  icon: string
  info?: ReactNode
  extra?: ReactNode
  children?: ReactNode
  /** 是否折叠（仅调用方已启用折叠时传入；缺省视为展开） */
  collapsed?: boolean
  /** 点击头部切换折叠 */
  onToggle?: () => void
  /** 是否可折叠（单间但有内容的房间默认可折叠；确无内容时置 false 隐藏箭头） */
  toggleable?: boolean
}) {
  const isCollapsed = collapsed === true
  const head = (
    <div className="room-head">
      {toggleable && onToggle && (
        <CollapseIcon className={`room-collapse-icon${isCollapsed ? '' : ' open'}`} size={10} />
      )}
      <span className="room-name">{title}</span>
      <span className="room-en">{en}</span>
      <span className="room-level">
        {Array.from({ length: level }, (_, index) => (
          <LevelMark key={index} />
        ))}
      </span>
    </div>
  )
  return (
    <div className={`room-card cut-box room--${tone}`}>
      {toggleable && onToggle ? (
        <button
          type="button"
          className="room-collapse"
          aria-expanded={!isCollapsed}
          onClick={onToggle}
          title={isCollapsed ? '展开' : '折叠'}
        >
          {head}
        </button>
      ) : (
        head
      )}
      {!isCollapsed && (
        <div className="room-body">
          <img className="room-icon" src={icon} alt="" />
          {info && <div className="room-info">{info}</div>}
          {extra && <div className="room-extra">{extra}</div>}
          {children && <div className="room-residents">{children}</div>}
        </div>
      )}
    </div>
  )
}

/** 折叠箭头（头部左侧，展开时朝下、折叠时朝右） */
function CollapseIcon({ className, size = 10 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" className={className} aria-hidden="true">
      <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 房间列表按槽位数字升序渲染：真实接口数组顺序无语义（样本 powers=[26,16,15]），编号才能从上到下递增 */
function bySlot<T extends { slotId: string }>(rooms: T[]): T[] {
  return [...rooms].sort((a, b) => (slotNumberOf(a.slotId) ?? 0) - (slotNumberOf(b.slotId) ?? 0))
}

/** 房间标题：制造/贸易/宿舍/发电始终带游戏内序号（贸易站1/宿舍2…），单间设施不加（见 roomSlotNumber） */
function roomTitle(base: string, rooms: { slotId: string }[], slotId: string): string {
  const number = roomSlotNumber(rooms, slotId)
  return number !== null ? `${base}${number}` : base
}

/**
 * 折叠状态的持久化 key。多间设施用「类型 + 槽位号」（槽位号是基建全局唯一，见
 * roomSlotNumber）；单间设施直接用具名 key。槽位号含 `slot_` 前缀（真实接口格式），
 * 直接拼 `slot_26` 而不取数字——取数字拼接在「玩家基建里槽位号恰好重组」时可能与
 * 其他房间撞 key。
 */
function roomKeyOf(type: string, slotId: string): string {
  return `${type}:${slotId}`
}

/** 发电站充能加成明细提示：基础 +5% + 技能名 +20% = +25%；条件型加成未计入时补充说明 */
function chargeTitle(charge: PowerPlantCharge): string {
  const parts = [`基础 +${charge.base}%`]
  if (charge.skillNames.length > 0) {
    parts.push(`${charge.skillNames.join(' / ')} +${charge.skill}%`)
  }
  const text = `无人机充能速度 ${parts.join(' + ')} = +${charge.percent}%`
  return charge.partial ? `${text}（*另有依赖其他干员进驻的附加加成未计入）` : text
}

function ManufactureRoom({ room, rooms, nowSec, charMap, collapse }: {
  room: SklandBuildingManufacture
  rooms: SklandBuildingManufacture[]
  nowSec: number
  charMap: CharMap
  collapse: RoomCollapse
}) {
  const formula = MANUFACTURE_FORMULAS[room.formulaId]
  const weight = estimateManufactureWeight(room, nowSec * 1000)
  // 生产耗尽后干员停止消耗心情，外推不超过配方剩余工时
  const capSec = manufactureWorkCapSec(room)
  const key = roomKeyOf('manufacture', room.slotId)
  return (
    <RoomCard
      title={roomTitle('制造站', rooms, room.slotId)}
      en="Factory"
      level={room.level}
      tone="manufacture"
      icon={manufactureIcon}
      collapsed={collapse.isCollapsed(key)}
      onToggle={() => collapse.toggle(key)}
      info={(
        <>
          <div className="room-info-row">
            {formula?.name === '基础作战记录' && <img className="room-info-icon" src={formulaRecordIcon} alt="" />}
            <span className="room-info-name" title={formula?.name}>{formula?.name ?? '未知配方'}</span>
          </div>
          <div className="room-info-row">
            <span className="room-info-value">{weight}<i>/{room.capacity}</i></span>
          </div>
        </>
      )}
    >
      {room.chars.map(resident => (
        <ResidentCharacter
          key={resident.charId}
          resident={resident}
          charMap={charMap}
          currentAp={workingCurrentAp(resident, nowSec, capSec)}
        />
      ))}
    </RoomCard>
  )
}

function TradingRoom({ room, rooms, nowSec, charMap, collapse }: {
  room: SklandBuildingTrading
  rooms: SklandBuildingTrading[]
  nowSec: number
  charMap: CharMap
  collapse: RoomCollapse
}) {
  const key = roomKeyOf('trading', room.slotId)
  return (
    <RoomCard
      title={roomTitle('贸易站', rooms, room.slotId)}
      en="Trading Post"
      level={room.level}
      tone="trading"
      icon={tradingIcon}
      collapsed={collapse.isCollapsed(key)}
      onToggle={() => collapse.toggle(key)}
      info={(
        <>
          <div className="room-info-row">
            {room.strategy === 'O_GOLD' && <img className="room-info-icon" src={strategyGoldIcon} alt="" />}
            <span className="room-info-name" title={tradingStrategyName(room.strategy)}>{tradingStrategyName(room.strategy)}</span>
          </div>
          <div className="room-info-row">
            <span className="room-info-value">{room.stock.length}<i>/{room.stockLimit}</i></span>
          </div>
        </>
      )}
    >
      {room.chars.map(resident => (
        <ResidentCharacter
          key={resident.charId}
          resident={resident}
          charMap={charMap}
          currentAp={workingCurrentAp(resident, nowSec)}
        />
      ))}
    </RoomCard>
  )
}

/** 各线索系列的标记色，按游戏内线索图样主题色提亮以适配深色背景；顺序对应槽位 1-7 */
const CLUE_COLORS = ['#9fce6a', '#5a8fe0', '#7c8cb8', '#e05a5a', '#fdd400', '#c79a6b', '#78b5bf']

function MeetingRoom({ info, nowSec, charMap, collapse }: {
  info: SklandBindingInfo
  nowSec: number
  charMap: CharMap
  collapse: RoomCollapse
}) {
  const meeting = info.building.meeting
  if (!meeting) {
    return null
  }
  // 搜集线索的干员与线索板并排展示
  const capSec = meetingWorkCapSec(meeting)
  const slots = clueBoardSlots(meeting.clue)
  const key = roomKeyOf('meeting', meeting.slotId)
  return (
    <RoomCard
      title="会客室"
      en="Meeting"
      level={meeting.level}
      tone="meeting"
      icon={meetingIcon}
      collapsed={collapse.isCollapsed(key)}
      onToggle={() => collapse.toggle(key)}
      extra={(
        <>
          <div className="meeting-status-row">
            <span className="meeting-status">{meeting.clue.sharing ? '交流中' : '搜集中'}</span>
            <span className="meeting-own"><b>{meeting.clue.own}</b><i>/{CLUE_OWN_MAX}</i></span>
          </div>
          <div className="meeting-progress">
            <div className="meeting-progress-fill" style={{ width: `${Math.min(100, (meeting.clue.own / CLUE_OWN_MAX) * 100)}%` }} />
          </div>
          <div className="clue-board">
            {slots.map((placed, index) => {
              const color = placed ? CLUE_COLORS[index] : undefined
              return (
                <span
                  key={index}
                  className={`clue-slot${placed ? ' own' : ''}`}
                  style={color ? { color, borderColor: color } : undefined}
                >
                  {index + 1}
                </span>
              )
            })}
          </div>
        </>
      )}
    >
      {meeting.chars.map(resident => (
        <ResidentCharacter
          key={resident.charId}
          resident={resident}
          charMap={charMap}
          currentAp={workingCurrentAp(resident, nowSec, capSec)}
        />
      ))}
    </RoomCard>
  )
}

/** 基建 tab：控制中枢居首，其后为制造/贸易/会客/宿舍/人力/训练/发电（无人机读数在区块标题行） */
export default function BuildingTab({ info }: { info: SklandBindingInfo }) {
  const nowSec = Math.floor(useNow(1000) / 1000)
  const building = info.building

  // charId → 干员条目（皮肤用于头像、evolvePhase/level 用于基建技能解锁判定）
  const charMap = new Map((info.chars ?? []).map(char => [char.charId, char]))
  const manufactures = bySlot(building?.manufactures ?? [])
  const tradings = bySlot(building?.tradings ?? [])
  const dormitories = bySlot(building?.dormitories ?? [])
  const powers = bySlot(building?.powers ?? [])
  // 发电站充能的 per10Drone 档位（巡线框架）需要无人机上限，故一并取 labor
  const labor = building?.labor
  // 房间折叠偏好（localStorage 持久化，key 见 roomKeyOf）
  const collapse = useRoomCollapse()

  const rooms: ReactNode[] = []
  if (building?.control) {
    rooms.push(
      <RoomCard
        key="control"
        title="控制中枢"
        en="Control"
        level={building.control.level}
        tone="control"
        icon={controlIcon}
        collapsed={collapse.isCollapsed('control')}
        onToggle={() => collapse.toggle('control')}
      >
        {building.control.chars.map(resident => (
          // 控制中枢无官方消耗速率口径，展示快照心情
          <ResidentCharacter key={resident.charId} resident={resident} charMap={charMap} />
        ))}
      </RoomCard>
    )
  }
  for (const room of manufactures) {
    rooms.push(<ManufactureRoom key={`manufacture-${room.slotId}`} room={room} rooms={manufactures} nowSec={nowSec} charMap={charMap} collapse={collapse} />)
  }
  for (const room of tradings) {
    rooms.push(<TradingRoom key={`trading-${room.slotId}`} room={room} rooms={tradings} nowSec={nowSec} charMap={charMap} collapse={collapse} />)
  }
  if (building?.meeting) {
    rooms.push(<MeetingRoom key="meeting" info={info} nowSec={nowSec} charMap={charMap} collapse={collapse} />)
  }
  for (const [index, room] of dormitories.entries()) {
    const dormKey = roomKeyOf('dormitory', room.slotId)
    rooms.push(
      <RoomCard
        key={`dormitory-${room.slotId}-${index}`}
        title={roomTitle('宿舍', dormitories, room.slotId)}
        en="Dormitory"
        level={room.level}
        tone="dormitory"
        icon={dormitoryIcon}
        collapsed={collapse.isCollapsed(dormKey)}
        onToggle={() => collapse.toggle(dormKey)}
        info={(
          <div className="room-info-row">
            <img className="room-info-icon" src={comfortIcon} alt="" />
            <span className="room-info-label">氛围</span>
            <span className="room-info-value">{room.comfort}</span>
          </div>
        )}
      >
        {room.chars.map(resident => (
          <ResidentCharacter
            key={resident.charId}
            resident={resident}
            charMap={charMap}
            currentAp={dormitoryCurrentAp(resident, room, nowSec)}
          />
        ))}
      </RoomCard>
    )
  }
  if (building?.hire) {
    const hire = building.hire
    const capSec = hireWorkCapSec(hire, nowSec)
    rooms.push(
      <RoomCard
        key="hire"
        title="人力办公室"
        en="HR Office"
        level={hire.level}
        tone="hire"
        icon={hireIcon}
        collapsed={collapse.isCollapsed('hire')}
        onToggle={() => collapse.toggle('hire')}
      >
        {hire.chars.map(resident => (
          <ResidentCharacter
            key={resident.charId}
            resident={resident}
            charMap={charMap}
            currentAp={workingCurrentAp(resident, nowSec, capSec)}
          />
        ))}
      </RoomCard>
    )
  }
  if (building?.training) {
    const training = building.training
    const capSec = trainingWorkCapSec(training.remainSecs)
    const completeAt = trainingCompleteTimeSec(training, info.currentTs)
    const skill = trainingSkillInfo(training, info.chars)
    const speedBonus = trainingSpeedBonusPercent(training.speed)
    rooms.push(
      <RoomCard
        key="training"
        title="训练室"
        en="Training"
        level={training.level}
        tone="training"
        icon={trainingIcon}
        collapsed={collapse.isCollapsed('training')}
        onToggle={() => collapse.toggle('training')}
        info={completeAt >= 0 ? (
          <>
            <div className="room-info-row">
              <span className="room-info-label">剩余</span>
              <span className="room-info-value">{formatDuration(Math.max(0, completeAt - nowSec) * 1000)}</span>
            </div>
            <div className="room-info-row" title={skill?.skillName ? `训练速度 +${speedBonus}%` : undefined}>
              {skill ? (
                <>
                  <span className="room-info-name" title={skill.skillName ?? undefined}>
                    {skill.skillName ?? `技能${skill.slot}`}
                  </span>
                  <span className="room-info-label">{specializeLevelText(skill.targetLevel)}</span>
                </>
              ) : (
                <span className="room-info-label">专精中</span>
              )}
            </div>
          </>
        ) : (
          <div className="room-info-row">
            <span className="room-info-label">空闲</span>
          </div>
        )}
      >
        {[training.trainer, training.trainee].map((person, personIndex) => (
          person
            ? (
                <ResidentCharacter
                  key={person.charId + personIndex}
                  resident={{ charId: person.charId, ap: person.ap, lastApAddTime: person.lastApAddTime ?? 0, index: personIndex }}
                  charMap={charMap}
                  // 教官在专精期间消耗心情；学员无官方外推口径，用快照
                  currentAp={personIndex === 0 ? workingCurrentAp(
                    { charId: person.charId, ap: person.ap, lastApAddTime: person.lastApAddTime ?? 0, index: personIndex },
                    nowSec,
                    capSec
                  ) : person.ap}
                />
              )
            : null
        ))}
      </RoomCard>
    )
  }
  for (const room of powers) {
    // 发电站：无人机充能与发电量上下两行（游戏内同款双指标）
    // 充能 = 基础 5% + 进驻干员基建技能（按 chars 的精英阶段取档，见 powerPlantChargePercent）
    const charge = labor ? powerPlantChargePercent(room, info.chars, labor) : null
    const share = powerSharePercent(powers, room)
    const powerKey = roomKeyOf('power', room.slotId)
    rooms.push(
      <RoomCard
        key={`power-${room.slotId}`}
        title={roomTitle('发电站', powers, room.slotId)}
        en="Power Plant"
        level={room.level}
        tone="power"
        icon={powerIcon}
        collapsed={collapse.isCollapsed(powerKey)}
        onToggle={() => collapse.toggle(powerKey)}
        info={(
          <>
            <div className="room-info-row" title={charge ? chargeTitle(charge) : undefined}>
              <img className="room-info-icon" src={droneChargeIcon} alt="" />
              <span className="room-info-value">
                {charge !== null ? `+${charge.percent}%` : '—'}
                {/* 条件型加成未计入，标星提示真实值可能更高，明细见 title */}
                {charge?.partial && <i>*</i>}
              </span>
            </div>
            <div className="room-info-row" title="发电量（用于无人机充能）：括号为占全基地总供电比">
              <img className="room-info-icon" src={powerStatIcon} alt="" />
              <span className="room-info-value">
                {powerOutput(room.level)}
                {share !== null && <i>({share.toFixed(1)}%)</i>}
              </span>
            </div>
          </>
        )}
      >
        {room.chars.map(resident => (
          <ResidentCharacter
            key={resident.charId}
            resident={resident}
            charMap={charMap}
            currentAp={workingCurrentAp(resident, nowSec)}
          />
        ))}
      </RoomCard>
    )
  }

  return (
    <div className="building-body">
      <div className="building-scroll">
        <div className="building-list">{rooms}</div>
      </div>
      {/* 列表底部渐隐遮罩 */}
      <div className="building-fade" />
    </div>
  )
}
