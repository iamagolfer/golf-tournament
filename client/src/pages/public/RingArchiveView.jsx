import { useState, useEffect } from 'react'
import { api } from '../../api'

// A finished Ring Cup year, exactly as it ended.
//
// Read-only by construction: no inputs, no save, no refresh, and no live data —
// everything comes from the frozen snapshot, so it cannot be edited by accident
// and cannot drift when the ranking rules change.
//
// Two views, because only two of them are competitions: handicap-adjusted net
// with ranking points, and the combined total once each player's horse is added.
// Gross is worth knowing but nobody wins on it, so it reads as a number on every
// row rather than taking a tab of its own.

const TABS = [
  { key: 'net', label: '淨桿排名' },
  { key: 'final', label: '最終排名🐴' },
]

function cellClass(rel) {
  if (rel === null || rel === undefined) return 'bg-gray-100 text-gray-400'
  if (rel <= -2) return 'bg-yellow-300 text-yellow-900'
  if (rel === -1) return 'bg-red-400 text-white'
  if (rel === 0) return 'bg-white text-gray-700 border border-gray-200'
  if (rel === 1) return 'bg-blue-200 text-blue-900'
  if (rel === 2) return 'bg-blue-500 text-white'
  return 'bg-gray-700 text-white'
}

const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null)

