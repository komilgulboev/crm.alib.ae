import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Search, PackageCheck, Banknote, FileText, Pencil, SlidersHorizontal, Paperclip, Trash2 } from 'lucide-react'
import { ordersApi } from '../../api/orders'
import { catalogsApi } from '../../api/catalogs'
import { formatDate } from '../../lib/utils'
import type { Order } from '../../types'
import { useAuthStore } from '../../store/auth'
import CreateOrderModal from './CreateOrderModal'
import RecordPaymentModal from './RecordPaymentModal'
import IssueFromWarehouseModal from './IssueFromWarehouseModal'
import InvoiceModal from './InvoiceModal'
import EditOrderModal from './EditOrderModal'
import OrderFilesModal from './OrderFilesModal'


// ── Цвета статусов ─────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  new:                'bg-gray-100 text-gray-600',
  collection_details: 'bg-yellow-100 text-yellow-700',
  warehouse:          'bg-blue-100 text-blue-700',
  dispatched:         'bg-indigo-100 text-indigo-700',
  in_transit:         'bg-purple-100 text-purple-700',
  customs:            'bg-orange-100 text-orange-700',
  departed:           'bg-cyan-100 text-cyan-700',
  handed_over:        'bg-teal-100 text-teal-700',
  arrived:            'bg-lime-100 text-lime-700',
  delivered:          'bg-green-100 text-green-700',
  completed:          'bg-green-200 text-green-800',
  closed:             'bg-gray-200 text-gray-600',
  problem:            'bg-red-100 text-red-700',
  accepted:           'bg-sky-100 text-sky-700',
}

const NTR_COLORS: Record<string, string> = {
  DG:  'bg-red-100 text-red-700 font-bold',
  PER: 'bg-orange-100 text-orange-700',
  VAL: 'bg-yellow-100 text-yellow-700',
  GEN: 'bg-gray-100 text-gray-600',
  EAP: 'bg-blue-100 text-blue-700',
}

const JOB_TYPE_COLORS: Record<string, string> = {
  'T-IN':  'bg-blue-50 text-blue-700',
  'L-EXP': 'bg-green-50 text-green-700',
  'T-OUT': 'bg-purple-50 text-purple-700',
  'T-EXP': 'bg-indigo-50 text-indigo-700',
  'GEN':   'bg-gray-50 text-gray-600',
}

const PRIORITY_COLORS: Record<string, string> = {
  ROUTINE:  'bg-gray-100 text-gray-500',
  CRITICAL: 'bg-orange-100 text-orange-700',
  AOG:      'bg-red-100 text-red-700 font-bold',
  TOPAOG:   'bg-red-200 text-red-900 font-bold',
}

type ColKey = 'ref' | 'our_ref' | 'assigned' | 'supplier' | 'customer' | 'job_type' | 'org' | 'des' | 'ntr'
  | 'pieces' | 'kg' | 'cwt' | 'status' | 'priority' | 'final_awb' | 'inv_usd' | 'inv_aed' | 'inv_status' | 'job_status' | 'date'

const loadVisibleCols = (): Set<ColKey> => {
  try {
    const raw = localStorage.getItem('orders_visible_cols')
    if (raw) return new Set(JSON.parse(raw) as ColKey[])
  } catch { /* ignore */ }
  return new Set<ColKey>(['ref','our_ref','assigned','supplier','customer','job_type','org','des','ntr',
    'pieces','kg','cwt','status','priority','final_awb','inv_usd','inv_aed','inv_status','job_status','date'])
}

