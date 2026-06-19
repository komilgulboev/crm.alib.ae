import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/ui/Modal'
import { clientsApi } from '../../api/clients'
import type { Currency } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

const CURRENCIES: Currency[] = ['USD', 'AED', 'TJS', 'RUB']

export default function CreateClientModal({ open, onClose }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const countries = t('clients.countries', { returnObjects: true }) as string[]
  const [form, setForm] = useState({
    name: '', phone: '', whatsapp: '', email: '',
    address: '', country: countries[0] ?? '', trn: '', currency: 'USD' as Currency, notes: '',
  })
  const [error, setError] = useState('')
  const set = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }))

  const mutation = useMutation({
    mutationFn: (data: object) => clientsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      onClose()
      setForm({ name: '', phone: '', whatsapp: '', email: '', address: '', country: countries[0] ?? '', trn: '', currency: 'USD', notes: '' })
      setError('')
    },
    onError: () => setError(t('clients.errCreate')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name)  { setError(t('clients.errName'));  return }
    if (!form.phone) { setError(t('clients.errPhone')); return }
    mutation.mutate(form)
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <Modal open={open} onClose={onClose} title={t('clients.createTitle')} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={lbl}>{t('clients.fName')}</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className={inp} placeholder={t('clients.fNamePlaceholder')} required />
          </div>
          <div>
            <label className={lbl}>{t('clients.fPhone')}</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              className={inp} placeholder="+971..." required />
          </div>
          <div>
            <label className={lbl}>WhatsApp</label>
            <input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)}
              className={inp} placeholder="+971..." />
          </div>
          <div>
            <label className={lbl}>Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              className={inp} placeholder="client@email.com" />
          </div>
          <div>
            <label className={lbl}>{t('clients.colCountry')}</label>
            <select value={form.country} onChange={e => set('country', e.target.value)} className={inp}>
              {countries.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={lbl}>{t('clients.fAddress')}</label>
            <input value={form.address} onChange={e => set('address', e.target.value)}
              className={inp} placeholder={t('clients.fAddressPlaceholder')} />
          </div>
          <div>
            <label className={lbl}>{t('clients.fTrn')}</label>
            <input value={form.trn} onChange={e => set('trn', e.target.value)}
              className={inp} placeholder="104182787200003" />
          </div>
          <div>
            <label className={lbl}>{t('clients.fCurrency')}</label>
            <select value={form.currency} onChange={e => set('currency', e.target.value as Currency)} className={inp}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={lbl}>{t('clients.fNotes')}</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              className={inp} rows={2} placeholder={t('clients.fNotesPlaceholder')} />
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
            {mutation.isPending ? t('clients.btnAdding') : t('clients.btnAdd')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
