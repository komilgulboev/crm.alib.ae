import { useQuery } from '@tanstack/react-query'
import { Package, Users, TrendingUp, Truck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ordersApi } from '../../api/orders'
import { formatCurrency } from '../../lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => ordersApi.dashboardStats().then((r) => r.data),
  })

  if (isLoading) {
    return <div className="text-gray-400">{t('common.loading')}</div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('dashboard.title')}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title={t('dashboard.totalOrders')}
          value={stats?.total_orders ?? 0}
          icon={<Package size={20} className="text-blue-600" />}
          color="bg-blue-50"
        />
        <StatCard
          title={t('dashboard.newOrders')}
          value={stats?.new_orders ?? 0}
          icon={<Users size={20} className="text-yellow-600" />}
          color="bg-yellow-50"
        />
        <StatCard
          title={t('dashboard.inTransit')}
          value={stats?.in_transit ?? 0}
          icon={<Truck size={20} className="text-purple-600" />}
          color="bg-purple-50"
        />
        <StatCard
          title={t('dashboard.revenue')}
          value={formatCurrency(stats?.total_revenue_usd ?? 0, 'USD')}
          icon={<TrendingUp size={20} className="text-green-600" />}
          color="bg-green-50"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.deliveryStats')}</h2>
        <div className="flex items-center gap-8 text-center">
          <div>
            <p className="text-3xl font-bold text-green-600">{stats?.delivered ?? 0}</p>
            <p className="text-sm text-gray-500 mt-1">{t('dashboard.delivered')}</p>
          </div>
          <div className="h-12 w-px bg-gray-200" />
          <div>
            <p className="text-3xl font-bold text-blue-600">{stats?.in_transit ?? 0}</p>
            <p className="text-sm text-gray-500 mt-1">{t('dashboard.inTransit')}</p>
          </div>
          <div className="h-12 w-px bg-gray-200" />
          <div>
            <p className="text-3xl font-bold text-yellow-600">{stats?.new_orders ?? 0}</p>
            <p className="text-sm text-gray-500 mt-1">{t('dashboard.pending')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
