import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { gjApi } from '../../api'
import { GjAdminShell, Card, useSaver, useGjLogout } from './GjAdminShell'

const STATUSES = [
  { key: 'setup',    label: '設定中',   desc: '賽前準備，可自由修改' },
  { key: 'playing',  label: '比賽中',   desc: '選手輸入成績，排名即時更新' },
  { key: 'finished', label: '已結束',   desc: '成績鎖定，排名為最終結果' },
]

const PAGES = [
  { path: '/admin/gj/tournament', icon: '📋', label: '賽事設定',   desc: '名稱、球場、日期、開球時間' },
  { path: '/admin/gj/course',     icon: '⛳', label: '球場設定',   desc: '球洞編號、Par、白紅 Tee 碼數' },
  { path: '/admin/gj/players',    icon: '👤', label: '選手管理',   desc: '名單、差點、外卡、Tee 別' },
  { path: '/admin/gj/groups',     icon: '👥', label: '分組設定',   desc: '分組、未到選手' },
  { path: '/admin/gj/tiebreak',   icon: '⚖️', label: '同分判定',   desc: '排名優先順序設定' },
  { path: '/admin/gj/champions',  icon: '🏆', label: '歷屆冠軍',   desc: '新增、修改、刪除' },
  { path: '/admin/gj/rules',      icon: '📖', label: '賽事規則',   desc: '規則摘要與詳細規則' },
]

