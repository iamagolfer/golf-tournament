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

export default function Dashboard({ onLogout }) {
  const [tournament, setTournament] = useState(null)
  const [players, setPlayers] = useState([])
  const [picks, setPicks] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    function load() {
      Promise.all([api.get('/tournament'), api.get('/players')]).then(([t, p]) => {
        setTournament(t.tournament)
        setPlayers(p.players || [])
        setPicks(p.picks || [])
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

  const status = tournament?.status || 'setup'
  const statusInfo = STATUS_LABELS[status] || STATUS_LABELS.setup
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
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-gray-800">🐴 選馬狀況 Horse Picks</h3>
                <p className="text-xs text-gray-400">每30秒自動更新 · auto-refreshes every 30s</p>
              </div>
              <span className={`text-sm font-bold px-2 py-1 rounded-full ${pickedCount === players.length ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {pickedCount}/{players.length}
              </span>
            </div>
            <div className="space-y-1">
              {players.map(p => {
                const pick = picks.find(pk => pk.player_id === p.id)
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
          </div>
        )}

        {/* Admin functions */}
        <div className="space-y-2">
          {ADMIN_LINKS.map(({ path, icon, zh, en }) => (
            <Link key={path} to={path}
              className="flex items-center gap-4 bg-white hover:bg-green-50 rounded-xl shadow-sm px-4 py-4 transition"
            >
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
          <h3 className="font-medium text-gray-700 mb-3">公開頁面連結 Public Links</h3>
          <div className="space-y-2 text-sm">
            {[
              { label: '賽事資訊 Info', path: '/' },
              { label: '選馬 Pick Horse', path: '/pick' },
              { label: '輸入成績 Scores', path: '/scores' },
              { label: '排名 Rankings', path: '/rankings' },
            ].map(({ label, path }) => (
              <a key={path} href={path} target="_blank" rel="noreferrer"
                className="flex items-center justify-between bg-green-50 hover:bg-green-100 text-green-800 px-3 py-2 rounded-lg"
              >
                <span>{label}</span>
                <span className="text-xs text-green-600">{window.location.origin}{path} ↗</span>
              </a>
            ))}
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-orange-100 space-y-2">
          <h3 className="font-medium text-orange-700 mb-1">重置選項 Reset Options</h3>

          {/* Soft reset — recommended */}
          <button onClick={handleSoftReset}
            className="w-full bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg py-3 text-sm font-medium transition text-left px-4"
          >
            <div className="font-semibold">🔄 清除比賽資料（保留設定）</div>
            <div className="text-xs text-orange-500 mt-0.5">保留球員名單、球場、規則 · 清除成績、選馬、分組</div>
            <div className="text-xs text-orange-400">Soft Reset — keep players &amp; setup, clear scores/picks/groups</div>
          </button>

          {/* Full reset */}
          <button onClick={handleReset}
            className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg py-3 text-sm font-medium transition text-left px-4"
          >
            <div className="font-semibold">🗑️ 完全重置所有資料</div>
            <div className="text-xs text-red-400 mt-0.5">清除一切，包含球員名單和球場設定</div>
            <div className="text-xs text-red-300">Full Reset — delete everything</div>
          </button>
        </div>
      </div>
    </div>
  )
}
