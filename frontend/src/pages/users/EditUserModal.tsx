import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/ui/Modal'
import { usersApi } from '../../api/users'
import type { Role, User } from '../../types'

interface Props {
  user: User | null
  onClose: () => void
}

const ROLE_VALUES: Role[] = ['superadmin', 'manager', 'warehouse', 'accountant', 'driver', 'client']

export default function EditUserModal({ user, onClose }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'manager' as Role,
    telegram_chat_id: '',
    new_password: '',
    active: true,
  })
  const [error, setError] = useState('')
  const set = (field: string, value: string | boolean) => setForm(p => ({ ...p, [field]: value }))

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        telegram_chat_id: user.telegram_chat_id || '',
        new_password: '',
        active: user.active,
      })
      setError('')
    }
  }, [user])

  const mutation = useMutation({
    mutationFn: () => {
      if (!user) return Promise.reject()
      const payload: Parameters<typeof usersApi.update>[1] = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: form.role,
        active: form.active,
        telegram_chat_id: form.telegram_chat_id,
      }
      if (form.new_password) payload.new_password = form.new_password
      return usersApi.update(user.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (e: any) => setError(e?.response?.data?.error || t('users.editError')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.new_password && form.new_password.length < 6) {
      setError(t('users.passwordMinLength'))
      return
    }
    mutation.mutate()
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <Modal open={!!user} onClose={onClose} title={t('users.editTitle')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t('users.fName')} *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>{t('users.fPhone')}</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              className={inputCls} placeholder="+971..." />
          </div>
        </div>

        <div>
          <label className={labelCls}>{t('users.fEmail')} *</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
            className={inputCls} required />
        </div>

        <div>
          <label className={labelCls}>{t('users.fTelegram')}</label>
          <input value={form.telegram_chat_id} onChange={e => set('telegram_chat_id', e.target.value)}
            className={inputCls} placeholder="123456789" />
          <p className="text-xs text-gray-400 mt-1">{t('users.fTelegramHint')}</p>
        </div>

        <div>
          <label className={labelCls}>{t('users.fNewPassword')}</label>
          <input type="password" value={form.new_password} onChange={e => set('new_password', e.target.value)}
            className={inputCls} placeholder={t('users.fNewPasswordPlaceholder')} />
        </div>

        <div>
          <label className={labelCls}>{t('users.fRole')} *</label>
          <div className="space-y-2">
            {ROLE_VALUES.map(role => (
              <label key={role} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                form.role === role ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input type="radio" name="edit_role" value={role}
                  checked={form.role === role} onChange={e => set('role', e.target.value)}
                  className="mt-0.5 accent-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{t(`users.roles.${role}` as const)}</p>
                  <p className="text-xs text-gray-500">{t(`users.roleDesc.${role}` as const)}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="edit_active" checked={form.active}
            onChange={e => set('active', e.target.checked)}
            className="accent-blue-600" />
          <label htmlFor="edit_active" className="text-sm text-gray-700">{t('users.fActive')}</label>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50">
            {mutation.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
