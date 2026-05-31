import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Modal from '../../components/ui/Modal'
import { usersApi } from '../../api/users'
import type { Role } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: 'superadmin',  label: 'Суперадмин',      description: 'Полный доступ, настройки системы' },
  { value: 'manager',     label: 'Менеджер',         description: 'Заказы, клиенты, платежи' },
  { value: 'warehouse',   label: 'Склад',            description: 'Приём и выдача товара' },
  { value: 'accountant',  label: 'Бухгалтер',        description: 'Финансы и отчёты' },
  { value: 'driver',      label: 'Водитель/Курьер',  description: 'Только свои заказы' },
  { value: 'client',      label: 'Клиент',           description: 'Просмотр своих заказов' },
]

export default function CreateUserModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'manager' as Role })
  const [error, setError] = useState('')
  const set = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }))

  const mutation = useMutation({
    mutationFn: () => usersApi.create({ ...form, role: form.role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onClose()
      setForm({ name: '', email: '', phone: '', password: '', role: 'manager' })
      setError('')
    },
    onError: (e: any) => setError(e?.response?.data?.error || 'Ошибка при создании пользователя'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 6) { setError('Минимальная длина пароля — 6 символов'); return }
    mutation.mutate()
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <Modal open={open} onClose={onClose} title="Новый пользователь" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Имя *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            className={inputCls} placeholder="Алибек Рахимов" required />
        </div>
        <div>
          <label className={labelCls}>Email *</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
            className={inputCls} placeholder="user@alib.ae" required />
        </div>
        <div>
          <label className={labelCls}>Телефон</label>
          <input value={form.phone} onChange={e => set('phone', e.target.value)}
            className={inputCls} placeholder="+971..." />
        </div>
        <div>
          <label className={labelCls}>Пароль *</label>
          <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
            className={inputCls} placeholder="Минимум 6 символов" required />
        </div>
        <div>
          <label className={labelCls}>Роль *</label>
          <div className="space-y-2">
            {ROLES.map(r => (
              <label key={r.value} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                form.role === r.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input type="radio" name="role" value={r.value}
                  checked={form.role === r.value} onChange={e => set('role', e.target.value)}
                  className="mt-0.5 accent-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.label}</p>
                  <p className="text-xs text-gray-500">{r.description}</p>
                </div>
              </label>
            ))}
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
            {mutation.isPending ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
