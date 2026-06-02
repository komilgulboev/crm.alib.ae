import { useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '../../store/auth'

export default function Layout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true')

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const toggleCollapsed = () => {
    setCollapsed(p => {
      localStorage.setItem('sidebar_collapsed', String(!p))
      return !p
    })
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <main className={`flex-1 overflow-auto transition-all duration-200 ${collapsed ? 'ml-14' : 'ml-64'}`}>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
