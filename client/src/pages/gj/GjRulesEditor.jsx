import { useState, useEffect } from 'react'
import { gjApi } from '../../api'
import { GjAdminShell, Card, Field, SaveButton, useSaver } from './GjAdminShell'

const textareaClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono'

export default function GjRulesEditor() {
  document.title = '綠夾克盃 — 賽事規則'
  const { saving, run, banner } = useSaver()
  const [form, setForm] = useState(null)

  useEffect(() => {
    gjApi.get('/tournament').then(({ tournament: t }) => setForm({
      brief_rules: t?.brief_rules || '',
      rules_text: t?.rules_text || '',
    }))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const save = () => run(() => gjApi.put('/tournament/rules', form))

  if (!form) return <div className="min-h-screen flex items-center justify-center text-emerald-900">載入中...</div>

  return (
    <GjAdminShell title="賽事規則">
      {banner}
      <Card>
        <Field label="比賽規則摘要" hint="顯示在賽事資料頁上方，建議簡短幾行">
          <textarea className={textareaClass} rows={6} value={form.brief_rules}
            onChange={e => set('brief_rules', e.target.value)}
            placeholder={'比桿賽，總桿扣差點取淨桿冠軍\n冠軍同淨桿時在練習果嶺 PK 決勝'} />
        </Field>
        <Field label="本次賽事規則" hint="完整規則，換行會保留">
          <textarea className={textareaClass} rows={12} value={form.rules_text}
            onChange={e => set('rules_text', e.target.value)} />
        </Field>
      </Card>
      <SaveButton onClick={save} saving={saving} />
    </GjAdminShell>
  )
}
