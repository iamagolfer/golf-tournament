import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../../api'

const STATUS_LABELS = {
  setup:    { zh: '準備階段',   en: 'Setup',              color: 'bg-gray-200 text-gray-700' },
  picking:  { zh: '選馬開放中', en: 'Horse Picking Open', color: 'bg-yellow-200 text-yellow-800' },
  playing:  { zh: '比賽進行中', en: 'Game In Progress',   color: 'bg-green-200 text-green-800' },
  revealed: { zh: '選馬已公布', en: 'Picks Revealed',     color: 'bg-purple-200 text-purple-800' },
  finished: { zh: '比賽結束',   en: 'Finished',           color: 'bg-blue-200 text-blue-800' },
}

const ADMIN_LINKS = [
  { path: '/admin/tournament', icon: '🏌️', zh: '賽事設定', en: 'Tournament Setup' },
  { path: '/admin/course',     icon: '⛳', zh: '球場設定', en: 'Course Setup' },
  { path: '/admin/rules',      icon: '📋', zh: '賽規文字', en: 'Tournament Rules' },
  { path: '/admin/players',    icon: '👥', zh: '球員名單', en: 'Player List' },
  { path: '/admin/groups',     icon: '🏆', zh: '分組 & 開賽', en: 'Groups & Start Game' },
]

// PIN formula: abs(handicap), first digit + (h-1 zero-padded to 2 digits) + last digit
// e.g. 14 → 1+13+4 = 1134, 5 → 5+04+5 = 5045, -4 → 4+03+4 = 4034
function computeAutoPin(handicap) {
  const h = Math.abs(Number(handicap))
  const s = String(h)
  const first = s[0]
  const last  = s.length === 1 ? s[0] : s[s.length - 1]
  const mid   = String(h - 1).padStart(2, '0')
  return first + mid + last
}

