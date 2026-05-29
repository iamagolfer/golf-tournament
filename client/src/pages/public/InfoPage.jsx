import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'

const BRIEF_RULES = `
【計分方式 Scoring System】
每位球員打完18洞後，以當天成績（總桿）扣除個人差點 = 淨桿成績。
Net Score = Gross Score − Handicap

【排名 Ranking】
淨桿成績最低者排名第一。共N名球員，第1名得N分，第N名得1分，未出席得0分。

【同分處理 Tiebreakers】
淨桿相同時，依序以下列標準決定：
1. 任一9洞最低桿（最低者優先）
2. 另一9洞桿數（最低者優先）
3. 低於標準桿洞數最多（老鷹/老鷹+/小鳥均算）
4. 標準桿洞數最多
5. 柏忌洞數最少
6. 雙柏忌洞數最少
7. 三柏忌、四柏忌… 依此類推，洞數最少者優先

【選馬制度 Horse Pick System】
比賽前每位球員各選一名「馬」（可選自己）。
最終總得分 = 自己的淨桿名次得分 + 選的馬的淨桿名次得分
得分最低的後6名請吃晚餐！

【選馬規則】
• 選馬在賽前開放，比賽開始後鎖定不可更改
• 每人需輸入自己的PIN碼才能選/改馬，防止誤觸
`

export default function InfoPage() {
  const [tournament, setTournament] = useState(null)
  const [sections, setSections] = useState([])
  const [holes, setHoles] = useState([])
  const [showCourse, setShowCourse] = useState(false)

  useEffect(() => {
    api.get('/tournament').then(d => {
      setTournament(d.tournament)
      setSections(d.sections || [])
      setHoles(d.holes || [])
    })
  }, [])

  if (!tournament) return <div className="p-4 text-center text-gray-500">載入中...</div>

  return (
    <div className="min-h-screen bg-green-50">
      {/* Header */}
      <div className="bg-green-800 text-white px-4 py-5">
        <div className="text-4xl text-center mb-2">⛳</div>
        <h1 className="text-2xl font-bold text-center">{tournament.course_name || '高爾夫球賽'}</h1>
        {tournament.date && (
          <div className="text-center text-green-200 mt-1">
            {tournament.date} {tournament.tee_time && `• 開球 ${tournament.tee_time}`}
          </div>
        )}
      </div>

      {/* Nav links */}
      <div className="grid grid-cols-3 bg-green-700 divide-x divide-green-600">
        {[
          { label: '選馬', sub: 'Pick Horse', path: '/pick' },
          { label: '成績', sub: 'Scores', path: '/scores' },
          { label: '排名', sub: 'Rankings', path: '/rankings' },
        ].map(({ label, sub, path }) => (
          <Link key={path} to={path} className="flex flex-col items-center py-3 text-white hover:bg-green-600 transition">
            <span className="font-medium">{label}</span>
            <span className="text-xs text-green-300">{sub}</span>
          </Link>
        ))}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Course info toggle */}
        {sections.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <button
              onClick={() => setShowCourse(!showCourse)}
              className="w-full px-4 py-3 text-left flex items-center justify-between font-medium text-gray-800"
            >
              <span>⛳ 球場資訊 Course Info</span>
              <span className="text-gray-400">{showCourse ? '▲' : '▼'}</span>
            </button>
            {showCourse && (
              <div className="px-4 pb-4">
                {sections.map(sec => {
                  const secHoles = holes.filter(h => h.section_id === sec.id)
                  const totalPar = secHoles.reduce((s, h) => s + h.par, 0)
                  const totalYards = secHoles.reduce((s, h) => s + (h.yards || 0), 0)
                  return (
                    <div key={sec.id} className="mb-4">
                      <h3 className="font-bold text-green-800 mb-2">{sec.name} (Par {totalPar} • {totalYards} yds)</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-green-50">
                              <th className="text-left px-2 py-1">洞</th>
                              {secHoles.map(h => <th key={h.id} className="px-2 py-1">{h.hole_number}</th>)}
                              <th className="px-2 py-1">合計</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="px-2 py-1 font-medium text-gray-600">Par</td>
                              {secHoles.map(h => <td key={h.id} className="text-center px-2 py-1">{h.par}</td>)}
                              <td className="text-center px-2 py-1 font-bold">{totalPar}</td>
                            </tr>
                            <tr>
                              <td className="px-2 py-1 font-medium text-gray-600">Yds</td>
                              {secHoles.map(h => <td key={h.id} className="text-center px-2 py-1 text-gray-500">{h.yards || '-'}</td>)}
                              <td className="text-center px-2 py-1 font-bold text-gray-500">{totalYards}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Brief game rules */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="font-bold text-gray-800 mb-3">📋 比賽規則摘要 Rules Summary</h2>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">{BRIEF_RULES.trim()}</pre>
        </div>

        {/* Admin's custom rules */}
        {tournament.rules_text && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="font-bold text-gray-800 mb-3">📝 本次賽事規則 Tournament Rules</h2>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {tournament.rules_text}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
