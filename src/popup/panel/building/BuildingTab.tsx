import type { ReactNode } from 'react'

import type {
  SklandBindingInfo,
  SklandBuildingManufacture,
  SklandBuildingTrading
} from '../../../core/skland-info'
import { computeDroneCount, estimateManufactureWeight, MANUFACTURE_FORMULAS, powerOutput } from '../../../core/status/building'
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
      <div className="room-title" style={{ color }}>
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

function ManufactureRoom({ room, now }: { room: SklandBuildingManufacture; now: number }) {
  const formula = MANUFACTURE_FORMULAS[room.formulaId]
  const weight = estimateManufactureWeight(room, now)
  return (
    <RoomCard title="制造站" level={room.level} color="#FFD800" icon={manufactureIcon}>
      <div className="room-info">
        <div className="room-info-row">
          <span className="font-bender" style={{ color: '#ffd800' }}>{weight}<span style={{ color: '#fff' }}>/{room.capacity}</span></span>
        </div>
        <div style={{ color: '#ffd800' }}>{formula?.name ?? '未知配方'}</div>
      </div>
    </RoomCard>
  )
}

function TradingRoom({ room }: { room: SklandBuildingTrading }) {
  return (
    <RoomCard title="贸易站" level={room.level} color="#5ab8f9" icon={tradingIcon}>
      <div className="room-info">
        <div className="room-info-row">
          <span className="font-bender" style={{ color: '#5ab8f9' }}>{room.stock.length}<span style={{ color: '#fff' }}>/{room.stockLimit}</span></span>
        </div>
        <div style={{ color: '#5ab8f9' }}>{room.strategy === 'O_DIAMOND' ? '开采协力' : '龙门商法'}</div>
      </div>
    </RoomCard>
  )
}

const CLUE_COUNT = 7

function MeetingRoom({ info }: { info: SklandBindingInfo }) {
  const meeting = info.building.meeting
  if (!meeting) {
    return null
  }
  return (
    <RoomCard title="会客室" level={meeting.level} color="#ffffff" icon={meetingIcon}>
      <div className="room-extra">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <span className="meeting-status">{meeting.clue.sharing ? '交流中' : '搜集中'}</span>
          <span>
            <span style={{ color: '#fd661c' }}>{meeting.clue.own}</span>/10
          </span>
        </div>
        <div className="meeting-progress">
          <div className="meeting-progress-fill" style={{ width: `${Math.min(100, (meeting.clue.own / 10) * 100)}%` }} />
        </div>
        <div className="clue-board">
          {Array.from({ length: CLUE_COUNT }, (_, index) => (
            <span key={index} className={`clue-slot${meeting.clue.board[index] ? ' own' : ''}`}>{index + 1}</span>
          ))}
        </div>
      </div>
    </RoomCard>
  )
}

/** 基建 tab：顶部无人机实时数 + 各设施卡片（制造/贸易/会客/宿舍/人力/训练/发电/中枢） */
export default function BuildingTab({ info }: { info: SklandBindingInfo }) {
  const now = useNow(1000)
  const building = info.building
  const labor = building?.labor
  const drone = labor ? computeDroneCount(labor, now) : 0

  const charMap = new Map((info.chars ?? []).map(char => [char.charId, char.skinId]))

  const rooms: ReactNode[] = []
  for (const room of building?.manufactures ?? []) {
    rooms.push(<ManufactureRoom key={`manufacture-${room.slotId}`} room={room} now={now} />)
  }
  for (const room of building?.tradings ?? []) {
    rooms.push(<TradingRoom key={`trading-${room.slotId}`} room={room} />)
  }
  if (building?.meeting) {
    rooms.push(<MeetingRoom key="meeting" info={info} />)
  }
  for (const [index, room] of (building?.dormitories ?? []).entries()) {
    rooms.push(
      <RoomCard key={`dormitory-${room.slotId}-${index}`} title="宿舍" level={room.level} color="#ffffff" icon={dormitoryIcon}>
        <div className="room-info">
          <div className="room-info-row">
            <span>氛围</span>
            <span style={{ color: '#9bc142' }}>{room.comfort}</span>
          </div>
        </div>
        {room.chars.map(resident => (
          <ResidentCharacter key={resident.charId} resident={resident} charMap={charMap} />
        ))}
      </RoomCard>
    )
  }
  if (building?.hire) {
    rooms.push(
      <RoomCard key="hire" title="人力办公室" level={building.hire.level} color="#ffffff" icon={hireIcon}>
        {building.hire.chars.map(resident => (
          <ResidentCharacter key={resident.charId} resident={resident} charMap={charMap} />
        ))}
      </RoomCard>
    )
  }
  if (building?.training) {
    const training = building.training
    rooms.push(
      <RoomCard key="training" title="训练室" level={training.level} color="#ffffff" icon={trainingIcon}>
        {[training.trainer, training.trainee].map((person, personIndex) => (
          person
            ? (
                <ResidentCharacter
                  key={person.charId + personIndex}
                  resident={{ charId: person.charId, ap: person.ap, lastApAddTime: 0, index: personIndex }}
                  charMap={charMap}
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
          <ResidentCharacter key={resident.charId} resident={resident} charMap={charMap} />
        ))}
      </RoomCard>
    )
  }
  if (building?.control) {
    rooms.push(
      <RoomCard key="control" title="控制中枢" level={building.control.level} color="#ffffff" icon={controlIcon}>
        {building.control.chars.map(resident => (
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
        </div>
      )}
      <div className="building-scroll">
        <div className="building-list">{rooms}</div>
      </div>
    </div>
  )
}