export default function OrdersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'superadmin'
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [jobTypeFilter, setJobTypeFilter] = useState<string>('')
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null)
  const [issueOrder, setIssueOrder] = useState<Order | null>(null)
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null)
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [filesOrder, setFilesOrder] = useState<Order | null>(null)
  const [deleteOrder, setDeleteOrder] = useState<Order | null>(null)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(loadVisibleCols)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ordersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      setDeleteOrder(null)
    },
  })

  const ALL_COLUMNS: { key: ColKey; label: string }[] = [
    { key: 'date',       label: t('orders.cols.date') },
    { key: 'our_ref',    label: t('orders.cols.ourRef') },
    { key: 'ref',        label: t('orders.cols.ref') },
    { key: 'supplier',   label: t('orders.cols.supplier') },
    { key: 'customer',   label: t('orders.cols.customer') },
    { key: 'job_type',   label: t('orders.cols.jobType') },
    { key: 'org',        label: t('orders.cols.org') },
    { key: 'final_awb',  label: t('orders.cols.finalAwb') },
    { key: 'des',        label: t('orders.cols.des') },
    { key: 'ntr',        label: t('orders.cols.ntr') },
    { key: 'pieces',     label: t('orders.cols.pieces') },
    { key: 'kg',         label: t('orders.cols.kg') },
    { key: 'cwt',        label: t('orders.cols.cwt') },
    { key: 'status',     label: t('orders.cols.status') },
    { key: 'priority',   label: t('orders.cols.priority') },
    { key: 'inv_usd',    label: t('orders.cols.invUsd') },
    { key: 'inv_aed',    label: t('orders.cols.invAed') },
    { key: 'inv_status', label: t('orders.cols.invStatus') },
    { key: 'job_status', label: t('orders.cols.jobStatus') },
  ]

  const toggleCol = (key: ColKey) => {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem('orders_visible_cols', JSON.stringify([...next]))
      return next
    })
  }
  const col = (key: ColKey) => visibleCols.has(key)

  const { data: statusCatalog = [] } = useQuery({
    queryKey: ['catalogs', 'order_status'],
    queryFn: () => catalogsApi.list('order_status', true).then(r => r.data),
  })

  const statusLabel = (value: string) =>
    statusCatalog.find(s => s.value === value)?.label || value

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', statusFilter, jobTypeFilter, jobStatusFilter],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (statusFilter) params.status = statusFilter
      if (jobTypeFilter) params.job_type = jobTypeFilter
      if (jobStatusFilter) params.job_status = jobStatusFilter
      return ordersApi.list(params).then(r => r.data)
    },
  })

  const filtered = orders.filter(o =>
    !search ||
    o.tracking_number?.toLowerCase().includes(search.toLowerCase()) ||
    o.our_ref?.toLowerCase().includes(search.toLowerCase()) ||
    o.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
    o.supplier?.toLowerCase().includes(search.toLowerCase()) ||
    o.final_awb?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <CreateOrderModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <RecordPaymentModal order={paymentOrder} onClose={() => setPaymentOrder(null)} />
      <IssueFromWarehouseModal order={issueOrder} onClose={() => setIssueOrder(null)} />
      <InvoiceModal order={invoiceOrder} onClose={() => setInvoiceOrder(null)} />
      <EditOrderModal order={editOrder} onClose={() => setEditOrder(null)} />
      <OrderFilesModal order={filesOrder} onClose={() => setFilesOrder(null)} />

      {deleteOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-base font-semibold text-gray-900 mb-2">{t('orders.deleteConfirmTitle')}</h2>
            <p className="text-sm text-gray-500 mb-1">
              <span className="font-mono font-medium text-blue-600">{deleteOrder.tracking_number}</span>
            </p>
            <p className="text-sm text-gray-500 mb-5">{t('orders.deleteConfirmText')}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteOrder(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteOrder.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-60"
              >
                {deleteMutation.isPending ? '...' : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('orders.title')}</h1>
        <div className="flex items-center gap-2">
          <div className="relative" ref={colMenuRef}>
            <button
              onClick={() => setColMenuOpen(p => !p)}
              className="flex items-center gap-2 border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm transition"
              title={t('orders.columns')}
            >
              <SlidersHorizontal size={15} /> {t('orders.columns')}
            </button>
            {colMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-3 w-52">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">{t('orders.visibleColumns')}</p>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {ALL_COLUMNS.map(c => (
                    <label key={c.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                      <input
                        type="checkbox"
                        checked={visibleCols.has(c.key)}
                        onChange={() => toggleCol(c.key)}
                        className="accent-blue-600"
                      />
                      <span className="text-sm text-gray-700">{c.label}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const all = new Set(ALL_COLUMNS.map(c => c.key))
                    setVisibleCols(all)
                    localStorage.setItem('orders_visible_cols', JSON.stringify([...all]))
                  }}
                  className="mt-2 w-full text-xs text-blue-600 hover:underline text-left px-2"
                >
                  {t('orders.showAll')}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition"
          >
            <Plus size={16} /> {t('orders.newOrder')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('orders.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">{t('orders.allStatuses')}</option>
          {statusCatalog.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={jobTypeFilter} onChange={e => setJobTypeFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">{t('orders.allTypes')}</option>
          <option value="T-IN">T-IN</option>
          <option value="L-EXP">L-EXP</option>
          <option value="T-OUT">T-OUT</option>
          <option value="T-EXP">T-EXP</option>
          <option value="GEN">GEN</option>
        </select>
        <select value={jobStatusFilter} onChange={e => setJobStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">{t('orders.allJobStatuses')}</option>
          <option value="OPEN">OPEN</option>
          <option value="CLOSED">CLOSED</option>
        </select>
        {(statusFilter || jobTypeFilter || jobStatusFilter || search) && (
          <button
            onClick={() => { setStatusFilter(''); setJobTypeFilter(''); setJobStatusFilter(''); setSearch('') }}
            className="px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            {t('orders.reset')}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">{t('orders.noOrders')}</div>
        ) : (
          <table className="w-full text-xs min-w-[800px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500 w-6">#</th>
                {col('date')       && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.date')}</th>}
                {col('our_ref')    && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.ourRef')}</th>}
                {col('ref')        && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.ref')}</th>}
                {col('supplier')   && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.supplier')}</th>}
                {col('customer')   && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.customer')}</th>}
                {col('job_type')   && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.jobType')}</th>}
                {col('org')        && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.org')}</th>}
                {col('final_awb')  && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.finalAwb')}</th>}
                {col('des')        && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.des')}</th>}
                {col('ntr')        && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.ntr')}</th>}
                {col('pieces')     && <th className="text-right px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.pieces')}</th>}
                {col('kg')         && <th className="text-right px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.kg')}</th>}
                {col('cwt')        && <th className="text-right px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.cwt')}</th>}
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.assigned')}</th>
                {col('status')     && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.status')}</th>}
                {col('priority')   && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.priority')}</th>}
                {col('inv_usd')    && <th className="text-right px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.invUsd')}</th>}
                {col('inv_aed')    && <th className="text-right px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.invAed')}</th>}
                {col('inv_status') && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.invStatus')}</th>}
                {col('job_status') && <th className="text-left px-3 py-2.5 font-semibold text-gray-500">{t('orders.cols.jobStatus')}</th>}
                <th className="px-3 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((order: Order, idx) => (
                <tr key={order.id}
                  className={`hover:bg-gray-50 transition ${
                    order.ntr === 'DG' ? 'bg-red-50/30' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                  {col('date') && (
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(order.created_at)}</td>
                  )}
                  {col('our_ref') && (
                    <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate">{order.our_ref || '—'}</td>
                  )}
                  {col('ref') && (
                    <td className="px-3 py-2">
                      <span className="font-mono font-medium text-blue-600 text-xs">{order.tracking_number}</span>
                    </td>
                  )}
                  {col('supplier') && (
                    <td className="px-3 py-2 text-gray-700 max-w-[100px] truncate">{order.supplier || '—'}</td>
                  )}
                  {col('customer') && (
                    <td className="px-3 py-2 font-medium text-gray-900">{order.client?.name || '—'}</td>
                  )}
                  {col('job_type') && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {order.job_type ? (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${JOB_TYPE_COLORS[order.job_type] || 'bg-gray-100 text-gray-600'}`}>
                          {order.job_type}
                        </span>
                      ) : '—'}
                    </td>
                  )}
                  {col('org') && <td className="px-3 py-2 font-mono text-gray-700">{order.origin_city || '—'}</td>}
                  {col('final_awb') && (
                    <td className="px-3 py-2 font-mono text-gray-600">{order.final_awb || '—'}</td>
                  )}
                  {col('des') && <td className="px-3 py-2 font-mono text-gray-700">{order.dest_city || '—'}</td>}
                  {col('ntr') && (
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${NTR_COLORS[order.ntr] || 'bg-gray-100 text-gray-600'}`}>
                        {order.ntr || 'GEN'}
                      </span>
                    </td>
                  )}
                  {col('pieces') && <td className="px-3 py-2 text-right text-gray-700">{order.pieces || '—'}</td>}
                  {col('kg') && (
                    <td className="px-3 py-2 text-right text-gray-700">
                      {order.weight_kg ? order.weight_kg.toFixed(1) : '—'}
                    </td>
                  )}
                  {col('cwt') && (
                    <td className="px-3 py-2 text-right text-gray-700">
                      {order.chargeable_weight ? order.chargeable_weight.toFixed(1) : '—'}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    {order.assigned_to?.name
                      ? <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">{order.assigned_to.name}</span>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  {col('status') && (
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabel(order.status)}
                      </span>
                    </td>
                  )}
                  {col('priority') && (
                    <td className="px-3 py-2">
                      {order.priority && order.priority !== 'ROUTINE' ? (
                        <span className={`px-1.5 py-0.5 rounded text-xs ${PRIORITY_COLORS[order.priority] || 'bg-gray-100 text-gray-600'}`}>
                          {order.priority}
                        </span>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                  )}
                  {col('inv_usd') && (
                    <td className="px-3 py-2 text-right font-medium text-gray-800">
                      {order.inv_amount_usd ? `$${order.inv_amount_usd.toLocaleString()}` : '—'}
                    </td>
                  )}
                  {col('inv_aed') && (
                    <td className="px-3 py-2 text-right text-gray-700">
                      {order.inv_amount_aed ? `AED${order.inv_amount_aed.toLocaleString()}` : '—'}
                    </td>
                  )}
                  {col('inv_status') && (
                    <td className="px-3 py-2">
                      {order.invoice_status ? (
                        <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-xs">{order.invoice_status}</span>
                      ) : '—'}
                    </td>
                  )}
                  {col('job_status') && (
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        order.job_status === 'OPEN' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {order.job_status || 'OPEN'}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-0.5">
                      {order.status === 'warehouse' && (
                        <button onClick={() => setIssueOrder(order)} title={t('orders.issueFromWarehouse')}
                          className="p-1.5 rounded text-yellow-600 hover:bg-yellow-50 transition">
                          <PackageCheck size={14} />
                        </button>
                      )}
                      {order.payment_status !== 'paid' && (
                        <button onClick={() => setPaymentOrder(order)} title={t('orders.recordPayment')}
                          className="p-1.5 rounded text-green-600 hover:bg-green-50 transition">
                          <Banknote size={14} />
                        </button>
                      )}
                      <button onClick={() => setInvoiceOrder(order)} title={t('orders.invoice')}
                        className="p-1.5 rounded text-purple-600 hover:bg-purple-50 transition">
                        <FileText size={14} />
                      </button>
                      <button onClick={() => setFilesOrder(order)} title="Файлы заказа"
                        className="p-1.5 rounded text-teal-600 hover:bg-teal-50 transition">
                        <Paperclip size={14} />
                      </button>
                      <button onClick={() => setEditOrder(order)} title={t('orders.editOrder')}
                        className="p-1.5 rounded text-gray-500 hover:bg-gray-100 transition">
                        <Pencil size={14} />
                      </button>
                      {isSuperAdmin && (
                        <button onClick={() => setDeleteOrder(order)} title={t('orders.deleteOrder')}
                          className="p-1.5 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition">
                          <Trash2 size={14} />
                        </button>
                      )}
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
