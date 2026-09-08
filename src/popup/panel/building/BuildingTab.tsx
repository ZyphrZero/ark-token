import type { CSSProperties, ReactNode } from 'react'

import type {
  SklandBindingInfo,
  SklandBuildingManufacture,
  SklandBuildingTrading
} from '../../../core/skland-info'
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
import { MeterBar } from '../../../ui/components'
import { useNow } from '../../useNow'
import controlIcon from '../../assets/rooms/control.svg'
import dormitoryIcon from '../../assets/rooms/dormitory.svg'
import hireIcon from '../../assets/rooms/hire.svg'
import manufactureIcon from '../../assets/rooms/manufacture.svg'
import meetingIcon from '../../assets/rooms/meeting.svg'
import powerIcon from '../../assets/rooms/power.svg'
import tradingIcon from '../../assets/rooms/trading.svg'
import trainingIcon from '../../assets/rooms/training.svg'
import ResidentCharacter from './ResidentCharacter'

/**
 * 基建设施卡片骨架：头部（语义色条 + 中英文名 + 菱形等级刻度）+
 * 主体（设施图标 + 信息读数 + 自定义内容 + 进驻干员）。
 * 语义色由 tone 对应的 room--{tone} 类提供（--room-accent），视图层不再内联色值。
 */
function RoomCard({ title, en, level, tone, icon, info, extra, children }: {
  title: string
  en: string
  level: number
  tone: 'manufacture' | 'trading' | 'meeting' | 'dormitory' | 'hire' | 'training' | 'power' | 'control'
  icon: string
  info?: ReactNode
  extra?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={`room-card cut-box room--${tone}`}>
      {/* 头部文字白色，语义色只体现在左侧色条与等级刻度 */}
      <div className="room-head">
        <span className="room-name">{title}</span>
        <span className="room-en">{en}</span>
        <span className="room-level">
          {Array.from({ length: level }, (_, index) => (
            <LevelMark key={index} />
          ))}
        </span>
      </div>
      <div className="room-body">
        <img className="room-icon" src={icon} alt="" />
        {info && <div className="room-info">{info}</div>}
        {extra && <div className="room-extra">{extra}</div>}
        {children && <div className="room-residents">{children}</div>}
      </div>
    </div>
  )
}

