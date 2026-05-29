import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'

function parsePlayerLine(line, idx) {
  // Accepts: "林楮君 William (11差點)" or "林楮君 William 11" etc.
  const trimmed = line.trim()
  if (!trimmed) return null
  // Remove leading number like "1 " or "1."
  const noNum = trimmed.replace(/^\d+[\.\s]+/, '').trim()
  // Extract handicap from (N差點) or just last number
  const hcapMatch = noNum.match(/\((\d+)差點\)/)
  let handicap = hcapMatch ? parseInt(hcapMatch[1]) : 0
  const noHcap = noNum.replace(/\(\d+差點\)/, '').trim()

  // First word = Chinese name (contains CJK), rest = English
  const parts = noHcap.split(/\s+/)
  let chineseName = '', englishName = ''
  for (const p of parts) {
    if (/[一-鿿]/.test(p)) chineseName += p
    else if (p) englishName = p
  }
  if (!handicap) {
    const lastNum = noHcap.match(/\d+$/)
    if (lastNum) handicap = parseInt(lastNum[0])
  }
  return chineseName || englishName
    ? { chinese_name: chineseName, english_name: englishName, handicap, pin: '' }
    : null
}

export default function PlayersManager() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [bulkText, setBulkText] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => { loadPlayers() }, [])

  async function loadPlayers() {
    const [t, p] = await Promise.all([api.get('/tournament'), api.get('/players/with-pins')])
    setTotalPlayers(t.tournament?.total_players || 0)
    setPlayers(p.players || [])
  }

  function handleBulkParse() {
    const lines = bulkText.trim().split('\n')
    const parsed = lines.map((l, i) => parsePlayerLine(l, i)).filter(Boolean)
    if (parsed.length === 0) return setError('無法解析球員資料，請檢查格式。')
    setPlayers(parsed.map((p, i) => ({ ...p, player_number: i + 1 })))
    setShowBulk(false)
    setBulkText('')
    setError('')
  }

  function updatePlayer(idx, field, value) {
    setPlayers(players.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  function addPlayer() {
    setPlayers([...players, { player_number: players.length + 1, chinese_name: '', english_name: '', handicap: 0, pin: '' }])
  }

  function removePlayer(idx) {
    setPlayers(players.filter((_, i) => i !== idx).map((p, i) => ({ ...p, player_number: i + 1 })))
  }

  async function handleSave() {
    setError('')
    for (const p of players) {
      if (!p.chinese_name && !p.english_name) return setError('每位球員至少需要一個名字。')
    }
    try {
      await api.put('/players', { players })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      loadPlayers()
    } catch (err) {
      setError(err.message)
    }
  }

  async function updatePin(playerId, pin) {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return
    await api.put(`/players/${playerId}/pin`, { pin })
  }

  return (
    <div className="min-h-screen bg-green-50">
      <div className="bg-green-800 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin/dashboard')} className="text-green-200 text-xl">‹</button>
        <div>
          <h1 className="text-xl font-bold">球員名單</h1>
          <p className="text-green-200 text-sm">Player List — 預計 {totalPlayers} 人</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Quick count indicator */}
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${players.length === totalPlayers && totalPlayers > 0 ? 'text-green-700' : 'text-orange-600'}`}>
            已輸入 {players.length} 名 / 預計 {totalPlayers || '?'} 名
            {players.length === totalPlayers && totalPlayers > 0 ? ' ✓' : ''}
          </span>
          <button onClick={() => setShowBulk(!showBulk)}
            className="text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200">
            批量輸入 Bulk Import
          </button>
        </div>

        {/* Bulk import */}
        {showBulk && (
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <p className="text-sm text-gray-600">
              貼上球員列表，每行一位。支援格式：<br/>
              <code className="bg-gray-100 px-1 rounded">林楮君 William (11差點)</code>
            </p>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm min-h-[150px] font-mono"
              placeholder={'1 林楮君 William (11差點)\n2 陳威龍 Daniel (16差點)\n...'}
            />
            <button onClick={handleBulkParse}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium">
              解析並匯入 Parse & Import
            </button>
          </div>
        )}

        {/* Player list */}
        <div className="space-y-2">
          {players.map((p, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-sm p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 bg-green-100 text-green-800 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {idx + 1}
                </span>
                <input
                  value={p.chinese_name}
                  onChange={e => updatePlayer(idx, 'chinese_name', e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                  placeholder="中文姓名"
                />
                <input
                  value={p.english_name}
                  onChange={e => updatePlayer(idx, 'english_name', e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                  placeholder="English"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-8">差點</span>
                <input
                  type="number"
                  min="0"
                  max="54"
                  value={p.handicap}
                  onChange={e => updatePlayer(idx, 'handicap', Number(e.target.value))}
                  className="w-16 border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
                <span className="text-xs text-gray-500">PIN</span>
                <input
                  type="text"
                  maxLength={4}
                  value={p.pin || ''}
                  onChange={e => updatePlayer(idx, 'pin', e.target.value)}
                  onBlur={e => p.id && updatePin(p.id, e.target.value)}
                  className="w-16 border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
                  placeholder="0000"
                />
                <button onClick={() => removePlayer(idx)}
                  className="ml-auto text-red-400 hover:text-red-600 text-sm px-2 py-1">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <button onClick={addPlayer}
          className="w-full border-2 border-dashed border-green-300 hover:border-green-500 text-green-600 rounded-xl py-3 text-sm font-medium transition">
          + 新增球員 Add Player
        </button>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

        <button onClick={handleSave}
          className={`w-full py-3 rounded-xl font-bold text-lg transition ${saved ? 'bg-green-500 text-white' : 'bg-green-700 hover:bg-green-800 text-white'}`}>
          {saved ? '✓ 已儲存!' : '儲存球員名單 Save Players'}
        </button>

        <p className="text-xs text-gray-400 text-center">
          儲存後系統自動生成4位數PIN碼，可直接修改。請將PIN碼分發給每位球員。<br/>
          PINs are auto-generated on save. Share each player's PIN with them before tournament day.
        </p>
      </div>
    </div>
  )
}
