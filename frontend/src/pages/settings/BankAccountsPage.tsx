import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Building2, CheckCircle, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { bankAccountsApi } from '../../api/bankAccounts'
import Modal from '../../components/ui/Modal'
import type { BankAccount } from '../../types'

const CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'TJS', 'RUB']

const emptyForm = {
  account_name: '',
  bank_name: '',
  swift_code: '',
  account_number: '',
  iban: '',
  currency: 'AED',
  active: true,
}

export default function BankAccountsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<BankAccount | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountsApi.list().then(r => r.data),
  })

  const set = (field: string, value: string | boolean) =>
    setForm(p => ({ ...p, [field]: value }))

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (acc: BankAccount) => {
    setEditing(acc)
    setForm({
      account_name: acc.account_name,
      bank_name: acc.bank_name,
      swift_code: acc.swift_code,
      account_number: acc.account_number,
      iban: acc.iban,
      currency: acc.currency,
      active: acc.active,
    })
    setError('')
    setModalOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? bankAccountsApi.update(editing.id, form)
        : bankAccountsApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] })
      setModalOpen(false)
    },
    onError: () => setError(t('common.saveError')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => bankAccountsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bank-accounts'] }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.account_name || !form.bank_name || !form.currency) {
      setError(t('bankAccounts.errorRequired'))
      return
    }
    saveMutation.mutate()
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('bankAccounts.editTitle') : t('bankAccounts.newTitle')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>{t('bankAccounts.fAccountName')} *</label>
              <input
                value={form.account_name}
                onChange={e => set('account_name', e.target.value)}
                className={inputCls}
                placeholder="AL IBTIKAR LOGISTIC SERVICES"
                required
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>{t('bankAccounts.fBank')} *</label>
              <input
                value={form.bank_name}
                onChange={e => set('bank_name', e.target.value)}
                className={inputCls}
                placeholder="Emirates Islamic Bank"
                required
              />
            </div>
            <div>
              <label className={labelCls}>{t('bankAccounts.fSwift')}</label>
              <input
                value={form.swift_code}
                onChange={e => set('swift_code', e.target.value)}
                className={inputCls}
                placeholder="MEBLAEADXXX"
              />
            </div>
            <div>
              <label className={labelCls}>{t('bankAccounts.fCurrency')} *</label>
              <select
                value={form.currency}
                onChange={e => set('currency', e.target.value)}
                className={inputCls}
              >
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>{t('bankAccounts.fAccountNumber')}</label>
              <input
                value={form.account_number}
                onChange={e => set('account_number', e.target.value)}
                className={inputCls}
                placeholder="3708489811201"
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>{t('bankAccounts.fIban')}</label>
              <input
                value={form.iban}
                onChange={e => set('iban', e.target.value)}
                className={inputCls}
                placeholder="AE390340003708489811201"
              />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => set('active', e.target.checked)}
                  className="accent-blue-600"
                />
                <span className="text-sm text-gray-700">{t('bankAccounts.fActive')}</span>
              </label>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
            >
              {saveMutation.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </Modal>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('bankAccounts.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('bankAccounts.subtitle')}</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition"
        >
          <Plus size={16} />
          {t('bankAccounts.addAccount')}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">{t('common.loading')}</div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Building2 size={40} className="mx-auto mb-3 text-gray-300" />
            <p>{t('bankAccounts.noAccounts')}</p>
            <p className="text-sm mt-1">{t('bankAccounts.noAccountsHint')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('bankAccounts.colNameBank')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('bankAccounts.colIban')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('bankAccounts.colNumber')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('bankAccounts.colSwift')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('bankAccounts.colCurrency')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('bankAccounts.colStatus')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map(acc => (
                <tr key={acc.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{acc.account_name}</p>
                    <p className="text-xs text-gray-500">{acc.bank_name}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{acc.iban || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{acc.account_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{acc.swift_code || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                      {acc.currency}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {acc.active ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <CheckCircle size={14} /> {t('bankAccounts.active')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-400 text-xs">
                        <XCircle size={14} /> {t('bankAccounts.inactive')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(acc)}
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition"
                        title={t('common.edit')}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(t('bankAccounts.deleteConfirm'))) deleteMutation.mutate(acc.id)
                        }}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition"
                        title={t('common.delete')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
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
