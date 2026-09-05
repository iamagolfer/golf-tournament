import { useState, useEffect } from 'react'
import { gjApi } from '../../api'
import { GjAdminShell, Card, SaveButton, useSaver } from './GjAdminShell'

const hasCJK = (s) => /[一-鿿]/.test(s)

// Tolerant of the way the list actually arrives: with or without a leading
// number, Chinese name optional, handicap bare or wrapped like (差：14).
function parseBulk(text) {
  const players = []
  const errors = []
  text.split('\n').map(l => l.trim()).filter(Boolean).forEach((line, i) => {
    const wildcard = /外卡|\*/.test(line)
    let rest = line.replace(/外卡|\*/g, '')
    rest = rest.replace(/^\s*\d+\s*[.、)]?\s*/, '')          // leading list number
    const nums = rest.match(/\d+/g)
    if (!nums || !nums.length) { errors.push(`第 ${i + 1} 行找不到差點：${line}`); return }
    const handicap = Number(nums[nums.length - 1])
    const namePart = rest.slice(0, rest.lastIndexOf(String(handicap)))
      .replace(/[（(].*$/, '').replace(/差點?[:：]?/g, '').trim()
    const tokens = namePart.split(/\s+/).filter(Boolean)
    if (!tokens.length) { errors.push(`第 ${i + 1} 行找不到姓名：${line}`); return }
    let chinese_name = '', english_name = ''
    if (tokens.length >= 2 && hasCJK(tokens[0])) {
      chinese_name = tokens[0]
      english_name = tokens.slice(1).join(' ')
    } else if (hasCJK(tokens[0])) {
      chinese_name = tokens.join(' ')
    } else {
      english_name = tokens.join(' ')
    }
    players.push({ chinese_name, english_name, handicap, wildcard, tee: 'white' })
  })
  return { players, errors }
}

