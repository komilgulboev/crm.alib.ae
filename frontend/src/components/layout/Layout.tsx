import { Navigate, Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '../../store/auth'

export default function Layout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-64 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
