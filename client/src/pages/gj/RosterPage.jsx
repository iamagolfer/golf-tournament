import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { GjAdminShell, Card, useSaver } from './GjAdminShell'

// The club roster — the people, not a tournament's entry list. Shared by both
// tournaments, so it is reachable from either admin panel.
const STATUS = {
  regular:  { label: '正規', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  wildcard: { label: '外卡', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  inactive: { label: '已退出', cls: 'bg-gray-100 text-gray-500 border-gray-300' },
}
const nameOf = (p) => [p.chinese_name, p.english_name].filter(Boolean).join(' ') || '(未命名)'

export default function RosterPage() {
  document.title = '球隊名單'
  const { saving, run, banner } = useSaver()
  const [roster, setRoster] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(null)
  const [importing, setImporting] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => { load() }, [])
  const load = () => api.get('/roster').then(d => { setRoster(d.roster || []); setLoaded(true) })

  const blank = { chinese_name: '', english_name: '', handicap: '', status: 'regular', tee: 'white' }

  const addOne = () => {
    if (!adding.chinese_name.trim() && !adding.english_name.trim()) { alert('請至少填寫中文名或英文名'); return }
    if (adding.handicap === '' || !Number.isFinite(Number(adding.handicap))) { alert('請填寫差點'); return }
    run(async () => {
      await api.post('/roster', { ...adding, handicap: Number(adding.handicap) })
      await load()
      setAdding(null)
    }, '已新增球員 ✓')
  }

  const openImport = () => run(async () => {
    const d = await api.get('/roster/import/preview')
    const fresh = (d.candidates || []).filter(c => !c.alreadyInRoster)
    setImporting(fresh.map(c => ({ ...c, chosen: true })))
  }, `找到 ${''}`)

  const doImport = () => run(async () => {
    const chosen = importing.filter(c => c.chosen)
    const r = await api.post('/roster/import', { players: chosen })
    await load()
    setImporting(null)
    alert(`已加入 ${r.added} 位，接回 ${r.linked} 筆比賽紀錄`)
  }, '已建立球隊名單 ✓')

  if (!loaded) {
    return <div className="min-h-screen flex items-center justify-center text-emerald-900">載入中...</div>
  }

  const shown = filter === 'all' ? roster : roster.filter(m => m.status === filter)
  const count = (s) => roster.filter(m => m.status === s).length

  return (
    <GjAdminShell title="球隊名單" subtitle={`${roster.length} 位球員`} showBack backTo="/admin">
      {banner}

      {/* Seeding from what already exists — offered until everyone is in */}
      {importing ? (
        <Card title="從既有比賽建立名單" accent="bg-amber-400 text-amber-950">
          <p className="text-xs text-gray-500 mb-3">
            從兩個比賽的名單與封存紀錄找出來的人。同一個人在不同比賽會自動合併,
            缺的中文名也會互相補齊。<b>請確認沒有把兩個人併成一個</b>。
          </p>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {importing.map((c, i) => (
              <label key={i} className="flex items-center gap-2 py-2 cursor-pointer">
                <input type="checkbox" checked={c.chosen} className="w-4 h-4"
                  onChange={e => setImporting(list => list.map((x, j) =>
                    j === i ? { ...x, chosen: e.target.checked } : x))} />
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900">{nameOf(c)}</span>
                  <span className="block text-xs text-gray-400 truncate">
                    差點 {c.handicap}{c.wildcard ? ' · 外卡' : ''} · {c.sources.join('、')}
                  </span>
                </span>
              </label>
            ))}
            {importing.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">沒有新的球員可以加入</p>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={doImport} disabled={saving || !importing.some(c => c.chosen)}
              className="flex-1 bg-emerald-800 text-white py-2.5 rounded-lg font-bold disabled:opacity-50">
              加入勾選的 {importing.filter(c => c.chosen).length} 位
            </button>
            <button onClick={() => setImporting(null)}
              className="px-5 bg-gray-200 text-gray-700 py-2.5 rounded-lg">取消</button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-2 mb-4">
          <button onClick={() => setAdding({ ...blank })} disabled={saving}
            className="w-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-3 rounded-lg disabled:opacity-50">
            ＋ 新增球員
          </button>
          <button onClick={openImport} disabled={saving}
            className="w-full bg-white border-2 border-emerald-700 text-emerald-800 font-bold py-3 rounded-lg disabled:opacity-50">
            📥 從既有比賽建立名單
          </button>
        </div>
      )}

      {adding && (
        <Card title="新增球員">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input className="border border-gray-300 rounded px-2 py-2 text-sm" placeholder="中文名"
              value={adding.chinese_name} onChange={e => setAdding({ ...adding, chinese_name: e.target.value })} />
            <input className="border border-gray-300 rounded px-2 py-2 text-sm" placeholder="英文名"
              value={adding.english_name} onChange={e => setAdding({ ...adding, english_name: e.target.value })} />
          </div>
          <div className="flex gap-2 items-center mb-3">
            <label className="text-sm text-gray-600">差點</label>
            <input type="number" inputMode="numeric" className="w-20 border border-gray-300 rounded px-2 py-2 text-sm"
              value={adding.handicap} onChange={e => setAdding({ ...adding, handicap: e.target.value })} />
            <button onClick={() => setAdding({ ...adding, status: adding.status === 'regular' ? 'wildcard' : 'regular' })}
              className={`px-3 py-2 rounded text-sm font-medium border ${STATUS[adding.status].cls}`}>
              {STATUS[adding.status].label}
            </button>
            <button onClick={() => setAdding({ ...adding, tee: adding.tee === 'red' ? 'white' : 'red' })}
              className={`px-3 py-2 rounded text-sm font-medium ${adding.tee === 'red' ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-gray-100 text-gray-700 border border-gray-300'}`}>
              {adding.tee === 'red' ? '紅 Tee' : '白 Tee'}
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={addOne} disabled={saving}
              className="flex-1 bg-emerald-800 text-white py-2 rounded text-sm font-bold disabled:opacity-50">新增</button>
            <button onClick={() => setAdding(null)}
              className="px-4 bg-gray-200 text-gray-700 py-2 rounded text-sm">取消</button>
          </div>
        </Card>
      )}

      <div className="flex gap-1.5 mb-3">
        {[['all', `全部 ${roster.length}`], ['regular', `正規 ${count('regular')}`],
          ['wildcard', `外卡 ${count('wildcard')}`], ['inactive', `已退出 ${count('inactive')}`]].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition
              ${filter === key ? 'bg-emerald-800 text-white' : 'bg-white text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden mb-4">
        {shown.length === 0 && (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">
            {roster.length === 0 ? '還沒有球員 — 按上面的「從既有比賽建立名單」開始' : '這個分類沒有人'}
          </p>
        )}
        {shown.map(m => (
          <Link key={m.id} to={`/admin/roster/${m.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-emerald-50">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-gray-900">{nameOf(m)}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${STATUS[m.status]?.cls}`}>
                  {STATUS[m.status]?.label}
                </span>
                {m.tee === 'red' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-300">紅</span>
                )}
              </div>
              <div className="text-xs text-gray-400">
                參賽 {m.roundsPlayed} 場
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-emerald-900">{m.handicap}</div>
              <div className="text-[10px] text-gray-400">差點</div>
            </div>
            <span className="text-gray-300">›</span>
          </Link>
        ))}
      </div>
    </GjAdminShell>
  )
}
