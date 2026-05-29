import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'

const STATUS_FLOW = {
  setup:    { next: 'picking',  btnLabel: '開放選馬 Open Horse Picking',       btnColor: 'bg-yellow-500 hover:bg-yellow-600' },
  picking:  { next: 'playing',  btnLabel: '🏌️ 開始比賽！Lock & Start Game',   btnColor: 'bg-green-600 hover:bg-green-700' },
  playing:  { next: 'revealed', btnLabel: '🐴 公布選馬 Reveal Horse Picks',    btnColor: 'bg-purple-600 hover:bg-purple-700' },
  revealed: { next: 'finished', btnLabel: '🏆 結束比賽 Finish Game',           btnColor: 'bg-blue-600 hover:bg-blue-700' },
  finished: { next: null,       btnLabel: '比賽已結束 Game Finished',           btnColor: 'bg-gray-400' },
}

export default function GroupsManager() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [groups, setGroups] = useState([{ name: '組 1', playerIds: [] }, { name: '組 2', playerIds: [] }, { name: '組 3', playerIds: [] }])
  const [status, setStatus] = useState('setup')
  const [noShows, setNoShows] = useState({})
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [t, p] = await Promise.all([api.get('/tournament'), api.get('/players')])
    setStatus(t.tournament?.status || 'setup')
    setPlayers(p.players || [])

    // Build groups from existing player data
    const existingGroups = p.groups || []
    if (existingGroups.length > 0) {
      const built = existingGroups.map(g => ({
        name: g.name,
        playerIds: p.players.filter(pl => pl.group_id === g.id).map(pl => pl.id)
      }))
      setGroups(built)
    }

    const ns = {}
    for (const pl of p.players || []) {
      if (pl.no_show) ns[pl.id] = true
    }
    setNoShows(ns)
  }

  function assignPlayer(playerId, groupIdx) {
    setGroups(groups.map((g, i) => ({
      ...g,
      playerIds: i === groupIdx
        ? g.playerIds.includes(playerId) ? g.playerIds : [...g.playerIds, playerId]
        : g.playerIds.filter(id => id !== playerId)
    })))
  }

  function unassignPlayer(playerId) {
    setGroups(groups.map(g => ({ ...g, playerIds: g.playerIds.filter(id => id !== playerId) })))
  }

  function addGroup() {
    setGroups([...groups, { name: `組 ${groups.length + 1}`, playerIds: [] }])
  }

  function removeGroup(idx) {
    if (groups.length <= 1) return
    const removed = groups[idx]
    const updated = groups.filter((_, i) => i !== idx)
    setGroups(updated)
    // Unassign players from removed group
    removed.playerIds.forEach(pid => {
      setGroups(g => g.map(gr => gr))
    })
  }

  function updateGroupName(idx, name) {
    setGroups(groups.map((g, i) => i === idx ? { ...g, name } : g))
  }

  async function toggleNoShow(playerId) {
    const current = !!noShows[playerId]
    await api.put(`/players/${playerId}/noshow`, { no_show: !current })
    setNoShows({ ...noShows, [playerId]: !current })
  }

  async function handleSaveGroups() {
    await api.put('/players/groups', { groups })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleStatusChange() {
    const flow = STATUS_FLOW[status]
    if (!flow || !flow.next) return
    const confirmMsg =
      flow.next === 'picking'
        ? '確定開放選馬？球員將可以開始選馬！\nOpen horse picking? Players can now pick their horses!'
        : flow.next === 'playing'
        ? '確定開始比賽？開始後選馬將鎖定，無法更改！\nStart game? Horse picks will be locked!'
        : flow.next === 'revealed'
        ? '確定公布所有人的選馬？公布後所有人都能看到最終排名！\nReveal all horse picks? Everyone will see the final combined rankings!'
        : '確定結束比賽？\nFinish the game?'
    if (!window.confirm(confirmMsg)) return
    await api.put('/tournament/status', { status: flow.next })
    setStatus(flow.next)
  }

  const unassignedPlayers = players.filter(p => !groups.some(g => g.playerIds.includes(p.id)))

  return (
    <div className="min-h-screen bg-green-50">
      <div className="bg-green-800 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin/dashboard')} className="text-green-200 text-xl">‹</button>
        <div>
          <h1 className="text-xl font-bold">分組 & 開賽</h1>
          <p className="text-green-200 text-sm">Groups & Start Game</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Status control */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-gray-700">目前狀態 Current Status</p>
              <p className="text-lg font-bold text-green-800 capitalize">{status}</p>
            </div>
          </div>
          {STATUS_FLOW[status]?.next && (
            <button onClick={handleStatusChange}
              className={`w-full ${STATUS_FLOW[status].btnColor} text-white py-3 rounded-lg font-bold text-base transition`}>
              {STATUS_FLOW[status].btnLabel}
            </button>
          )}
        </div>

        {/* No-show toggle */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-medium text-gray-700 mb-2">標記未出席 Mark No-Show</h3>
          <div className="flex flex-wrap gap-2">
            {players.map(p => (
              <button key={p.id}
                onClick={() => toggleNoShow(p.id)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${noShows[p.id] ? 'bg-red-100 border-red-400 text-red-700' : 'bg-gray-100 border-gray-300 text-gray-700'}`}>
                {noShows[p.id] ? '✗ ' : ''}{p.chinese_name} {p.english_name}
              </button>
            ))}
          </div>
        </div>

        {/* Unassigned players */}
        {unassignedPlayers.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <h3 className="font-medium text-yellow-800 mb-2">未分組球員 ({unassignedPlayers.length})</h3>
            <div className="flex flex-wrap gap-2">
              {unassignedPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-1 bg-white rounded-full px-2 py-1 border border-yellow-300 text-sm">
                  <span>{p.chinese_name} {p.english_name}</span>
                  <div className="flex gap-1 ml-1">
                    {groups.map((g, gi) => (
                      <button key={gi} onClick={() => assignPlayer(p.id, gi)}
                        className="text-xs bg-yellow-200 hover:bg-yellow-300 px-1.5 py-0.5 rounded-full text-yellow-800">
                        {gi + 1}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Groups */}
        {groups.map((g, gi) => (
          <div key={gi} className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                value={g.name}
                onChange={e => updateGroupName(gi, e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 font-bold text-sm"
              />
              <span className="text-sm text-gray-500">{g.playerIds.length} 人</span>
              {groups.length > 1 && (
                <button onClick={() => removeGroup(gi)}
                  className="text-red-400 text-xs px-2 py-1 border border-red-200 rounded">刪除</button>
              )}
            </div>
            <div className="space-y-1 min-h-[40px]">
              {g.playerIds.map(pid => {
                const pl = players.find(p => p.id === pid)
                if (!pl) return null
                return (
                  <div key={pid} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${noShows[pid] ? 'bg-red-50 text-red-600' : 'bg-green-50'}`}>
                    <span>{pl.player_number}. {pl.chinese_name} {pl.english_name} <span className="text-gray-400">({pl.handicap}差點)</span></span>
                    <button onClick={() => unassignPlayer(pid)} className="text-gray-400 hover:text-red-500 ml-2">✕</button>
                  </div>
                )
              })}
              {g.playerIds.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-2">拖曳球員到此組 Assign players above</p>
              )}
            </div>
            {/* Quick-assign remaining players */}
            {unassignedPlayers.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1">
                {unassignedPlayers.slice(0, 4).map(p => (
                  <button key={p.id} onClick={() => assignPlayer(p.id, gi)}
                    className="text-xs bg-green-100 hover:bg-green-200 text-green-800 px-2 py-1 rounded-full">
                    + {p.english_name || p.chinese_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <button onClick={addGroup}
          className="w-full border-2 border-dashed border-green-300 hover:border-green-500 text-green-600 rounded-xl py-3 text-sm font-medium">
          + 新增組別 Add Group
        </button>

        <button onClick={handleSaveGroups}
          className={`w-full py-3 rounded-xl font-bold text-lg transition ${saved ? 'bg-green-500 text-white' : 'bg-green-700 hover:bg-green-800 text-white'}`}>
          {saved ? '✓ 已儲存分組!' : '儲存分組 Save Groups'}
        </button>
      </div>
    </div>
  )
}
