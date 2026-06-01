import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, BookOpen, GripVertical, CheckCircle, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/ui/Modal'
import { catalogsApi } from '../../api/catalogs'
import type { CatalogEntry } from '../../types'

const CATALOG_TYPE_KEYS = ['job_type', 'order_status', 'ntr'] as const
type CatalogTypeKey = typeof CATALOG_TYPE_KEYS[number]

const emptyForm = {
  value: '',
  label: '',
  sort_order: 0,
  active: true,
}

export default function CatalogsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedType, setSelectedType] = useState<CatalogTypeKey>('job_type')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogEntry | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  const CATALOG_TYPES = CATALOG_TYPE_KEYS.map(type => ({
    type,
    label: t(`catalogs.types.${type}.label`),
    description: t(`catalogs.types.${type}.description`),
    hint: type === 'job_type' ? 'T-IN, L-EXP, T-OUT...'
        : type === 'order_status' ? 'new, accepted, warehouse...'
        : 'GEN, DG, PER, VAL, EAP...',
  }))

  const selectedCatalog = CATALOG_TYPES.find(c => c.type === selectedType)!

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['catalogs', selectedType],
    queryFn: () => catalogsApi.list(selectedType).then(r => r.data),
  })

  const set = (field: string, value: string | number | boolean) =>
    setForm(p => ({ ...p, [field]: value }))

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, sort_order: entries.length + 1 })
    setError('')
    setModalOpen(true)
  }

  const openEdit = (entry: CatalogEntry) => {
    setEditing(entry)
    setForm({
      value: entry.value,
      label: entry.label,
      sort_order: entry.sort_order,
      active: entry.active,
    })
    setError('')
    setModalOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? catalogsApi.update(editing.id, form)
        : catalogsApi.create({ ...form, type: selectedType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogs', selectedType] })
      queryClient.invalidateQueries({ queryKey: ['catalogs'] })
      setModalOpen(false)
    },
    onError: () => setError(t('common.saveError')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => catalogsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogs', selectedType] })
      queryClient.invalidateQueries({ queryKey: ['catalogs'] })
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      catalogsApi.update(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalogs', selectedType] }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.value.trim() || !form.label.trim()) {
      setError(t('catalogs.errorRequired'))
      return
    }
    saveMutation.mutate()
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('catalogs.editEntryTitle') : `${t('catalogs.newEntryTitle')} ${selectedCatalog.label}`}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={lbl}>{t('catalogs.fValue')} *</label>
            <input
              value={form.value}
              onChange={e => set('value', e.target.value.toUpperCase())}
              className={inp}
              placeholder={selectedCatalog.hint}
              disabled={!!editing}
            />
            {editing && (
              <p className="text-xs text-gray-400 mt-1">{t('catalogs.valueReadonly')}</p>
            )}
          </div>
          <div>
            <label className={lbl}>{t('catalogs.fLabel')} *</label>
            <input
              value={form.label}
              onChange={e => set('label', e.target.value)}
              className={inp}
              placeholder="T-IN — Transport Import"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>{t('catalogs.fSortOrder')}</label>
              <input
                type="number"
                min="0"
                value={form.sort_order}
                onChange={e => set('sort_order', Number(e.target.value))}
                className={inp}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => set('active', e.target.checked)}
                  className="accent-blue-600 w-4 h-4"
                />
                <span className="text-sm text-gray-700">{t('catalogs.fActive')}</span>
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

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('catalogs.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('catalogs.subtitle')}</p>
      </div>

      <div className="flex gap-3 mb-6">
        {CATALOG_TYPES.map(ct => (
          <button
            key={ct.type}
            onClick={() => setSelectedType(ct.type)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition ${
              selectedType === ct.type
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <BookOpen size={18} className={selectedType === ct.type ? 'text-blue-600' : 'text-gray-400'} />
            <div>
              <p className={`text-sm font-semibold ${selectedType === ct.type ? 'text-blue-700' : 'text-gray-700'}`}>
                {ct.label}
              </p>
              <p className="text-xs text-gray-400">{ct.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">
            {selectedCatalog.label}
            <span className="ml-2 text-xs font-normal text-gray-400">{entries.length} {t('catalogs.records')}</span>
          </p>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
          >
            <Plus size={15} />
            {t('catalogs.addEntry')}
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">{t('common.loading')}</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <BookOpen size={36} className="mx-auto mb-3 text-gray-300" />
            <p>{t('catalogs.noEntries')}</p>
            <p className="text-sm mt-1">{t('catalogs.noEntriesHint')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-10">
                  <GripVertical size={14} className="text-gray-300" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('catalogs.colValue')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('catalogs.colLabel')}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 w-24">{t('catalogs.colOrder')}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 w-28">{t('catalogs.colStatus')}</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-gray-300">
                    <GripVertical size={14} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded">
                      {entry.value}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{entry.label}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{entry.sort_order}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: entry.id, active: !entry.active })}
                      className="inline-flex items-center gap-1 text-xs transition"
                      title={entry.active ? t('common.deactivate') : t('common.activate')}
                    >
                      {entry.active ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle size={14} /> {t('catalogs.active')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-400">
                          <XCircle size={14} /> {t('catalogs.inactive')}
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(entry)}
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition"
                        title={t('common.edit')}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`${t('catalogs.deleteConfirm')} "${entry.label}"?`)) deleteMutation.mutate(entry.id)
                        }}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition"
                        title={t('common.delete')}
                      >
                        <Trash2 size={14} />
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
