import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'

const DEFAULT_BRIEF_RULES =
`【計分方式 Scoring System】
每位球員打完18洞後，以當天成績（總桿）扣除個人差點 = 淨桿成績。
為加速賽事，三桿洞最多8桿, 四桿洞最多9桿，五桿洞最多10桿
一切照球場Rules OB原地重打，紅色障礙兩個球桿內重打
新豐樹很多，如果可能會找不到球，可以多打一個Provisional球
推桿要將球推進洞才算

【排名 Ranking】
淨桿成績最低者排名第一。共13名球員，第1名得13分，第名得1分，未出席得0分。

【同分處理 Tiebreakers】
淨桿相同時，依序以下列標準決定：
1. 低於標準桿洞數最多（雙老鷹/老鷹/小鳥均算）
2. 標準桿洞數最多
3. 柏忌洞數最少
4. 雙柏忌洞數最少
5. 三柏忌、四柏忌… 依此類推，洞數最少者優先
6. 仍相同則並列同名次

【選馬制度 Horse Pick System】
比賽前每位球員各選一名「馬」（可選自己）。
最終總得分 = 自己的淨桿名次得分 + 選的馬的淨桿名次得分
得分最低的後6名請吃晚餐！

【選馬規則】
• 選馬在賽前開放，比賽前一個小時鎖定不可更改
• 每人需輸入自己的PIN碼才能選/改馬，防止誤觸`

export default function RulesEditor() {
  const navigate = useNavigate()
  const [briefRules, setBriefRules] = useState('')
  const [rules, setRules] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get('/tournament').then(d => {
      setBriefRules(d.tournament?.brief_rules || DEFAULT_BRIEF_RULES)
      setRules(d.tournament?.rules_text || '')
    })
  }, [])

  async function handleSave() {
    await api.put('/tournament/rules', { rules_text: rules, brief_rules: briefRules })
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

        {/* Brief rules — shown as Rules Summary on public info page */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="font-bold text-gray-800 mb-1">📋 比賽規則摘要 Rules Summary</h2>
          <p className="text-xs text-gray-400 mb-3">顯示在公開首頁「比賽規則摘要」區塊 · Shown as Rules Summary on the public info page</p>
          <textarea
            value={briefRules}
            onChange={e => setBriefRules(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 min-h-[320px] font-mono"
          />
        </div>

        {/* Tournament-specific rules */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="font-bold text-gray-800 mb-1">📝 本次賽事規則 Tournament Rules</h2>
          <p className="text-xs text-gray-400 mb-3">額外補充規則，顯示在規則摘要下方 · Extra notes shown below the summary</p>
          <textarea
            value={rules}
            onChange={e => setRules(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500 min-h-[150px]"
            placeholder="輸入本次特別規則（選填）... Enter any extra rules (optional)..."
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
