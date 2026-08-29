import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { api, gjApi } from './api'

// Admin pages — Ring Cup
import Login from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import TournamentSetup from './pages/admin/TournamentSetup'
import CourseSetup from './pages/admin/CourseSetup'
import RulesEditor from './pages/admin/RulesEditor'
import PlayersManager from './pages/admin/PlayersManager'
import GroupsManager from './pages/admin/GroupsManager'

// Public pages — Ring Cup
import InfoPage from './pages/public/InfoPage'
import PickHorsePage from './pages/public/PickHorsePage'
import ScoresPage from './pages/public/ScoresPage'
import RankingsPage from './pages/public/RankingsPage'

// Public pages — Green Jacket
import GjInfoPage from './pages/gj/GjInfoPage'
import GjScoresPage from './pages/gj/GjScoresPage'
import GjRankingsPage from './pages/gj/GjRankingsPage'

// Admin pages — Green Jacket
import GjDashboard from './pages/gj/GjDashboard'
import GjTournamentSetup from './pages/gj/GjTournamentSetup'
import GjCourseSetup from './pages/gj/GjCourseSetup'
import GjRulesEditor from './pages/gj/GjRulesEditor'
import GjPlayersManager from './pages/gj/GjPlayersManager'
import GjGroupsManager from './pages/gj/GjGroupsManager'
import GjTiebreakSettings from './pages/gj/GjTiebreakSettings'
import ChampionsManager from './pages/gj/ChampionsManager'

function ProtectedRoute({ allowed, children }) {
  if (!allowed) return <Navigate to="/admin" replace />
  return children
}

export default function App() {
  const [auth, setAuth] = useState({ ring: false, greenjacket: false })
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    api.get('/auth/check')
      .then(d => setAuth({ ring: !!d.ring, greenjacket: !!d.greenjacket }))
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  const login  = (scope) => setAuth(a => ({ ...a, [scope]: true }))
  const logout = (scope) => setAuth(a => ({ ...a, [scope]: false }))

  const gjRoute = (path, element) => (
    <Route path={path} element={<ProtectedRoute allowed={auth.greenjacket}>{element}</ProtectedRoute>} />
  )
  const ringRoute = (path, element) => (
    <Route path={path} element={<ProtectedRoute allowed={auth.ring}>{element}</ProtectedRoute>} />
  )

  return checking ? (
    <div className="flex items-center justify-center min-h-screen text-green-800 text-xl">
      載入中... Loading...
    </div>
  ) : (
    <Routes>
      {/* ---- Public: Ring Cup ---- */}
      <Route path="/" element={<InfoPage />} />
      <Route path="/pick" element={<PickHorsePage />} />
      <Route path="/scores" element={<ScoresPage />} />
      <Route path="/rankings" element={<RankingsPage />} />

      {/* ---- Public: Green Jacket ---- */}
      <Route path="/greenjacket" element={<GjInfoPage />} />
      <Route path="/greenjacket/scores" element={<GjScoresPage />} />
      <Route path="/greenjacket/rankings" element={<GjRankingsPage />} />

      {/* ---- Admin: shared login (two forms) ---- */}
      <Route path="/admin" element={<Login onLogin={login} />} />

      {/* ---- Admin: Ring Cup ---- */}
      <Route path="/admin/dashboard" element={
        <ProtectedRoute allowed={auth.ring}>
          <Dashboard onLogout={() => logout('ring')} />
        </ProtectedRoute>
      } />
      {ringRoute('/admin/tournament', <TournamentSetup />)}
      {ringRoute('/admin/course', <CourseSetup />)}
      {ringRoute('/admin/rules', <RulesEditor />)}
      {ringRoute('/admin/players', <PlayersManager />)}
      {ringRoute('/admin/groups', <GroupsManager />)}
      {ringRoute('/admin/champions',
        <ChampionsManager api={api} title="戒指盃 歷屆冠軍" backTo="/admin/dashboard" theme="ring" />)}

      {/* ---- Admin: Green Jacket ---- */}
      {gjRoute('/admin/gj/dashboard', <GjDashboard />)}
      {gjRoute('/admin/gj/tournament', <GjTournamentSetup />)}
      {gjRoute('/admin/gj/course', <GjCourseSetup />)}
      {gjRoute('/admin/gj/rules', <GjRulesEditor />)}
      {gjRoute('/admin/gj/players', <GjPlayersManager />)}
      {gjRoute('/admin/gj/groups', <GjGroupsManager />)}
      {gjRoute('/admin/gj/tiebreak', <GjTiebreakSettings />)}
      {gjRoute('/admin/gj/champions',
        <ChampionsManager api={gjApi} title="綠夾克盃 歷屆冠軍" backTo="/admin/gj/dashboard" />)}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
