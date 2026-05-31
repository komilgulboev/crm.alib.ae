import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Modal from '../../components/ui/Modal'
import { clientsApi } from '../../api/clients'
import type { Currency } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

const CURRENCIES: Currency[] = ['USD', 'AED', 'TJS', 'RUB']
const COUNTRIES = [
  'ОАЭ', 'Таджикистан', 'Россия', 'Казахстан', 'Кыргызстан',
  'Узбекистан', 'Китай', 'Турция', 'США', 'Германия', 'Другое',
]

export default function CreateClientModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '', phone: '', whatsapp: '', email: '',
    address: '', country: 'ОАЭ', trn: '', currency: 'USD' as Currency, notes: '',
  })
  const [error, setError] = useState('')
  const set = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }))

  const mutation = useMutation({
    mutationFn: (data: object) => clientsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      onClose()
      setForm({ name: '', phone: '', whatsapp: '', email: '', address: '', country: 'ОАЭ', trn: '', currency: 'USD', notes: '' })
      setError('')
    },
    onError: () => setError('Ошибка при создании клиента'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) { setError('Введите имя'); return }
    if (!form.phone) { setError('Введите телефон'); return }
    mutation.mutate(form)
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <Modal open={open} onClose={onClose} title="Новый клиент" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Имя / Название *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className={inputCls} placeholder="Алибек Рахимов" required />
          </div>
          <div>
            <label className={labelCls}>Телефон *</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              className={inputCls} placeholder="+971..." required />
          </div>
          <div>
            <label className={labelCls}>WhatsApp</label>
            <input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)}
              className={inputCls} placeholder="+971..." />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              className={inputCls} placeholder="client@email.com" />
          </div>
          <div>
            <label className={labelCls}>Страна</label>
            <select value={form.country} onChange={e => set('country', e.target.value)} className={inputCls}>
              {COUNTRIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Адрес</label>
            <input value={form.address} onChange={e => set('address', e.target.value)}
              className={inputCls} placeholder="Город, улица..." />
          </div>
          <div>
            <label className={labelCls}>TRN (налоговый номер)</label>
            <input value={form.trn} onChange={e => set('trn', e.target.value)}
              className={inputCls} placeholder="104182787200003" />
          </div>
          <div>
            <label className={labelCls}>Валюта расчётов</label>
            <select value={form.currency} onChange={e => set('currency', e.target.value as Currency)} className={inputCls}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Примечание</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              className={inputCls} rows={2} placeholder="Дополнительная информация..." />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            Отмена
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50">
            {mutation.isPending ? 'Сохранение...' : 'Добавить клиента'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