function ManufactureRoom({ room, nowSec, charMap }: { room: SklandBuildingManufacture; nowSec: number; charMap: Map<string, string> }) {
  const formula = MANUFACTURE_FORMULAS[room.formulaId]
  const weight = estimateManufactureWeight(room, nowSec * 1000)
  // 生产耗尽后干员停止消耗心情，外推不超过配方剩余工时
  const capSec = manufactureWorkCapSec(room)
  return (
    <RoomCard title="制造站" en="Factory" level={room.level} tone="manufacture" icon={manufactureIcon}>
      <div className="room-info">
        <div className="room-info-row">
          <span className="room-info-value">{weight}<i>/{room.capacity}</i></span>
        </div>
        <div className="room-info-name" title={formula?.name}>{formula?.name ?? '未知配方'}</div>
      </div>
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

function TradingRoom({ room, nowSec, charMap }: { room: SklandBuildingTrading; nowSec: number; charMap: Map<string, string> }) {
  return (
    <RoomCard title="贸易站" en="Trading Post" level={room.level} tone="trading" icon={tradingIcon}>
      <div className="room-info">
        <div className="room-info-row">
          <span className="room-info-value">{room.stock.length}<i>/{room.stockLimit}</i></span>
        </div>
        <div className="room-info-name" title={tradingStrategyName(room.strategy)}>{tradingStrategyName(room.strategy)}</div>
      </div>
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

function MeetingRoom({ info, nowSec, charMap }: { info: SklandBindingInfo; nowSec: number; charMap: Map<string, string> }) {
  const meeting = info.building.meeting
  if (!meeting) {
    return null
  }
  // 搜集线索的干员与线索板并排展示
  const capSec = meetingWorkCapSec(meeting)
  const slots = clueBoardSlots(meeting.clue)
  return (
    <RoomCard title="会客室" en="Meeting" level={meeting.level} tone="meeting" icon={meetingIcon}>
      <div className="room-extra">
        <div className="meeting-status-row">
          <span className="meeting-status">{meeting.clue.sharing ? '交流中' : '搜集中'}</span>
          <span className="meeting-own"><b>{meeting.clue.own}</b><i>/{CLUE_OWN_MAX}</i></span>
        </div>
        <MeterBar
          className="meter--thin"
          value={meeting.clue.own}
          max={CLUE_OWN_MAX}
          style={{ '--meter-color': 'var(--clue-orange)' } as CSSProperties}
        />
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
      </div>
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

/** 基建 tab：各设施卡片（制造/贸易/会客/宿舍/人力/训练/发电/中枢）；无人机读数在区块标题行 */
export default function BuildingTab({ info }: { info: SklandBindingInfo }) {
  const nowSec = Math.floor(useNow(1000) / 1000)
  const building = info.building

  const charMap = new Map((info.chars ?? []).map(char => [char.charId, char.skinId]))

  const rooms: ReactNode[] = []
  for (const room of building?.manufactures ?? []) {
    rooms.push(<ManufactureRoom key={`manufacture-${room.slotId}`} room={room} nowSec={nowSec} charMap={charMap} />)
  }
  for (const room of building?.tradings ?? []) {
    rooms.push(<TradingRoom key={`trading-${room.slotId}`} room={room} nowSec={nowSec} charMap={charMap} />)
  }
  if (building?.meeting) {
    rooms.push(<MeetingRoom key="meeting" info={info} nowSec={nowSec} charMap={charMap} />)
  }
  for (const [index, room] of (building?.dormitories ?? []).entries()) {
    rooms.push(
      <RoomCard key={`dormitory-${room.slotId}-${index}`} title="宿舍" en="Dormitory" level={room.level} tone="dormitory" icon={dormitoryIcon}>
        <div className="room-info">
          <div className="room-info-row">
            <span>氛围</span>
            <span className="room-info-value">{room.comfort}</span>
          </div>
        </div>
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
      <RoomCard key="hire" title="人力办公室" en="HR Office" level={hire.level} tone="hire" icon={hireIcon}>
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
      <RoomCard key="training" title="训练室" en="Training" level={training.level} tone="training" icon={trainingIcon}>
        <div className="room-info">
          {completeAt >= 0 ? (
            <>
              <div className="room-info-row">
                <span>剩余</span>
                <span className="room-info-value">{formatDuration(Math.max(0, completeAt - nowSec) * 1000)}</span>
              </div>
              <div className="room-info-row" title={skill?.skillName ? `训练速度 +${speedBonus}%` : undefined}>
                {skill ? (
                  <>
                    <span className="room-info-name" title={skill.skillName ?? undefined}>
                      {skill.skillName ?? `技能${skill.slot}`}
                    </span>
                    <span>{specializeLevelText(skill.targetLevel)}</span>
                  </>
                ) : (
                  <span>专精中</span>
                )}
              </div>
            </>
          ) : (
            <div className="room-info-row">
              <span>空闲</span>
            </div>
          )}
        </div>
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
  for (const room of building?.powers ?? []) {
    rooms.push(
      <RoomCard key={`power-${room.slotId}`} title="发电站" en="Power Plant" level={room.level} tone="power" icon={powerIcon}>
        <div className="room-info">
          <div className="room-info-row">
            <span>发电</span>
            <span className="room-info-value">{powerOutput(room.level)}</span>
          </div>
        </div>
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
  if (building?.control) {
    rooms.push(
      <RoomCard key="control" title="控制中枢" en="Control" level={building.control.level} tone="control" icon={controlIcon}>
        {building.control.chars.map(resident => (
          // 控制中枢无官方消耗速率口径，展示快照心情
          <ResidentCharacter key={resident.charId} resident={resident} charMap={charMap} />
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
