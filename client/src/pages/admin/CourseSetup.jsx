import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'

function defaultSection(name, order) {
  return {
    name,
    order,
    holes: Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1, par: 4, yards: 0 }))
  }
}

export default function CourseSetup() {
  const navigate = useNavigate()
  const [sections, setSections] = useState([defaultSection('前9', 1), defaultSection('後9', 2)])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/tournament').then(d => {
      if (d.sections && d.sections.length > 0) {
        const built = d.sections.map(sec => {
          const secHoles = d.holes.filter(h => h.section_id === sec.id)
          return {
            name: sec.name,
            order: sec.section_order,
            holes: secHoles.length > 0
              ? secHoles.map(h => ({ hole_number: h.hole_number, par: h.par, yards: h.yards }))
              : Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1, par: 4, yards: 0 }))
          }
        })
        setSections(built)
      }
    })
  }, [])

  function addSection() {
    const names = ['東區', '西區', '中區', '南區', '北區']
    const name = names[sections.length - 2] || `第${sections.length + 1}區`
    setSections([...sections, defaultSection(name, sections.length + 1)])
  }

  function removeSection(idx) {
    if (sections.length <= 2) return
    setSections(sections.filter((_, i) => i !== idx))
  }

  function updateSectionName(idx, name) {
    const updated = [...sections]
    updated[idx] = { ...updated[idx], name }
    setSections(updated)
  }

  function updateHole(secIdx, holeIdx, field, value) {
    const updated = sections.map((sec, si) => {
      if (si !== secIdx) return sec
      return {
        ...sec,
        holes: sec.holes.map((h, hi) =>
          hi === holeIdx ? { ...h, [field]: Number(value) || 0 } : h
        )
      }
    })
    setSections(updated)
  }

  async function handleSave() {
    setError('')
    for (const sec of sections) {
      if (!sec.name.trim()) return setError('每個球區都需要名稱 All sections need a name')
    }
    try {
      await api.put('/tournament/course', { sections })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    }
  }

  const parLabels = { 3: 'Par 3', 4: 'Par 4', 5: 'Par 5' }

  return (
    <div className="min-h-screen bg-green-50">
      <div className="bg-green-800 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin/dashboard')} className="text-green-200 text-xl">‹</button>
        <div>
          <h1 className="text-xl font-bold">球場設定</h1>
          <p className="text-green-200 text-sm">Course Setup</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {sections.map((sec, si) => (
          <div key={si} className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-3 mb-4">
              <input
                value={sec.name}
                onChange={e => updateSectionName(si, e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 font-bold text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="區域名稱 e.g. 前9"
              />
              {sections.length > 2 && (
                <button onClick={() => removeSection(si)}
                  className="text-red-400 hover:text-red-600 text-sm px-2 py-1 border border-red-200 rounded-lg">
                  刪除
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs">
                    <th className="text-left py-1 w-8">洞</th>
                    <th className="text-left py-1">Par</th>
                    <th className="text-left py-1">碼數 Yards</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.holes.map((hole, hi) => (
                    <tr key={hi} className="border-t border-gray-100">
                      <td className="py-2 font-medium text-gray-600">{hole.hole_number}</td>
                      <td className="py-2">
                        <select
                          value={hole.par}
                          onChange={e => updateHole(si, hi, 'par', e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                        >
                          <option value={3}>Par 3</option>
                          <option value={4}>Par 4</option>
                          <option value={5}>Par 5</option>
                        </select>
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          min="0"
                          max="700"
                          value={hole.yards || ''}
                          onChange={e => updateHole(si, hi, 'yards', e.target.value)}
                          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 font-bold text-sm text-gray-700">
                    <td className="pt-2">合計</td>
                    <td className="pt-2">Par {sec.holes.reduce((s, h) => s + h.par, 0)}</td>
                    <td className="pt-2">{sec.holes.reduce((s, h) => s + (h.yards || 0), 0)} yds</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))}

        <button onClick={addSection}
          className="w-full border-2 border-dashed border-green-300 hover:border-green-500 text-green-600 hover:text-green-800 rounded-xl py-3 text-sm font-medium transition">
          + 新增球區 Add Section (27/36 holes)
        </button>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

        <button onClick={handleSave}
          className={`w-full py-3 rounded-xl font-bold text-lg transition ${saved ? 'bg-green-500 text-white' : 'bg-green-700 hover:bg-green-800 text-white'}`}>
          {saved ? '✓ 已儲存 Saved!' : '儲存球場設定 Save Course'}
        </button>
      </div>
    </div>
  )
}
