import { useState, useEffect } from 'react'
import { gjApi } from '../../api'
import { GjAdminShell, Card, SaveButton, useSaver } from './GjAdminShell'

// Everything the admin can put in a tiebreaker chain.
const RULES = [
  { id: 'pk',             label: '果嶺 PK',    desc: '人工決定 — 程式停下等你指定勝出者' },
  { id: 'hcp_low',        label: '差點低的贏', desc: '與「差點高的贏」互斥' },
  { id: 'hcp_high',       label: '差點高的贏', desc: '與「差點低的贏」互斥' },
  { id: 'back9',          label: '後九總桿',   desc: '後九洞桿數總和，低者勝' },
  { id: 'front9',         label: '前九總桿',   desc: '前九洞桿數總和，低者勝' },
  { id: 'last6',          label: '後六洞總桿', desc: 'USGA 標準 countback' },
  { id: 'last3',          label: '後三洞總桿', desc: 'USGA 標準 countback' },
  { id: 'last1',          label: '最後一洞',   desc: '實際打的最後一洞' },
  { id: 'hole_countback', label: '逐洞倒數',   desc: '從最後一洞往前逐洞比較' },
]

const PRESETS = [
  { label: '目前設定（後九 → 逐洞倒數）', chain: ['back9', 'hole_countback'] },
  { label: 'USGA 標準（後9→後6→後3→最後1洞）', chain: ['back9', 'last6', 'last3', 'last1'] },
  { label: '只用果嶺 PK', chain: ['pk'] },
]

const byId = Object.fromEntries(RULES.map(r => [r.id, r]))
const conflictsWith = (id) => id === 'hcp_low' ? 'hcp_high' : id === 'hcp_high' ? 'hcp_low' : null

function ChainEditor({ title, hint, chain, setChain }) {
  const available = RULES.filter(r => !chain.includes(r.id) && !chain.includes(conflictsWith(r.id)))

  const move = (i, dir) => {
    const next = [...chain]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setChain(next)
  }

  return (
    <Card title={title}>
      <p className="text-xs text-gray-500 mb-3">{hint}</p>

      {chain.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-lg mb-3">
          沒有規則 — 同分時將直接並列
        </p>
      ) : (
        <div className="space-y-2 mb-3">
          {chain.map((id, i) => (
            <div key={id} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-emerald-800 text-white text-xs font-bold">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 text-sm">{byId[id]?.label || id}</div>
                <div className="text-xs text-gray-400 truncate">{byId[id]?.desc}</div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => move(i, -1)} disabled={i === 0}
                  className="w-7 h-7 rounded bg-white border border-gray-200 text-gray-600 disabled:opacity-30">▲</button>
                <button onClick={() => move(i, 1)} disabled={i === chain.length - 1}
                  className="w-7 h-7 rounded bg-white border border-gray-200 text-gray-600 disabled:opacity-30">▼</button>
                <button onClick={() => setChain(chain.filter(x => x !== id))}
                  className="w-7 h-7 rounded bg-white border border-red-200 text-red-600">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 mb-3">
        以上都相同 → <b>並列同名次</b>（固定保底，不可移除）
      </div>

      {available.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">可加入的規則</p>
          <div className="flex flex-wrap gap-2">
            {available.map(r => (
              <button key={r.id} onClick={() => setChain([...chain, r.id])}
                className="px-3 py-1.5 rounded-full bg-white border border-gray-300 text-sm text-gray-700 hover:bg-emerald-50 hover:border-emerald-300">
                + {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

export default function GjTiebreakSettings() {
  document.title = '綠夾克盃 — 同分判定'
  const { saving, run, banner } = useSaver()
  const [champion, setChampion] = useState([])
  const [others, setOthers] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    gjApi.get('/rankings').then(r => {
      setChampion(r.championChain || [])
      setOthers(r.othersChain || [])
      setLoaded(true)
    })
  }, [])

  const save = () => run(() => gjApi.put('/tournament/tiebreak', { champion, others }), '判定順序已儲存 ✓')

  if (!loaded) {
    return <div className="min-h-screen flex items-center justify-center text-emerald-900">載入中...</div>
  }

  const describe = (chain) =>
    chain.length ? chain.map(id => byId[id]?.label || id).join(' → ') + ' → 仍相同則並列'
                 : '直接並列'

  return (
    <GjAdminShell title="同分判定順序" subtitle="淨桿相同時如何分出名次">
      {banner}

      <Card title="目前判定方式" accent="bg-amber-400 text-amber-950">
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium text-amber-700">冠軍同淨桿時：</span>
            <div className="text-gray-700 mt-0.5">{describe(champion)}</div>
          </div>
          <div>
            <span className="font-medium text-emerald-800">其他名次同淨桿時：</span>
            <div className="text-gray-700 mt-0.5">{describe(others)}</div>
          </div>
        </div>
      </Card>

      <ChainEditor
        title="🥇 冠軍"
        hint="只套用在並列第 1 的選手。「果嶺 PK」是終止符 — 程式會停下並標示「待延長賽」，等你在管理面板指定勝出者。"
        chain={champion}
        setChain={setChampion}
      />

      <ChainEditor
        title="其他名次"
        hint="套用在第 2 名以後。未打完 18 洞的選手不套用 countback，直接並列並排在完賽者之後。"
        chain={others}
        setChain={setOthers}
      />

      <Card title="快速套用">
        <div className="space-y-2">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => setOthers(p.chain)}
              className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-emerald-50 text-sm text-gray-700">
              {p.label}
              <span className="block text-xs text-gray-400">
                套用到「其他名次」：{p.chain.map(id => byId[id].label).join(' → ')}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 mb-4">
        比賽進行中也可以隨時修改，排名會立刻依新順序重算。
      </div>

      <SaveButton onClick={save} saving={saving} />
    </GjAdminShell>
  )
}
