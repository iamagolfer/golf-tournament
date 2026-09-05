import { Link } from 'react-router-dom'

// Masters-flavoured dark green + gold. Deliberately different from the Ring
// Cup's lighter green so nobody enters scores on the wrong tournament's page.
export const GJ = {
  pageBg:     'bg-[#f4f7f2]',
  headerBg:   'bg-emerald-900',
  headerText: 'text-amber-200',
  accent:     'text-emerald-900',
  gold:       'text-amber-600',
  goldBg:     'bg-amber-400',
  button:     'bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950',
  tabActive:  'bg-emerald-800 text-white',
  tabIdle:    'bg-white text-gray-700 hover:bg-emerald-50',
}

export function GjHeader({ title, subtitle, tournamentName }) {
  return (
    <div className={`${GJ.headerBg} text-white px-4 py-4 border-b-4 border-amber-400`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-amber-300 text-xs font-semibold tracking-widest uppercase">
            {tournamentName || '綠夾克盃'}
          </div>
          <h1 className="text-xl font-bold truncate">{title}</h1>
          {subtitle && <p className="text-emerald-200 text-sm">{subtitle}</p>}
        </div>
        <Link to="/greenjacket" className="text-amber-200 text-sm underline flex-shrink-0 mt-1">
          返回主選單
        </Link>
      </div>
    </div>
  )
}

export function GjNav({ current }) {
  const links = [
    { path: '/greenjacket',          label: '賽事資料' },
    { path: '/greenjacket/scores',   label: '輸入即時成績' },
    { path: '/greenjacket/rankings', label: '排名' },
  ]
  return (
    <div className="flex gap-2 px-3 py-3 overflow-x-auto">
      {links.map(l => (
        <Link key={l.path} to={l.path}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium shadow-sm transition
            ${current === l.path ? GJ.tabActive : GJ.tabIdle}`}>
          {l.label}
        </Link>
      ))}
    </div>
  )
}

// Chinese name is optional for this tournament — fall back to the English one
export function playerName(p) {
  return p.chinese_name || p.english_name || ''
}

export function PlayerName({ player, showWildcard }) {
  const zh = player.chinese_name
  const en = player.english_name
  return (
    <span className="inline-flex items-baseline gap-1.5 flex-wrap">
      <span className="font-medium text-gray-900">{zh || en}</span>
      {zh && en && <span className="text-gray-500 text-sm">{en}</span>}
      {showWildcard && player.wildcard ? (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
          外卡
        </span>
      ) : null}
    </span>
  )
}

export function cellClass(rel) {
  if (rel === null || rel === undefined) return 'bg-gray-100 text-gray-400'
  if (rel <= -2) return 'bg-yellow-300 text-yellow-900'
  if (rel === -1) return 'bg-red-400 text-white'
  if (rel === 0)  return 'bg-gray-50 text-gray-700'
  if (rel === 1)  return 'bg-blue-100 text-blue-900'
  if (rel === 2)  return 'bg-blue-500 text-white'
  return 'bg-gray-700 text-white'
}

export function toParDisplay(diff) {
  if (diff === null || diff === undefined) return { text: '-', cls: 'text-gray-300' }
  if (diff === 0) return { text: 'E', cls: 'text-gray-600 font-bold' }
  if (diff < 0)   return { text: String(diff), cls: 'text-red-600 font-bold' }
  return { text: `+${diff}`, cls: 'text-blue-700 font-bold' }
}

export function holeLabel(hole) {
  return hole.hole_label || String(hole.hole_number)
}

export function medal(rank) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
}

// Side awards on the net leaderboard. Which ones run is set per year in the
// admin panel; the engine decides who holds them and when they become visible,
// and this only draws what it sends.
//
// Colour follows the award type so the same prize looks the same every year even
// after it is renamed.
const AWARD_STYLE = {
  rank_at:        'bg-amber-100 text-amber-900 border-amber-400',
  rank_from_last: 'bg-sky-100 text-sky-900 border-sky-400',
  rank_every:     'bg-violet-100 text-violet-900 border-violet-400',
  big_swing:      'bg-orange-100 text-orange-900 border-orange-400',
  best_scoring:   'bg-lime-100 text-lime-900 border-lime-500',
}
const FALLBACK_STYLE = 'bg-gray-100 text-gray-700 border-gray-300'

// 2026 was archived before awards became configurable, and those snapshots are
// frozen — they carry plain strings where later years carry objects.
const LEGACY = {
  lucky7: { name: 'Lucky 7 獎', emoji: '🍀', type: 'rank_at' },
  bb:     { name: 'BB 獎',      emoji: '🎱', type: 'rank_from_last' },
}

export function AwardBadges({ player }) {
  if (!player.awards?.length) return null
  return (
    <>
      {player.awards.map((raw, i) => {
        const a = typeof raw === 'string' ? LEGACY[raw] : raw
        if (!a?.name) return null
        return (
          <span key={`${a.type}_${i}`}
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${AWARD_STYLE[a.type] || FALLBACK_STYLE}`}>
            {a.emoji ? `${a.emoji} ` : ''}{a.name}
          </span>
        )
      })}
    </>
  )
}

// Badges shown when a tie was resolved (or is still waiting on the playoff).
// A player in the middle of a three-way tie both lost to the player above and
// beat the player below, so both badges show — ↑ first (the player above),
// then ↓ (the player below).
export function TiebreakBadge({ player }) {
  if (player.awaitingPlayoff) {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-amber-950">
        ⛳ 待{player.playoffLabel || '延長賽'}
      </span>
    )
  }
  if (!player.tiebreakLost && !player.tiebreakWon) return null
  return (
    <>
      {player.tiebreakLost && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">
          ↑輸 {player.tiebreakLost}
        </span>
      )}
      {player.tiebreakWon && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
          ↓勝 {player.tiebreakWon}
        </span>
      )}
    </>
  )
}