export default function GjDashboard() {
  document.title = '綠夾克盃 管理面板'
  const logout = useGjLogout()
  const { saving, run, banner } = useSaver()
  const [tournament, setTournament] = useState(null)
  const [players, setPlayers] = useState([])
  const [rankings, setRankings] = useState(null)
  const [scoreCount, setScoreCount] = useState(0)
  const [showTools, setShowTools] = useState(false)
  const [busy, setBusy] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [t, p, s, r] = await Promise.all([
      gjApi.get('/tournament'), gjApi.get('/players'), gjApi.get('/scores'), gjApi.get('/rankings'),
    ])
    setTournament(t.tournament)
    setPlayers(p.players || [])
    setScoreCount((s.scores || []).length)
    setRankings(r)
  }

  const setStatus = (status) => run(async () => {
    await gjApi.put('/tournament/status', { status })
    await load()
  }, '狀態已更新 ✓')

  const setPlayoffWinner = (playerId) => run(async () => {
    await gjApi.put('/tournament/playoff-winner', { playerId })
    await load()
  }, 'PK 勝出者已記錄 ✓')

  const toggleWildcard = () => run(async () => {
    await gjApi.put('/tournament/wildcard-visibility', { show: tournament.show_wildcard === 0 })
    await load()
  }, '已更新 ✓')

  // ---- Test data, for the pre-tournament rehearsal ----
  async function fillTestScores() {
    if (!confirm('這會覆蓋所有選手的成績，確定嗎？')) return
    setBusy('fill')
    try {
      const t = await gjApi.get('/tournament')
      const holes = t.holes || []
      for (const p of players) {
        const scores = holes.map(h => ({
          holeId: h.id,
          strokes: Math.max(2, h.par + (Math.random() < 0.15 ? -1 : Math.floor(Math.random() * 4))),
        }))
        await gjApi.post('/scores/batch', { playerId: p.id, scores })
      }
      await load()
    } finally { setBusy('') }
  }

  async function clearScores() {
    if (!confirm('確定清除所有成績？')) return
    setBusy('clear')
    try {
      const t = await gjApi.get('/tournament')
      for (const p of players) {
        await gjApi.post('/scores/batch', {
          playerId: p.id,
          scores: (t.holes || []).map(h => ({ holeId: h.id, strokes: 0 })),
        })
      }
      await load()
    } finally { setBusy('') }
  }

  const softReset = () => {
    if (!confirm('清除所有成績與分組，但保留選手與球場設定。確定嗎？')) return
    run(async () => { await gjApi.delete('/tournament/soft-reset'); await load() }, '已重置 ✓')
  }

  if (!tournament) {
    return <div className="min-h-screen flex items-center justify-center text-emerald-900">載入中...</div>
  }

  const tiedForFirst = (rankings?.netRankings || []).filter(p => p.awaitingPlayoff)
  const winner = players.find(p => p.id === tournament.playoff_winner_id)
  const completed = (rankings?.netRankings || []).filter(p => p.isComplete).length

  return (
    <GjAdminShell title="管理面板" subtitle={tournament.name} onLogout={logout} showBack={false}>
      {banner}

      {/* Status */}
      <Card title="比賽狀態">
        <div className="grid grid-cols-3 gap-2">
          {STATUSES.map(s => (
            <button key={s.key} onClick={() => setStatus(s.key)} disabled={saving}
              className={`px-2 py-3 rounded-lg text-sm font-bold transition disabled:opacity-50
                ${tournament.status === s.key
                  ? 'bg-emerald-800 text-white ring-2 ring-amber-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-emerald-50'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {STATUSES.find(s => s.key === tournament.status)?.desc}
        </p>
      </Card>

      {/* Counts */}
      <Card title="目前狀況">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-2xl font-bold text-emerald-900">{players.length}</div>
            <div className="text-xs text-gray-500">選手</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-900">{completed}</div>
            <div className="text-xs text-gray-500">完賽</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-900">{scoreCount}</div>
            <div className="text-xs text-gray-500">已輸入成績</div>
          </div>
        </div>
      </Card>

      {/* Sudden-death playoff — only surfaces when there is actually a tie */}
      {(tiedForFirst.length > 0 || winner) && (
        <Card title="⛳ 冠軍延長賽 PK" accent="bg-amber-400 text-amber-950">
          {winner ? (
            <div>
              <p className="text-sm text-gray-700 mb-3">
                目前記錄的 PK 勝出者：
                <b className="text-emerald-900"> {winner.chinese_name || winner.english_name}</b>
              </p>
              <button onClick={() => setPlayoffWinner(null)} disabled={saving}
                className="text-sm text-red-600 underline">清除，回到並列狀態</button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-700 mb-3">
                以下選手淨桿同分並列第 1。在練習果嶺推桿決勝後，點選勝出者：
              </p>
              <div className="space-y-2">
                {tiedForFirst.map(p => (
                  <button key={p.id} onClick={() => setPlayoffWinner(p.id)} disabled={saving}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50">
                    <span className="font-medium text-gray-900">{p.chinese_name || p.english_name}</span>
                    <span className="text-sm text-gray-500">淨桿 {p.netScore} · 總桿 {p.grossScore}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Wildcard visibility */}
      <Card title="外卡標示">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700">公開頁面顯示「外卡」標籤</p>
            <p className="text-xs text-gray-400">
              目前 {players.filter(p => p.wildcard).length} 位外卡選手
            </p>
          </div>
          <button onClick={toggleWildcard} disabled={saving}
            className={`px-4 py-2 rounded-full text-sm font-bold transition disabled:opacity-50
              ${tournament.show_wildcard !== 0 ? 'bg-emerald-800 text-white' : 'bg-gray-200 text-gray-600'}`}>
            {tournament.show_wildcard !== 0 ? '顯示中' : '已隱藏'}
          </button>
        </div>
      </Card>

      {/* Navigation */}
      <div className="grid gap-2 mb-4">
        {PAGES.map(p => (
          <Link key={p.path} to={p.path}
            className="flex items-center gap-3 bg-white rounded-xl shadow-sm px-4 py-3 hover:bg-emerald-50 transition">
            <span className="text-2xl">{p.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900">{p.label}</div>
              <div className="text-xs text-gray-400 truncate">{p.desc}</div>
            </div>
            <span className="text-gray-300">›</span>
          </Link>
        ))}
      </div>

      {/* Public page links */}
      <Card title="公開頁面">
        <div className="grid grid-cols-3 gap-2 text-sm">
          {[
            { label: '賽事資料', path: '/greenjacket' },
            { label: '輸入成績', path: '/greenjacket/scores' },
            { label: '排名', path: '/greenjacket/rankings' },
          ].map(l => (
            <a key={l.path} href={l.path} target="_blank" rel="noreferrer"
              className="text-center bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-lg px-2 py-2">
              {l.label}
            </a>
          ))}
        </div>
      </Card>

      {/* Test tools */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <button onClick={() => setShowTools(v => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-left">
          <span className="font-bold text-gray-700">🛠 程式測試</span>
          <span className="text-gray-400">{showTools ? '▲' : '▼'}</span>
        </button>
        {showTools && (
          <div className="px-4 pb-4 space-y-2">
            <p className="text-xs text-gray-500">
              比賽前彩排用。灌入假成績後去排名頁確認同分判定、PK、即時排名都正確。
            </p>
            <button onClick={fillTestScores} disabled={!!busy}
              className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
              {busy === 'fill' ? '填入中...' : '批次填入測試成績（全部 18 洞）'}
            </button>
            <button onClick={clearScores} disabled={!!busy}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
              {busy === 'clear' ? '清除中...' : '清除所有成績'}
            </button>
            <button onClick={softReset} disabled={saving}
              className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
              重置：清除成績與分組（保留選手與球場）
            </button>
          </div>
        )}
      </div>
    </GjAdminShell>
  )
}
