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
