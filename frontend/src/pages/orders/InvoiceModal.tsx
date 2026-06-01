import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Printer, ArrowLeft, FileText } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { invoicesApi, type CreateInvoicePayload } from '../../api/invoices'
import { bankAccountsApi } from '../../api/bankAccounts'
import type { BankAccount, Invoice, Order } from '../../types'

// ─── Company info (Al Ibtikar Logistic Services) ─────────────────────────────
const COMPANY = {
  name: 'Al Ibtikar Logistic Services',
  address: 'Office #1408, DAMAC XL Tower,',
  city: 'Business Bay, Dubai, United Arab Emirates',
  phone: '+971586233881',
  email: 'accounts@alib.ae',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

const todayISO = () => new Date().toISOString().split('T')[0]

// ─── InvoiceView ─────────────────────────────────────────────────────────────
function InvoiceView({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation()
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    const el = printRef.current
    if (!el) return
    const style = document.createElement('style')
    style.id = '__inv_print'
    style.textContent = `@media print{body>*{display:none!important}#inv-print-root{display:block!important;position:fixed;inset:0;background:#fff}}`
    document.head.appendChild(style)
    el.id = 'inv-print-root'
    window.print()
    setTimeout(() => {
      document.getElementById('__inv_print')?.remove()
      el.removeAttribute('id')
    }, 800)
  }

  const client = invoice.order?.client
  const banks = invoice.bank_accounts ?? []
  const items = invoice.line_items ?? []

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-sm rounded-lg transition"
        >
          <Printer size={15} />
          {t('invoice.print')}
        </button>
      </div>

      {/* ── Invoice paper ── */}
      <div ref={printRef} className="bg-white border border-gray-200 rounded-lg p-8 text-sm font-sans">

        {/* Header row */}
        <div className="flex justify-between items-start mb-6">
          {/* Company */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center">
                <span className="text-white text-xs font-bold">A</span>
              </div>
              <span className="font-bold text-base text-gray-900">{COMPANY.name}</span>
            </div>
            <p className="text-gray-500 text-xs">{COMPANY.address}</p>
            <p className="text-gray-500 text-xs">{COMPANY.city}</p>
            <p className="text-gray-500 text-xs">{COMPANY.phone}, {COMPANY.email}</p>
          </div>

          {/* INVOICE block */}
          <div className="text-right">
            <h1 className="text-3xl font-bold text-green-700 tracking-wide">INVOICE</h1>
            <p className="text-gray-600 text-sm mt-1"># {invoice.invoice_number}</p>
            <div className="mt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Balance Due</p>
              <p className="text-2xl font-bold text-gray-900">
                {invoice.currency} {fmt(invoice.total_amount)}
              </p>
            </div>
          </div>
        </div>

        <hr className="border-gray-200 mb-5" />

        {/* Bill To + Invoice details */}
        <div className="flex gap-8 mb-6">
          {/* Bill To */}
          <div className="flex-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Bill To</p>
            {client ? (
              <>
                <p className="font-bold text-gray-900">{client.name}</p>
                {client.address && <p className="text-gray-600 text-xs mt-0.5">{client.address}</p>}
                {client.country && <p className="text-gray-600 text-xs">{client.country}</p>}
                {client.phone && <p className="text-gray-600 text-xs">{client.phone}</p>}
                {client.trn && (
                  <p className="text-gray-600 text-xs mt-1">
                    TRN <span className="font-mono">{client.trn}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-gray-400 text-xs">—</p>
            )}
          </div>

          {/* Invoice meta */}
          <div className="w-64 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Invoice Date :</span>
              <span className="font-medium">{fmtDate(invoice.invoice_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Terms :</span>
              <span className="font-medium">{invoice.terms}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Due Date :</span>
              <span className="font-medium">{fmtDate(invoice.due_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Chargeable Weight :</span>
              <span className="font-medium">{invoice.chargeable_weight.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Line items table */}
        <table className="w-full text-xs mb-0">
          <thead>
            <tr className="bg-green-700 text-white">
              <th className="text-left px-3 py-2 w-8">#</th>
              <th className="text-left px-3 py-2">Item &amp; Description</th>
              <th className="text-right px-3 py-2 w-16">Qty</th>
              <th className="text-right px-3 py-2 w-24">Rate</th>
              <th className="text-right px-3 py-2 w-28">Amount</th>
              <th className="text-right px-3 py-2 w-28">Amount ({invoice.currency})</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-3 py-2.5 text-gray-500">{i + 1}</td>
                <td className="px-3 py-2.5 text-gray-900">{item.description}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{item.quantity.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{fmt(item.rate)}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{fmt(item.taxable_amount)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-gray-900">{fmt(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          {/* Totals */}
          <tfoot>
            <tr className="border-t border-gray-200">
              <td colSpan={4} className="px-3 py-2 text-right font-semibold text-gray-700">Sub Total</td>
              <td className="px-3 py-2 text-right text-gray-700">{fmt(invoice.sub_total)}</td>
              <td className="px-3 py-2 text-right font-medium text-gray-900">{fmt(invoice.total_amount)}</td>
            </tr>
            <tr className="border-t border-gray-300">
              <td colSpan={4} />
              <td className="px-3 py-2 text-right font-bold text-gray-800">Total</td>
              <td className="px-3 py-2 text-right font-bold text-gray-900">
                {invoice.currency}{fmt(invoice.total_amount)}
              </td>
            </tr>
            <tr className="bg-gray-50">
              <td colSpan={4} />
              <td className="px-3 py-2 text-right font-bold text-gray-800">Balance Due</td>
              <td className="px-3 py-2 text-right font-bold text-gray-900">
                {invoice.currency}{fmt(invoice.total_amount)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Notes / Bank accounts */}
        {(banks.length > 0 || invoice.accepts_cash || invoice.notes) && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-gray-700 mb-2">Notes</p>
            <div className="text-xs text-gray-600 space-y-3">
              {invoice.accepts_cash && (
                <p className="font-medium">Cash payment accepted.</p>
              )}
              {banks.map((b, i) => (
                <div key={b.id}>
                  {i > 0 && <hr className="border-dashed border-gray-300 my-2" />}
                  {b.account_name && (
                    <p>Account Name &nbsp;&nbsp;: <span className="font-medium">{b.account_name}</span></p>
                  )}
                  <p>Beneficiary Bank : <span className="font-medium">{b.bank_name}</span></p>
                  {b.swift_code && <p>IBC Code &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: {b.swift_code}</p>}
                  {b.account_number && <p>Account Number : {b.account_number}{b.iban ? ` , IBAN: ${b.iban}` : ''}</p>}
                  <p>Currency: <span className="font-medium">{b.currency}</span></p>
                </div>
              ))}
              {invoice.notes && <p className="text-gray-500 mt-1">{invoice.notes}</p>}
            </div>
          </div>
        )}

        {/* Terms */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-700 mb-1">Terms &amp; Conditions</p>
          <p className="text-xs text-gray-500">
            Please contact us within 7 days should there be any discrepancies.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── LineItemRow ──────────────────────────────────────────────────────────────
interface LIForm {
  description: string
  quantity: string
  rate: string
}

// ─── InvoiceModal (main) ──────────────────────────────────────────────────────
interface Props {
  order: Order | null
  onClose: () => void
}

export default function InvoiceModal({ order, onClose }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'create' | 'view'>('create')
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null)
  const [selectedBanks, setSelectedBanks] = useState<number[]>([])
  const [acceptsCash, setAcceptsCash] = useState(false)
  const [taxRate, setTaxRate] = useState('5')
  const [currency, setCurrency] = useState('AED')
  const [terms, setTerms] = useState('Due on Receipt')
  const [invoiceDate, setInvoiceDate] = useState(todayISO())
  const [dueDate, setDueDate] = useState(todayISO())
  const [chargeableWeight, setChargeableWeight] = useState('1')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LIForm[]>([])
  const [error, setError] = useState('')

  const open = !!order

  // Fetch existing invoices for this order
  const { data: existingInvoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices', order?.id],
    queryFn: () => invoicesApi.listByOrder(order!.id).then(r => r.data),
    enabled: open,
  })

  // Fetch bank accounts
  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountsApi.list().then(r => r.data),
    enabled: open,
  })

  // Pre-fill form from order
  useEffect(() => {
    if (!order) return
    setCurrency(order.currency === 'AED' ? 'AED' : 'AED')
    setChargeableWeight(
      order.items?.reduce((s, i) => s + (i.weight_kg ?? 0), 0).toFixed(2) || '1'
    )
    const defaultDescription =
      order.items?.[0]?.description || 'Freight Charges'
    setItems([{ description: defaultDescription, quantity: '1', rate: String(order.total_amount) }])
    setInvoiceDate(todayISO())
    setDueDate(todayISO())
  }, [order])

  // Auto-switch to view if invoice already exists
  useEffect(() => {
    if (existingInvoices.length > 0) {
      setCurrentInvoice(existingInvoices[0])
      setMode('view')
    }
  }, [existingInvoices])

  const createMutation = useMutation({
    mutationFn: (payload: CreateInvoicePayload) => invoicesApi.create(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['invoices', order?.id] })
      setCurrentInvoice(res.data)
      setMode('view')
    },
    onError: () => setError(t('invoice.errorCreate')),
  })

  const calcTotals = () => {
    const rate = Number(taxRate) || 0
    let subTotal = 0
    items.forEach(it => { subTotal += Number(it.quantity) * Number(it.rate) })
    const taxAmt = subTotal * rate / 100
    return { subTotal, taxAmt, total: subTotal + taxAmt }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!order) return
    if (items.length === 0) { setError(t('invoice.errorNoItems')); return }
    if (!acceptsCash && selectedBanks.length === 0) {
      setError(t('invoice.errorNoPayment'))
      return
    }
    setError('')

    createMutation.mutate({
      order_id: order.id,
      invoice_date: new Date(invoiceDate).toISOString(),
      due_date: new Date(dueDate).toISOString(),
      terms,
      chargeable_weight: Number(chargeableWeight) || 1,
      tax_rate: Number(taxRate) || 5,
      currency,
      accepts_cash: acceptsCash,
      notes,
      line_items: items.map(it => ({
        description: it.description,
        quantity: Number(it.quantity) || 1,
        rate: Number(it.rate) || 0,
        tax_rate: Number(taxRate) || 5,
      })),
      bank_account_ids: selectedBanks,
    })
  }

  const addItem = () =>
    setItems(p => [...p, { description: '', quantity: '1', rate: '' }])

  const removeItem = (i: number) =>
    setItems(p => p.filter((_, idx) => idx !== i))

  const setItem = (i: number, field: keyof LIForm, val: string) =>
    setItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: val } : it))

  const toggleBank = (id: number) =>
    setSelectedBanks(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const { subTotal, taxAmt, total } = calcTotals()

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  const title = mode === 'view' && currentInvoice
    ? `${t('invoice.title')} ${currentInvoice.invoice_number}`
    : `${t('invoice.createTitle')} — ${order?.tracking_number ?? ''}`

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {loadingInvoices ? (
        <div className="py-12 text-center text-gray-400">{t('invoice.loading')}</div>
      ) : mode === 'view' && currentInvoice ? (
        <div>
          {/* Switch between invoices or create new */}
          <div className="flex items-center justify-between mb-3">
            {existingInvoices.length > 1 && (
              <div className="flex gap-2">
                {existingInvoices.map(inv => (
                  <button
                    key={inv.id}
                    onClick={() => setCurrentInvoice(inv)}
                    className={`text-xs px-3 py-1 rounded-full border transition ${
                      currentInvoice.id === inv.id
                        ? 'bg-green-700 text-white border-green-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {inv.invoice_number}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => { setMode('create'); setCurrentInvoice(null) }}
              className="ml-auto flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
            >
              <Plus size={13} /> {t('invoice.newInvoice')}
            </button>
          </div>
          <InvoiceView invoice={currentInvoice} />
        </div>
      ) : (
        /* ── Create form ── */
        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'create' && existingInvoices.length > 0 && (
            <button
              type="button"
              onClick={() => { setMode('view'); setCurrentInvoice(existingInvoices[0]) }}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
            >
              <ArrowLeft size={13} />
              <FileText size={13} /> {t('invoice.viewExisting')} ({existingInvoices[0].invoice_number})
            </button>
          )}

          {/* Invoice meta */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>{t('invoice.invoiceDate')}</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t('invoice.dueDate')}</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t('invoice.terms')}</label>
              <input
                value={terms}
                onChange={e => setTerms(e.target.value)}
                className={inputCls}
                placeholder="Due on Receipt"
              />
            </div>
            <div>
              <label className={labelCls}>{t('invoice.currency')}</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputCls}>
                {['AED', 'USD', 'EUR', 'TJS', 'RUB'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('invoice.taxRate')}</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={taxRate}
                onChange={e => setTaxRate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t('invoice.chargeableWeight')}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={chargeableWeight}
                onChange={e => setChargeableWeight(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('invoice.items')}</p>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <Plus size={13} /> {t('invoice.addItem')}
              </button>
            </div>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600 w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">{t('invoice.colDescription')}</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 w-20">{t('invoice.colQty')}</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 w-28">{t('invoice.colRate')}</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 w-28">{t('invoice.colTaxable')}</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">{t('invoice.colTax')}</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 w-28">{t('invoice.colTotal')}</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((it, i) => {
                    const taxable = Number(it.quantity) * Number(it.rate)
                    const vat = taxable * (Number(taxRate) || 0) / 100
                    return (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-1.5">
                          <input
                            value={it.description}
                            onChange={e => setItem(i, 'description', e.target.value)}
                            className="w-full border-0 focus:outline-none text-xs"
                            placeholder={t('invoice.descPlaceholder')}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.quantity}
                            onChange={e => setItem(i, 'quantity', e.target.value)}
                            className="w-full border-0 focus:outline-none text-xs text-right"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.rate}
                            onChange={e => setItem(i, 'rate', e.target.value)}
                            className="w-full border-0 focus:outline-none text-xs text-right"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{fmt(taxable)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{fmt(vat)}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmt(taxable + vat)}</td>
                        <td className="px-3 py-1.5">
                          <button
                            type="button"
                            onClick={() => removeItem(i)}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-3 text-center text-gray-400">
                        {t('invoice.noItems')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals preview */}
            <div className="flex justify-end mt-2 text-xs space-y-0.5">
              <div className="w-56 space-y-1">
                <div className="flex justify-between text-gray-600">
                  <span>{t('invoice.subtotalNoTax')}</span>
                  <span>{currency} {fmt(subTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>{t('invoice.taxLine', { rate: taxRate })}</span>
                  <span>{currency} {fmt(taxAmt)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 border-t pt-1">
                  <span>{t('invoice.grandTotal')}</span>
                  <span>{currency} {fmt(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment methods */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {t('invoice.paymentMethod')}
            </p>
            <div className="space-y-2">
              {/* Cash */}
              <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                acceptsCash ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input
                  type="checkbox"
                  checked={acceptsCash}
                  onChange={e => setAcceptsCash(e.target.checked)}
                  className="accent-green-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('invoice.cash')}</p>
                  <p className="text-xs text-gray-500">{t('invoice.cashDesc')}</p>
                </div>
              </label>

              {/* Bank accounts */}
              {bankAccounts.length === 0 ? (
                <p className="text-xs text-gray-400 px-1">
                  {t('invoice.noBanks')}
                </p>
              ) : (
                bankAccounts.map(acc => (
                  <label
                    key={acc.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                      selectedBanks.includes(acc.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedBanks.includes(acc.id)}
                      onChange={() => toggleBank(acc.id)}
                      className="accent-blue-600"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{acc.bank_name}</p>
                      <p className="text-xs text-gray-500">
                        {acc.iban ? `IBAN: ${acc.iban}` : acc.account_number} · {acc.currency}
                      </p>
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                      {acc.currency}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>{t('invoice.notes')}</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={inputCls}
              rows={2}
              placeholder={t('invoice.notesPlaceholder')}
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              {t('invoice.cancel')}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-6 py-2 text-sm bg-green-700 hover:bg-green-800 text-white rounded-lg transition disabled:opacity-50"
            >
              {createMutation.isPending ? t('invoice.creating') : t('invoice.createBtn')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