export default function Dashboard({ onLogout }) {
  const [tournament, setTournament]   = useState(null)
  const [players, setPlayers]         = useState([])
  const [picks, setPicks]             = useState([])
  const [groups, setGroups]           = useState([])
  const [showPicks, setShowPicks]     = useState(false)
  const [copied, setCopied]           = useState(false)

  // Debug section state
  const [showDebug, setShowDebug]     = useState(false)
  const [debugTab, setDebugTab]       = useState('pins')

  // Debug — PIN section
  const [pinMode, setPinMode]         = useState('auto')
  const [pinText, setPinText]         = useState('')
  const [pinStatus, setPinStatus]     = useState('')
  const [pinLoading, setPinLoading]   = useState(false)

  // Debug — Self-pick section
  const [pickSelfStatus, setPickSelfStatus] = useState('')
  const [pickSelfLoading, setPickSelfLoading] = useState(false)

  // Debug — Score section
  const [scoreMode, setScoreMode]     = useState('all')
  const [scoreAll, setScoreAll]       = useState('')
  const [sectionInputs, setSectionInputs] = useState({})
  const [groupInputs, setGroupInputs] = useState({})
  const [scoreStatus, setScoreStatus] = useState('')
  const [scoreLoading, setScoreLoading] = useState(false)
  const [debugSections, setDebugSections] = useState([])

  const navigate = useNavigate()

  useEffect(() => {
    function load() {
      Promise.all([api.get('/tournament'), api.get('/players')]).then(([t, p]) => {
        setTournament(t.tournament)
        setPlayers(p.players || [])
        setPicks(p.picks || [])
        setGroups(p.groups || [])
      })
    }
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [])

  async function handleLogout() {
    await api.post('/auth/logout', {})
    onLogout()
    navigate('/admin')
  }

  async function handleCopyLink() {
    const url = window.location.origin
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('複製此連結 Copy this link:', url)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleSoftReset() {
    if (!window.confirm(
      '【保留設定，清除比賽資料】\n\n保留：球場、日期、規則、球員名單\n清除：成績、選馬、分組、出席狀態\n\nKeep setup & players, clear scores/picks/groups?'
    )) return
    await api.delete('/tournament/soft-reset')
    window.location.reload()
  }

  async function handleReset() {
    if (!window.confirm('【完全重置】確定要清除所有資料包含球員名單和球場設定？此操作無法復原。\nFull reset — delete everything including players and course setup?')) return
    await api.delete('/tournament/reset')
    window.location.reload()
  }

  // ── Debug: PIN functions ──

  async function handleAutoPin() {
    if (!players.length) return
    setPinLoading(true); setPinStatus('')
    let ok = 0, fail = 0
    for (const player of players) {
      try {
        await api.put(`/players/${player.id}/pin`, { pin: computeAutoPin(player.handicap) })
        ok++
      } catch { fail++ }
    }
    setPinStatus(`完成 Done: ${ok} 更新${fail ? `，${fail} 失敗` : ''}`)
    setPinLoading(false)
  }

  async function handlePastePin() {
    setPinLoading(true); setPinStatus('')
    const lines = pinText.trim().split('\n').map(l => l.trim()).filter(Boolean)
    let ok = 0, skip = 0
    for (const line of lines) {
      const parts = line.split(/\s+/)
      if (parts.length < 2) { skip++; continue }
      const no  = parseInt(parts[0])
      const pin = parts[parts.length - 1]
      if (isNaN(no) || !/^\d{4}$/.test(pin)) { skip++; continue }
      const player = players.find(p => p.player_number === no)
      if (!player) { skip++; continue }
      try {
        await api.put(`/players/${player.id}/pin`, { pin })
        ok++
      } catch { skip++ }
    }
    setPinStatus(`完成: ${ok} 更新，${skip} 略過`)
    setPinLoading(false)
  }

  // ── Debug: Self-pick function ──

  async function handleBatchSelfPick() {
    if (!window.confirm(`批次自選馬：讓所有 ${players.length} 位球員選自己為馬？\nBatch self-pick: make all ${players.length} players pick themselves?`)) return
    setPickSelfLoading(true); setPickSelfStatus('')
    try {
      const result = await api.post('/players/batch-self-pick', {})
      setPickSelfStatus(`完成 Done: ${result.count} 位球員已自選馬`)
    } catch (err) {
      setPickSelfStatus(`失敗 Failed: ${err.message || '未知錯誤'}`)
    }
    setPickSelfLoading(false)
  }

  // ── Debug: Score fill functions ──

  async function loadDebugSections() {
    const t = await api.get('/tournament')
    setDebugSections(t.sections || [])
  }

  async function handleFillAll() {
    const strokes = parseInt(scoreAll)
    if (isNaN(strokes) || strokes < 1 || strokes > 20) { setScoreStatus('請輸入有效桿數 1–20'); return }
    setScoreLoading(true); setScoreStatus('')
    const t = await api.get('/tournament')
    const holes = t.holes || []
    if (!holes.length) { setScoreStatus('尚未設定球場'); setScoreLoading(false); return }
    const active = players.filter(p => !p.no_show)
    let ok = 0
    for (const player of active) {
      try {
        await api.post('/scores/batch', { playerId: player.id, scores: holes.map(h => ({ holeId: h.id, strokes })) })
        ok++
      } catch {}
    }
    setScoreStatus(`完成: ${ok}/${active.length} 球員`)
    setScoreLoading(false)
  }

  async function handleFillSection() {
    setScoreLoading(true); setScoreStatus('')
    const t = await api.get('/tournament')
    const holes = t.holes || []
    const sections = t.sections || []
    if (!holes.length) { setScoreStatus('尚未設定球場'); setScoreLoading(false); return }
    const active = players.filter(p => !p.no_show)
    let ok = 0
    for (const player of active) {
      const scoreArr = []
      for (const sec of sections) {
        const strokes = parseInt(sectionInputs[sec.id] || '')
        if (!strokes || strokes < 1 || strokes > 20) continue
        holes.filter(h => h.section_id === sec.id).forEach(h => scoreArr.push({ holeId: h.id, strokes }))
      }
      if (!scoreArr.length) continue
      try {
        await api.post('/scores/batch', { playerId: player.id, scores: scoreArr })
        ok++
      } catch {}
    }
    setScoreStatus(`完成: ${ok}/${active.length} 球員`)
    setScoreLoading(false)
  }

  async function handleFillGroup() {
    setScoreLoading(true); setScoreStatus('')
    const t = await api.get('/tournament')
    const holes = t.holes || []
    if (!holes.length) { setScoreStatus('尚未設定球場'); setScoreLoading(false); return }
    let ok = 0
    for (const player of players.filter(p => !p.no_show)) {
      const strokes = parseInt(groupInputs[player.group_id] || '')
      if (!strokes || strokes < 1 || strokes > 20) continue
      try {
        await api.post('/scores/batch', { playerId: player.id, scores: holes.map(h => ({ holeId: h.id, strokes })) })
        ok++
      } catch {}
    }
    setScoreStatus(`完成: ${ok} 球員`)
    setScoreLoading(false)
  }

  const status      = tournament?.status || 'setup'
  const statusInfo  = STATUS_LABELS[status] || STATUS_LABELS.setup
  const pickedCount = picks.length
  const totalPlayers = players.length

  return (
    <div className="min-h-screen bg-green-50">
      <div className="bg-green-800 text-white px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">⛳ 管理員面板</h1>
          <p className="text-green-200 text-sm">Admin Dashboard</p>
        </div>
        <button onClick={handleLogout} className="text-sm bg-green-700 hover:bg-green-600 px-3 py-2 rounded-lg">
          登出 Logout
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Status card */}
        {tournament && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-gray-800">{tournament.course_name || '(尚未設定球場)'}</h2>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusInfo.color}`}>
                {statusInfo.zh}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {tournament.date ? `${tournament.date} ${tournament.tee_time}` : '日期未設定'}
            </p>
            <div className="mt-2 flex gap-4 text-sm text-gray-500">
              <span>球員: {totalPlayers}/{tournament.total_players || '?'} 人</span>
              <span>已選馬: {pickedCount}/{totalPlayers}</span>
            </div>
          </div>
        )}

        {/* Horse picks tracker */}
        {players.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <button onClick={() => setShowPicks(v => !v)}
              className="w-full px-4 py-4 flex items-center justify-between text-left">
              <div>
                <h3 className="font-bold text-gray-800">🐴 選馬狀況 Horse Picks</h3>
                <p className="text-xs text-gray-400">每30秒自動更新 · auto-refreshes every 30s</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-sm font-bold px-2 py-1 rounded-full ${pickedCount === players.length ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {pickedCount}/{players.length}
                </span>
                <span className="text-gray-400">{showPicks ? '▲' : '▼'}</span>
              </div>
            </button>
            {showPicks && (
              <div className="px-4 pb-4 space-y-1">
                {players.map(p => {
                  const pick   = picks.find(pk => pk.player_id === p.id)
                  const picked = pick ? players.find(pl => pl.id === pick.picked_player_id) : null
                  return (
                    <div key={p.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${picked ? 'bg-green-50' : 'bg-gray-50'}`}>
                      <span className="text-gray-700 font-medium">{p.player_number}. {p.chinese_name} {p.english_name}</span>
                      <span className={picked ? 'text-green-700 font-medium' : 'text-gray-400 italic'}>
                        {picked ? `→ ${picked.chinese_name} ${picked.english_name}` : '尚未選馬'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Debug section ── */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-orange-200">
          <button onClick={() => setShowDebug(v => !v)}
            className="w-full px-4 py-4 flex items-center justify-between text-left">
            <div>
              <h3 className="font-bold text-orange-700">🛠 程式測試 Debug</h3>
              <p className="text-xs text-gray-400">批次填入測試資料 · For testing purposes only</p>
            </div>
            <span className="text-gray-400">{showDebug ? '▲' : '▼'}</span>
          </button>

          {showDebug && (
            <div className="border-t border-orange-100 px-4 pb-5 pt-3 space-y-4">

              {/* Tab toggle */}
              <div className="flex gap-2">
                <button onClick={() => setDebugTab('pins')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${debugTab === 'pins' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  1. 批次設定 PIN碼
                </button>
                <button onClick={() => { setDebugTab('scores'); if (!debugSections.length) loadDebugSections() }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${debugTab === 'scores' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  2. 批次填入成績
                </button>
                <button onClick={() => setDebugTab('selfpick')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${debugTab === 'selfpick' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  3. 批次自選馬
                </button>
              </div>

              {/* ── Section 1: PIN ── */}
              {debugTab === 'pins' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button onClick={() => setPinMode('auto')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${pinMode === 'auto' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      自動從差點產生
                    </button>
                    <button onClick={() => setPinMode('paste')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${pinMode === 'paste' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      貼上自訂清單
                    </button>
                  </div>

                  {pinMode === 'auto' && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">
                        公式：差點14 → <span className="font-mono font-bold">1134</span>，差點5 → <span className="font-mono font-bold">5045</span>，差點-4 → <span className="font-mono font-bold">4034</span>
                      </p>
                      {players.length > 0 ? (
                        <div className="bg-gray-50 rounded-lg p-2 max-h-48 overflow-y-auto space-y-0.5">
                          {players.map(p => (
                            <div key={p.id} className="flex justify-between items-center text-xs text-gray-600 py-0.5">
                              <span>{p.player_number}. {p.chinese_name} {p.english_name} (差點{p.handicap})</span>
                              <span className="font-mono font-bold text-green-700 ml-2">{computeAutoPin(p.handicap)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 text-center py-2">尚未建立球員名單</p>
                      )}
                      <button onClick={handleAutoPin} disabled={pinLoading || !players.length}
                        className="w-full py-2.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition">
                        {pinLoading ? '更新中...' : '一鍵套用所有 PIN 碼'}
                      </button>
                    </div>
                  )}

                  {pinMode === 'paste' && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">格式：號碼 中文名 英文名 PIN碼（每行一位）</p>
                      <textarea
                        value={pinText}
                        onChange={e => setPinText(e.target.value)}
                        placeholder={'1 林楮君 William 1101\n2 陳威龍 Daniel 1156\n3 林家榮 Jason 1134\n...'}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono min-h-[160px] focus:outline-none focus:ring-2 focus:ring-orange-400 resize-y"
                      />
                      <button onClick={handlePastePin} disabled={pinLoading || !pinText.trim()}
                        className="w-full py-2.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition">
                        {pinLoading ? '更新中...' : '套用 PIN 碼'}
                      </button>
                    </div>
                  )}

                  {pinStatus && (
                    <div className="text-xs text-center font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
                      ✓ {pinStatus}
                    </div>
                  )}
                </div>
              )}

              {/* ── Section 2: Scores ── */}
              {debugTab === 'scores' && (
                <div className="space-y-3">
                  <div className="flex gap-1">
                    {[
                      { key: 'all',     label: '全部統一' },
                      { key: 'section', label: '依球場區域' },
                      { key: 'group',   label: '依分組' },
                    ].map(({ key, label }) => (
                      <button key={key}
                        onClick={() => { setScoreMode(key); setScoreStatus(''); if (key === 'section' && !debugSections.length) loadDebugSections() }}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${scoreMode === key ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Mode 1: same score for all holes all players */}
                  {scoreMode === 'all' && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">所有球員，每洞填入相同桿數</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">每洞</span>
                        <input type="number" inputMode="numeric" min="1" max="20"
                          value={scoreAll} onChange={e => setScoreAll(e.target.value)}
                          placeholder="桿"
                          className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-base text-center font-bold focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <span className="text-sm text-gray-600">桿（{players.filter(p=>!p.no_show).length} 位球員）</span>
                      </div>
                    </div>
                  )}

                  {/* Mode 2: different score per section */}
                  {scoreMode === 'section' && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">每個區域填入不同桿數（留空 = 不填入該區域）</p>
                      {debugSections.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">載入球場資料中...</p>
                      ) : (
                        <div className="space-y-2">
                          {debugSections.map(sec => (
                            <div key={sec.id} className="flex items-center gap-3">
                              <span className="text-sm text-gray-700 w-12">{sec.name}</span>
                              <input type="number" inputMode="numeric" min="1" max="20"
                                value={sectionInputs[sec.id] || ''}
                                onChange={e => setSectionInputs(prev => ({ ...prev, [sec.id]: e.target.value }))}
                                placeholder="桿"
                                className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-base text-center font-bold focus:outline-none focus:ring-2 focus:ring-green-400"
                              />
                              <span className="text-xs text-gray-400">桿/洞</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode 3: different score per group */}
                  {scoreMode === 'group' && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">每組填入不同桿數（留空 = 不填入該組）</p>
                      {groups.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">尚未設定分組</p>
                      ) : (
                        <div className="space-y-2">
                          {groups.map(g => {
                            const count = players.filter(p => p.group_id === g.id && !p.no_show).length
                            return (
                              <div key={g.id} className="flex items-center gap-3">
                                <span className="text-sm text-gray-700 w-14">{g.name}</span>
                                <span className="text-xs text-gray-400 w-8">({count}人)</span>
                                <input type="number" inputMode="numeric" min="1" max="20"
                                  value={groupInputs[g.id] || ''}
                                  onChange={e => setGroupInputs(prev => ({ ...prev, [g.id]: e.target.value }))}
                                  placeholder="桿"
                                  className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-base text-center font-bold focus:outline-none focus:ring-2 focus:ring-green-400"
                                />
                                <span className="text-xs text-gray-400">桿/洞</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={scoreMode === 'all' ? handleFillAll : scoreMode === 'section' ? handleFillSection : handleFillGroup}
                    disabled={scoreLoading}
                    className="w-full py-2.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition">
                    {scoreLoading ? '填入中...' : '套用測試成績'}
                  </button>

                  {scoreStatus && (
                    <div className="text-xs text-center font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
                      ✓ {scoreStatus}
                    </div>
                  )}
                </div>
              )}

              {/* ── Section 3: Self-pick ── */}
              {debugTab === 'selfpick' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">讓所有球員選自己為馬（測試用）<br/>Make every player pick themselves as their horse</p>
                  {players.length > 0 ? (
                    <div className="bg-gray-50 rounded-lg p-2 max-h-48 overflow-y-auto space-y-0.5">
                      {players.map(p => (
                        <div key={p.id} className="flex justify-between items-center text-xs text-gray-600 py-0.5">
                          <span>{p.player_number}. {p.chinese_name} {p.english_name}</span>
                          <span className="text-blue-600 font-medium">→ 自己 Self</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-2">尚未建立球員名單</p>
                  )}
                  <button onClick={handleBatchSelfPick} disabled={pickSelfLoading || !players.length}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition">
                    {pickSelfLoading ? '設定中...' : `一鍵全員自選馬 (${players.length} 人)`}
                  </button>
                  {pickSelfStatus && (
                    <div className="text-xs text-center font-medium text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
                      ✓ {pickSelfStatus}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>

        {/* Admin functions */}
        <div className="space-y-2">
          {ADMIN_LINKS.map(({ path, icon, zh, en }) => (
            <Link key={path} to={path}
              className="flex items-center gap-4 bg-white hover:bg-green-50 rounded-xl shadow-sm px-4 py-4 transition">
              <span className="text-2xl">{icon}</span>
              <div>
                <div className="font-medium text-gray-900">{zh}</div>
                <div className="text-sm text-gray-500">{en}</div>
              </div>
              <span className="ml-auto text-gray-400">›</span>
            </Link>
          ))}
        </div>

        {/* Public page links */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-700">公開頁面連結 Public Links</h3>
            <button onClick={handleCopyLink}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition
                ${copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
              {copied ? '✓ 已複製！' : '📋 複製連結'}
            </button>
          </div>
          <div className="space-y-2 text-sm">
            {[
              { label: '賽事資訊 Info', path: '/' },
              { label: '選馬 Pick Horse', path: '/pick' },
              { label: '輸入成績 Scores', path: '/scores' },
              { label: '排名 Rankings', path: '/rankings' },
            ].map(({ label, path }) => (
              <a key={path} href={path} target="_blank" rel="noreferrer"
                className="flex items-center justify-between bg-green-50 hover:bg-green-100 text-green-800 px-3 py-2 rounded-lg">
                <span>{label}</span>
                <span className="text-xs text-green-600">{window.location.origin}{path} ↗</span>
              </a>
            ))}
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-orange-100 space-y-2">
          <h3 className="font-medium text-orange-700 mb-1">重置選項 Reset Options</h3>
          <button onClick={handleSoftReset}
            className="w-full bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg py-3 text-sm font-medium transition text-left px-4">
            <div className="font-semibold">🔄 清除比賽資料（保留設定）</div>
            <div className="text-xs text-orange-500 mt-0.5">保留球員名單、球場、規則 · 清除成績、選馬、分組</div>
            <div className="text-xs text-orange-400">Soft Reset — keep players &amp; setup, clear scores/picks/groups</div>
          </button>
          <button onClick={handleReset}
            className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg py-3 text-sm font-medium transition text-left px-4">
            <div className="font-semibold">🗑️ 完全重置所有資料</div>
            <div className="text-xs text-red-400 mt-0.5">清除一切，包含球員名單和球場設定</div>
            <div className="text-xs text-red-300">Full Reset — delete everything</div>
          </button>
        </div>

      </div>
    </div>
  )
}
