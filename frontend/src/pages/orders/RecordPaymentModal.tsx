import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Modal from '../../components/ui/Modal'
import { paymentsApi } from '../../api/payments'
import type { Order, Currency, PaymentMethod } from '../../types'
import { CURRENCY_SYMBOLS } from '../../lib/utils'

interface Props {
  order: Order | null
  onClose: () => void
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash',          label: 'Наличные' },
  { value: 'bank_transfer', label: 'Банковский перевод' },
  { value: 'card',          label: 'Карта' },
  { value: 'crypto',        label: 'Крипто' },
]

const EXCHANGE_RATES: Record<Currency, number> = {
  USD: 1,
  AED: 3.67,
  TJS: 10.9,
  RUB: 92,
}

export default function RecordPaymentModal({ order, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    amount: '',
    currency: (order?.currency || 'USD') as Currency,
    method: 'cash' as PaymentMethod,
    note: '',
  })
  const [error, setError] = useState('')
  const set = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }))

  const remaining = order ? order.total_amount - order.paid_amount : 0
  const amountUSD = form.amount
    ? Number(form.amount) / EXCHANGE_RATES[form.currency]
    : 0

  const mutation = useMutation({
    mutationFn: () => paymentsApi.create({
      order_id: order!.id,
      amount: Number(form.amount),
      currency: form.currency,
      exchange_rate: EXCHANGE_RATES[form.currency],
      method: form.method,
      note: form.note,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onClose()
      setForm({ amount: '', currency: 'USD', method: 'cash', note: '' })
      setError('')
    },
    onError: () => setError('Ошибка при записи платежа'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.amount || Number(form.amount) <= 0) { setError('Введите сумму'); return }
    mutation.mutate()
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  if (!order) return null

  return (
    <Modal open={!!order} onClose={onClose} title="Приём платежа" size="md">
      {/* Инфо о заказе */}
      <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-gray-500">Заказ</span>
          <span className="font-mono font-medium text-blue-600">{order.tracking_number}</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-gray-500">Клиент</span>
          <span className="font-medium">{order.client?.name}</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-gray-500">К оплате</span>
          <span className="font-medium">{CURRENCY_SYMBOLS[order.currency]}{order.total_amount.toLocaleString('ru-RU')}</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-gray-500">Оплачено</span>
          <span className={order.paid_amount > 0 ? 'font-medium text-green-600' : 'text-gray-400'}>
            {CURRENCY_SYMBOLS['USD']}{order.paid_amount.toLocaleString('ru-RU')}
          </span>
        </div>
        <div className="flex justify-between items-center mt-1 pt-1 border-t border-gray-200">
          <span className="text-gray-500 font-medium">Остаток (USD)</span>
          <span className={`font-bold ${remaining > 0 ? 'text-red-500' : 'text-green-600'}`}>
            ${remaining.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Сумма *</label>
            <input type="number" min="0" step="0.01" value={form.amount}
              onChange={e => set('amount', e.target.value)}
              className={inputCls} placeholder="0.00" required />
          </div>
          <div>
            <label className={labelCls}>Валюта</label>
            <select value={form.currency} onChange={e => set('currency', e.target.value as Currency)} className={inputCls}>
              {(['USD', 'AED', 'TJS', 'RUB'] as Currency[]).map(c => (
                <option key={c} value={c}>{c} ({CURRENCY_SYMBOLS[c]})</option>
              ))}
            </select>
          </div>
        </div>

        {form.amount && form.currency !== 'USD' && (
          <p className="text-xs text-gray-500 bg-blue-50 px-3 py-2 rounded-lg">
            ≈ ${amountUSD.toFixed(2)} USD (курс: 1 USD = {EXCHANGE_RATES[form.currency]} {form.currency})
          </p>
        )}

        <div>
          <label className={labelCls}>Способ оплаты</label>
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map(m => (
              <label key={m.value} className={`flex items-center gap-2 p-2.5 border rounded-lg cursor-pointer text-sm transition ${
                form.method === m.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input type="radio" name="method" value={m.value}
                  checked={form.method === m.value} onChange={e => set('method', e.target.value)}
                  className="accent-blue-600" />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Примечание</label>
          <input value={form.note} onChange={e => set('note', e.target.value)}
            className={inputCls} placeholder="Кто принял, детали..." />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            Отмена
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="px-6 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50">
            {mutation.isPending ? 'Сохранение...' : 'Записать платёж'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
