import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'

const RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

function RankBadge({ rank, N }) {
  if (rank <= 3) return <span className="text-xl">{RANK_MEDAL[rank]}</span>
  const isDinner = rank > N - 6
  return (
    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${isDinner ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
      {rank}
    </span>
  )
}

function ScoreBar({ player, N }) {
  const pct = Math.max(0, Math.min(100, ((player.rankingPoints || 0) / N) * 100))
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{player.rankingPoints || 0}pts</span>
    </div>
  )
}

export default function RankingsPage() {
  const [data, setData] = useState(null)
  const [activeTab, setActiveTab] = useState('stroke')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  async function load() {
    try {
      const r = await api.get('/rankings')
      setData(r)
      setLastUpdated(new Date())
    } catch (e) {}
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-500">載入中... Loading...</div>
  if (!data || data.N === 0) return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center">
      <div className="text-center text-gray-500 p-6">
        <div className="text-4xl mb-3">⛳</div>
        <p>尚無資料 No data yet</p>
        <Link to="/" className="text-green-700 underline text-sm mt-2 block">返回首頁</Link>
      </div>
    </div>
  )

  const { strokeRankings, finalRankings, N, picksRevealed, status } = data
  const dinnerCutoff = N - 6

  return (
    <div className="min-h-screen bg-green-50">
      <div className="bg-green-800 text-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">排名 Rankings</h1>
            <p className="text-green-200 text-xs">
              {lastUpdated ? `更新: ${lastUpdated.toLocaleTimeString('zh-TW')} • 每30秒自動重整` : ''}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={load} className="text-green-200 text-sm bg-green-700 px-2 py-1 rounded">↻</button>
            <Link to="/" className="text-green-200 text-sm underline">返回</Link>
          </div>
        </div>
      </div>

      {/* Picks hidden banner — shown during game, before reveal */}
      {status === 'playing' && (
        <div className="bg-purple-700 text-white text-center py-2 px-4 text-sm font-medium">
          🔒 選馬保密中，比賽結束後公布最終排名
          <span className="block text-purple-200 text-xs">Horse picks hidden until game ends</span>
        </div>
      )}

      {/* Picks revealed banner */}
      {picksRevealed && (
        <div className="bg-purple-100 border-b border-purple-200 text-purple-800 text-center py-2 text-sm font-medium">
          🐴 選馬已公布！最終排名如下
        </div>
      )}

      {/* Tabs — Final Rankings tab only visible after picks are revealed */}
      <div className={`grid bg-green-700 ${picksRevealed ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button onClick={() => setActiveTab('stroke')}
          className={`py-3 text-sm font-medium transition ${activeTab === 'stroke' ? 'bg-white text-green-800' : 'text-white hover:bg-green-600'}`}>
          <div>淨桿排名</div>
          <div className={`text-xs ${activeTab === 'stroke' ? 'text-green-600' : 'text-green-300'}`}>Stroke Play</div>
        </button>
        {picksRevealed && (
          <button onClick={() => setActiveTab('final')}
            className={`py-3 text-sm font-medium transition ${activeTab === 'final' ? 'bg-white text-green-800' : 'text-white hover:bg-green-600'}`}>
            <div>最終排名 🐴</div>
            <div className={`text-xs ${activeTab === 'final' ? 'text-green-600' : 'text-green-300'}`}>Final + Horse</div>
          </button>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-2">

        {/* Final combined rankings */}
        {activeTab === 'final' && (
          <>
            <div className="bg-white rounded-xl p-3 text-xs text-gray-500 text-center">
              最終得分 = 淨桿名次得分 + 選馬名次得分 &nbsp;|&nbsp; Total = Stroke pts + Horse pts
            </div>
            {dinnerCutoff > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-center text-sm text-red-700">
                🍽️ 第 {dinnerCutoff + 1} 名以後（共6名）請吃晚餐！
              </div>
            )}
            {finalRankings.map((player, idx) => {
              const isDinner = player.finalRank > dinnerCutoff && dinnerCutoff > 0
              return (
                <div key={player.id}
                  className={`bg-white rounded-xl shadow-sm p-4 ${isDinner ? 'border-l-4 border-red-400' : ''}`}>
                  <div className="flex items-center gap-3">
                    <RankBadge rank={player.finalRank} N={N} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {player.chinese_name} <span className="text-gray-500">{player.english_name}</span>
                        {isDinner && <span className="ml-2 text-xs text-red-500">🍽️</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        淨桿{player.rankingPoints || 0}分 + 馬{player.horsePoints || 0}分
                        {player.pickedPlayerName && <span className="ml-1 text-green-600">(馬: {player.pickedPlayerName})</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-2xl font-bold text-green-700">{player.totalPoints}</div>
                      <div className="text-xs text-gray-400">總分</div>
                    </div>
                  </div>
                  {player.isNoShow && <div className="text-xs text-red-500 mt-1">未出席 No show</div>}
                </div>
              )
            })}
          </>
        )}

        {/* Stroke play rankings */}
        {activeTab === 'stroke' && (
          <>
            <div className="bg-white rounded-xl p-3 text-xs text-gray-500 text-center">
              淨桿 = 總桿 − 差點 &nbsp;|&nbsp; Net = Gross − Handicap
            </div>
            {strokeRankings.map(player => (
              <div key={player.id} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-3">
                  <RankBadge rank={player.rank} N={N} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {player.chinese_name} <span className="text-gray-500 text-sm">{player.english_name}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      差點 {player.handicap}
                      {player.netScore !== null && (
                        <> • 總桿 {player.grossScore} − {player.handicap} = <span className="font-medium text-gray-700">淨桿 {player.netScore}</span></>
                      )}
                      {player.isNoShow && <span className="text-red-500"> 未出席</span>}
                      {player.scoresPending && <span className="text-orange-500"> 成績未完整</span>}
                    </div>
                    {player.holesPlayed > 0 && (
                      <div className="flex gap-2 mt-1 text-xs text-gray-400">
                        {player.sectionTotals?.filter(s => s.total !== null).map(s => (
                          <span key={s.sectionId}>{s.sectionName}: {s.total}</span>
                        ))}
                      </div>
                    )}
                    <ScoreBar player={player} N={N} />
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold text-green-700">{player.rankingPoints || 0}</div>
                    <div className="text-xs text-gray-400">分</div>
                    {player.netScore !== null && (
                      <div className="text-xs text-gray-500">淨桿 {player.netScore}</div>
                    )}
                  </div>
                </div>

                {/* Hole-by-hole summary */}
                {player.holesPlayed > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {player.holeAnalysis?.filter(h => h.strokes).map(h => (
                      <span key={h.holeId}
                        className={`inline-flex items-center justify-center w-7 h-7 text-xs rounded font-medium ${
                          h.relativeToPar <= -2 ? 'bg-yellow-300 text-yellow-900' :
                          h.relativeToPar === -1 ? 'bg-red-400 text-white' :
                          h.relativeToPar === 0 ? 'bg-gray-100 text-gray-700' :
                          h.relativeToPar === 1 ? 'bg-blue-100 text-blue-700' :
                          h.relativeToPar === 2 ? 'bg-blue-500 text-white' :
                          'bg-gray-700 text-white'
                        }`}>
                        {h.strokes}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* Legend */}
        <div className="bg-white rounded-xl p-3 flex flex-wrap gap-2 text-xs justify-center">
          {[
            { cls: 'bg-yellow-300 text-yellow-900', label: '老鷹 Eagle' },
            { cls: 'bg-red-400 text-white', label: '小鳥 Birdie' },
            { cls: 'bg-gray-100 text-gray-700', label: '標準 Par' },
            { cls: 'bg-blue-100 text-blue-700', label: '柏忌 Bogey' },
            { cls: 'bg-blue-500 text-white', label: '雙柏 Dbl' },
            { cls: 'bg-gray-700 text-white', label: '三柏+ Trip+' },
          ].map(({ cls, label }) => (
            <span key={label} className={`${cls} px-2 py-0.5 rounded`}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
