import { useState, useEffect } from 'react'
import { gjApi } from '../../api'
import { GjAdminShell, Card, SaveButton, useSaver } from './GjAdminShell'

const blankSection = (name) => ({
  name,
  active: 1,
  holes: Array.from({ length: 9 }, (_, i) => ({ hole_label: '', par: 4, yards: 0, yards_red: 0 })),
})

export default function GjCourseSetup() {
  document.title = '綠夾克盃 — 球場設定'
  const { saving, run, banner } = useSaver()
  const [sections, setSections] = useState(null)

  useEffect(() => {
    gjApi.get('/tournament').then(t => {
      const secs = (t.sections || []).map(sec => ({
        name: sec.name,
        active: sec.active,
        holes: (t.holes || []).filter(h => h.section_id === sec.id).map(h => ({
          hole_label: h.hole_label || String(h.hole_number),
          par: h.par, yards: h.yards || 0, yards_red: h.yards_red || 0,
        })),
      }))
      setSections(secs.length ? secs : [blankSection('前九'), blankSection('後九')])
    })
  }, [])

  const setHole = (si, hi, key, value) => setSections(prev => {
    const next = prev.map(s => ({ ...s, holes: s.holes.map(h => ({ ...h })) }))
    next[si].holes[hi][key] = key === 'hole_label' ? value : Number(value) || 0
    return next
  })
  const setSectionName = (si, name) => setSections(prev =>
    prev.map((s, i) => i === si ? { ...s, name } : s))

  const save = () => run(() => gjApi.put('/tournament/course', { sections }), '球場已儲存 ✓')

  if (!sections) return <div className="min-h-screen flex items-center justify-center text-emerald-900">載入中...</div>

  const grandPar = sections.reduce((s, sec) => s + sec.holes.reduce((a, h) => a + h.par, 0), 0)

  return (
    <GjAdminShell title="球場設定" subtitle={`總 Par ${grandPar}`}>
      {banner}

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 mb-4">
        <b>洞號</b>可以填任何文字（例如 <b>10A</b>），會照這裡的順序當作實際打球順序。
        後九最後一洞就是同分判定「逐洞倒數」的第一個比較對象。
        <br />15 洞整修完成後，把 <b>10A</b> 改成 <b>15</b> 並調整順序即可，排名規則會自動跟著變。
        <br /><b>已輸入的成績不會因為存檔而消失。</b>
      </div>

      {sections.map((sec, si) => {
        const par = sec.holes.reduce((a, h) => a + h.par, 0)
        const white = sec.holes.reduce((a, h) => a + h.yards, 0)
        const red = sec.holes.reduce((a, h) => a + h.yards_red, 0)
        return (
          <Card key={si} title={`${sec.name} — Par ${par} · 白 ${white} · 紅 ${red}`}>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={sec.name} onChange={e => setSectionName(si, e.target.value)} placeholder="區段名稱" />
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse w-full">
                <thead>
                  <tr className="text-xs text-gray-500 border-b">
                    <th className="py-1.5 text-left w-8">#</th>
                    <th className="py-1.5 text-left">洞號</th>
                    <th className="py-1.5 text-left">Par</th>
                    <th className="py-1.5 text-left">白 Tee</th>
                    <th className="py-1.5 text-left">紅 Tee</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.holes.map((h, hi) => (
                    <tr key={hi} className="border-b border-gray-50">
                      <td className="py-1 text-gray-400 text-xs">{hi + 1}</td>
                      <td className="py-1 pr-1">
                        <input className="w-16 border border-gray-300 rounded px-2 py-1.5 text-center font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                          value={h.hole_label} onChange={e => setHole(si, hi, 'hole_label', e.target.value)} />
                      </td>
                      <td className="py-1 pr-1">
                        <input type="number" min="3" max="6" className="w-14 border border-gray-300 rounded px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                          value={h.par} onChange={e => setHole(si, hi, 'par', e.target.value)} />
                      </td>
                      <td className="py-1 pr-1">
                        <input type="number" min="0" className="w-20 border border-gray-300 rounded px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                          value={h.yards} onChange={e => setHole(si, hi, 'yards', e.target.value)} />
                      </td>
                      <td className="py-1">
                        <input type="number" min="0" className="w-20 border border-red-200 bg-red-50 rounded px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                          value={h.yards_red} onChange={e => setHole(si, hi, 'yards_red', e.target.value)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      })}

      <SaveButton onClick={save} saving={saving} />
    </GjAdminShell>
  )
}
