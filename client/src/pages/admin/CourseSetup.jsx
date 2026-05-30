import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'

function defaultSection(name, order) {
  return {
    id: null,
    name,
    order,
    active: true,
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
            id: sec.id,
            name: sec.name,
            order: sec.section_order,
            active: sec.active !== 0,
            holes: secHoles.length > 0
              ? secHoles.map(h => ({ hole_number: h.hole_number, par: h.par, yards: h.yards }))
              : Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1, par: 4, yards: 0 }))
          }
        })
        setSections(built)
      }
    })
  }, [])

  async function toggleActive(idx) {
    const sec = sections[idx]
    const newActive = !sec.active
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, active: newActive } : s))
    if (sec.id) {
      try {
        await api.put(`/tournament/sections/${sec.id}/active`, { active: newActive })
      } catch {
        setSections(prev => prev.map((s, i) => i === idx ? { ...s, active: !newActive } : s))
      }
    }
  }

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
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, name } : s))
  }

  function updateHole(secIdx, holeIdx, field, value) {
    setSections(prev => prev.map((sec, si) => {
      if (si !== secIdx) return sec
      return {
        ...sec,
        holes: sec.holes.map((h, hi) =>
          hi === holeIdx ? { ...h, [field]: Number(value) || 0 } : h
        )
      }
    }))
  }

  async function handleSave() {
    setError('')
    for (const sec of sections) {
      if (!sec.name.trim()) return setError('每個球區都需要名稱 All sections need a name')
    }
    try {
      await api.put('/tournament/course', { sections })
      // Reload to get fresh IDs after re-insert
      const d = await api.get('/tournament')
      if (d.sections && d.sections.length > 0) {
        setSections(d.sections.map(sec => {
          const secHoles = d.holes.filter(h => h.section_id === sec.id)
          return {
            id: sec.id,
            name: sec.name,
            order: sec.section_order,
            active: sec.active !== 0,
            holes: secHoles.map(h => ({ hole_number: h.hole_number, par: h.par, yards: h.yards }))
          }
        }))
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    }
  }

  const activeSections   = sections.filter(s => s.active)
  const totalActiveHoles = activeSections.reduce((sum, s) => sum + s.holes.length, 0)
  const totalActivePar   = activeSections.reduce((sum, s) => sum + s.holes.reduce((p, h) => p + h.par, 0), 0)

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

        {/* ── Today's Play Selection ── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="font-bold text-gray-800 mb-1">⛳ 今日賽程 Today's Course</h2>
          <p className="text-xs text-gray-400 mb-3">點選要出賽的球區 · 成績和排名只計算已選球區</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {sections.map((sec, idx) => (
              <button key={idx} onClick={() => toggleActive(idx)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition
                  ${sec.active
                    ? 'bg-green-700 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-400'}`}>
                {sec.active ? '✓ ' : ''}{sec.name || `區${idx + 1}`}
              </button>
            ))}
          </div>
          {activeSections.length > 0 ? (
            <p className="text-xs text-green-700 font-medium">
              出賽：{activeSections.map(s => s.name).join(' + ')} · {totalActiveHoles}洞 · Par {totalActivePar}
            </p>
          ) : (
            <p className="text-xs text-red-500">⚠ 請至少選擇一個球區</p>
          )}
        </div>

        {/* ── Section cards ── */}
        {sections.map((sec, si) => (
          <div key={si} className={`bg-white rounded-xl shadow-sm p-4 transition ${!sec.active ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-3 mb-4">
              <input
                value={sec.name}
                onChange={e => updateSectionName(si, e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 font-bold text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="區域名稱 e.g. 前9"
              />
              {!sec.active && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg whitespace-nowrap">今日不出賽</span>
              )}
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
