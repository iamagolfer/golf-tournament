import { useState, useEffect, useRef } from 'react'
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

const TB_LABELS = ['低標桿洞','標準桿洞','柏忌洞','雙柏忌洞','三柏忌洞','四柏忌洞','五柏忌洞','六柏忌洞','七柏忌洞','八柏忌洞','九柏忌洞','十柏忌洞','十一柏忌洞','十二柏忌洞']

function getTiebreakReason(winner, loser) {
  if ((winner.underParCount||0) !== (loser.underParCount||0)) return TB_LABELS[0]
  if ((winner.parCount||0) !== (loser.parCount||0)) return TB_LABELS[1]
  for (let i = 1; i <= 12; i++) {
    const wc = winner.categoryCounts?.[i]||0, lc = loser.categoryCounts?.[i]||0
    if (wc !== lc) return TB_LABELS[i+1]
  }
  return null
}

function lbTiebreak(a, b) {
  if (a.underParCount !== b.underParCount) return b.underParCount - a.underParCount
  if (a.parCount !== b.parCount) return b.parCount - a.parCount
  for (let i = 1; i <= 12; i++) {
    const ac = a.categoryCounts[i] || 0, bc = b.categoryCounts[i] || 0
    if (ac !== bc) return ac - bc
  }
  return 0
}


