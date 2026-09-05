import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../api'
import { GjAdminShell, Card, useSaver } from './GjAdminShell'

const STATUS = {
  regular:  { label: '正規球員', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  wildcard: { label: '外卡球員', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  inactive: { label: '已退出',   cls: 'bg-gray-100 text-gray-500 border-gray-300' },
}
const nameOf = (p) => [p.chinese_name, p.english_name].filter(Boolean).join(' ') || '(未命名)'

function cellClass(rel) {
  if (rel === null || rel === undefined) return 'bg-gray-100 text-gray-400'
  if (rel <= -2) return 'bg-yellow-300 text-yellow-900'
  if (rel === -1) return 'bg-red-400 text-white'
  if (rel === 0) return 'bg-white text-gray-700 border border-gray-200'
  if (rel === 1) return 'bg-blue-200 text-blue-900'
  if (rel === 2) return 'bg-blue-500 text-white'
  return 'bg-gray-700 text-white'
}

export default function RosterPlayerPage() {
  const { id } = useParams()
  const { saving, run, banner } = useSaver()
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(null)
  const [hcp, setHcp] = useState({ open: false, value: '', reason: '' })
  const [openRound, setOpenRound] = useState(null)
  const [merging, setMerging] = useState(null)
  const [roster, setRoster] = useState([])

  useEffect(() => { load() }, [id])
  const load = () => api.get(`/roster/${id}`).then(d => {
    setData(d)
    document.title = nameOf(d.player)
  })

  const openMerge = () => run(async () => {
    const d = await api.get('/roster')
    setRoster((d.roster || []).filter(m => String(m.id) !== String(id)))
    setMerging('')
  }, '選擇要合併過來的球員')

  const doMerge = () => {
    const other = roster.find(m => String(m.id) === String(merging))
    if (!other) { alert('請選擇要合併的球員'); return }
    if (!confirm(
      `把「${nameOf(other)}」合併進「${nameOf(data.player)}」？\n\n` +
      `• ${nameOf(other)} 的比賽紀錄與差點異動會轉過來\n` +
      `• 他的名字會保留成「也曾登記為」,舊比賽才找得到\n` +
      `• ${nameOf(other)} 這筆資料會被刪除\n\n此動作無法復原。`
    )) return
    run(async () => {
      await api.post(`/roster/${id}/merge`, { fromId: other.id })
      await load()
      setMerging(null)
    }, '已合併 ✓')
  }

  const saveDetails = () => run(async () => {
    await api.put(`/roster/${id}`, editing)
    await load()
    setEditing(null)
  }, '已更新 ✓')

  const saveHandicap = () => {
    if (hcp.value === '' || !Number.isFinite(Number(hcp.value))) { alert('請填寫差點'); return }
    if (!hcp.reason.trim()) { alert('請填寫調整原因'); return }
    run(async () => {
      await api.put(`/roster/${id}/handicap`, { handicap: Number(hcp.value), reason: hcp.reason })
      await load()
      setHcp({ open: false, value: '', reason: '' })
    }, '差點已調整 ✓')
  }

  if (!data) {
    return <div className="min-h-screen flex items-center justify-center text-emerald-900">載入中...</div>
  }
  const { player, rounds, stats, handicapLog, suggestion } = data
  const played = rounds.filter(r => r.archived)
  const CONFIDENCE = {
    high:   { label: '參考性高', cls: 'text-emerald-700' },
    medium: { label: '參考性普通', cls: 'text-amber-700' },
    low:    { label: '只有一場,參考性低', cls: 'text-gray-500' },
  }
  const useSuggestion = () => setHcp({
    open: true,
    value: String(suggestion.suggested),
    reason: `依 ${suggestion.basedOn} 場成績建議（平均 +${suggestion.average}、最佳 +${suggestion.best}）`,
  })

  return (
    <GjAdminShell title={nameOf(player)} subtitle={STATUS[player.status]?.label} showBack backTo="/admin/roster">
      {banner}

      {/* Names, status and tee first — this is what gets edited most, and it used
          to sit below a long list of rounds where nobody found it */}
      <Card title="基本資料">
        {editing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input className="border border-gray-300 rounded px-2 py-2 text-sm" placeholder="中文名"
                value={editing.chinese_name || ''} onChange={e => setEditing({ ...editing, chinese_name: e.target.value })} />
              <input className="border border-gray-300 rounded px-2 py-2 text-sm" placeholder="英文名"
                value={editing.english_name || ''} onChange={e => setEditing({ ...editing, english_name: e.target.value })} />
            </div>
            <div className="flex gap-1.5">
              {Object.entries(STATUS).map(([key, s]) => (
                <button key={key} onClick={() => setEditing({ ...editing, status: key })}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border ${
                    editing.status === key ? s.cls : 'bg-white text-gray-500 border-gray-200'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <button onClick={() => setEditing({ ...editing, tee: editing.tee === 'red' ? 'white' : 'red' })}
              className={`w-full py-2 rounded text-sm font-medium ${editing.tee === 'red' ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-gray-100 text-gray-700 border border-gray-300'}`}>
              預設 {editing.tee === 'red' ? '紅 Tee' : '白 Tee'}
            </button>
            <textarea className="w-full border border-gray-300 rounded px-2 py-2 text-sm" rows={2}
              placeholder="備註（選填）" maxLength={500}
              value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
            <div className="flex gap-2">
              <button onClick={saveDetails} disabled={saving}
                className="flex-1 bg-emerald-800 text-white py-2 rounded text-sm font-bold disabled:opacity-50">儲存</button>
              <button onClick={() => setEditing(null)}
                className="px-4 bg-gray-200 text-gray-700 py-2 rounded text-sm">取消</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm text-gray-600">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span>{player.chinese_name || '（無中文名）'} · {player.english_name || '（無英文名）'}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${STATUS[player.status]?.cls}`}>
                  {STATUS[player.status]?.label}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                預設 {player.tee === 'red' ? '紅' : '白'} Tee
                {player.notes ? ` · ${player.notes}` : ''}
              </div>
              {player.aliasList?.length > 0 && (
                <div className="text-xs text-gray-400 mt-0.5">
                  也曾登記為:{player.aliasList.map(a =>
                    [a.chinese_name, a.english_name].filter(Boolean).join(' ')).join('、')}
                </div>
              )}
            </div>
            <button onClick={() => setEditing({ ...player })}
              className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg">修改</button>
          </div>
        )}

        {/* Same person entered twice — J.J. and 王伯軒 JJ */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          {merging === null ? (
            <button onClick={openMerge} disabled={saving}
              className="text-xs text-emerald-800 underline disabled:opacity-50">
              🔗 這個人在名單上有兩筆？合併過來
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                選擇要<b>合併進這位球員</b>的另一筆資料。對方的比賽紀錄會轉過來,
                名字保留成別名,然後刪除那筆。
              </p>
              <select value={merging} onChange={e => setMerging(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-2 text-sm">
                <option value="">— 選擇球員 —</option>
                {roster.map(m => (
                  <option key={m.id} value={m.id}>
                    {nameOf(m)}（差點 {m.handicap} · {m.roundsPlayed} 場）
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button onClick={doMerge} disabled={saving || !merging}
                  className="flex-1 bg-amber-500 text-amber-950 py-2 rounded text-sm font-bold disabled:opacity-50">
                  合併
                </button>
                <button onClick={() => setMerging(null)}
                  className="px-4 bg-gray-200 text-gray-700 py-2 rounded text-sm">取消</button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Current handicap, and changing it */}
      <Card title="目前差點">
        <div className="flex items-center gap-4">
          <div className="text-4xl font-bold text-emerald-900">{player.handicap}</div>
          <div className="flex-1 text-xs text-gray-500">
            調整差點一定要填原因,會留在下面的異動紀錄裡。
            <b className="block text-gray-600 mt-0.5">改這裡不會動到已經打完的比賽。</b>
          </div>
          <button onClick={() => setHcp({ open: !hcp.open, value: String(player.handicap), reason: '' })}
            className="bg-emerald-800 text-white text-sm font-bold px-4 py-2 rounded-lg">
            調整
          </button>
        </div>

        {/* What the scores say, next to what the club has decided. Never applied
            on its own — it exists to tell the organiser whether a guest's
            self-reported handicap held up. */}
        {suggestion && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <div className="flex-1 text-xs text-gray-500">
                <span className="text-gray-700 font-medium">依成績建議 </span>
                <span className="text-lg font-bold text-emerald-900 align-middle">{suggestion.suggested}</span>
                <span className={`ml-1.5 ${CONFIDENCE[suggestion.confidence].cls}`}>
                  {CONFIDENCE[suggestion.confidence].label}
                </span>
                <span className="block mt-0.5">
                  {suggestion.basedOn} 場 · 平均高於 Par {suggestion.average} 桿 · 最佳 {suggestion.best} 桿
                  {suggestion.suggested !== player.handicap && (
                    <b className="text-gray-700">
                      {suggestion.suggested < player.handicap
                        ? `　目前 ${player.handicap} 偏寬鬆`
                        : `　目前 ${player.handicap} 偏嚴格`}
                    </b>
                  )}
                </span>
              </div>
              {suggestion.suggested !== player.handicap && (
                <button onClick={useSuggestion}
                  className="bg-white border border-emerald-700 text-emerald-800 text-xs font-bold px-3 py-2 rounded-lg flex-shrink-0">
                  採用
                </button>
              )}
            </div>
          </div>
        )}

        {hcp.open && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">新差點</label>
              <input type="number" inputMode="numeric"
                className="w-20 border border-gray-300 rounded px-2 py-2 text-sm text-center font-bold"
                value={hcp.value} onChange={e => setHcp({ ...hcp, value: e.target.value })} />
              <span className="text-sm text-gray-400">
                {Number.isFinite(Number(hcp.value)) && Number(hcp.value) !== player.handicap
                  ? `${player.handicap} → ${hcp.value}` : ''}
              </span>
            </div>
            <input className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
              placeholder="原因（例如:2026 綠夾克冠軍,調降 2 桿）" maxLength={200}
              value={hcp.reason} onChange={e => setHcp({ ...hcp, reason: e.target.value })} />
            <div className="flex gap-2">
              <button onClick={saveHandicap} disabled={saving}
                className="flex-1 bg-emerald-800 text-white py-2 rounded text-sm font-bold disabled:opacity-50">
                儲存調整
              </button>
              <button onClick={() => setHcp({ open: false, value: '', reason: '' })}
                className="px-4 bg-gray-200 text-gray-700 py-2 rounded text-sm">取消</button>
            </div>
          </div>
        )}
      </Card>

      {/* Career figures — archived rounds only, so they do not move mid-round */}
      {stats.played > 0 && (
        <Card title="生涯紀錄">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[['參賽', stats.played + ' 場'], ['冠軍', stats.wins + ' 次'],
              ['最佳淨桿', stats.bestNet], ['最佳總桿', stats.bestGross],
              ['平均對 Par', stats.avgToPar === null ? '—' : (stats.avgToPar > 0 ? '+' : '') + stats.avgToPar],
              ['小鳥/老鷹', `${stats.birdies}/${stats.eagles}`]].map(([label, value]) => (
              <div key={label}>
                <div className="text-xl font-bold text-emerald-900">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Every round, newest first */}
      <Card title={`比賽紀錄（${played.length} 場）`}>
        {rounds.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">還沒有比賽紀錄</p>
        )}
        <div className="divide-y divide-gray-100">
          {rounds.map((r, i) => {
            const key = `${r.slug}_${r.year}_${i}`
            const isOpen = openRound === key
            return (
              <div key={key}>
                <button onClick={() => setOpenRound(isOpen ? null : key)}
                  disabled={!r.archived}
                  className="w-full flex items-center gap-3 py-2.5 text-left disabled:cursor-default">
                  <span className="text-amber-600 font-bold w-11 flex-shrink-0">{r.year}</span>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 block truncate">{r.tournamentName}</span>
                    <span className="text-xs text-gray-400">
                      差點 {r.handicap}
                      {r.groupName ? ` · ${r.groupName}` : ''}
                      {r.inProgress ? ' · 進行中' : ''}
                      {r.isNoShow ? ' · 未到' : ''}
                    </span>
                  </span>
                  {r.isNoShow ? (
                    <span className="text-xs text-gray-400">未到</span>
                  ) : r.archived ? (
                    <span className="text-right">
                      <span className="block text-base font-bold text-emerald-900">
                        {r.rank ? `第 ${r.rank} 名` : '—'}
                      </span>
                      <span className="block text-[10px] text-gray-400">
                        淨 {r.netScore} · 總 {r.grossScore}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">{r.holesEntered ?? 0} 洞</span>
                  )}
                  {r.archived && <span className="text-gray-300 text-xs">{isOpen ? '▲' : '▼'}</span>}
                </button>

                {isOpen && r.archived && (
                  <div className="pb-3">
                    <div className="text-xs text-gray-500 mb-2 space-y-0.5">
                      <p>{r.date} · {r.course} · Par {r.parTotal}</p>
                      {r.groupMates?.length > 0 && (
                        <p className="text-gray-400">同組:{r.groupMates.join('、')}</p>
                      )}
                      {r.pickedPlayerName && (
                        <p className="text-green-700">🐴 選的馬:{r.pickedPlayerName}
                          {r.totalPoints !== null ? `（總分 ${r.totalPoints}）` : ''}</p>
                      )}
                      {r.awards?.length > 0 && (
                        <p className="text-amber-700">
                          🏅 {r.awards.map(a => (typeof a === 'string' ? a : a.name)).join('、')}
                        </p>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                        <tbody>
                          <tr>
                            <td className="px-1.5 py-1 text-gray-500 sticky left-0 bg-white">洞</td>
                            {(r.holes || []).map((h, k) => (
                              <td key={k} className="px-1 py-1 text-center min-w-[28px] text-gray-500">{h.label}</td>
                            ))}
                            <td className="px-2 py-1 text-gray-500">總</td>
                          </tr>
                          <tr>
                            <td className="px-1.5 py-1 text-gray-400 sticky left-0 bg-white">Par</td>
                            {(r.holes || []).map((h, k) => (
                              <td key={k} className="px-1 py-1 text-center text-gray-400">{h.par}</td>
                            ))}
                            <td className="px-2 py-1 text-gray-400">{r.parTotal}</td>
                          </tr>
                          <tr>
                            <td className="px-1.5 py-1 text-gray-700 font-medium sticky left-0 bg-white">桿數</td>
                            {(r.holes || []).map((h, k) => {
                              const s = r.strokes?.[k] ?? null
                              return (
                                <td key={k} className="p-0.5">
                                  <div className={`w-7 h-7 flex items-center justify-center rounded font-bold ${cellClass(s === null ? null : s - h.par)}`}>
                                    {s ?? '-'}
                                  </div>
                                </td>
                              )
                            })}
                            <td className="px-2 py-1 font-bold text-gray-900">{r.grossScore}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-400 text-center mt-1.5">← 左右滑動查看全部洞 →</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Handicap history */}
      <Card title={`差點異動紀錄（${handicapLog.length} 筆）`}>
        <div className="divide-y divide-gray-100">
          {handicapLog.map(l => (
            <div key={l.id} className="py-2 flex items-start gap-3">
              <span className="text-sm font-bold text-emerald-900 w-20 flex-shrink-0">
                {l.from_handicap === null ? '—' : l.from_handicap} → {l.to_handicap}
              </span>
              <span className="flex-1 min-w-0">
                <span className="text-sm text-gray-700 block">{l.reason}</span>
                <span className="text-xs text-gray-400">{l.changed_at}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

    </GjAdminShell>
  )
}