export default function GjPlayersManager() {
  document.title = '綠夾克盃 — 選手管理'
  const { saving, run, banner } = useSaver()
  const [players, setPlayers] = useState([])
  const [editing, setEditing] = useState(null)
  const [bulk, setBulk] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [status, setStatus] = useState(null)
  const [adding, setAdding] = useState(null)
  const [fromRoster, setFromRoster] = useState(null)

  // Entering people from the club roster. Only ever adds — the tournament's own
  // list and the scores hanging off it are never replaced from here.
  const openRoster = () => run(async () => {
    const d = await gjApi.get('/roster')
    const here = new Set(players.map(p => p.club_player_id).filter(Boolean))
    const names = new Set(players.map(p => (p.english_name || p.chinese_name || '').toLowerCase()))
    setFromRoster((d.roster || [])
      .filter(m => m.status !== 'inactive')
      .map(m => ({
        ...m,
        already: here.has(m.id) ||
          names.has((m.english_name || m.chinese_name || '').toLowerCase()),
        chosen: false,
      })))
  }, '選擇要加入的球員')

  const addFromRoster = () => {
    const chosen = fromRoster.filter(m => m.chosen && !m.already)
    if (!chosen.length) { alert('請先勾選球員'); return }
    run(async () => {
      const r = await gjApi.post('/players/from-roster', { clubPlayerIds: chosen.map(m => m.id) })
      await load()
      setFromRoster(null)
      if (r.skipped?.length) {
        alert(`已加入 ${r.added.length} 位。\n略過 ${r.skipped.length} 位:` +
          r.skipped.map(s => `${s.name || s.id}（${s.why}）`).join('、'))
      }
    }, '已從球隊名單加入 ✓')
  }

  useEffect(() => { load() }, [])
  const load = () => Promise.all([gjApi.get('/players'), gjApi.get('/tournament')])
    .then(([d, t]) => {
      setPlayers(d.players || [])
      setStatus(t.tournament?.status ?? null)
    })

  const saveOne = (p) => run(async () => {
    await gjApi.put(`/players/${p.id}/details`, p)
    await load()
    setEditing(null)
  }, '已更新 ✓')

  const blankPlayer = { chinese_name: '', english_name: '', handicap: '', wildcard: 0, tee: 'white' }

  const addOne = () => {
    if (!adding.chinese_name.trim() && !adding.english_name.trim()) { alert('請至少填寫中文名或英文名'); return }
    if (!Number.isFinite(Number(adding.handicap)) || adding.handicap === '') { alert('請填寫差點'); return }
    run(async () => {
      await gjApi.post('/players', { ...adding, handicap: Number(adding.handicap) })
      await load()
      setAdding(null)
    }, '已新增選手 ✓')
  }

  // The server refuses this once play starts, so the button only shows during
  // setup — a player who drops out mid-round is marked 未到 instead.
  const deleteOne = (p) => {
    const who = p.chinese_name || p.english_name
    if (!confirm(
      `確定刪除「${who}」？\n\n` +
      `• 會一併刪除他已輸入的成績\n` +
      `• 其餘選手的編號會重新排序\n\n` +
      `此動作無法復原。`
    )) return
    run(async () => {
      await gjApi.delete(`/players/${p.id}`)
      await load()
      setEditing(null)
    }, `已刪除 ${who} ✓`)
  }

  const importBulk = () => {
    const { players: parsed, errors } = parseBulk(bulk)
    if (errors.length) { alert(errors.join('\n')); return }
    if (!confirm(`將以 ${parsed.length} 位選手取代整份名單。\n\n⚠️ 這會清除所有已輸入的成績與分組。確定嗎？`)) return
    run(async () => {
      await gjApi.put('/players', { players: parsed })
      await load()
      setBulk('')
      setShowBulk(false)
    }, `已匯入 ${parsed.length} 位選手 ✓`)
  }

  return (
    <GjAdminShell title="選手管理" subtitle={`${players.length} 位選手`}>
      {banner}

      <Card title="選手名單">
        <p className="text-xs text-gray-400 mb-3">
          點選手可直接修改姓名、差點、外卡與 Tee 別 — <b>不會影響已輸入的成績</b>。
          {status === 'setup' && ' 展開後最下面有刪除鈕。'}
        </p>
        <div className="divide-y divide-gray-100">
          {players.map(p => editing?.id === p.id ? (
            <div key={p.id} className="py-3 space-y-2 bg-emerald-50 -mx-4 px-4">
              <div className="grid grid-cols-2 gap-2">
                <input className="border border-gray-300 rounded px-2 py-2 text-sm" placeholder="中文名（可空白）"
                  value={editing.chinese_name} onChange={e => setEditing({ ...editing, chinese_name: e.target.value })} />
                <input className="border border-gray-300 rounded px-2 py-2 text-sm" placeholder="英文名"
                  value={editing.english_name} onChange={e => setEditing({ ...editing, english_name: e.target.value })} />
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-sm text-gray-600">差點</label>
                <input type="number" className="w-20 border border-gray-300 rounded px-2 py-2 text-sm"
                  value={editing.handicap} onChange={e => setEditing({ ...editing, handicap: Number(e.target.value) })} />
                <button onClick={() => setEditing({ ...editing, tee: editing.tee === 'red' ? 'white' : 'red' })}
                  className={`px-3 py-2 rounded text-sm font-medium ${editing.tee === 'red' ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-gray-100 text-gray-700 border border-gray-300'}`}>
                  {editing.tee === 'red' ? '紅 Tee' : '白 Tee'}
                </button>
                <button onClick={() => setEditing({ ...editing, wildcard: editing.wildcard ? 0 : 1 })}
                  className={`px-3 py-2 rounded text-sm font-medium ${editing.wildcard ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-gray-100 text-gray-500 border border-gray-300'}`}>
                  {editing.wildcard ? '外卡' : '非外卡'}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => saveOne(editing)} disabled={saving}
                  className="flex-1 bg-emerald-800 text-white py-2 rounded text-sm font-bold disabled:opacity-50">儲存</button>
                <button onClick={() => setEditing(null)}
                  className="px-4 bg-gray-200 text-gray-700 py-2 rounded text-sm">取消</button>
              </div>
              {status === 'setup' ? (
                <button onClick={() => deleteOne(editing)} disabled={saving}
                  className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 py-2 rounded text-sm font-medium disabled:opacity-50">
                  🗑 刪除這位選手
                </button>
              ) : (
                <p className="text-xs text-gray-400 text-center pt-1">
                  比賽已開始,不能刪除選手 — 臨時不來請到「分組設定」標記<b>未到</b>
                </p>
              )}
            </div>
          ) : (
            <button key={p.id} onClick={() => setEditing({ ...p })}
              className="w-full flex items-center gap-3 py-2.5 text-left">
              <span className="w-6 text-gray-400 text-sm">{p.player_number}</span>
              <span className="flex-1 min-w-0">
                <span className="font-medium text-gray-900">{p.chinese_name || p.english_name}</span>
                {p.chinese_name && <span className="text-gray-500 text-sm ml-1.5">{p.english_name}</span>}
                {p.wildcard ? (
                  <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">外卡</span>
                ) : null}
                {p.tee === 'red' ? (
                  <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-300">紅</span>
                ) : null}
              </span>
              <span className="text-sm text-gray-500">差點 {p.handicap}</span>
              <span className="text-gray-300">›</span>
            </button>
          ))}
          {players.length === 0 && <p className="py-6 text-center text-gray-400 text-sm">尚無選手</p>}
        </div>

        {/* Adding one player leaves everyone else's scores and groups untouched,
            unlike the bulk import below. Setup only, matching the server. */}
        {/* From the club roster — the usual way to fill a new tournament */}
        {status === 'setup' && (fromRoster ? (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-sm font-bold text-gray-700 mb-1">從球隊名單加入</p>
            <p className="text-xs text-gray-400 mb-2">
              差點會帶入球隊名單上的數字,加入後可以在這裡單獨微調,<b>不會改到球隊名單</b>。
            </p>
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {fromRoster.map((m, i) => (
                <label key={m.id}
                  className={`flex items-center gap-2 py-2 ${m.already ? 'opacity-40' : 'cursor-pointer'}`}>
                  <input type="checkbox" className="w-4 h-4" checked={m.chosen} disabled={m.already}
                    onChange={e => setFromRoster(list => list.map((x, j) =>
                      j === i ? { ...x, chosen: e.target.checked } : x))} />
                  <span className="flex-1 min-w-0">
                    <span className="text-sm text-gray-900">
                      {[m.chinese_name, m.english_name].filter(Boolean).join(' ')}
                    </span>
                    {m.status === 'wildcard' && (
                      <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">外卡</span>
                    )}
                    <span className="block text-xs text-gray-400">
                      差點 {m.handicap} · {m.roundsPlayed} 場{m.already ? ' · 已在名單上' : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={addFromRoster} disabled={saving}
                className="flex-1 bg-emerald-800 text-white py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
                加入勾選的 {fromRoster.filter(m => m.chosen && !m.already).length} 位
              </button>
              <button onClick={() => setFromRoster(null)}
                className="px-4 bg-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">取消</button>
            </div>
          </div>
        ) : !adding && (
          <button onClick={openRoster} disabled={saving}
            className="mt-3 w-full bg-white border-2 border-emerald-700 text-emerald-800 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
            🧑‍🤝‍🧑 從球隊名單加入
          </button>
        ))}

        {status === 'setup' && (adding ? (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            <p className="text-sm font-bold text-gray-700">新增選手</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="border border-gray-300 rounded px-2 py-2 text-sm" placeholder="中文名（可空白）"
                value={adding.chinese_name} onChange={e => setAdding({ ...adding, chinese_name: e.target.value })} />
              <input className="border border-gray-300 rounded px-2 py-2 text-sm" placeholder="英文名"
                value={adding.english_name} onChange={e => setAdding({ ...adding, english_name: e.target.value })} />
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-sm text-gray-600">差點</label>
              <input type="number" inputMode="numeric" className="w-20 border border-gray-300 rounded px-2 py-2 text-sm"
                value={adding.handicap} onChange={e => setAdding({ ...adding, handicap: e.target.value })} />
              <button onClick={() => setAdding({ ...adding, tee: adding.tee === 'red' ? 'white' : 'red' })}
                className={`px-3 py-2 rounded text-sm font-medium ${adding.tee === 'red' ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-gray-100 text-gray-700 border border-gray-300'}`}>
                {adding.tee === 'red' ? '紅 Tee' : '白 Tee'}
              </button>
              <button onClick={() => setAdding({ ...adding, wildcard: adding.wildcard ? 0 : 1 })}
                className={`px-3 py-2 rounded text-sm font-medium ${adding.wildcard ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-gray-100 text-gray-500 border border-gray-300'}`}>
                {adding.wildcard ? '外卡' : '非外卡'}
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={addOne} disabled={saving}
                className="flex-1 bg-emerald-800 text-white py-2 rounded text-sm font-bold disabled:opacity-50">
                新增為第 {players.length + 1} 位
              </button>
              <button onClick={() => setAdding(null)}
                className="px-4 bg-gray-200 text-gray-700 py-2 rounded text-sm">取消</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding({ ...blankPlayer })}
            className="mt-3 w-full border border-dashed border-emerald-400 text-emerald-800 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-50">
            ＋ 新增一位選手
          </button>
        ))}
      </Card>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
        <button onClick={() => setShowBulk(v => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-left">
          <span className="font-bold text-gray-700">📋 批次匯入名單</span>
          <span className="text-gray-400">{showBulk ? '▲' : '▼'}</span>
        </button>
        {showBulk && (
          <div className="px-4 pb-4">
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 mb-3">
              ⚠️ 匯入會<b>取代整份名單</b>並清除所有成績與分組。比賽開始後請改用上面的單筆修改。
            </div>
            <p className="text-xs text-gray-500 mb-2">
              一行一位。可寫中文名、英文名或兩者都寫，最後的數字是差點，加「外卡」會標記為外卡。
            </p>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              rows={10} value={bulk} onChange={e => setBulk(e.target.value)}
              placeholder={'1. Benny (差：14)\n2. JJ 14\n3. Lola 19 外卡\n4. 林褚君 William 11'} />
            <button onClick={importBulk} disabled={saving || !bulk.trim()}
              className="w-full mt-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-2.5 rounded-lg disabled:opacity-50">
              匯入並取代名單
            </button>
          </div>
        )}
      </div>
    </GjAdminShell>
  )
}
