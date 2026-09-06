import type { ReactNode } from 'react'

import type {
  SklandBindingInfo,
  SklandBuildingManufacture,
  SklandBuildingTrading
} from '../../../core/skland-info'
import {
  CLUE_OWN_MAX,
  clueBoardSlots,
  computeDroneCount,
  dormitoryCurrentAp,
  droneSpeedBonusPercent,
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
import { LevelMark } from '../../icons'
import { useNow } from '../../useNow'
import controlIcon from '../../assets/rooms/control.svg'
import dormitoryIcon from '../../assets/rooms/dormitory.svg'
import droneIcon from '../../assets/rooms/drone.svg'
import hireIcon from '../../assets/rooms/hire.svg'
import manufactureIcon from '../../assets/rooms/manufacture.svg'
import meetingIcon from '../../assets/rooms/meeting.svg'
import powerIcon from '../../assets/rooms/power.svg'
import tradingIcon from '../../assets/rooms/trading.svg'
import trainingIcon from '../../assets/rooms/training.svg'
import ResidentCharacter from './ResidentCharacter'

/** 基建设施卡片骨架：标题(色条+等级刻度) + 图标 + 信息列 + 自定义内容 + 进驻干员 */
function RoomCard({ title, level, color, icon, info, extra, children }: {
  title: string
  level: number
  color: string
  icon: string
  info?: ReactNode
  extra?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="room-card">
      {/* 设计稿：标题文字白色，颜色只体现在左侧色条与等级刻度 */}
      <div className="room-title" style={{ borderColor: color }}>
        <span>{title}</span>
        <span className="room-level">
          {Array.from({ length: level }, (_, index) => (
            <LevelMark key={index} color={color} />
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
    <RoomCard title="制造站" level={room.level} color="#FFD800" icon={manufactureIcon}>
      <div className="room-info">
        <div className="room-info-row">
          <span className="font-bender" style={{ color: '#ffd800' }}>{weight}<span style={{ color: '#fff' }}>/{room.capacity}</span></span>
        </div>
        <div style={{ color: '#ffd800' }}>{formula?.name ?? '未知配方'}</div>
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
    // 设计稿（Figma 502:903）：贸易站色条 #2bf，订单数/策略文字 #25abdf
    <RoomCard title="贸易站" level={room.level} color="#2bf" icon={tradingIcon}>
      <div className="room-info">
        <div className="room-info-row">
          <span className="font-bender" style={{ color: '#25abdf' }}>{room.stock.length}<span style={{ color: '#fff' }}>/{room.stockLimit}</span></span>
        </div>
        <div style={{ color: '#25abdf' }}>{tradingStrategyName(room.strategy)}</div>
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
    <RoomCard title="会客室" level={meeting.level} color="#ffffff" icon={meetingIcon}>
      <div className="room-extra">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <span className="meeting-status">{meeting.clue.sharing ? '交流中' : '搜集中'}</span>
          <span className="font-bender">
            <span style={{ color: '#fd661c' }}>{meeting.clue.own}</span>/{CLUE_OWN_MAX}
          </span>
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

/** 基建 tab：顶部无人机实时数 + 各设施卡片（制造/贸易/会客/宿舍/人力/训练/发电/中枢） */
export default function BuildingTab({ info }: { info: SklandBindingInfo }) {
  const now = useNow(1000)
  const nowSec = Math.floor(now / 1000)
  const building = info.building
  const labor = building?.labor
  const drone = labor ? computeDroneCount(labor, now) : 0
  // 充能速度加成（中枢进驻技能），快照无法推导（已满）时不显示
  const droneBonus = labor ? droneSpeedBonusPercent(labor) : null

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
      <RoomCard key={`dormitory-${room.slotId}-${index}`} title="宿舍" level={room.level} color="#ffffff" icon={dormitoryIcon}>
        <div className="room-info">
          <div className="room-info-row">
            <span>氛围</span>
            <span className="font-bender" style={{ color: '#9bc142' }}>{room.comfort}</span>
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
      <RoomCard key="hire" title="人力办公室" level={hire.level} color="#ffffff" icon={hireIcon}>
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
      <RoomCard key="training" title="训练室" level={training.level} color="#ffffff" icon={trainingIcon}>
        <div className="room-info">
          {completeAt >= 0 ? (
            <>
              <div className="room-info-row">
                <span>剩余</span>
                <span className="font-bender">{formatDuration(Math.max(0, completeAt - nowSec) * 1000)}</span>
              </div>
              <div className="room-info-row" title={skill?.skillName ? `训练速度 +${speedBonus}%` : undefined}>
                {skill ? (
                  <>
                    <span className="skill-name">{skill.skillName ?? `技能${skill.slot}`}</span>
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
      <RoomCard key={`power-${room.slotId}`} title="发电站" level={room.level} color="#d1eb64" icon={powerIcon}>
        <div className="room-info">
          <div className="room-info-row">
            <span>发电</span>
            <span className="font-bender" style={{ color: '#caec46' }}>{powerOutput(room.level)}</span>
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
      <RoomCard key="control" title="控制中枢" level={building.control.level} color="#ffffff" icon={controlIcon}>
        {building.control.chars.map(resident => (
          // 控制中枢无官方消耗速率口径，展示快照心情
          <ResidentCharacter key={resident.charId} resident={resident} charMap={charMap} />
        ))}
      </RoomCard>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {labor && (
        <div className="labor-row">
          <img className="drone-icon" src={droneIcon} alt="" />
          <span>
            <span className="drone-value font-bender">{drone}</span>
            <span className="font-bender">/{labor.maxValue}</span>
          </span>
          {droneBonus !== null && (
            <span className="drone-bonus font-bender" title="无人机充能速度加成（含控制中枢进驻技能）">+{droneBonus}%</span>
          )}
        </div>
      )}
      <div className="building-body">
        <div className="building-scroll">
          <div className="building-list">{rooms}</div>
        </div>
        {/* 设计稿（Figma 502:1985）：列表底部 30px 渐隐遮罩 */}
        <div className="building-fade" />
      </div>
    </div>
  )
}
