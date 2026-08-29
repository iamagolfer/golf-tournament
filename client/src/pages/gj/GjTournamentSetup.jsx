import { useState, useEffect } from 'react'
import { gjApi } from '../../api'
import { GjAdminShell, Card, Field, inputClass, SaveButton, useSaver } from './GjAdminShell'

export default function GjTournamentSetup() {
  document.title = '綠夾克盃 — 賽事設定'
  const { saving, run, banner } = useSaver()
  const [form, setForm] = useState(null)

  useEffect(() => {
    gjApi.get('/tournament').then(({ tournament: t }) => setForm({
      name: t?.name || '',
      course_name: t?.course_name || '',
      date: t?.date || '',
      tee_time: t?.tee_time || '',
      total_players: t?.total_players || 0,
    }))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const save = () => run(() => gjApi.put('/tournament/info', form))

  if (!form) return <div className="min-h-screen flex items-center justify-center text-emerald-900">載入中...</div>

  return (
    <GjAdminShell title="賽事設定">
      {banner}
      <Card>
        <Field label="比賽名稱" hint="顯示在所有公開頁面的標題">
          <input className={inputClass} value={form.name}
            onChange={e => set('name', e.target.value)} placeholder="綠夾克盃" />
        </Field>
        <Field label="球場">
          <input className={inputClass} value={form.course_name}
            onChange={e => set('course_name', e.target.value)} placeholder="再興高爾夫俱樂部" />
        </Field>
        <Field label="日期" hint="格式 YYYY-MM-DD">
          <input className={inputClass} type="date" value={form.date}
            onChange={e => set('date', e.target.value)} />
        </Field>
        <Field label="開球時間">
          <input className={inputClass} type="time" value={form.tee_time}
            onChange={e => set('tee_time', e.target.value)} />
        </Field>
        <Field label="參賽人數" hint="設定後，選手名單的人數必須相符才能儲存。設 0 表示不檢查。">
          <input className={inputClass} type="number" min="0" value={form.total_players}
            onChange={e => set('total_players', Number(e.target.value))} />
        </Field>
      </Card>
      <SaveButton onClick={save} saving={saving} />
    </GjAdminShell>
  )
}
