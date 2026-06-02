import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, CreditCard,
  Settings, LogOut, Truck, Building2, BookOpen, Globe,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/auth'
import { cn } from '../../lib/utils'

interface Props {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: Props) {
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

  const navLink = (to: string, icon: React.ElementType, label: string, end?: boolean) => {
    const Icon = icon
    return (
      <NavLink
        key={to}
        to={to}
        end={end}
        title={collapsed ? label : undefined}
        className={({ isActive }) =>
          cn(
            'flex items-center py-2 rounded-lg text-sm transition',
            collapsed ? 'justify-center px-2' : 'gap-3 px-3',
            isActive
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          )
        }
      >
        <Icon size={18} className="shrink-0" />
        {!collapsed && label}
      </NavLink>
    )
  }

  return (
    <aside className={cn(
      'bg-gray-900 text-white flex flex-col h-screen fixed left-0 top-0 transition-all duration-200 overflow-hidden',
      collapsed ? 'w-14' : 'w-64'
    )}>

      {/* Logo + toggle */}
      <div className={cn(
        'border-b border-gray-700',
        collapsed ? 'p-2 flex flex-col items-center gap-2' : 'p-4 flex items-center justify-between'
      )}>
        <div className={cn('flex items-center', collapsed ? '' : 'gap-3')}>
          <div className="bg-blue-600 p-2 rounded-lg shrink-0">
            <Truck size={20} />
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-bold text-lg leading-tight">Alib CRM</h1>
              <p className="text-gray-400 text-xs">{t('nav.freight')}</p>
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          className="text-gray-400 hover:text-white hover:bg-gray-800 p-1.5 rounded-lg transition"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon, label }) => navLink(to, icon, label, to === '/'))}

        {user?.role === 'superadmin' && (
          <>
            {collapsed
              ? <div className="my-2 border-t border-gray-700 mx-1" />
              : <div className="pt-4 pb-2">
                  <p className="text-gray-500 text-xs uppercase tracking-wider px-3">{t('nav.admin')}</p>
                </div>
            }
            {adminItems.map(({ to, icon, label }) => navLink(to, icon, label))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className={cn('border-t border-gray-700', collapsed ? 'p-2 flex flex-col items-center gap-2' : 'p-4')}>
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-3 mb-3')}>
          <div
            className="bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium shrink-0"
            title={collapsed ? user?.name : undefined}
          >
            {user?.name?.[0]?.toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-gray-400 text-xs truncate">{user?.role}</p>
            </div>
          )}
        </div>
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'justify-between')}>
          <button
            onClick={handleLogout}
            title={collapsed ? t('nav.logout') : undefined}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition"
          >
            <LogOut size={16} />
            {!collapsed && t('nav.logout')}
          </button>
          <button
            onClick={toggleLang}
            title="Switch language"
            className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs transition px-2 py-1 rounded hover:bg-gray-800"
          >
            <Globe size={13} />
            {!collapsed && (i18n.language === 'ru' ? 'EN' : 'RU')}
          </button>
        </div>
      </div>
    </aside>
  )
}
