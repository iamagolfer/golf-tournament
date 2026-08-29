import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { gjApi } from '../../api'

// Chrome shared by every Green Jacket admin page.
export function GjAdminShell({ title, subtitle, children, onLogout, showBack = true, backTo = '/admin/gj/dashboard' }) {
  return (
    <div className="min-h-screen bg-[#f4f7f2]">
      <div className="bg-emerald-900 text-white px-4 py-4 border-b-4 border-amber-400">
        <div className="flex items-start justify-between gap-3 max-w-2xl mx-auto">
          <div className="min-w-0">
            <div className="text-amber-300 text-xs font-semibold tracking-widest uppercase">綠夾克盃 管理</div>
            <h1 className="text-xl font-bold truncate">{title}</h1>
            {subtitle && <p className="text-emerald-200 text-sm">{subtitle}</p>}
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1 text-sm">
            {showBack && <Link to={backTo} className="text-amber-200 underline">返回管理面板</Link>}
            {onLogout && <button onClick={onLogout} className="text-emerald-300 underline">登出</button>}
          </div>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-3 py-4 pb-12">{children}</div>
    </div>
  )
}

export function Card({ title, children, accent }) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
      {title && (
        <div className={`px-4 py-2.5 font-bold ${accent || 'bg-emerald-800 text-white'}`}>{title}</div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

export const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-500'

export function SaveButton({ onClick, saving, children = '儲存 Save', disabled }) {
  return (
    <button onClick={onClick} disabled={saving || disabled}
      className="w-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-3 rounded-lg text-lg transition disabled:opacity-50">
      {saving ? '儲存中...' : children}
    </button>
  )
}

// Small helper that gives every admin page the same save/feedback behaviour
export function useSaver() {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  async function run(fn, successText = '已儲存 ✓') {
    setSaving(true)
    setMessage(null)
    try {
      await fn()
      setMessage({ ok: true, text: successText })
      setTimeout(() => setMessage(null), 2500)
      return true
    } catch (e) {
      setMessage({ ok: false, text: e.message })
      return false
    } finally {
      setSaving(false)
    }
  }

  const banner = message ? (
    <div className={`rounded-lg px-4 py-3 text-sm mb-3 whitespace-pre-wrap ${
      message.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                 : 'bg-red-50 border border-red-200 text-red-700'}`}>
      {message.text}
    </div>
  ) : null

  return { saving, run, banner, setMessage }
}

export function useGjLogout() {
  const navigate = useNavigate()
  return async () => {
    try { await gjApi.post('/auth/logout', { scope: 'greenjacket' }) } catch {}
    navigate('/admin')
  }
}
