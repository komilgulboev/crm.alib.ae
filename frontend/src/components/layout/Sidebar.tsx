import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, CreditCard,
  Settings, LogOut, Truck, Building2, BookOpen, Globe,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/auth'
import { cn } from '../../lib/utils'

export default function Sidebar() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const navItems = [
    { to: '/',         icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/orders',   icon: Package,         label: t('nav.orders') },
    { to: '/clients',  icon: Users,           label: t('nav.clients') },
    { to: '/payments', icon: CreditCard,      label: t('nav.payments') },
  ]

  const adminItems = [
    { to: '/users',         icon: Settings,  label: t('nav.users') },
    { to: '/bank-accounts', icon: Building2, label: t('nav.banks') },
    { to: '/catalogs',      icon: BookOpen,  label: t('nav.catalogs') },
  ]

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  const toggleLang = () => {
    const next = i18n.language === 'ru' ? 'en' : 'ru'
    i18n.changeLanguage(next)
    localStorage.setItem('lang', next)
  }

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-screen fixed left-0 top-0">
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Truck size={20} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Alib CRM</h1>
            <p className="text-gray-400 text-xs">{t('nav.freight')}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {user?.role === 'superadmin' && (
          <>
            <div className="pt-4 pb-2">
              <p className="text-gray-500 text-xs uppercase tracking-wider px-3">{t('nav.admin')}</p>
            </div>
            {adminItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  )
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-gray-400 text-xs truncate">{user?.role}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition"
          >
            <LogOut size={16} />
            {t('nav.logout')}
          </button>
          <button
            onClick={toggleLang}
            title="Switch language"
            className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs transition px-2 py-1 rounded hover:bg-gray-800"
          >
            <Globe size={13} />
            {i18n.language === 'ru' ? 'EN' : 'RU'}
          </button>
        </div>
      </div>
    </aside>
  )
}
