import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/ui/Modal'
import { usersApi } from '../../api/users'
import type { Role } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

const ROLE_VALUES: Role[] = ['superadmin', 'manager', 'warehouse', 'accountant', 'driver', 'client']

export default function CreateUserModal({ open, onClose }: Props) {
  const { t } = useTranslation()
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
    onError: (e: any) => setError(e?.response?.data?.error || t('users.editError')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 6) { setError('Минимальная длина пароля — 6 символов'); return }
    mutation.mutate()
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <Modal open={open} onClose={onClose} title={t('users.addUser')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>{t('users.fName')} *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            className={inputCls} placeholder="Alibek Rakhimov" required />
        </div>
        <div>
          <label className={labelCls}>{t('users.fEmail')} *</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
            className={inputCls} placeholder="user@alib.ae" required />
        </div>
        <div>
          <label className={labelCls}>{t('users.fPhone')}</label>
          <input value={form.phone} onChange={e => set('phone', e.target.value)}
            className={inputCls} placeholder="+971..." />
        </div>
        <div>
          <label className={labelCls}>{t('users.fNewPassword')} *</label>
          <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
            className={inputCls} placeholder={t('users.passwordMinLength')} required />
        </div>
        <div>
          <label className={labelCls}>{t('users.fRole')} *</label>
          <div className="space-y-2">
            {ROLE_VALUES.map(role => (
              <label key={role} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                form.role === role ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input type="radio" name="role" value={role}
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

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50">
            {mutation.isPending ? t('common.saving') : t('users.addUser')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
