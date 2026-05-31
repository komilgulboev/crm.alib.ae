import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, PackageCheck, Banknote, FileText, Pencil } from 'lucide-react'
import { ordersApi } from '../../api/orders'
import { formatDate } from '../../lib/utils'
import type { Order, OrderStatus } from '../../types'
import CreateOrderModal from './CreateOrderModal'
import RecordPaymentModal from './RecordPaymentModal'
import IssueFromWarehouseModal from './IssueFromWarehouseModal'
import InvoiceModal from './InvoiceModal'
import EditOrderModal from './EditOrderModal'

// ── Статусы ────────────────────────────────────────────────────────────────
const STATUS_OPTIONS: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'Все статусы' },
  { value: 'new',                label: 'Новый' },
  { value: 'collection_details', label: 'Collection Details' },
  { value: 'warehouse',          label: 'На складе' },
  { value: 'dispatched',         label: 'Dispatched' },
  { value: 'in_transit',         label: 'In Transit' },
  { value: 'customs',            label: 'Таможня' },
  { value: 'departed',           label: 'Departed' },
  { value: 'handed_over',        label: 'Handed Over' },
  { value: 'arrived',            label: 'Arrived' },
  { value: 'delivered',          label: 'Delivered' },
  { value: 'completed',          label: 'Completed' },
  { value: 'closed',             label: 'Closed' },
  { value: 'problem',            label: 'Проблема' },
]

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

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [jobTypeFilter, setJobTypeFilter] = useState<string>('')
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null)
  const [issueOrder, setIssueOrder] = useState<Order | null>(null)
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null)
  const [editOrder, setEditOrder] = useState<Order | null>(null)

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

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Заказы</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition"
        >
          <Plus size={16} /> Новый заказ
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="REF#, OUR REF, клиент, AWB..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={jobTypeFilter} onChange={e => setJobTypeFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Все типы</option>
          <option value="T-IN">T-IN</option>
          <option value="L-EXP">L-EXP</option>
          <option value="T-OUT">T-OUT</option>
          <option value="T-EXP">T-EXP</option>
          <option value="GEN">GEN</option>
        </select>
        <select value={jobStatusFilter} onChange={e => setJobStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">OPEN + CLOSED</option>
          <option value="OPEN">OPEN</option>
          <option value="CLOSED">CLOSED</option>
        </select>
        {(statusFilter || jobTypeFilter || jobStatusFilter || search) && (
          <button
            onClick={() => { setStatusFilter(''); setJobTypeFilter(''); setJobStatusFilter(''); setSearch('') }}
            className="px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            Сбросить
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Заказов не найдено</div>
        ) : (
          <table className="w-full text-xs min-w-[1400px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500 w-6">#</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">REF#</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">OUR REF</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">ASSIGNED</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">SUPPLIER</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">CUSTOMER</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">JOB TYPE</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">ORG</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">DES</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">NTR</th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-500">#PC</th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-500">KG</th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-500">CWT</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">STATUS</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">FINAL AWB</th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-500">INV (USD)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-500">INV (AED)</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">Inv Status</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">JOB</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-500">Дата</th>
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

                  {/* REF# */}
                  <td className="px-3 py-2">
                    <span className="font-mono font-medium text-blue-600 text-xs">
                      {order.tracking_number}
                    </span>
                  </td>

                  {/* OUR REF */}
                  <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate">
                    {order.our_ref || '—'}
                  </td>

                  {/* ASSIGNED */}
                  <td className="px-3 py-2 text-gray-700">
                    {order.assigned_to?.name || '—'}
                  </td>

                  {/* SUPPLIER */}
                  <td className="px-3 py-2 text-gray-700 max-w-[100px] truncate">
                    {order.supplier || '—'}
                  </td>

                  {/* CUSTOMER */}
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {order.client?.name || '—'}
                  </td>

                  {/* JOB TYPE */}
                  <td className="px-3 py-2">
                    {order.job_type ? (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        JOB_TYPE_COLORS[order.job_type] || 'bg-gray-100 text-gray-600'
                      }`}>
                        {order.job_type}
                      </span>
                    ) : '—'}
                  </td>

                  {/* ORG → DES */}
                  <td className="px-3 py-2 font-mono text-gray-700">{order.origin_city || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{order.dest_city || '—'}</td>

                  {/* NTR */}
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      NTR_COLORS[order.ntr] || 'bg-gray-100 text-gray-600'
                    }`}>
                      {order.ntr || 'GEN'}
                    </span>
                  </td>

                  {/* #PC / KG / CWT */}
                  <td className="px-3 py-2 text-right text-gray-700">{order.pieces || '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {order.weight_kg ? order.weight_kg.toFixed(1) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {order.chargeable_weight ? order.chargeable_weight.toFixed(1) : '—'}
                  </td>

                  {/* STATUS */}
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'
                    }`}>
                      {STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status}
                    </span>
                  </td>

                  {/* FINAL AWB */}
                  <td className="px-3 py-2 font-mono text-gray-600">
                    {order.final_awb || '—'}
                  </td>

                  {/* INV AMOUNT USD / AED */}
                  <td className="px-3 py-2 text-right font-medium text-gray-800">
                    {order.inv_amount_usd ? `$${order.inv_amount_usd.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {order.inv_amount_aed
                      ? `AED${order.inv_amount_aed.toLocaleString()}`
                      : '—'}
                  </td>

                  {/* Invoice Status */}
                  <td className="px-3 py-2">
                    {order.invoice_status ? (
                      <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-xs">
                        {order.invoice_status}
                      </span>
                    ) : '—'}
                  </td>

                  {/* JOB STATUS */}
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      order.job_status === 'OPEN'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {order.job_status || 'OPEN'}
                    </span>
                  </td>

                  {/* Дата */}
                  <td className="px-3 py-2 text-gray-500">{formatDate(order.created_at)}</td>

                  {/* Actions */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-0.5">
                      {order.status === 'warehouse' && (
                        <button onClick={() => setIssueOrder(order)}
                          title="Выдача со склада"
                          className="p-1.5 rounded text-yellow-600 hover:bg-yellow-50 transition">
                          <PackageCheck size={14} />
                        </button>
                      )}
                      {order.payment_status !== 'paid' && (
                        <button onClick={() => setPaymentOrder(order)}
                          title="Принять оплату"
                          className="p-1.5 rounded text-green-600 hover:bg-green-50 transition">
                          <Banknote size={14} />
                        </button>
                      )}
                      <button onClick={() => setInvoiceOrder(order)}
                        title="Инвойс"
                        className="p-1.5 rounded text-purple-600 hover:bg-purple-50 transition">
                        <FileText size={14} />
                      </button>
                      <button onClick={() => setEditOrder(order)}
                        title="Редактировать"
                        className="p-1.5 rounded text-gray-500 hover:bg-gray-100 transition">
                        <Pencil size={14} />
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