export default function RingArchiveView({ year }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('final')
  const [openPlayer, setOpenPlayer] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.get(`/archives/${year}`)
      .then(d => { if (!cancelled) { setData(d); if (!d.finalRankings?.length) setTab('net') } })
      .catch(e => { if (!cancelled) setError(e.message || '讀取失敗') })
    return () => { cancelled = true }
  }, [year])

  if (error) return <p className="px-4 py-3 text-sm text-red-600">{error}</p>
  if (!data) return <p className="px-4 py-3 text-sm text-gray-400">載入中...</p>

  const holes = data.holes || []
  const hasFinal = (data.finalRankings || []).length > 0
  const rows = tab === 'final' ? (data.finalRankings || []) : (data.netRankings || [])

  const groupsById = Object.fromEntries((data.groups || []).map(g => [g.id, g]))
  const scored = (data.netRankings || []).filter(p => !p.isNoShow && p.netScore !== null)
  // Group tradition: the bottom six of the final table buy dinner
  const dinnerFrom = hasFinal ? scored.length - 6 : null

  const strokesFor = (player) => {
    const byHole = new Map()
    if (Array.isArray(player.holeAnalysis)) {
      player.holeAnalysis.forEach(h => byHole.set(h.holeId, h.strokes))
    } else {
      (data.scores || []).filter(s => s.player_id === player.id)
        .forEach(s => byHole.set(s.hole_id, s.strokes))
    }
    return holes.map(h => (byHole.has(h.id) ? byHole.get(h.id) : null))
  }

  return (
    <div className="bg-gray-50 border-t border-gray-200">
      <div className="px-3 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500">
            {data.tournament?.date} · {data.tournament?.course_name} · Par {data.parTotal}
          </p>
          <span className="text-[10px] text-gray-400 border border-gray-300 rounded-full px-2 py-0.5">
            🔒 已封存
          </span>
        </div>

        <div className="flex gap-1.5 mb-2">
          {TABS.filter(t => t.key !== 'final' || hasFinal).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition
                ${tab === t.key ? 'bg-green-700 text-white' : 'bg-white text-gray-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden">
          {rows.length === 0 && (
            <p className="px-4 py-6 text-center text-gray-400 text-sm">沒有成績</p>
          )}
          {rows.map((p, idx) => {
            const rank = p.rank
            const isOpen = openPlayer === `${tab}_${p.id}`
            const hasScores = p.grossScore !== null && p.grossScore !== undefined
            const group = groupsById[p.group_id]
            const mates = (data.players || [])
              .filter(m => m.group_id === p.group_id && m.id !== p.id)
              .map(m => [m.chinese_name, m.english_name].filter(Boolean).join(' '))
            const buysDinner = tab === 'final' && dinnerFrom !== null && !p.isNoShow && idx >= dinnerFrom
            const strokes = isOpen ? strokesFor(p) : null

            return (
              <div key={p.id} className={buysDinner ? 'bg-red-50' : ''}>
                <button onClick={() => setOpenPlayer(isOpen ? null : `${tab}_${p.id}`)} disabled={!hasScores}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left disabled:cursor-default">
                  <div className="w-9 text-center flex-shrink-0">
                    {p.isNoShow ? (
                      <span className="text-gray-300 text-xs">未到</span>
                    ) : (
                      <span className="text-base font-bold text-green-800">{medal(rank) || rank}</span>
                    )}
                    {!p.isNoShow && (
                      <div className="text-[10px] text-gray-400">
                        {tab === 'final' ? `${p.totalPoints ?? 0}分` : `${p.rankingPoints ?? 0}分`}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {p.chinese_name || p.english_name}
                      {p.chinese_name && <span className="text-gray-400 text-xs ml-1.5">{p.english_name}</span>}
                    </div>
                    <div className="text-xs text-gray-400">
                      差點 {p.handicap}
                      {hasScores && ` · 總桿 ${p.grossScore}`}
                      {group ? ` · ${group.name}` : ''}
                      {tab === 'final' && p.pickedPlayerName && (
                        <span className="text-green-700"> · 🐴 {p.pickedPlayerName}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    {!hasScores ? (
                      <span className="text-gray-300">-</span>
                    ) : tab === 'net' ? (
                      <>
                        <div className="text-base font-bold text-green-800">{p.netScore}</div>
                        <div className="text-[10px] text-gray-400">淨桿</div>
                      </>
                    ) : (
                      <>
                        <div className="text-base font-bold text-green-800">{p.totalPoints ?? 0}</div>
                        <div className="text-[10px] text-gray-400">
                          自 {p.rankingPoints ?? 0} + 馬 {p.horsePoints ?? 0}
                        </div>
                      </>
                    )}
                  </div>
                  {hasScores && <span className="text-gray-300 text-xs ml-1">{isOpen ? '▲' : '▼'}</span>}
                </button>

                {isOpen && hasScores && (
                  <div className="px-3 pb-3 bg-gray-50">
                    <div className="text-xs text-gray-500 mb-2 space-y-0.5">
                      {group && (
                        <p>
                          <b>{group.name}</b>
                          {mates.length > 0 && <span className="text-gray-400"> · 同組:{mates.join('、')}</span>}
                        </p>
                      )}
                      <p>
                        總桿 {p.grossScore} · 差點 {p.handicap} · 淨桿 {p.netScore}
                        {p.pickedPlayerName && <span> · 選的馬:{p.pickedPlayerName}（{p.horsePoints ?? 0}分）</span>}
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                        <tbody>
                          <tr>
                            <td className="px-1.5 py-1 text-gray-500 sticky left-0 bg-gray-50">洞</td>
                            {holes.map(h => (
                              <td key={h.id} className="px-1 py-1 text-center min-w-[30px] text-gray-500">{h.label}</td>
                            ))}
                            <td className="px-2 py-1 text-gray-500">總</td>
                          </tr>
                          <tr>
                            <td className="px-1.5 py-1 text-gray-400 sticky left-0 bg-gray-50">Par</td>
                            {holes.map(h => (
                              <td key={h.id} className="px-1 py-1 text-center text-gray-400">{h.par}</td>
                            ))}
                            <td className="px-2 py-1 text-gray-400">{data.parTotal}</td>
                          </tr>
                          <tr>
                            <td className="px-1.5 py-1 text-gray-700 font-medium sticky left-0 bg-gray-50">桿數</td>
                            {holes.map((h, i) => {
                              const s = strokes?.[i] ?? null
                              return (
                                <td key={h.id} className="p-0.5">
                                  <div className={`w-7 h-7 flex items-center justify-center rounded font-bold ${cellClass(s === null ? null : s - h.par)}`}>
                                    {s ?? '-'}
                                  </div>
                                </td>
                              )
                            })}
                            <td className="px-2 py-1 font-bold text-gray-900">{p.grossScore}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-400 text-center mt-1.5">← 左右滑動查看全部洞 →</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {tab === 'final' && dinnerFrom !== null && (
          <p className="text-xs text-red-500 text-center mt-2">紅底為當年墊底 6 位（請客）</p>
        )}
      </div>
    </div>
  )
}
