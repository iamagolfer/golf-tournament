import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'

export default function RulesEditor() {
  const navigate = useNavigate()
  const [rules, setRules] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get('/tournament').then(d => {
      if (d.tournament?.rules_text) setRules(d.tournament.rules_text)
    })
  }, [])

  async function handleSave() {
    await api.put('/tournament/rules', { rules_text: rules })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="min-h-screen bg-green-50">
      <div className="bg-green-800 text-white px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin/dashboard')} className="text-green-200 text-xl">‹</button>
        <div>
          <h1 className="text-xl font-bold">賽規文字</h1>
          <p className="text-green-200 text-sm">Tournament Rules</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500 mb-2">
            輸入本次比賽的詳細規則（中文/英文均可），會顯示在公開頁面給所有人查看。
          </p>
          <textarea
            value={rules}
            onChange={e => setRules(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500 min-h-[300px]"
            placeholder="輸入賽事規則... Enter tournament rules..."
          />
        </div>

        <button onClick={handleSave}
          className={`w-full py-3 rounded-xl font-bold text-lg transition ${saved ? 'bg-green-500 text-white' : 'bg-green-700 hover:bg-green-800 text-white'}`}>
          {saved ? '✓ 已儲存 Saved!' : '儲存規則 Save Rules'}
        </button>
      </div>
    </div>
  )
}
