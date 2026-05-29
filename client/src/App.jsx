import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { api } from './api'

// Admin pages
import Login from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import TournamentSetup from './pages/admin/TournamentSetup'
import CourseSetup from './pages/admin/CourseSetup'
import RulesEditor from './pages/admin/RulesEditor'
import PlayersManager from './pages/admin/PlayersManager'
import GroupsManager from './pages/admin/GroupsManager'

// Public pages
import InfoPage from './pages/public/InfoPage'
import PickHorsePage from './pages/public/PickHorsePage'
import ScoresPage from './pages/public/ScoresPage'
import RankingsPage from './pages/public/RankingsPage'

function ProtectedRoute({ isAdmin, children }) {
  if (!isAdmin) return <Navigate to="/admin" replace />
  return children
}

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    api.get('/auth/check')
      .then(d => setIsAdmin(d.isAdmin))
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  if (checking) return (
    <div className="flex items-center justify-center min-h-screen text-green-800 text-xl">
      載入中... Loading...
    </div>
  )

  return (
    <Routes>
      {/* Public pages */}
      <Route path="/" element={<InfoPage />} />
      <Route path="/pick" element={<PickHorsePage />} />
      <Route path="/scores" element={<ScoresPage />} />
      <Route path="/rankings" element={<RankingsPage />} />

      {/* Admin pages */}
      <Route path="/admin" element={<Login onLogin={() => setIsAdmin(true)} />} />
      <Route path="/admin/dashboard" element={
        <ProtectedRoute isAdmin={isAdmin}>
          <Dashboard onLogout={() => setIsAdmin(false)} />
        </ProtectedRoute>
      } />
      <Route path="/admin/tournament" element={
        <ProtectedRoute isAdmin={isAdmin}><TournamentSetup /></ProtectedRoute>
      } />
      <Route path="/admin/course" element={
        <ProtectedRoute isAdmin={isAdmin}><CourseSetup /></ProtectedRoute>
      } />
      <Route path="/admin/rules" element={
        <ProtectedRoute isAdmin={isAdmin}><RulesEditor /></ProtectedRoute>
      } />
      <Route path="/admin/players" element={
        <ProtectedRoute isAdmin={isAdmin}><PlayersManager /></ProtectedRoute>
      } />
      <Route path="/admin/groups" element={
        <ProtectedRoute isAdmin={isAdmin}><GroupsManager /></ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
