import { useQuery } from '@tanstack/react-query'
import api from '../../api/client'
import type { Payment } from '../../types'
import { formatCurrency, formatDate, CURRENCY_SYMBOLS } from '../../lib/utils'

const METHOD_LABELS: Record<string, string> = {
  cash: 'Наличные',
  bank_transfer: 'Перевод',
  card: 'Карта',
  crypto: 'Крипто',
}

export default function PaymentsPage() {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => api.get<Payment[]>('/payments').then((r) => r.data),
  })

  const totalUSD = payments.reduce((sum, p) => sum + p.amount_usd, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Платежи</h1>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm">
          <span className="text-gray-500">Итого получено:</span>
          <span className="font-bold text-green-700 ml-2">{formatCurrency(totalUSD, 'USD')}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Загрузка...</div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Платежей не найдено</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Заказ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Сумма</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">В USD</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Способ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Принял</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Дата</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Примечание</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((payment: Payment) => (
                <tr key={payment.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-mono text-blue-600 text-xs">
                    #{payment.order_id}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {CURRENCY_SYMBOLS[payment.currency]}{payment.amount.toLocaleString('ru-RU')}
                    <span className="text-gray-400 text-xs ml-1">{payment.currency}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatCurrency(payment.amount_usd, 'USD')}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                      {METHOD_LABELS[payment.method] || payment.method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{payment.user?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(payment.created_at)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">
                    {payment.note || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
