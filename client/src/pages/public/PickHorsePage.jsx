import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'

export default function PickHorsePage() {
  const [players, setPlayers] = useState([])
  const [picks, setPicks] = useState([]) // { player_id, picked_player_id, updated_at }
  const [status, setStatus] = useState('setup')
  const [modal, setModal] = useState(null) // { playerId, playerName }
  const [pin, setPin] = useState('')
  const [selectedHorse, setSelectedHorse] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [t, p] = await Promise.all([api.get('/tournament'), api.get('/players')])
    setStatus(t.tournament?.status || 'setup')
    setPlayers(p.players || [])
    setPicks(p.picks || [])
  }

  function getPickStatus(playerId) {
    const pick = picks.find(p => p.player_id === playerId)
    if (!pick) return { label: '還沒選馬', labelEn: 'No pick yet', color: 'bg-gray-100 text-gray-500 border-gray-200' }
    return { label: '已選馬了', labelEn: 'Pick confirmed', color: 'bg-green-100 text-green-700 border-green-300', pick }
  }

  function openPickModal(player) {
    if (status === 'playing' || status === 'finished') return
    setModal({ playerId: player.id, playerName: `${player.chinese_name} ${player.english_name}` })
    const existing = picks.find(p => p.player_id === player.id)
    setSelectedHorse(existing ? String(existing.picked_player_id) : '')
    setPin('')
    setError('')
  }

  async function handleSubmitPick() {
    if (!pin || pin.length !== 4) return setError('請輸入4位數PIN碼 Enter 4-digit PIN')
    if (!selectedHorse) return setError('請選擇一位球員 Select a player')
    setLoading(true)
    setError('')
    try {
      await api.post('/players/pick-horse', {
        playerId: modal.playerId,
        pin,
        pickedPlayerId: Number(selectedHorse)
      })
      setSuccess('選馬成功！Pick saved!')
      setModal(null)
      await loadData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isLocked = status === 'playing' || status === 'revealed' || status === 'finished'
  const pickedCount = picks.length
  const [showHistory, setShowHistory] = useState(false)

  const HISTORY = [
    {
      year: '2022', course: '新豐球場', champion: '林家榮 Jason',
      results: [
        { name: 'Jason',   score: '+4'  },
        { name: 'Daniel',  score: '+8'  },
        { name: 'Casper',  score: '+8'  },
        { name: 'AD',      score: '+10' },
        { name: 'Benny',   score: '+10' },
        { name: 'Albert',  score: '+12' },
        { name: 'Johnny',  score: '+12' },
        { name: 'William', score: '+15' },
        { name: 'Eddie',   score: '+20' },
      ]
    },
    {
      year: '2023', course: '楊梅球場', champion: '林褚君 William',
      results: [
        { name: 'William', score: '0'          },
        { name: 'Johnny',  score: '+1'         },
        { name: 'Casper',  score: '+4'         },
        { name: 'AD',      score: '+6'         },
        { name: 'Albert',  score: '+7'         },
        { name: 'Eddie',   score: '+7'         },
        { name: 'Benny',   score: '+8'         },
        { name: 'Daniel',  score: '+9'         },
        { name: 'Jason',   score: '+16'        },
        { name: 'JJ',      score: 'DQ (No Show)' },
      ]
    },
    {
      year: '2024', course: '台北球場', champion: '陳威龍 Daniel',
      results: [
        { name: 'Daniel',  score: '+1'  },
        { name: 'JJ',      score: '+3'  },
        { name: 'Johnny',  score: '+4'  },
        { name: 'AD',      score: '+8'  },
        { name: 'Benny',   score: '+9'  },
        { name: 'Jimmy',   score: '+9'  },
        { name: 'Albert',  score: '+11' },
        { name: 'William', score: '+13' },
        { name: 'Eddie',   score: '+14' },
        { name: 'Jason',   score: '+18' },
        { name: 'Jeff',    score: '+18' },
        { name: 'Casper',  score: '+22' },
      ]
    },
    {
      year: '2025', course: '新豐球場', champion: '林褚君 William',
      results: [
        { name: 'William', score: '-1' },
        { name: 'Jimmy',   score: '0'  },
        { name: 'AD',      score: '+1' },
        { name: 'Johnny',  score: '+2' },
        { name: 'Albert',  score: '+2' },
        { name: 'Eddie',   score: '+5' },
        { name: 'Daniel',  score: '+7' },
        { name: 'Benny',   score: '+8' },
        { name: 'Casper',  score: '+9' },
        { name: 'Jeff',    score: '+9' },
        { name: 'Jason',   score: '+17'},
      ]
    },
  ]

  return (
    <div className="min-h-screen bg-green-50">
      <div className="bg-green-800 text-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">選馬 Pick Your Horse</h1>
            <p className="text-green-200 text-sm">
              {isLocked ? '🔒 比賽已開始，選馬已鎖定' : `已選 ${pickedCount}/${players.length} 人`}
            </p>
          </div>
          <Link to="/" className="text-green-200 text-sm underline">返回</Link>
        </div>
      </div>

      {success && (
        <div className="bg-green-500 text-white text-center py-2 font-medium">{success}</div>
      )}

      <div className="max-w-lg mx-auto px-4 py-4">

        {/* Past champions collapsible */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
          <button onClick={() => setShowHistory(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left">
            <span className="font-bold text-gray-800">🏆 歷屆冠軍及成績</span>
            <span className="text-gray-400">{showHistory ? '▲' : '▼'}</span>
          </button>
          {showHistory && (
            <div className="px-4 pb-4 space-y-4">
              {/* Champions summary */}
              <div className="bg-yellow-50 rounded-lg p-3 space-y-1">
                {HISTORY.map(h => (
                  <div key={h.year} className="flex items-center gap-2 text-sm">
                    <span className="text-yellow-600 font-bold w-10">{h.year}</span>
                    <span className="text-gray-600">{h.course}</span>
                    <span className="ml-auto font-medium text-gray-800">🥇 {h.champion}</span>
                  </div>
                ))}
              </div>
              {/* Per-year results */}
              {HISTORY.map(h => (
                <div key={h.year}>
                  <div className="text-sm font-bold text-green-800 mb-1">{h.year} {h.course} 成績</div>
                  <div className="space-y-0.5">
                    {h.results.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-sm px-2 py-1 rounded
                        odd:bg-gray-50 even:bg-white">
                        <span className="text-gray-500 w-5 text-right mr-2">{i + 1}.</span>
                        <span className="flex-1 text-gray-800">{r.name}</span>
                        <span className={`font-medium tabular-nums ${
                          r.score.startsWith('-') ? 'text-red-600' :
                          r.score === '0' ? 'text-gray-600' :
                          r.score.startsWith('+') ? 'text-blue-600' : 'text-gray-400'
                        }`}>{r.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!isLocked && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-sm text-yellow-800">
            點擊你的名字，輸入PIN碼選擇或更改你的馬。比賽當天9點後無法更改。
          </div>
        )}

        <div className="space-y-2">
          {players.map(player => {
            const status_ = getPickStatus(player.id)
            return (
              <div key={player.id}
                onClick={() => !isLocked && openPickModal(player)}
                className={`bg-white rounded-xl shadow-sm p-4 flex items-center justify-between transition ${!isLocked ? 'cursor-pointer hover:bg-green-50 active:bg-green-100' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-green-100 text-green-800 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {player.player_number}
                  </span>
                  <div>
                    <div className="font-medium text-gray-900">{player.chinese_name} <span className="text-gray-500">{player.english_name}</span></div>
                    <div className="text-xs text-gray-400">差點 {player.handicap}</div>
                    {status_.pick && (() => {
                      const picksRevealed = status === 'revealed' || status === 'finished'
                      if (picksRevealed) {
                        const horse = players.find(p => p.id === status_.pick.picked_player_id)
                        return <div className="text-xs text-green-600 mt-0.5">🐴 {horse ? `${horse.chinese_name} ${horse.english_name}` : '-'}</div>
                      }
                      return <div className="text-xs text-gray-400 mt-0.5">🔒 選馬保密中</div>
                    })()}
                  </div>
                </div>
                <span className={`text-xs border rounded-full px-2 py-1 flex-shrink-0 ${status_.color}`}>
                  {status_.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pick modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-lg mx-auto p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {picks.find(p => p.player_id === modal.playerId) ? '改變選馬 Change Pick' : '選馬 Pick Horse'}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <p className="text-gray-600 text-sm">
              你好，<strong>{modal.playerName}</strong>！請輸入你的PIN碼確認身份。<br/>
              Hello! Enter your 4-digit PIN to confirm identity.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN 碼 (4位數字)</label>
              <input
                type="number"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={e => setPin(e.target.value.slice(0, 4))}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-2xl text-center font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">選擇你的馬 Pick Your Horse</label>
              <select
                value={selectedHorse}
                onChange={e => setSelectedHorse(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">-- 選擇一位球員 Select player --</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.player_number}. {p.chinese_name} {p.english_name} ({p.handicap}差點)
                    {p.id === modal.playerId ? ' ★ 自己' : ''}
                  </option>
                ))}
              </select>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

            <button
              onClick={handleSubmitPick}
              disabled={loading}
              className="w-full bg-green-700 hover:bg-green-800 text-white py-4 rounded-xl font-bold text-lg transition disabled:opacity-50"
            >
              {loading ? '儲存中...' : '確認選馬 Confirm Pick'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
