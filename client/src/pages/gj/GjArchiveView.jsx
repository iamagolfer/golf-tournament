import { useState, useEffect } from 'react'
import { gjApi } from '../../api'
import { GJ, PlayerName, cellClass, toParDisplay, medal, TiebreakBadge, AwardBadges } from './gjTheme'

// A finished year, exactly as it ended.
//
// Deliberately its own component rather than a flag on the scores page: there is
// no input, no save, no refresh, and nothing here reads live data — everything
// comes from the frozen snapshot, so this cannot be edited by accident and
// cannot drift when the ranking rules change.
export default function GjArchiveView({ year }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('net')
  const [openPlayer, setOpenPlayer] = useState(null)

  useEffect(() => {
    let cancelled = false
    gjApi.get(`/archives/${year}`)
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e.message || '讀取失敗') })
    return () => { cancelled = true }
  }, [year])

  if (error) return <p className="px-4 py-4 text-sm text-red-600">{error}</p>
  if (!data) return <p className="px-4 py-4 text-sm text-gray-400">載入中...</p>

  const holes = data.holes || []
  const rows = tab === 'net' ? (data.netRankings || []) : (data.grossRankings || [])
  const groupsById = Object.fromEntries((data.groups || []).map(g => [g.id, g]))
  const strokesFor = (player) => {
    // The snapshot keeps rankings in play order already; fall back to raw rows
    if (Array.isArray(player.strokesInPlayOrder)) return player.strokesInPlayOrder
    const mine = (data.scores || []).filter(s => s.player_id === player.id)
    const byHole = new Map(mine.map(s => [s.hole_id, s.strokes]))
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

        {/* Same two views as the live leaderboard */}
        <div className="flex gap-2 mb-2">
          <button onClick={() => setTab('net')}
            className={`flex-1 px-2 py-2 rounded-lg text-xs leading-tight font-medium transition
              ${tab === 'net' ? GJ.tabActive : 'bg-white text-gray-600'}`}>
            🏅 綠夾克淨桿排名（差點）
          </button>
          <button onClick={() => setTab('gross')}
            className={`flex-1 px-2 py-2 rounded-lg text-xs leading-tight font-medium transition
              ${tab === 'gross' ? GJ.tabActive : 'bg-white text-gray-600'}`}>
            ⛳ 總桿排名
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden">
          {rows.length === 0 && (
            <p className="px-4 py-6 text-center text-gray-400 text-sm">沒有成績</p>
          )}
          {rows.map(p => {
            const rank = tab === 'net' ? p.rank : p.grossRank
            const isOpen = openPlayer === p.id
            const hasScores = p.grossScore !== null && p.grossScore !== undefined
            const group = groupsById[p.group_id]
            const mates = (data.players || [])
              .filter(m => m.group_id === p.group_id && m.id !== p.id)
              .map(m => m.chinese_name || m.english_name)
            const strokes = isOpen ? strokesFor(p) : null

            return (
              <div key={p.id}>
                <button onClick={() => setOpenPlayer(isOpen ? null : p.id)} disabled={!hasScores}
                  className="w-full flex items-center gap-3 px-3 py-3 text-left disabled:cursor-default">
                  <div className="w-10 text-center flex-shrink-0">
                    {p.isNoShow ? (
                      <span className="text-gray-300 text-xs">未到</span>
                    ) : (
                      <span className="text-lg font-bold text-emerald-900">{medal(rank) || rank}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <PlayerName player={p} showWildcard={data.showWildcard !== false} />
                      {tab === 'net' && <TiebreakBadge player={p} />}
                      {tab === 'net' && <AwardBadges player={p} />}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      差點 {p.handicap}
                      {group ? ` · ${group.name}` : ''}
                      {p.holesPlayed > 0 && ` · ${p.holesPlayed}/${p.totalHoles ?? holes.length} 洞`}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {!hasScores ? (
                      <span className="text-gray-300">-</span>
                    ) : tab === 'net' ? (
                      <>
                        <div className="text-lg font-bold text-emerald-900">{p.netScore}</div>
                        <div className="text-xs text-gray-400">總桿 {p.grossScore}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-bold text-emerald-900">{p.grossScore}</div>
                        <div className={`text-xs ${toParDisplay(p.toPar).cls}`}>{toParDisplay(p.toPar).text}</div>
                      </>
                    )}
                  </div>
                  {hasScores && <span className="text-gray-300 text-xs ml-1">{isOpen ? '▲' : '▼'}</span>}
                </button>

                {isOpen && hasScores && (
                  <div className="px-3 pb-3 bg-gray-50">
                    {group && (
                      <p className="text-xs text-gray-500 mb-2">
                        <b>{group.name}</b>
                        {mates.length > 0 && <span className="text-gray-400"> · 同組:{mates.join('、')}</span>}
                      </p>
                    )}
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
                    <p className="text-xs text-gray-400 text-center mt-1.5">
                      ← 左右滑動查看全部洞 →
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
