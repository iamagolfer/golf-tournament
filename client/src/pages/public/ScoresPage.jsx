import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'

function cellClass(rel) {
  if (rel === null || rel === undefined) return 'bg-gray-100 text-gray-400'
  if (rel <= -2) return 'bg-yellow-300 text-yellow-900'
  if (rel === -1) return 'bg-red-400 text-white'
  if (rel === 0)  return 'bg-gray-50 text-gray-700'
  if (rel === 1)  return 'bg-blue-100 text-blue-900'
  if (rel === 2)  return 'bg-blue-500 text-white'
  return 'bg-gray-700 text-white'
}

function toParDisplay(diff) {
  if (diff === null) return { text: '-', cls: 'text-gray-300' }
  if (diff === 0)    return { text: 'E', cls: 'text-gray-600 font-bold' }
  if (diff < 0)      return { text: String(diff), cls: 'text-red-600 font-bold' }
  return { text: `+${diff}`, cls: 'text-blue-700 font-bold' }
}

export default function ScoresPage() {
  const [groups, setGroups]         = useState([])
  const [players, setPlayers]       = useState([])
  const [holes, setHoles]           = useState([])
  const [sections, setSections]     = useState([])
  const [scores, setScores]         = useState({})
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [cellSaving, setCellSaving] = useState({})
  const [cellError, setCellError]   = useState({})

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    const id = setInterval(loadData, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  async function loadData() {
    const [t, p, s] = await Promise.all([
      api.get('/tournament'), api.get('/players'), api.get('/scores')
    ])
    setSections(t.sections || [])
    setHoles(t.holes || [])
    const grps = p.groups || []
    setGroups(grps)
    setPlayers(p.players || [])
    setActiveGroupId(prev => prev ?? (grps[0]?.id || null))

    const map = {}
    for (const sc of s.scores || []) map[`${sc.player_id}_${sc.hole_id}`] = sc.strokes
    setScores(map)
  }

  function handleChange(playerId, holeId, value) {
    const key = `${playerId}_${holeId}`
    setScores(prev => ({ ...prev, [key]: value === '' ? '' : Number(value) }))
    setCellError(prev => ({ ...prev, [key]: false }))
  }

  async function handleBlur(playerId, holeId, value) {
    const key = `${playerId}_${holeId}`
    const s = Number(value)
    if (!value || isNaN(s) || s < 1 || s > 20) return
    setCellSaving(prev => ({ ...prev, [key]: true }))
    try {
      await api.post('/scores/batch', { playerId, scores: [{ holeId: Number(holeId), strokes: s }] })
    } catch {
      setCellError(prev => ({ ...prev, [key]: true }))
    } finally {
      setCellSaving(prev => ({ ...prev, [key]: false }))
    }
  }

  const activeGroup  = groups.find(g => g.id === activeGroupId) || null
  const groupPlayers = activeGroup ? players.filter(p => p.group_id === activeGroup.id) : []

  // Pre-calculate totals for group scorecard summary column
  const groupStats = groupPlayers.map(player => {
    let gross = 0, toPar = 0, played = 0
    for (const h of holes) {
      const s = scores[`${player.id}_${h.id}`]
      if (s) { gross += s; toPar += s - h.par; played++ }
    }
    return { id: player.id, gross, toPar, played }
  })

  // N = total field size including no-shows (matches official ranking engine)
  const N = players.length

  function lbTiebreak(a, b) {
    if (a.underParCount !== b.underParCount) return b.underParCount - a.underParCount
    if (a.parCount !== b.parCount) return b.parCount - a.parCount
    for (let i = 1; i <= 12; i++) {
      const ac = a.categoryCounts[i] || 0, bc = b.categoryCounts[i] || 0
      if (ac !== bc) return ac - bc
    }
    return 0
  }

  // Leaderboard — all players sorted by net-to-par then tiebreaker
  const leaderboard = (() => {
    let rank = 1
    return players
      .filter(p => !p.no_show)
      .map(player => {
        let gross = 0, parSum = 0, played = 0
        const holeData = holes.map(h => {
          const s = scores[`${player.id}_${h.id}`] || null
          if (s) { gross += s; parSum += h.par; played++ }
          return { holeId: h.id, strokes: s, rel: s ? s - h.par : null }
        })
        const completed = holeData.filter(h => h.strokes !== null)
        const underParCount = completed.filter(h => h.rel <= -1).length
        const parCount = completed.filter(h => h.rel === 0).length
        const categoryCounts = {}
        for (let i = 1; i <= 12; i++) categoryCounts[i] = completed.filter(h => h.rel === i).length
        return { ...player, gross, toPar: gross - parSum - player.handicap, played, holeData, underParCount, parCount, categoryCounts }
      })
      .sort((a, b) => {
        if (a.toPar !== b.toPar) return a.toPar - b.toPar
        return lbTiebreak(a, b)
      })
      .map((player, idx, arr) => {
        if (idx > 0 && (arr[idx].toPar !== arr[idx - 1].toPar || lbTiebreak(arr[idx], arr[idx - 1]) !== 0)) rank = idx + 1
        return { ...player, rank, rankingPoints: N - rank + 1 }
      })
  })()

  return (
    <div className="min-h-screen bg-green-50">
      {/* Header */}
      <div className="bg-green-800 text-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">成績輸入 Score Entry</h1>
            <p className="text-green-200 text-sm">離開格子自動儲存 Auto-saves on exit</p>
          </div>
          <div className="flex gap-2">
            <Link to="/" className="text-green-200 text-sm underline">返回</Link>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          <p>尚未設定分組 No groups set up yet</p>
        </div>
      ) : (
        <div className="py-4 space-y-5">

          {/* Group tabs */}
          <div className="flex gap-2 overflow-x-auto px-3 pb-1">
            {groups.map(g => (
              <button key={g.id} onClick={() => setActiveGroupId(g.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium shadow-sm transition
                  ${activeGroupId === g.id ? 'bg-green-700 text-white' : 'bg-white text-gray-700 hover:bg-green-50'}`}>
                {g.name}
              </button>
            ))}
          </div>

          {/* ── SCROLLABLE GROUP SCORECARD ── */}
          <div className="px-3">
            <p className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">
              {activeGroup?.name} — 直接輸入各洞桿數
            </p>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="border-collapse text-sm" style={{ minWidth: 'max-content' }}>
                  <thead>
                    {/* Section name spans */}
                    <tr className="bg-green-700 text-white text-xs">
                      <th className="sticky left-0 z-20 bg-green-700 px-3 py-2 text-left min-w-[110px]">球員 Player</th>
                      {sections.map((sec, si) => {
                        const sh = holes.filter(h => h.section_id === sec.id)
                        return (
                          <th key={sec.id} colSpan={sh.length}
                            className={`py-2 text-center ${si > 0 ? 'border-l-2 border-green-500' : ''}`}>
                            {sec.name}&nbsp;Par {sh.reduce((s,h)=>s+h.par,0)}
                          </th>
                        )
                      })}
                      <th className="px-3 py-2 text-center border-l-2 border-green-500 min-w-[64px]">合計</th>
                    </tr>
                    {/* Hole numbers + par */}
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="sticky left-0 z-20 bg-gray-50 px-3 py-1.5 text-left">差點</th>
                      {sections.map(sec =>
                        holes.filter(h => h.section_id === sec.id).map((hole, hi) => (
                          <th key={hole.id}
                            className={`py-1.5 text-center min-w-[44px] ${hi === 0 ? 'border-l border-gray-200' : ''}`}>
                            <div className="font-medium text-gray-600">H{hole.hole_number}</div>
                            <div className="text-gray-400">P{hole.par}</div>
                          </th>
                        ))
                      )}
                      <th className="border-l border-gray-200"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupPlayers.map((player, pi) => {
                      const stat = groupStats.find(s => s.id === player.id) || { gross:0, toPar:0, played:0 }
                      const { text: parText, cls: parCls } = toParDisplay(stat.played > 0 ? stat.toPar : null)
                      return (
                        <tr key={player.id} className={pi % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                          <td className={`sticky left-0 z-10 px-3 py-2 min-w-[110px] ${pi % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <div className="font-medium text-gray-900 text-sm leading-tight">{player.chinese_name}</div>
                            <div className="text-xs text-gray-400">{player.english_name} · {player.handicap}差</div>
                          </td>
                          {sections.map(sec =>
                            holes.filter(h => h.section_id === sec.id).map((hole, hi) => {
                              const key = `${player.id}_${hole.id}`
                              const val = scores[key]
                              const rel = val ? val - hole.par : null
                              return (
                                <td key={hole.id}
                                  className={`px-0.5 py-1.5 text-center ${hi === 0 ? 'border-l border-gray-200' : ''}`}>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min="1" max="20"
                                    value={val || ''}
                                    onChange={e => handleChange(player.id, hole.id, e.target.value)}
                                    onBlur={e => handleBlur(player.id, hole.id, e.target.value)}
                                    placeholder="·"
                                    className={`w-[42px] h-[38px] text-center text-sm font-bold rounded
                                      border-0 outline-none focus:ring-2 focus:ring-green-400
                                      ${cellError[key]  ? 'bg-red-100 text-red-700' :
                                        cellSaving[key] ? 'bg-yellow-100' :
                                        cellClass(rel)}`}
                                  />
                                </td>
                              )
                            })
                          )}
                          {/* Summary column */}
                          <td className="px-3 py-2 text-center border-l border-gray-200 min-w-[64px]">
                            {stat.played > 0 ? (
                              <>
                                <div className="text-sm font-bold text-gray-800">{stat.gross}</div>
                                <div className={`text-xs ${parCls}`}>{parText}</div>
                              </>
                            ) : <span className="text-gray-300 text-xs">-</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-1.5 bg-gray-50 border-t text-xs text-gray-400 text-center">
                ← 左右滑動查看全部洞 / Scroll to see all holes →
              </div>
            </div>
          </div>

          {/* ── ALL PLAYERS LEADERBOARD ── */}
          <div className="px-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                所有球員即時排行 Live Leaderboard — 按目前得失桿排序
              </p>
              <button onClick={loadData}
                className="text-xs bg-green-700 text-white px-3 py-1 rounded-full font-medium shadow-sm active:bg-green-900">
                ↻ 更新即時排名
              </button>
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {leaderboard.map((player, idx) => {
                const { text: parText, cls: parCls } = toParDisplay(player.toPar)
                return (
                  <div key={player.id}
                    className={`px-4 py-3 ${idx < leaderboard.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex flex-col items-center flex-shrink-0 w-8">
                          <span className="w-6 h-6 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-xs font-bold">
                            {player.rank}
                          </span>
                          <span className="text-xs text-green-700 font-semibold leading-tight">{player.rankingPoints}分</span>
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-gray-900">{player.chinese_name}</span>
                          <span className="text-xs text-gray-400 ml-1">{player.english_name}</span>
                          <span className="text-xs text-gray-400 ml-1">差點{player.handicap}</span>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-2 flex-shrink-0 ml-3">
                        {player.played > 0 && (
                          <>
                            <span className="text-xs text-gray-400">{player.played}洞</span>
                            <span className="text-xs text-gray-500">{player.gross}桿</span>
                          </>
                        )}
                        <span className={`text-base min-w-[36px] text-right ${parCls}`}>{parText}</span>
                      </div>
                    </div>
                    {/* Hole score dots */}
                    <div className="flex flex-wrap gap-1 pl-8">
                      {player.holeData.map(({ holeId, strokes, rel }) => (
                        <span key={holeId}
                          className={`inline-flex items-center justify-center w-6 h-6 text-xs rounded font-medium ${cellClass(rel)}`}>
                          {strokes || '·'}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Color legend */}
            <div className="flex flex-wrap gap-1.5 mt-2 justify-center text-xs">
              {[
                { cls:'bg-yellow-300 text-yellow-900', label:'老鷹-' },
                { cls:'bg-red-400 text-white',         label:'小鳥' },
                { cls:'bg-gray-100 text-gray-600',     label:'Par' },
                { cls:'bg-blue-100 text-blue-900',     label:'柏忌' },
                { cls:'bg-blue-500 text-white',        label:'雙柏' },
                { cls:'bg-gray-700 text-white',        label:'三柏+' },
              ].map(({ cls, label }) => (
                <span key={label} className={`${cls} px-2 py-0.5 rounded`}>{label}</span>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
