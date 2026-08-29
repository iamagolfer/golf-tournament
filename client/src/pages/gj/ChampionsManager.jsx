import { useState, useEffect } from 'react'
import { GjAdminShell, Card, useSaver } from './GjAdminShell'

// Shared by both tournaments — the caller passes the scoped api client, so the
// Ring Cup and the Green Jacket edit their own separate lists of champions.
export default function ChampionsManager({ api, title = '歷屆冠軍', backTo, theme = 'gj' }) {
  document.title = title
  const { saving, run, banner } = useSaver()
  const [champions, setChampions] = useState([])
  const [editing, setEditing] = useState(null)

  useEffect(() => { load() }, [])
  const load = () => api.get('/champions').then(d => setChampions(d.champions || []))

  const blank = () => ({ id: null, year: '', course: '', champion_name: '', results: [] })

  const save = () => {
    if (!editing.year || !editing.champion_name) { alert('年份與冠軍必填'); return }
    run(async () => {
      const body = {
        year: editing.year,
        course: editing.course,
        champion_name: editing.champion_name,
        results: editing.results.filter(r => r.player_name.trim()),
      }
      if (editing.id) await api.put(`/champions/${editing.id}`, body)
      else await api.post('/champions', body)
      await load()
      setEditing(null)
    }, '已儲存 ✓')
  }

  // Pulls the finished tournament's leaderboard into the editor. Loading it as a
  // draft rather than saving straight away lets the organiser fix names first.
  const importFromTournament = () => run(async () => {
    const preview = await api.get('/champions/preview-from-tournament')
    const existing = champions.find(c => c.year === preview.year)
    setEditing({
      id: existing?.id || null,
      year: preview.year,
      course: preview.course,
      champion_name: preview.champion_name,
      results: preview.results,
    })
  }, '已帶入成績，確認後請按儲存')

  const remove = (c) => {
    if (!confirm(`確定刪除 ${c.year} 年的紀錄？`)) return
    run(async () => { await api.delete(`/champions/${c.id}`); await load() }, '已刪除 ✓')
  }

  const setResult = (i, key, value) => setEditing(e => {
    const results = e.results.map((r, j) => j === i ? { ...r, [key]: value } : r)
    return { ...e, results }
  })

  const accent = theme === 'ring' ? 'bg-green-700 text-white' : 'bg-emerald-800 text-white'

  return (
    <GjAdminShell title={title} showBack={!!backTo} backTo={backTo}>
      {banner}

      {editing ? (
        <Card title={editing.id ? '修改紀錄' : '新增紀錄'} accent={accent}>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">年份 *</label>
              <input className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                value={editing.year} onChange={e => setEditing({ ...editing, year: e.target.value })}
                placeholder="2026" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">球場</label>
              <input className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                value={editing.course} onChange={e => setEditing({ ...editing, course: e.target.value })}
                placeholder="再興高爾夫俱樂部" />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">冠軍 *</label>
            <input className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
              value={editing.champion_name} onChange={e => setEditing({ ...editing, champion_name: e.target.value })}
              placeholder="王小明 Jimmy" />
          </div>

          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">當年成績（可留空）</label>
            <div className="space-y-1.5">
              {editing.results.map((r, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <span className="w-6 text-right text-xs text-gray-400">{i + 1}.</span>
                  <input className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                    value={r.player_name} onChange={e => setResult(i, 'player_name', e.target.value)}
                    placeholder="選手" />
                  <input className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm"
                    value={r.score} onChange={e => setResult(i, 'score', e.target.value)}
                    placeholder="+4" />
                  <button onClick={() => setEditing({ ...editing, results: editing.results.filter((_, j) => j !== i) })}
                    className="w-8 h-8 rounded bg-white border border-red-200 text-red-600 text-sm">✕</button>
                </div>
              ))}
            </div>
            <button onClick={() => setEditing({ ...editing, results: [...editing.results, { player_name: '', score: '' }] })}
              className="mt-2 text-sm text-emerald-800 underline">+ 加一位選手</button>
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-2.5 rounded-lg disabled:opacity-50">
              {saving ? '儲存中...' : '儲存'}
            </button>
            <button onClick={() => setEditing(null)}
              className="px-5 bg-gray-200 text-gray-700 py-2.5 rounded-lg">取消</button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-2 mb-4">
          <button onClick={() => setEditing(blank())}
            className="w-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-3 rounded-lg">
            + 新增一年
          </button>
          <button onClick={importFromTournament} disabled={saving}
            className="w-full bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold py-3 rounded-lg disabled:opacity-50">
            📥 從本次比賽成績匯入
          </button>
          <p className="text-xs text-gray-400 text-center">
            自動帶入今年的冠軍與全部選手成績，可再手動調整後儲存
          </p>
        </div>
      )}

      <Card title={`已建立 ${champions.length} 筆`}>
        <div className="divide-y divide-gray-100">
          {champions.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-3">
              <span className="text-amber-600 font-bold w-12">{c.year}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">🥇 {c.champion_name}</div>
                <div className="text-xs text-gray-400 truncate">
                  {c.course || '未填球場'}
                  {c.results.length > 0 && ` · ${c.results.length} 筆成績`}
                </div>
              </div>
              <button onClick={() => setEditing({ ...c, results: c.results.map(r => ({ ...r })) })}
                className="text-sm text-emerald-800 underline">修改</button>
              <button onClick={() => remove(c)} disabled={saving}
                className="text-sm text-red-600 underline disabled:opacity-50">刪除</button>
            </div>
          ))}
          {champions.length === 0 && <p className="py-6 text-center text-gray-400 text-sm">尚無紀錄</p>}
        </div>
      </Card>
    </GjAdminShell>
  )
}
