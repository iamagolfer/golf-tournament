import { useState, useEffect } from 'react'
import { gjApi } from '../../api'
import { GjAdminShell, Card, useSaver } from './GjAdminShell'

// Which side awards run this year. The list of types and their parameters comes
// from the server, so adding an award in logic/gjAwards.js makes it appear here
// without touching this page.
export default function GjAwardsSettings() {
  document.title = '綠夾克盃 — 獎項設定'
  const { saving, run, banner } = useSaver()
  const [types, setTypes] = useState([])
  const [awards, setAwards] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { load() }, [])
  const load = () => gjApi.get('/tournament').then(d => {
    setTypes(d.awardTypes || [])
    setAwards(d.awards || [])
    setLoaded(true)
  })

  const specOf = (type) => types.find(t => t.type === type)

  const add = (type) => {
    const spec = specOf(type)
    if (!spec) return
    const params = {}
    spec.params.forEach(p => { params[p.key] = p.default })
    setAwards(a => [...a, { type, name: spec.defaultName, params }])
  }
  const update = (i, patch) => setAwards(a => a.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const setParam = (i, key, value) =>
    setAwards(a => a.map((x, j) => (j === i ? { ...x, params: { ...x.params, [key]: value } } : x)))
  const remove = (i) => setAwards(a => a.filter((_, j) => j !== i))
  const move = (i, dir) => setAwards(a => {
    const j = i + dir
    if (j < 0 || j >= a.length) return a
    const copy = [...a]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return copy
  })

  const save = () => run(async () => {
    const r = await gjApi.put('/tournament/awards', {
      awards: awards.map(a => ({
        type: a.type,
        name: a.name,
        params: Object.fromEntries(Object.entries(a.params || {}).map(([k, v]) => [k, Number(v)])),
      })),
    })
    setAwards(r.awards || [])
  }, '獎項已儲存 ✓')

  if (!loaded) {
    return <div className="min-h-screen flex items-center justify-center text-emerald-900">載入中...</div>
  }

  return (
    <GjAdminShell title="獎項設定" subtitle="淨桿排名上的附加獎" showBack backTo="/admin/gj/dashboard">
      {banner}

      <Card title="今年要發的獎">
        <p className="text-xs text-gray-400 mb-3">
          只算<b>打完全場</b>的人,未到者不列入。全部選手打完後才會出現在排名頁。
          名稱可以自己改,順序就是徽章顯示的順序。
        </p>

        {awards.length === 0 && (
          <p className="py-5 text-center text-sm text-gray-400">
            目前沒有任何獎項 — 排名頁不會顯示徽章
          </p>
        )}

        <div className="space-y-3">
          {awards.map((a, i) => {
            const spec = specOf(a.type)
            if (!spec) return null
            return (
              <div key={i} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{spec.emoji}</span>
                  <input
                    className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1.5 text-sm font-medium"
                    value={a.name} maxLength={20}
                    onChange={e => update(i, { name: e.target.value })} />
                  <button onClick={() => move(i, -1)} disabled={i === 0}
                    className="w-7 h-7 rounded bg-gray-100 text-gray-500 disabled:opacity-30">▲</button>
                  <button onClick={() => move(i, 1)} disabled={i === awards.length - 1}
                    className="w-7 h-7 rounded bg-gray-100 text-gray-500 disabled:opacity-30">▼</button>
                  <button onClick={() => remove(i)}
                    className="w-7 h-7 rounded bg-white border border-red-200 text-red-600 text-sm">✕</button>
                </div>

                {spec.params.length > 0 && (
                  <div className="flex items-center gap-2 mb-1.5">
                    {spec.params.map(p => (
                      <label key={p.key} className="flex items-center gap-1.5 text-sm text-gray-600">
                        {p.label}
                        <input type="number" inputMode="numeric" min={p.min} max={p.max}
                          className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center"
                          value={a.params?.[p.key] ?? p.default}
                          onChange={e => setParam(i, p.key, e.target.value)} />
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-400">{spec.hint}</p>
              </div>
            )
          })}
        </div>

        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500 mb-2">加入獎項（同一種可以加多個,例如跳七獎和跳五獎）</p>
          <div className="grid gap-1.5">
            {types.map(t => (
              <button key={t.type} onClick={() => add(t.type)}
                className="flex items-center gap-2 text-left border border-dashed border-emerald-300 rounded-lg px-3 py-2 hover:bg-emerald-50">
                <span className="text-lg">{t.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-emerald-900">＋ {t.label}</span>
                  <span className="block text-xs text-gray-400 truncate">{t.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <button onClick={save} disabled={saving}
        className="w-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-3 rounded-lg disabled:opacity-50 mb-4">
        {saving ? '儲存中...' : '儲存獎項設定'}
      </button>
    </GjAdminShell>
  )
}
