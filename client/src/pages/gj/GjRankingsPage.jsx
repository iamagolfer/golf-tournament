import { useState, useEffect } from 'react'
import { gjApi } from '../../api'
import { GJ, GjHeader, GjNav, PlayerName, cellClass, toParDisplay, holeLabel, medal, TiebreakBadge } from './gjTheme'

export default function GjRankingsPage() {
  document.title = '綠夾克盃 — 排名'
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('net')
  const [openPlayer, setOpenPlayer] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { load() }, [])
  useEffect(() => {
    const id = setInterval(load, 8 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  async function load() {
    setRefreshing(true)
    try {
      const [r, t] = await Promise.all([gjApi.get('/rankings'), gjApi.get('/tournament')])
      setData({ ...r, tournament: t.tournament })
    } catch (e) {
      // leave the previous data on screen rather than blanking the page
    } finally {
      setRefreshing(false)
    }
  }

  if (!data) {
    return <div className="min-h-screen flex items-center justify-center text-emerald-900">載入中...</div>
  }

  const showWildcard = data.showWildcard !== false
  const rows = tab === 'net' ? data.netRankings : data.grossRankings
  const holes = data.holes || []

  return (
    <div className={`min-h-screen ${GJ.pageBg}`}>
      <GjHeader
        title="排名 Rankings"
        subtitle={`${data.N} 位選手 · Par ${data.parTotal}`}
        tournamentName={data.tournament?.name}
      />
      <GjNav current="/greenjacket/rankings" />

      {data.awaitingPlayoff && (
        <div className="bg-amber-400 text-amber-950 px-4 py-2.5 text-center text-sm font-bold">
          ⛳ 冠軍同淨桿 — 待練習果嶺延長賽 (Sudden Death) 決勝
        </div>
      )}

      <div className="max-w-lg mx-auto px-3 pb-10">

        {/* Tabs */}
        <div className="flex gap-2 my-3">
          <button onClick={() => setTab('net')}
            className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition
              ${tab === 'net' ? GJ.tabActive : 'bg-white text-gray-600'}`}>
            🏅 淨桿排名
          </button>
          <button onClick={() => setTab('gross')}
            className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition
              ${tab === 'gross' ? GJ.tabActive : 'bg-white text-gray-600'}`}>
            ⛳ 總桿排名
          </button>
        </div>

        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500">
            {tab === 'net' ? '總桿扣差點，低者勝' : '不計差點，純比總桿'}
          </p>
          <button onClick={load} disabled={refreshing}
            className={`${GJ.button} text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-sm disabled:opacity-50`}>
            {refreshing ? '更新中...' : '↻ 更新排名'}
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden">
          {rows.length === 0 && (
            <p className="px-4 py-8 text-center text-gray-400 text-sm">尚無成績</p>
          )}
          {rows.map(p => {
            const rank = tab === 'net' ? p.rank : p.grossRank
            const isOpen = openPlayer === p.id
            const hasScores = p.grossScore !== null && p.grossScore !== undefined
            return (
              <div key={p.id}>
                <button
                  onClick={() => setOpenPlayer(isOpen ? null : p.id)}
                  disabled={!hasScores}
                  className="w-full flex items-center gap-3 px-3 py-3 text-left disabled:cursor-default">
                  <div className="w-10 text-center flex-shrink-0">
                    {p.isNoShow ? (
                      <span className="text-gray-300 text-xs">未到</span>
                    ) : (
                      <span className="text-lg font-bold text-emerald-900">{medal(rank) || rank}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <PlayerName player={p} showWildcard={showWildcard} />
                      {tab === 'net' && <TiebreakBadge player={p} />}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      差點 {p.handicap}
                      {p.holesPlayed > 0 && ` · ${p.holesPlayed}/${p.totalHoles} 洞`}
                      {p.inProgress && <span className="text-amber-600 font-medium"> · 進行中</span>}
                      {p.scoresPending && ' · 尚未輸入'}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    {!hasScores ? (
                      <span className="text-gray-300">-</span>
                    ) : tab === 'net' ? (
                      <>
                        {/* A partial round's net score is provisional — greying it
                            stops a nine-hole total reading as a runaway lead. */}
                        <div className={`text-lg font-bold ${p.inProgress ? 'text-gray-400' : 'text-emerald-900'}`}>
                          {p.inProgress ? `暫 ${p.netScore}` : p.netScore}
                        </div>
                        <div className="text-xs text-gray-400">總桿 {p.grossScore}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-bold text-emerald-900">{p.grossScore}</div>
                        <div className={`text-xs ${toParDisplay(p.toPar).cls}`}>{toParDisplay(p.toPar).text}</div>
                      </>
                    )}
                  </div>
                  {hasScores && <span className="text-gray-300 text-xs ml-1">{isOpen ? '▲' : '▼'}</span>}
                </button>

                {/* Per-hole breakdown */}
                {isOpen && hasScores && (
                  <div className="px-3 pb-3 bg-gray-50">
                    <div className="overflow-x-auto">
                      <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                        <tbody>
                          <tr>
                            <td className="px-1.5 py-1 text-gray-500 sticky left-0 bg-gray-50">洞</td>
                            {holes.map(h => (
                              <td key={h.id} className="px-1 py-1 text-center min-w-[30px] text-gray-500">{holeLabel(h)}</td>
                            ))}
                          </tr>
                          <tr>
                            <td className="px-1.5 py-1 text-gray-400 sticky left-0 bg-gray-50">Par</td>
                            {holes.map(h => (
                              <td key={h.id} className="px-1 py-1 text-center text-gray-400">{h.par}</td>
                            ))}
                          </tr>
                          <tr>
                            <td className="px-1.5 py-1 text-gray-700 font-medium sticky left-0 bg-gray-50">桿數</td>
                            {holes.map((h, i) => {
                              const s = p.strokesInPlayOrder?.[i] ?? null
                              return (
                                <td key={h.id} className="p-0.5">
                                  <div className={`w-7 h-7 flex items-center justify-center rounded font-bold ${cellClass(s === null ? null : s - h.par)}`}>
                                    {s ?? '-'}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-gray-600">
                      <span>前九 <b>{p.front9 ?? '-'}</b></span>
                      <span>後九 <b>{p.back9 ?? '-'}</b></span>
                      <span>總桿 <b>{p.grossScore}</b></span>
                      <span>淨桿 <b className="text-emerald-900">{p.netScore}</b></span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* How ties are broken — reflects the admin's current configuration */}
        {tab === 'net' && (
          <div className="mt-4 bg-white rounded-xl shadow-sm p-4 text-xs text-gray-600 space-y-1.5">
            <div className="font-bold text-gray-800 text-sm mb-1">同淨桿判定順序</div>
            <div>
              <span className="text-amber-700 font-medium">冠軍：</span>
              {(data.championChain || []).map(id => RULE_LABELS[id] || id).join(' → ') || '並列'}
            </div>
            <div>
              <span className="text-emerald-800 font-medium">其他名次：</span>
              {(data.othersChain || []).map(id => RULE_LABELS[id] || id).join(' → ') || '並列'}
            </div>
            <div className="text-gray-400 pt-1">未打完 18 洞不套用同分判定，完賽者排在未完賽者之前。</div>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mt-3">每 8 分鐘自動更新</p>
      </div>
    </div>
  )
}

const RULE_LABELS = {
  pk: '果嶺 PK',
  hcp_low: '差點低',
  hcp_high: '差點高',
  back9: '後九總桿',
  front9: '前九總桿',
  last6: '後六洞',
  last3: '後三洞',
  last1: '最後一洞',
  hole_countback: '逐洞倒數',
}
