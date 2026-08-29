import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'

// One form per tournament. They are deliberately separate rather than one form
// with a dropdown — signing in to one grants no access to the other.
function LoginForm({ scope, title, subtitle, redirectTo, onLogin, theme }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/login', { username, password, scope })
      onLogin(scope)
      navigate(redirectTo)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`rounded-2xl shadow-lg p-6 ${theme.card}`}>
      <div className="text-center mb-5">
        <div className="text-4xl mb-1">{theme.icon}</div>
        <h2 className={`text-xl font-bold ${theme.title}`}>{title}</h2>
        <p className="text-gray-500 text-sm">{subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">帳號 Username</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className={`w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 ${theme.ring}`}
            placeholder="admin"
            autoComplete="username"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">密碼 Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={`w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 ${theme.ring}`}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full text-white font-bold py-3 rounded-lg text-lg transition disabled:opacity-50 ${theme.button}`}
        >
          {loading ? '登入中...' : '登入 Login'}
        </button>
      </form>
    </div>
  )
}

function PublicLinks({ heading, links, accent }) {
  return (
    <div>
      <p className={`text-center text-sm font-medium mb-2 ${accent}`}>{heading}</p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {links.map(({ label, path }) => (
          <a key={path} href={path}
            className="text-center bg-white/80 hover:bg-white text-gray-700 rounded-lg px-2 py-2 transition shadow-sm">
            {label}
          </a>
        ))}
      </div>
    </div>
  )
}

export default function Login({ onLogin }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-green-100 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">⛳</div>
          <h1 className="text-2xl font-bold text-green-900">高爾夫球賽計分系統</h1>
          <p className="text-gray-500 text-sm">請選擇要管理的比賽</p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <LoginForm
            scope="ring"
            title="戒指盃管理員登入"
            subtitle="Ring Cup Admin"
            redirectTo="/admin/dashboard"
            onLogin={onLogin}
            theme={{
              icon: '💍',
              card: 'bg-white',
              title: 'text-green-800',
              ring: 'focus:ring-green-500',
              button: 'bg-green-700 hover:bg-green-800',
            }}
          />
          <LoginForm
            scope="greenjacket"
            title="綠夾克管理員登入"
            subtitle="Green Jacket Admin"
            redirectTo="/admin/gj/dashboard"
            onLogin={onLogin}
            theme={{
              icon: '🏆',
              card: 'bg-white ring-2 ring-amber-300',
              title: 'text-emerald-900',
              ring: 'focus:ring-amber-500',
              button: 'bg-emerald-900 hover:bg-emerald-950',
            }}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-5 mt-8">
          <PublicLinks
            heading="💍 戒指盃公開頁面"
            accent="text-green-800"
            links={[
              { label: '賽事資訊', path: '/' },
              { label: '選馬 Pick Horse', path: '/pick' },
              { label: '輸入成績 Scores', path: '/scores' },
              { label: '排名 Rankings', path: '/rankings' },
            ]}
          />
          <PublicLinks
            heading="🏆 綠夾克盃公開頁面"
            accent="text-emerald-900"
            links={[
              { label: '賽事資料', path: '/greenjacket' },
              { label: '輸入成績 Scores', path: '/greenjacket/scores' },
              { label: '排名 Rankings', path: '/greenjacket/rankings' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