export default function ScoresPage() {
  const [groups, setGroups]             = useState([])
  const [players, setPlayers]           = useState([])
  const [holes, setHoles]               = useState([])
  const [sections, setSections]         = useState([])
  const [scores, setScores]             = useState({})
  const [status, setStatus]             = useState('setup')
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [cellSaving, setCellSaving]     = useState({})
  const [cellError, setCellError]       = useState({})
  const [cellSaved, setCellSaved]       = useState({})
  const [lbView, setLbView]             = useState('net')
  const savedScoresRef                  = useRef({}) // tracks what is actually saved on server

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    // Skip refresh if scorer is actively typing in a cell
    function smartRefresh() {
      if (document.activeElement?.tagName === 'INPUT') return
      loadData()
    }
    const id = setInterval(smartRefresh, 60 * 1000)
    return () => clearInterval(id)
  }, [])

  async function loadData() {
    const [t, p, s] = await Promise.all([
      api.get('/tournament'), api.get('/players'), api.get('/scores')
    ])
    const freshSections = t.sections || []
    const freshHoles    = t.holes    || []
    const freshGroups   = p.groups   || []
    const freshPlayers  = p.players  || []

    const freshScoreMap = {}
    for (const sc of s.scores || []) freshScoreMap[`${sc.player_id}_${sc.hole_id}`] = sc.strokes
    savedScoresRef.current = freshScoreMap // snapshot of what server has

    setSections(freshSections)
    setHoles(freshHoles)
    setGroups(freshGroups)
    setPlayers(freshPlayers)
    setStatus(t.tournament?.status || 'setup')
    setActiveGroupId(prev => prev ?? (freshGroups[0]?.id || null))
    setScores(freshScoreMap)

  }

  function handleChange(playerId, holeId, value) {
    const key = `${playerId}_${holeId}`
    setScores(prev => ({ ...prev, [key]: value === '' ? '' : Number(value) }))
    setCellError(prev => ({ ...prev, [key]: false }))
  }

  async function handleBlur(playerId, holeId, value) {
    const key = `${playerId}_${holeId}`

    if (value === '' || value === null || value === undefined) {
      // Only send delete if a score was actually saved on the server for this cell
      if (savedScoresRef.current[key] === undefined) return
      setCellSaving(prev => ({ ...prev, [key]: true }))
      try {
        await api.post('/scores/batch', { playerId, scores: [{ holeId: Number(holeId), strokes: 0 }] })
        setScores(prev => { const next = { ...prev }; delete next[key]; return next })
        delete savedScoresRef.current[key] // server no longer has this score
      } catch {
        setCellError(prev => ({ ...prev, [key]: true }))
      } finally {
        setCellSaving(prev => ({ ...prev, [key]: false }))
      }
      return
    }

    const s = Number(value)
    if (isNaN(s) || s < 1 || s > 20) return
    setCellSaving(prev => ({ ...prev, [key]: true }))
    try {
      await api.post('/scores/batch', { playerId, scores: [{ holeId: Number(holeId), strokes: s }] })
      savedScoresRef.current[key] = s // server now has this score
      setCellSaved(prev => ({ ...prev, [key]: true }))
      setTimeout(() => setCellSaved(prev => { const n = { ...prev }; delete n[key]; return n }), 900)
    } catch {
      setCellError(prev => ({ ...prev, [key]: true }))
    } finally {
      setCellSaving(prev => ({ ...prev, [key]: false }))
    }
  }

  // Only count holes from active sections
  const activeSections   = sections.filter(s => s.active !== 0)
  const activeSectionIds = new Set(activeSections.map(s => s.id))
  const activeHoles      = holes.filter(h => activeSectionIds.has(h.section_id))

  const activeGroup  = groups.find(g => g.id === activeGroupId) || null
  const groupPlayers = activeGroup ? players.filter(p => p.group_id === activeGroup.id) : []

  const groupStats = groupPlayers.map(player => {
    let gross = 0, toPar = 0, played = 0
    for (const h of activeHoles) {
      const s = scores[`${player.id}_${h.id}`]
      if (s) { gross += s; toPar += s - h.par; played++ }
    }
    return { id: player.id, gross, toPar, played }
  })

  const N = players.length

  // Shared stats — computed once, used by both leaderboard views
  const playerStats = players
    .filter(p => !p.no_show)
    .map(player => {
      let gross = 0, parSum = 0, played = 0
      const holeData = activeHoles.map(h => {
        const s = scores[`${player.id}_${h.id}`] || null
        if (s) { gross += s; parSum += h.par; played++ }
        return { holeId: h.id, sectionId: h.section_id, strokes: s, rel: s ? s - h.par : null }
      })
      const completed     = holeData.filter(h => h.strokes !== null)
      const underParCount = completed.filter(h => h.rel <= -1).length
      const parCount      = completed.filter(h => h.rel === 0).length
      const categoryCounts = {}
      for (let i = 1; i <= 12; i++) categoryCounts[i] = completed.filter(h => h.rel === i).length
      return { ...player, gross, parSum, played, holeData, underParCount, parCount, categoryCounts,
        toPar: gross - parSum - player.handicap,
        vsParGross: gross - parSum,
      }
    })

  // View 1: net leaderboard (handicap-adjusted)
  const leaderboard = (() => {
    let rank = 1
    return [...playerStats]
      .sort((a, b) => a.toPar !== b.toPar ? a.toPar - b.toPar : lbTiebreak(a, b))
      .map((player, idx, arr) => {
        if (idx > 0 && (arr[idx].toPar !== arr[idx-1].toPar || lbTiebreak(arr[idx], arr[idx-1]) !== 0)) rank = idx + 1
        const above = arr[idx - 1], below = arr[idx + 1]
        let tbWon = false, tbReason = null
        if (above && above.toPar === player.toPar) {
          tbReason = getTiebreakReason(above, player)
        } else if (below && below.toPar === player.toPar) {
          tbWon = true; tbReason = getTiebreakReason(player, below)
        }
        return { ...player, rank, rankingPoints: N - rank + 1, tbWon, tbReason }
      })
  })()

  // View 2: stroke leaderboard (traditional, no handicap — fewest over par wins)
  const strokeLeaderboard = (() => {
    let rank = 1
    return [...playerStats]
      .sort((a, b) => {
        if (a.played === 0 && b.played === 0) return 0
        if (a.played === 0) return 1
        if (b.played === 0) return -1
        return a.vsParGross - b.vsParGross
      })
      .map((player, idx, arr) => {
        if (idx > 0) {
          const prev = arr[idx - 1]
          const tied = player.played > 0 && prev.played > 0 && player.vsParGross === prev.vsParGross
          if (!tied) rank = idx + 1
        }
        return { ...player, rank }
      })
  })()

  const activeLeaderboard = lbView === 'net' ? leaderboard : strokeLeaderboard

  return (
    <div className="min-h-screen bg-green-50">
      {/* Header */}
      <div className="bg-green-800 text-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">成績輸入 Score Entry</h1>
            <p className="text-green-200 text-sm">離開格子自動儲存 Auto-saves on exit</p>
          </div>
          <Link to="/" className="text-green-200 text-sm underline">返回主選單</Link>
        </div>
      </div>

      {status === 'finished' && (
        <div className="bg-blue-700 text-white text-center py-2 px-4 text-sm font-medium">
          🏆 比賽已結束，成績已鎖定。如需修改請聯絡管理員。
        </div>
      )}

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
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                {activeGroup?.name} — 直接輸入各洞桿數
              </p>
              <button onClick={loadData}
                className="flex items-center gap-1.5 bg-green-700 hover:bg-green-800 active:bg-green-900 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-sm">
                ↻ 重新整理成績
              </button>
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="border-collapse text-sm" style={{ minWidth: 'max-content' }}>
                  <thead>
                    <tr className="bg-green-700 text-white text-xs">
                      <th className="sticky left-0 z-20 bg-green-700 px-3 py-2 text-left min-w-[110px]">球員 Player</th>
                      {activeSections.map((sec, si) => {
                        const sh = activeHoles.filter(h => h.section_id === sec.id)
                        return (
                          <th key={sec.id} colSpan={sh.length}
                            className={`py-2 text-center ${si > 0 ? 'border-l-2 border-green-500' : ''}`}>
                            {sec.name}&nbsp;Par {sh.reduce((s,h)=>s+h.par,0)}
                          </th>
                        )
                      })}
                      <th className="px-3 py-2 text-center border-l-2 border-green-500 min-w-[64px]">合計</th>
                    </tr>
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="sticky left-0 z-20 bg-gray-50 px-3 py-1.5 text-left">差點</th>
                      {activeSections.map(sec =>
                        activeHoles.filter(h => h.section_id === sec.id).map((hole, hi) => (
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
                          {activeSections.map(sec =>
                            activeHoles.filter(h => h.section_id === sec.id).map((hole, hi) => {
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
                                    disabled={status === 'finished'}
                                    onChange={e => handleChange(player.id, hole.id, e.target.value)}
                                    onBlur={e => handleBlur(player.id, hole.id, e.target.value)}
                                    placeholder="·"
                                    className={`w-[42px] h-[38px] text-center text-sm font-bold rounded
                                      border-0 outline-none focus:ring-2 focus:ring-green-400
                                      transition-colors duration-500
                                      ${status === 'finished' ? 'opacity-60 cursor-not-allowed' :
                                        cellError[key]  ? 'bg-red-200 text-red-700' :
                                        cellSaving[key] ? 'bg-yellow-100 text-yellow-700' :
                                        cellSaved[key]  ? 'bg-green-200 text-green-800' :
                                        cellClass(rel)}`}
                                  />
                                </td>
                              )
                            })
                          )}
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
            {/* View toggle tabs */}
            <div className="flex gap-2 mb-2">
              <button onClick={() => setLbView('net')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition
                  ${lbView === 'net' ? 'bg-green-700 text-white shadow-sm' : 'bg-white text-gray-500 hover:bg-green-50 shadow-sm'}`}>
                🏅 淨桿排名（差點）
              </button>
              <button onClick={() => setLbView('stroke')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition
                  ${lbView === 'stroke' ? 'bg-green-700 text-white shadow-sm' : 'bg-white text-gray-500 hover:bg-green-50 shadow-sm'}`}>
                ⛳ 總桿排名（傳統）
              </button>
            </div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                {lbView === 'net' ? '淨桿即時排行 Net Leaderboard' : '總桿即時排行 Stroke Leaderboard'}
              </p>
              <button onClick={loadData}
                className="text-xs bg-green-700 text-white px-3 py-1 rounded-full font-medium shadow-sm active:bg-green-900">
                ↻ 更新即時排名
              </button>
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {activeLeaderboard.map((player, idx) => {
                const netDisplay   = toParDisplay(player.played > 0 ? player.toPar : null)
                const grossDisplay = toParDisplay(player.played > 0 ? player.vsParGross : null)
                return (
                  <div key={player.id}
                    className={`px-4 py-3 ${idx < activeLeaderboard.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Rank badge */}
                        <div className="flex flex-col items-center flex-shrink-0 w-10">
                          {player.rank === 1 ? (
                            <span className="text-2xl leading-none">🥇</span>
                          ) : player.rank === 2 ? (
                            <span className="text-2xl leading-none">🥈</span>
                          ) : player.rank === 3 ? (
                            <span className="text-2xl leading-none">🥉</span>
                          ) : (
                            <span className="w-6 h-6 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-xs font-bold">
                              {player.rank}
                            </span>
                          )}
                          {lbView === 'net' && (
                            <span className="text-xs text-green-700 font-semibold leading-tight">{player.rankingPoints}分</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">{player.chinese_name}</span>
                            <span className="text-xs text-gray-400">{player.english_name}</span>
                            <span className="text-xs text-gray-400">差點{player.handicap}</span>
                            {player.played > 0 && (
                              <span className="text-xs text-gray-500">{player.played}洞花{player.gross - player.parSum}桿</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-2 flex-shrink-0 ml-3">
                        {player.played > 0 && (
                          <span className="text-xs text-gray-500">總桿{player.gross}</span>
                        )}
                        {lbView === 'net' ? (
                          <>
                            <span className={`text-base min-w-[36px] text-right ${netDisplay.cls}`}>淨桿{netDisplay.text}</span>
                            {player.tbReason && (
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap
                                ${player.tbWon ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {player.tbWon ? '勝' : '輸'}{player.tbReason}#
                              </span>
                            )}
                          </>
                        ) : (
                          <span className={`text-base min-w-[36px] text-right ${grossDisplay.cls}`}>{grossDisplay.text}</span>
                        )}
                      </div>
                    </div>
                    {/* Hole score dots grouped by section */}
                    <div className="pl-10 space-y-1">
                      {activeSections.map(sec => {
                        const secHoles  = player.holeData.filter(h => h.sectionId === sec.id)
                        const secTotal  = secHoles.reduce((sum, h) => sum + (h.strokes || 0), 0)
                        const secPlayed = secHoles.filter(h => h.strokes).length
                        return (
                          <div key={sec.id} className="flex items-center gap-1">
                            {secHoles.map(({ holeId, strokes, rel }) => (
                              <span key={holeId}
                                className={`inline-flex items-center justify-center w-6 h-6 text-xs rounded font-medium ${cellClass(rel)}`}>
                                {strokes || '·'}
                              </span>
                            ))}
                            <span className="ml-1 text-xs font-semibold text-gray-500 min-w-[24px]">
                              {secPlayed > 0 ? secTotal : '-'}
                            </span>
                          </div>
                        )
                      })}
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
