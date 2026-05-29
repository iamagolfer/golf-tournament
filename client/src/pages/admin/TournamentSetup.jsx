import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'

export default function TournamentSetup() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ course_name: '', date: '', tee_time: '', total_players: '' })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/tournament').then(d => {
      if (d.tournament) {
        setForm({
          course_name: d.tournament.course_name || '',
          date: d.tournament.date || '',
          tee_time: d.tournament.tee_time || '',
          total_players: d.tournament.total_players || '',
        })
      }
    })
  }, [])

  async function handleSave() {
    setError('')
    if (!form.course_name) return setError('請輸入球場名稱 Please enter course name')
    if (!form.date) return setError('請選擇日期 Please select date')
    try {
      await api.put('/tournament/info', form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen bg-green-50">
      <div className="bg-green-800 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin/dashboard')} className="text-green-200 text-xl">‹</button>
        <div>
          <h1 className="text-xl font-bold">賽事設定</h1>
          <p className="text-green-200 text-sm">Tournament Setup</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">球場名稱 Course Name</label>
            <input
              value={form.course_name}
              onChange={e => setForm({ ...form, course_name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g. 林口球場"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">比賽日期 Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開球時間 Tee Time</label>
            <input
              type="time"
              value={form.tee_time}
              onChange={e => setForm({ ...form, tee_time: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              預計參賽人數 Total Players
              <span className="text-gray-400 text-xs ml-1">(用於驗證球員名單)</span>
            </label>
            <input
              type="number"
              min="2"
              max="50"
              value={form.total_players}
              onChange={e => setForm({ ...form, total_players: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g. 13"
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

          <button
            onClick={handleSave}
            className={`w-full py-3 rounded-lg font-bold text-lg transition ${saved ? 'bg-green-500 text-white' : 'bg-green-700 hover:bg-green-800 text-white'}`}
          >
            {saved ? '✓ 已儲存 Saved!' : '儲存 Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
