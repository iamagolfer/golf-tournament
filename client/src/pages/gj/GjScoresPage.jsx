import { useState, useEffect, useRef } from 'react'
import { gjApi } from '../../api'
import { GJ, GjHeader, GjNav, PlayerName, cellClass, toParDisplay, holeLabel, medal, TiebreakBadge, AwardBadges } from './gjTheme'

export default function GjScoresPage() {
  document.title = '綠夾克盃 — 輸入成績'
  const [tournament, setTournament] = useState(null)
  const [groups, setGroups] = useState([])
  const [players, setPlayers] = useState([])
  const [holes, setHoles] = useState([])
  const [sections, setSections] = useState([])
  const [scores, setScores] = useState({})
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [cellSaving, setCellSaving] = useState({})
  const [cellError, setCellError] = useState({})
  const [cellSaved, setCellSaved] = useState({})
  const [lbView, setLbView] = useState('net')
  const [netRankings, setNetRankings] = useState([])
  const [grossRankings, setGrossRankings] = useState([])
  const [showWildcard, setShowWildcard] = useState(true)
  const savedScoresRef = useRef({})

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    // Don't yank the page out from under a scorer who is mid-entry
    function smartRefresh() {
      if (document.activeElement?.tagName === 'INPUT') return
      loadData()
    }
    const id = setInterval(smartRefresh, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  async function loadData() {
    const [t, p, s, r] = await Promise.all([
      gjApi.get('/tournament'), gjApi.get('/players'), gjApi.get('/scores'), gjApi.get('/rankings'),
    ])
    const map = {}
    for (const sc of s.scores || []) map[`${sc.player_id}_${sc.hole_id}`] = sc.strokes
    savedScoresRef.current = map

    setTournament(t.tournament)
    setSections(t.sections || [])
    setHoles(t.holes || [])
    setGroups(p.groups || [])
    setPlayers(p.players || [])
    setActiveGroupId(prev => prev ?? (p.groups?.[0]?.id || null))
    setScores(map)
    applyRankings(r)
  }

  async function loadRankings() {
    applyRankings(await gjApi.get('/rankings'))
  }

  function applyRankings(r) {
    setNetRankings(r.netRankings || [])
    setGrossRankings(r.grossRankings || [])
    setShowWildcard(r.showWildcard !== false)
  }

  function handleChange(playerId, holeId, value) {
    const key = `${playerId}_${holeId}`
    setScores(prev => ({ ...prev, [key]: value === '' ? '' : Number(value) }))
    setCellError(prev => ({ ...prev, [key]: false }))
  }

  async function handleBlur(playerId, holeId, value) {
    const key = `${playerId}_${holeId}`

    // Clearing a cell deletes the score (strokes:0 is the delete signal)
    if (value === '' || value === null || value === undefined) {
      if (savedScoresRef.current[key] === undefined) return
      setCellSaving(prev => ({ ...prev, [key]: true }))
      try {
        await gjApi.post('/scores/batch', { playerId, scores: [{ holeId: Number(holeId), strokes: 0 }] })
        setScores(prev => { const next = { ...prev }; delete next[key]; return next })
        delete savedScoresRef.current[key]
        loadRankings()
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
      await gjApi.post('/scores/batch', { playerId, scores: [{ holeId: Number(holeId), strokes: s }] })
      savedScoresRef.current[key] = s
      setCellSaved(prev => ({ ...prev, [key]: true }))
      setTimeout(() => setCellSaved(prev => { const n = { ...prev }; delete n[key]; return n }), 900)
      loadRankings()
    } catch {
      setCellError(prev => ({ ...prev, [key]: true }))
    } finally {
      setCellSaving(prev => ({ ...prev, [key]: false }))
    }
  }

  const activeSections = sections.filter(s => s.active !== 0)
  const activeSectionIds = new Set(activeSections.map(s => s.id))
  const activeHoles = holes.filter(h => activeSectionIds.has(h.section_id))
  const activeGroup = groups.find(g => g.id === activeGroupId) || null
  const groupPlayers = activeGroup ? players.filter(p => p.group_id === activeGroup.id) : []
  const status = tournament?.status || 'setup'
  const leaderboard = lbView === 'net' ? netRankings : grossRankings

  return (
    <div className={`min-h-screen ${GJ.pageBg}`}>
      <GjHeader
        title="成績輸入 Score Entry"
        subtitle="離開格子自動儲存 Auto-saves on exit"
        tournamentName={tournament?.name}
      />
      <GjNav current="/greenjacket/scores" />

      {status === 'finished' && (
        <div className="bg-emerald-800 text-white text-center py-2 px-4 text-sm font-medium">
          🏆 比賽已結束，成績已鎖定。如需修改請聯絡管理員。
        </div>
      )}

      {groups.length === 0 ? (
        <div className="p-6 text-center text-gray-500">尚未設定分組 No groups set up yet</div>
      ) : (
        <div className="py-3 space-y-5">

          {/* Group tabs */}
          <div className="flex gap-2 overflow-x-auto px-3 pb-1">
            {groups.map(g => (
              <button key={g.id} onClick={() => setActiveGroupId(g.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium shadow-sm transition
                  ${activeGroupId === g.id ? GJ.tabActive : GJ.tabIdle}`}>
                {g.name}
              </button>
            ))}
          </div>

          {/* Scorecard */}
          <div className="px-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                {activeGroup?.name} — 直接輸入各洞桿數
              </p>
              <button onClick={loadData}
                className={`${GJ.button} text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-sm`}>
                ↻ 重新整理成績
              </button>
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="border-collapse text-sm" style={{ minWidth: 'max-content' }}>
                  <thead>
                    <tr className="bg-emerald-800 text-white text-xs">
                      <th className="sticky left-0 z-20 bg-emerald-800 px-3 py-2 text-left min-w-[110px]">球員 Player</th>
                      {activeSections.map((sec, si) => {
                        const sh = activeHoles.filter(h => h.section_id === sec.id)
                        return (
                          <th key={sec.id} colSpan={sh.length}
                            className={`py-2 text-center ${si > 0 ? 'border-l-2 border-amber-400' : ''}`}>
                            {sec.name}&nbsp;Par {sh.reduce((s, h) => s + h.par, 0)}
                          </th>
                        )
                      })}
                      <th className="px-3 py-2 text-center border-l-2 border-amber-400 min-w-[64px]">合計</th>
                    </tr>
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="sticky left-0 z-20 bg-gray-50 px-3 py-1.5 text-left">差點</th>
                      {activeSections.map(sec =>
                        activeHoles.filter(h => h.section_id === sec.id).map((hole, hi) => (
                          <th key={hole.id}
                            className={`py-1.5 text-center min-w-[44px] ${hi === 0 ? 'border-l border-gray-200' : ''}`}>
                            <div className="font-medium text-gray-600">{holeLabel(hole)}</div>
                            <div className="text-gray-400">P{hole.par}</div>
                          </th>
                        ))
                      )}
                      <th className="border-l border-gray-200"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupPlayers.map(player => {
                      let gross = 0, toPar = 0, played = 0
                      for (const h of activeHoles) {
                        const s = scores[`${player.id}_${h.id}`]
                        if (s) { gross += s; toPar += s - h.par; played++ }
                      }
                      return (
                        <tr key={player.id} className="border-t border-gray-100">
                          <td className="sticky left-0 z-10 bg-white px-3 py-2">
                            <div className="leading-tight">
                              <div className="font-medium text-gray-900 text-sm truncate">
                                {player.chinese_name || player.english_name}
                              </div>
                              <div className="text-xs text-gray-400">
                                {player.chinese_name ? player.english_name + ' · ' : ''}差點 {player.handicap}
                                {showWildcard && player.wildcard ? ' · 外卡' : ''}
                              </div>
                            </div>
                          </td>
                          {activeSections.map(sec =>
                            activeHoles.filter(h => h.section_id === sec.id).map((hole, hi) => {
                              const key = `${player.id}_${hole.id}`
                              const val = scores[key]
                              const rel = val ? val - hole.par : null
                              return (
                                <td key={hole.id} className={`p-0.5 ${hi === 0 ? 'border-l border-gray-200' : ''}`}>
                                  <input
                                    type="number" inputMode="numeric" min="1" max="20"
                                    value={val ?? ''}
                                    onChange={e => handleChange(player.id, hole.id, e.target.value)}
                                    onBlur={e => handleBlur(player.id, hole.id, e.target.value)}
                                    className={`w-11 h-10 text-center rounded font-bold outline-none
                                      focus:ring-2 focus:ring-amber-500
                                      ${cellError[key] ? 'bg-red-200 text-red-900' : cellClass(rel)}
                                      ${cellSaving[key] ? 'opacity-50' : ''}
                                      ${cellSaved[key] ? 'ring-2 ring-emerald-500' : ''}`}
                                  />
                                </td>
                              )
                            })
                          )}
                          <td className="px-3 py-2 text-center border-l border-gray-200">
                            <div className="font-bold text-gray-900">{played ? gross : '-'}</div>
                            <div className={`text-xs ${toParDisplay(played ? toPar : null).cls}`}>
                              {toParDisplay(played ? toPar : null).text}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Live leaderboard */}
          <div className="px-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">即時排名</p>
              <button onClick={loadRankings}
                className={`${GJ.button} text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-sm`}>
                ↻ 更新即時排名
              </button>
            </div>

            <div className="flex gap-2 mb-2">
              {/* Long label — text-xs and tight leading keep both tabs on one
                  line at 375px instead of one wrapping and both growing tall */}
              <button onClick={() => setLbView('net')}
                className={`flex-1 px-2 py-2 rounded-lg text-xs leading-tight font-medium transition
                  ${lbView === 'net' ? GJ.tabActive : 'bg-white text-gray-600'}`}>
                🏅 即時綠夾克淨桿排名（差點）
              </button>
              <button onClick={() => setLbView('gross')}
                className={`flex-1 px-2 py-2 rounded-lg text-xs leading-tight font-medium transition
                  ${lbView === 'gross' ? GJ.tabActive : 'bg-white text-gray-600'}`}>
                ⛳ 即時總桿排名
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
              {leaderboard.length === 0 && (
                <p className="px-4 py-6 text-center text-gray-400 text-sm">尚無成績</p>
              )}
              {leaderboard.map(p => {
                const rank = lbView === 'net' ? p.rank : p.grossRank
                return (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="w-9 text-center flex-shrink-0">
                      {p.isNoShow ? (
                        <span className="text-gray-300 text-xs">未到</span>
                      ) : (
                        <span className="font-bold text-emerald-900">{medal(rank) || rank}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <PlayerName player={p} showWildcard={showWildcard} />
                        {lbView === 'net' && <TiebreakBadge player={p} />}
                        {lbView === 'net' && <AwardBadges player={p} />}
                      </div>
                      <div className="text-xs text-gray-400">
                        差點 {p.handicap}
                        {p.holesPlayed > 0 && ` · 打完 ${p.holesPlayed}/${p.totalHoles} 洞`}
                        {p.inProgress && <span className="text-amber-600 font-medium"> · 進行中</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {p.grossScore === null ? (
                        <span className="text-gray-300 text-sm">-</span>
                      ) : lbView === 'net' ? (
                        <>
                          {/* Provisional while the round is unfinished */}
                          <div className={`font-bold ${p.inProgress ? 'text-gray-400' : 'text-emerald-900'}`}>
                            {p.inProgress ? `暫 ${p.netScore}` : `淨桿 ${p.netScore}`}
                          </div>
                          <div className="text-xs text-gray-400">總桿 {p.grossScore}</div>
                        </>
                      ) : (
                        <>
                          <div className="font-bold text-emerald-900">{p.grossScore}</div>
                          <div className={`text-xs ${toParDisplay(p.toPar).cls}`}>{toParDisplay(p.toPar).text}</div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-400 text-center mt-2 mb-6">
              完賽者排在未完賽者之前 · 每 10 分鐘自動更新
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
