import { useState, useEffect } from 'react'
import { gjApi } from '../../api'
import { GjAdminShell, Card, SaveButton, useSaver } from './GjAdminShell'

export default function GjGroupsManager() {
  document.title = '綠夾克盃 — 分組設定'
  const { saving, run, banner } = useSaver()
  const [players, setPlayers] = useState([])
  const [groupCount, setGroupCount] = useState(4)
  const [assignment, setAssignment] = useState({}) // playerId -> group index (1-based), 0 = unassigned

  useEffect(() => { load() }, [])

  async function load() {
    const d = await gjApi.get('/players')
    const groups = d.groups || []
    const order = Object.fromEntries(groups.map((g, i) => [g.id, i + 1]))
    setPlayers(d.players || [])
    setGroupCount(Math.max(1, groups.length || 4))
    setAssignment(Object.fromEntries((d.players || []).map(p => [p.id, order[p.group_id] || 0])))
  }

  const assign = (playerId, groupIndex) =>
    setAssignment(a => ({ ...a, [playerId]: a[playerId] === groupIndex ? 0 : groupIndex }))

  const toggleNoShow = (p) => run(async () => {
    await gjApi.put(`/players/${p.id}/noshow`, { no_show: p.no_show ? 0 : 1 })
    await load()
  }, '已更新 ✓')

  const save = () => run(async () => {
    const groups = Array.from({ length: groupCount }, (_, i) => ({
      name: `組 ${i + 1}`,
      playerIds: players.filter(p => assignment[p.id] === i + 1).map(p => p.id),
    }))
    await gjApi.put('/players/groups', { groups })
    await load()
  }, '分組已儲存 ✓')

  const unassigned = players.filter(p => !assignment[p.id])

  return (
    <GjAdminShell title="分組設定" subtitle={`${players.length} 位選手`}>
      {banner}

      <Card title="組數">
        <div className="flex items-center gap-4">
          <button onClick={() => setGroupCount(c => Math.max(1, c - 1))}
            className="w-11 h-11 rounded-lg bg-gray-100 text-gray-700 text-xl font-bold">−</button>
          <span className="text-2xl font-bold text-emerald-900 w-10 text-center">{groupCount}</span>
          <button onClick={() => setGroupCount(c => Math.min(12, c + 1))}
            className="w-11 h-11 rounded-lg bg-gray-100 text-gray-700 text-xl font-bold">+</button>
          <span className="text-sm text-gray-500 ml-2">
            {unassigned.length > 0 ? `${unassigned.length} 位未分組` : '全部已分組 ✓'}
          </span>
        </div>
      </Card>

      <Card title="指派分組">
        <p className="text-xs text-gray-400 mb-3">點組別數字指派，再點一次取消。</p>
        <div className="divide-y divide-gray-100">
          {players.map(p => (
            <div key={p.id} className={`py-2.5 ${p.no_show ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-6 text-gray-400 text-sm">{p.player_number}</span>
                <span className="flex-1 min-w-0 font-medium text-gray-900 truncate">
                  {p.chinese_name || p.english_name}
                  {p.chinese_name && <span className="text-gray-500 text-sm ml-1.5">{p.english_name}</span>}
                </span>
                <span className="text-xs text-gray-400">差點 {p.handicap}</span>
                <button onClick={() => toggleNoShow(p)} disabled={saving}
                  className={`text-xs px-2 py-1 rounded ${p.no_show ? 'bg-gray-300 text-gray-700' : 'bg-gray-50 text-gray-400 border border-gray-200'}`}>
                  {p.no_show ? '未到' : '出席'}
                </button>
              </div>
              <div className="flex gap-1.5 pl-8">
                {Array.from({ length: groupCount }, (_, i) => i + 1).map(g => (
                  <button key={g} onClick={() => assign(p.id, g)}
                    className={`w-9 h-9 rounded-lg text-sm font-bold transition
                      ${assignment[p.id] === g ? 'bg-emerald-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-emerald-50'}`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {players.length === 0 && <p className="py-6 text-center text-gray-400 text-sm">尚無選手</p>}
        </div>
      </Card>

      <SaveButton onClick={save} saving={saving} children="儲存分組" />
    </GjAdminShell>
  )
}
