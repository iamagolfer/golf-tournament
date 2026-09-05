import { useState, useEffect } from 'react'
import { gjApi } from '../../api'
import { GJ, GjNav, holeLabel } from './gjTheme'
import GjArchiveView from './GjArchiveView'

export default function GjInfoPage() {
  document.title = '綠夾克盃'
  const [tournament, setTournament] = useState(null)
  const [sections, setSections] = useState([])
  const [holes, setHoles] = useState([])
  const [champions, setChampions] = useState([])
  const [archivedYears, setArchivedYears] = useState([])
  const [openArchive, setOpenArchive] = useState(null)
  const [showHoles, setShowHoles] = useState(false)
  const [openYear, setOpenYear] = useState(null)

  useEffect(() => {
    gjApi.get('/archives')
      .then(a => setArchivedYears((a.archives || []).map(x => x.year)))
      .catch(() => setArchivedYears([]))
    Promise.all([gjApi.get('/tournament'), gjApi.get('/champions')])
      .then(([t, c]) => {
        setTournament(t.tournament)
        setSections(t.sections || [])
        setHoles(t.holes || [])
        setChampions(c.champions || [])
      })
      .catch(() => {})
  }, [])

  if (!tournament) {
    return <div className="min-h-screen flex items-center justify-center text-emerald-900">載入中...</div>
  }

  const parTotal = holes.reduce((s, h) => s + h.par, 0)

  return (
    <div className={`min-h-screen ${GJ.pageBg}`}>
      <div className={`${GJ.headerBg} text-white px-4 pt-6 pb-5 border-b-4 border-amber-400 text-center`}>
        <div className="text-4xl mb-1">🏆</div>
        <h1 className="text-2xl font-bold">{tournament.name || '綠夾克盃'}</h1>
        <p className="text-amber-200 text-sm tracking-widest uppercase">Green Jacket</p>
      </div>

      <GjNav current="/greenjacket" />

      <div className="max-w-lg mx-auto px-3 pb-10 space-y-4">

        {/* Tournament details */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">球場</div>
              <div className="font-bold text-emerald-900 text-sm">{tournament.course_name || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">日期</div>
              <div className="font-bold text-emerald-900 text-sm">{tournament.date || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">開球時間</div>
              <div className="font-bold text-emerald-900 text-sm">{tournament.tee_time || '-'}</div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-center gap-6 text-sm">
            <span className="text-gray-600">參賽人數 <b className="text-emerald-900">{tournament.total_players || 0}</b></span>
            <span className="text-gray-600">總 Par <b className="text-emerald-900">{parTotal || '-'}</b></span>
          </div>
        </div>

        {/* Past champions — always expanded, per the brief */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-amber-400 px-4 py-2.5">
            <h2 className="font-bold text-amber-950">🏆 歷屆冠軍</h2>
          </div>
          {champions.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-400 text-center">尚未建立</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {champions.map(c => (
                <div key={c.id}>
                  <button
                    onClick={() => {
                      const closing = openYear === c.id
                      setOpenYear(closing ? null : c.id)
                      // Collapsing the year takes the full scorecard with it
                      if (closing) setOpenArchive(null)
                    }}
                    disabled={!c.results.length}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left disabled:cursor-default">
                    <span className="text-amber-600 font-bold w-12 flex-shrink-0">{c.year}</span>
                    <span className="text-gray-500 text-sm flex-1 truncate">{c.course}</span>
                    <span className="font-medium text-gray-900">🥇 {c.champion_name}</span>
                    {c.results.length > 0 && (
                      <span className="text-gray-400 text-xs">{openYear === c.id ? '▲' : '▼'}</span>
                    )}
                  </button>
                  {openYear === c.id && c.results.length > 0 && (
                    <div className="px-4 pb-3 space-y-0.5">
                      {c.results.map(r => (
                        <div key={r.id} className="flex items-start text-sm px-2 py-1 rounded odd:bg-gray-50">
                          <span className="text-gray-400 w-5 text-right mr-2">{r.position}.</span>
                          <span className="flex-1 min-w-0">
                            <span className="text-gray-800">{r.player_name}</span>
                            {/* Years typed in by hand have no breakdown to show */}
                            {r.net !== null && r.net !== undefined && (
                              <span className="block text-xs text-gray-400">
                                總桿 {r.gross} · 差點 {r.handicap} · 淨桿 {r.net}
                              </span>
                            )}
                          </span>
                          <span className="text-gray-600 font-medium ml-2">{r.score}</span>
                        </div>
                      ))}
                      {/* Only years archived while their scores were still live */}
                      {archivedYears.includes(c.year) && (
                        <button
                          onClick={() => setOpenArchive(openArchive === c.year ? null : c.year)}
                          className="mt-2 text-xs text-emerald-800 underline">
                          {openArchive === c.year ? '收合完整成績' : '📋 查看完整成績（逐洞・分組）'}
                        </button>
                      )}
                    </div>
                  )}
                  {openYear === c.id && openArchive === c.year && <GjArchiveView year={c.year} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Course card */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button onClick={() => setShowHoles(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left">
            <span className="font-bold text-gray-800">⛳ 球場資料 {parTotal ? `Par ${parTotal}` : ''}</span>
            <span className="text-gray-400">{showHoles ? '▲' : '▼'}</span>
          </button>
          {showHoles && (
            <div className="px-3 pb-4 space-y-4">
              {sections.map(sec => {
                const secHoles = holes.filter(h => h.section_id === sec.id)
                return (
                  <div key={sec.id}>
                    <div className="text-sm font-bold text-emerald-900 mb-1">
                      {sec.name} — Par {secHoles.reduce((s, h) => s + h.par, 0)}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                        <tbody>
                          <tr className="bg-emerald-800 text-white">
                            <td className="px-2 py-1 font-medium sticky left-0 bg-emerald-800">洞</td>
                            {secHoles.map(h => <td key={h.id} className="px-2 py-1 text-center min-w-[36px] font-medium">{holeLabel(h)}</td>)}
                          </tr>
                          <tr className="bg-gray-50">
                            <td className="px-2 py-1 text-gray-500 sticky left-0 bg-gray-50">Par</td>
                            {secHoles.map(h => <td key={h.id} className="px-2 py-1 text-center text-gray-700">{h.par}</td>)}
                          </tr>
                          <tr>
                            <td className="px-2 py-1 text-gray-500 sticky left-0 bg-white">白 Tee</td>
                            {secHoles.map(h => <td key={h.id} className="px-2 py-1 text-center text-gray-500">{h.yards || '-'}</td>)}
                          </tr>
                          <tr className="bg-red-50">
                            <td className="px-2 py-1 text-red-700 sticky left-0 bg-red-50">紅 Tee</td>
                            {secHoles.map(h => <td key={h.id} className="px-2 py-1 text-center text-red-600">{h.yards_red || '-'}</td>)}
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

        {/* Rules */}
        {tournament.brief_rules && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="font-bold text-gray-800 mb-2">📋 比賽規則摘要</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{tournament.brief_rules}</p>
          </div>
        )}
        {tournament.rules_text && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="font-bold text-gray-800 mb-2">📖 本次賽事規則</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{tournament.rules_text}</p>
          </div>
        )}
      </div>
    </div>
  )
}
