import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Loader2, CheckCircle2, AlertCircle, ExternalLink, History, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/ui/Modal'
import { ordersApi } from '../../api/orders'
import { clientsApi } from '../../api/clients'
import { usersApi } from '../../api/users'
import { filesApi } from '../../api/files'
import { catalogsApi } from '../../api/catalogs'
import { extractAWBFromFile, isPDFFile } from '../../lib/awbOcr'
import type { AWBData, Currency, JobType, NTR, Order, OrderLog, OrderNote } from '../../types'

interface Props {
  order: Order | null
  onClose: () => void
}


const PRIORITY_OPTIONS = [
  { value: 'ROUTINE',  label: 'ROUTINE',  color: 'border-gray-300 bg-white text-gray-600' },
  { value: 'CRITICAL', label: 'CRITICAL', color: 'border-orange-400 bg-orange-50 text-orange-700' },
  { value: 'AOG',      label: 'AOG',      color: 'border-red-500 bg-red-50 text-red-700' },
  { value: 'TOPAOG',   label: 'TOP AOG',  color: 'border-red-700 bg-red-100 text-red-900' },
]

type DimRow = { l: string; w: string; h: string }

const parseDims = (str: string, pieces: number): DimRow[] => {
  const parts = (str || '').split(/\s+/).filter(s => /x/i.test(s))
  const arr: DimRow[] = parts.map(p => {
    const m = p.match(/^([\d.]*)x([\d.]*)x([\d.]*)$/i)
    return m ? { l: m[1], w: m[2], h: m[3] } : { l: '', w: '', h: '' }
  })
  const n = Math.max(1, pieces)
  while (arr.length < n) arr.push({ l: '', w: '', h: '' })
  return arr.slice(0, n)
}

const serializeDims = (dims: DimRow[]) =>
  dims.map(d => `${d.l || 0}x${d.w || 0}x${d.h || 0}`).join(' ')

const INVOICE_STATUSES = ['', 'Inv Sent', 'Pending', 'Paid', 'Cancelled']
const CURRENCIES: Currency[] = ['USD', 'AED', 'TJS', 'RUB']

type Tab = 'main' | 'cargo' | 'awb' | 'finance' | 'history'

const emptyAWB = (): AWBData => ({
  awb_number: '', shipper_name: '', shipper_address: '', shipper_account_no: '',
  consignee_name: '', consignee_address: '', consignee_account_no: '',
  issuing_agent_name: '', issuing_agent_city: '', agent_iata_code: '', agent_account_no: '',
  airport_of_departure: '', airport_of_destination: '', first_carrier: '',
  routing_destination_1: '', routing_carrier_1: '', requested_flight_date: '',
  accounting_info: '', reference_number: '', optional_shipping_info: '',
  currency: '', mode_of_payment: 'Prepaid', weight_val_charge: 'PP', other_charge_code: 'PP',
  declared_value_carriage: 'NVD', declared_value_customs: 'NCV', insurance_amount: '',
  handling_info: '', sci_code: '',
  number_of_pieces: 1, gross_weight: 0, weight_unit: 'K', rate_class: '',
  commodity_item_no: '', chargeable_weight: 0, rate: 0, total: 0,
  goods_description: '', volume_cbm: 0,
  prepaid_weight_charge: 0, collect_weight_charge: 0, valuation_charge: 0,
  tax: 0, other_charges_agent: 0, other_charges_carrier: 0,
  total_prepaid: 0, total_collect: 0,
  execution_date: '', execution_time: '', execution_place: '', signer_name: '',
})

export default function EditOrderModal({ order, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('main')
  const [error, setError] = useState('')

  // ── State ──────────────────────────────────────────────────────────────────
  const [main, setMain] = useState({
    our_ref: '', supplier: '', client_id: '', job_type: 'T-IN' as JobType,
    flight_type: '', status: 'new', job_status: 'OPEN', assigned_to_id: '',
    payment_timing: 'on_dispatch', priority: 'ROUTINE',
  })
  const [cargo, setCargo] = useState({
    origin_city: '', dest_city: '', ntr: 'GEN' as NTR, pieces: '1',
    weight_kg: '', chargeable_weight: '', handed_over: false,
    boe_number: '', shipper_2: '', consignee_2: '', receiver_name: '',
    receiver_phone: '', notes: '', instr: '',
  })
  const [dims, setDims] = useState<DimRow[]>([{ l: '', w: '', h: '' }])
  const [docs, setDocs] = useState({ final_awb: '', xbd_awb: '', svo_awb: '' })
  const [awb, setAWB] = useState<AWBData>(emptyAWB())
  const [awbFileURL, setAWBFileURL] = useState('')
  const [awbFileKey, setAWBFileKey] = useState('')
  const [awbFileName, setAWBFileName] = useState('')
  const [awbPreviewURL, setAWBPreviewURL] = useState('')
  const [awbIsPDF, setAWBIsPDF] = useState(false)
  const [ocrState, setOcrState] = useState<'idle' | 'uploading' | 'ocr' | 'done' | 'error'>('idle')
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrConfidence, setOcrConfidence] = useState(0)
  const [fin, setFin] = useState({
    total_amount: '', add_amount: '', currency: 'USD' as Currency,
    exchange_rate: '3.67', inv_amount_usd: '', inv_amount_aed: '',
    invoice_status: '', cx_notified: false,
  })

  // ── Заполнение из order ────────────────────────────────────────────────────
  useEffect(() => {
    if (!order) return
    setTab('main')
    setError('')
    setMain({
      our_ref:        order.our_ref || '',
      supplier:       order.supplier || '',
      client_id:      String(order.client_id || ''),
      job_type:       (order.job_type as JobType) || 'T-IN',
      flight_type:    order.flight_type || '',
      status:         order.status || 'new',
      job_status:     order.job_status || 'OPEN',
      assigned_to_id: order.assigned_to_id ? String(order.assigned_to_id) : '',
      payment_timing: order.payment_timing || 'on_dispatch',
      priority:       order.priority || 'ROUTINE',
    })
    const pieces = order.pieces || 1
    setCargo({
      origin_city:       order.origin_city || '',
      dest_city:         order.dest_city || '',
      ntr:               (order.ntr as NTR) || 'GEN',
      pieces:            String(pieces),
      weight_kg:         order.weight_kg ? String(order.weight_kg) : '',
      chargeable_weight: order.chargeable_weight ? String(order.chargeable_weight) : '',
      handed_over:       order.handed_over || false,
      boe_number:        order.boe_number || '',
      shipper_2:         order.shipper_2 || '',
      consignee_2:       order.consignee_2 || '',
      receiver_name:     order.receiver_name || '',
      receiver_phone:    order.receiver_phone || '',
      notes:             order.notes || '',
      instr:             order.instr || '',
    })
    setDims(parseDims(order.dimensions || '', pieces))
    setDocs({
      final_awb: order.final_awb || '',
      xbd_awb:   order.xbd_awb || '',
      svo_awb:   order.svo_awb || '',
    })
    if (order.awb) {
      setAWB({ ...emptyAWB(), ...order.awb })
      if (order.awb.file_url) {
        setAWBFileURL(order.awb.file_url)
        setAWBFileKey(order.awb.file_key || '')
        setOcrState('done')
        setOcrConfidence(95)
      }
    } else {
      setAWB(emptyAWB())
      setAWBFileURL('')
      setAWBFileKey('')
      setOcrState('idle')
    }
    setFin({
      total_amount:   order.total_amount ? String(order.total_amount) : '',
      add_amount:     order.add_amount ? String(order.add_amount) : '',
      currency:       order.currency || 'USD',
      exchange_rate:  order.exchange_rate ? String(order.exchange_rate) : '3.67',
      inv_amount_usd: order.inv_amount_usd ? String(order.inv_amount_usd) : '',
      inv_amount_aed: order.inv_amount_aed ? String(order.inv_amount_aed) : '',
      invoice_status: order.invoice_status || '',
      cx_notified:    order.cx_notified || false,
    })
    setNoteText('')
  }, [order])

  // ── Данные ────────────────────────────────────────────────────────────────
  const { data: jobTypes = [] } = useQuery({
    queryKey: ['catalogs', 'job_type'],
    queryFn: () => catalogsApi.list('job_type', true).then(r => r.data),
  })

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['order-logs', order?.id],
    queryFn: () => ordersApi.getLogs(order!.id).then(r => r.data),
    enabled: !!order && tab === 'history',
  })

  // ── Заметки ───────────────────────────────────────────────────────────────
  const [noteText, setNoteText] = useState('')

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ['order-notes', order?.id],
    queryFn: () => ordersApi.getNotes(order!.id).then(r => r.data),
    enabled: !!order,
  })

  const addNoteMutation = useMutation({
    mutationFn: (text: string) => ordersApi.addNote(order!.id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-notes', order?.id] })
      setNoteText('')
    },
  })

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: number) => ordersApi.deleteNote(order!.id, noteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order-notes', order?.id] }),
  })

  const { data: statuses = [] } = useQuery({
    queryKey: ['catalogs', 'order_status'],
    queryFn: () => catalogsApi.list('order_status', true).then(r => r.data),
  })

  const { data: ntrTypes = [] } = useQuery({
    queryKey: ['catalogs', 'ntr'],
    queryFn: () => catalogsApi.list('ntr', true).then(r => r.data),
  })

  // ── Авто-расчёт груза ─────────────────────────────────────────────────────
  const volumetricCWT = useMemo(() => {
    const total = dims.reduce((sum, d) =>
      sum + (parseFloat(d.l) || 0) * (parseFloat(d.w) || 0) * (parseFloat(d.h) || 0), 0)
    return total / 6000
  }, [dims])

  const autoCWT = useMemo(() => {
    const kg = parseFloat(cargo.weight_kg) || 0
    const vol = volumetricCWT
    if (vol <= 0 && kg <= 0) return 0
    return Math.max(kg, vol)
  }, [volumetricCWT, cargo.weight_kg])

  const cbm = useMemo(() => {
    const cwt = parseFloat(cargo.chargeable_weight) || autoCWT
    return cwt > 0 ? cwt / 166.66 : 0
  }, [cargo.chargeable_weight, autoCWT])

  const handleDimChange = (i: number, field: keyof DimRow, val: string) => {
    setDims(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: val }
      return next
    })
  }

  const handlePiecesChange = (val: string) => {
    const n = Math.max(1, parseInt(val) || 1)
    setCargo(p => ({ ...p, pieces: val }))
    setDims(prev => {
      if (n > prev.length) return [...prev, ...Array.from({ length: n - prev.length }, () => ({ l: '', w: '', h: '' }))]
      return prev.slice(0, n)
    })
  }

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list().then(r => r.data),
    enabled: !!order,
  })
  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersApi.list().then(r => r.data).catch(() => []),
    enabled: !!order,
  })

  // ── Мутации ────────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data: object) => ordersApi.update(order!.id, data as Partial<Order>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      onClose()
    },
    onError: () => setError(t('orders.edit.errorSave')),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => filesApi.uploadAWB(file),
  })

  // ── Загрузка AWB ──────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAWBFileName(file.name)
    setOcrState('uploading')
    setOcrProgress(0)
    setError('')
    setAWBPreviewURL(URL.createObjectURL(file))
    setAWBIsPDF(isPDFFile(file))
    try {
      const uploadPromise = uploadMutation.mutateAsync(file)
      setOcrState('ocr')
      const ocrResult = await extractAWBFromFile(file, p => setOcrProgress(p))
      const extracted = ocrResult.awb
      setOcrConfidence(ocrResult.confidence)
      const uploadRes = await uploadPromise
      setAWBFileKey(uploadRes.data.file_key)
      setAWBFileURL(uploadRes.data.file_url)
      if (Object.keys(extracted).length > 0) {
        setAWB(prev => ({ ...prev, ...extracted }))
        if (extracted.airport_of_departure) setCargo(p => ({ ...p, origin_city: extracted.airport_of_departure! }))
        if (extracted.airport_of_destination) setCargo(p => ({ ...p, dest_city: extracted.airport_of_destination! }))
        if (extracted.awb_number) setDocs(p => ({ ...p, final_awb: extracted.awb_number! }))
        if (extracted.gross_weight) setCargo(p => ({ ...p, weight_kg: String(extracted.gross_weight) }))
        if (extracted.chargeable_weight) setCargo(p => ({ ...p, chargeable_weight: String(extracted.chargeable_weight) }))
        if (extracted.number_of_pieces) setCargo(p => ({ ...p, pieces: String(extracted.number_of_pieces) }))
      }
      setOcrState('done')
    } catch {
      setOcrState('error')
    }
  }

  // ── Авто-расчёт AED ───────────────────────────────────────────────────────
  const handleInvUSDChange = (val: string) => {
    const usd = parseFloat(val) || 0
    const rate = parseFloat(fin.exchange_rate) || 3.67
    setFin(p => ({ ...p, inv_amount_usd: val, inv_amount_aed: usd > 0 ? (usd * rate).toFixed(2) : '' }))
  }
  const handleRateChange = (val: string) => {
    const rate = parseFloat(val) || 3.67
    const usd = parseFloat(fin.inv_amount_usd) || 0
    setFin(p => ({ ...p, exchange_rate: val, inv_amount_aed: usd > 0 ? (usd * rate).toFixed(2) : p.inv_amount_aed }))
  }

  // ── Сабмит ────────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!main.client_id) { setError(t('orders.create.errorSelectClient')); return }
    setError('')
    updateMutation.mutate({
      our_ref: main.our_ref, supplier: main.supplier,
      client_id: Number(main.client_id), job_type: main.job_type,
      flight_type: main.flight_type,
      status: main.status, job_status: main.job_status,
      assigned_to_id: main.assigned_to_id ? Number(main.assigned_to_id) : null,
      payment_timing: main.payment_timing,
      priority: main.priority,
      origin_country: '', origin_city: cargo.origin_city,
      dest_country: '', dest_city: cargo.dest_city,
      ntr: cargo.ntr, pieces: Number(cargo.pieces) || 1,
      weight_kg: Number(cargo.weight_kg) || 0,
      chargeable_weight: autoCWT > 0 ? autoCWT : (Number(cargo.chargeable_weight) || 0),
      dimensions: serializeDims(dims), handed_over: cargo.handed_over,
      boe_number: cargo.boe_number, shipper_2: cargo.shipper_2,
      consignee_2: cargo.consignee_2, receiver_name: cargo.receiver_name,
      receiver_phone: cargo.receiver_phone, notes: cargo.notes, instr: cargo.instr,
      final_awb: docs.final_awb, xbd_awb: docs.xbd_awb, svo_awb: docs.svo_awb,
      awb: awbFileKey ? { ...awb, file_key: awbFileKey, file_url: awbFileURL } : (order?.awb || undefined),
      total_amount: Number(fin.total_amount) || 0,
      add_amount: Number(fin.add_amount) || 0,
      currency: fin.currency, exchange_rate: Number(fin.exchange_rate) || 3.67,
      inv_amount_usd: Number(fin.inv_amount_usd) || 0,
      inv_amount_aed: Number(fin.inv_amount_aed) || 0,
      invoice_status: fin.invoice_status, cx_notified: fin.cx_notified,
    })
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'
  const sec = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'

  const TABS: { key: Tab; label: string }[] = [
    { key: 'main',    label: t('orders.create.tabMain') },
    { key: 'cargo',   label: t('orders.create.tabCargo') },
    { key: 'awb',     label: t('orders.create.tabAwb') },
    { key: 'finance', label: t('orders.create.tabFinance') },
    { key: 'history', label: t('orders.edit.tabHistory') },
  ]

  // Группируем логи по пользователю + временной близости (≤3 сек = одно сохранение)
  const groupedLogs = (() => {
    if (!logs.length) return []
    const groups: { log: OrderLog; changes: OrderLog[] }[] = []
    for (const log of logs) {
      const last = groups[groups.length - 1]
      const sameUser = last && last.log.user_id === log.user_id
      const closedInTime = last && Math.abs(
        new Date(last.log.created_at).getTime() - new Date(log.created_at).getTime()
      ) < 3000
      if (sameUser && closedInTime && log.action !== 'created') {
        last.changes.push(log)
      } else {
        groups.push({ log, changes: log.action === 'created' ? [] : [log] })
      }
    }
    return groups
  })()

  if (!order) return null

  return (
    <Modal open={!!order} onClose={onClose}
      title={`${t('orders.edit.title')} — ${order.tracking_number}`} size="xl">

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5 -mx-6 px-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            {t.key === 'awb' && awbFileKey && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-green-500 inline-block" />
            )}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>

        {/* ── TAB 1: ОСНОВНОЕ ── */}
        <div className={tab === 'main' ? 'space-y-4' : 'hidden'}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>OUR REF</label>
              <input value={main.our_ref} onChange={e => setMain(p => ({...p, our_ref: e.target.value}))}
                className={inp} placeholder={t('orders.create.ourRefPlaceholder')} />
            </div>
            <div>
              <label className={lbl}>JOB TYPE</label>
              <select value={main.job_type}
                onChange={e => setMain(p => ({...p, job_type: e.target.value as JobType}))} className={inp}>
                {jobTypes.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>SUPPLIER</label>
              <input value={main.supplier} onChange={e => setMain(p => ({...p, supplier: e.target.value}))}
                className={inp} placeholder="AIRBORNE, AVNUR TRADING..." />
            </div>
            <div>
              <label className={lbl}>CUSTOMER *</label>
              <select value={main.client_id}
                onChange={e => setMain(p => ({...p, client_id: e.target.value}))} className={inp} required>
                <option value="">{t('orders.create.selectClient')}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>ASSIGNED</label>
              <select value={main.assigned_to_id}
                onChange={e => setMain(p => ({...p, assigned_to_id: e.target.value}))} className={inp}>
                <option value="">{t('orders.create.notAssigned')}</option>
                {(users as {id: number; name: string}[]).map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>STATUS</label>
              <select value={main.status}
                onChange={e => setMain(p => ({...p, status: e.target.value}))} className={inp}>
                {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>JOB STATUS</label>
              <div className="flex gap-3">
                {['OPEN', 'CLOSED'].map(js => (
                  <label key={js} className={`flex-1 flex items-center justify-center gap-2 p-2.5 border rounded-lg cursor-pointer transition text-sm font-medium ${
                    main.job_status === js
                      ? js === 'OPEN' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-500 bg-gray-50 text-gray-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                    <input type="radio" name="edit_job_status" value={js}
                      checked={main.job_status === js}
                      onChange={e => setMain(p => ({...p, job_status: e.target.value}))}
                      className="hidden" />
                    {js}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>{t('orders.create.paymentWhen')}</label>
              <select value={main.payment_timing}
                onChange={e => setMain(p => ({...p, payment_timing: e.target.value}))} className={inp}>
                <option value="on_dispatch">{t('orders.create.onDispatch')}</option>
                <option value="on_receipt">{t('orders.create.onReceipt')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>{t('orders.create.flightType')}</label>
              <div className="flex gap-3">
                {[{ value: 'charter', label: t('orders.create.charter') }, { value: 'regular', label: t('orders.create.regular') }].map(ft => (
                  <label key={ft.value} className={`flex-1 flex items-center justify-center gap-2 p-2.5 border rounded-lg cursor-pointer transition text-sm font-medium ${
                    main.flight_type === ft.value
                      ? ft.value === 'charter'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                    <input type="radio" name="edit_flight_type" value={ft.value}
                      checked={main.flight_type === ft.value}
                      onChange={e => setMain(p => ({...p, flight_type: e.target.value}))}
                      className="hidden" />
                    {ft.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>{t('orders.create.priority')}</label>
              <div className="flex gap-2">
                {PRIORITY_OPTIONS.map(p => (
                  <label key={p.value} className={`flex-1 flex items-center justify-center p-2 border rounded-lg cursor-pointer transition text-xs font-semibold ${
                    main.priority === p.value ? p.color : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                  }`}>
                    <input type="radio" name="edit_priority" value={p.value}
                      checked={main.priority === p.value}
                      onChange={e => setMain(prev => ({...prev, priority: e.target.value}))}
                      className="hidden" />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── TAB 2: ГРУЗ ── */}
        <div className={tab === 'cargo' ? 'space-y-4' : 'hidden'}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>{t('orders.create.orgLabel')}</label>
              <input value={cargo.origin_city}
                onChange={e => setCargo(p => ({...p, origin_city: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)}))}
                className={`${inp} uppercase tracking-widest font-mono`} placeholder="DXB" maxLength={3} />
            </div>
            <div>
              <label className={lbl}>{t('orders.create.desLabel')}</label>
              <input value={cargo.dest_city}
                onChange={e => setCargo(p => ({...p, dest_city: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)}))}
                className={`${inp} uppercase tracking-widest font-mono`} placeholder="CAI" maxLength={3} />
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <p className={sec}>{t('orders.create.cargoProps')}</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className={lbl}>{t('orders.create.ntrLabel')}</label>
                <select value={cargo.ntr}
                  onChange={e => setCargo(p => ({...p, ntr: e.target.value as NTR}))} className={inp}>
                  {ntrTypes.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>{t('orders.create.pcLabel')}</label>
                <input type="number" min="1" value={cargo.pieces}
                  onChange={e => handlePiecesChange(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>{t('orders.create.kgLabel')}</label>
                <input type="number" min="0" step="0.01" value={cargo.weight_kg}
                  onChange={e => setCargo(p => ({...p, weight_kg: e.target.value}))}
                  className={inp} placeholder="0.00" />
              </div>
            </div>

            {/* DIMS rows */}
            <div className="mb-3">
              <label className={lbl}>{t('orders.create.dimsCm')}</label>
              <div className="space-y-1.5">
                {dims.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 w-5 text-right shrink-0">{i + 1}.</span>
                    <input type="number" min="0" step="0.1" value={d.l}
                      onChange={e => handleDimChange(i, 'l', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="L" />
                    <span className="text-gray-400 text-sm">×</span>
                    <input type="number" min="0" step="0.1" value={d.w}
                      onChange={e => handleDimChange(i, 'w', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="W" />
                    <span className="text-gray-400 text-sm">×</span>
                    <input type="number" min="0" step="0.1" value={d.h}
                      onChange={e => handleDimChange(i, 'h', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="H" />
                  </div>
                ))}
              </div>
              {volumetricCWT > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {t('orders.create.volumetricWeight')}: <span className="font-medium text-blue-600">{volumetricCWT.toFixed(2)} kg</span>
                </p>
              )}
            </div>

            {/* CWT + CBM */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>
                  {t('orders.create.cwtLabel')}
                  {autoCWT > 0 && <span className="ml-1 text-blue-500 text-xs">{t('orders.create.autoLabel')}: {autoCWT.toFixed(2)}</span>}
                </label>
                <input type="number" min="0" step="0.01"
                  value={autoCWT > 0 ? autoCWT.toFixed(2) : cargo.chargeable_weight}
                  onChange={e => setCargo(p => ({...p, chargeable_weight: e.target.value}))}
                  className={inp} placeholder="0.00" />
              </div>
              <div>
                <label className={lbl}>{t('orders.create.cbmLabel')}</label>
                <input type="text" readOnly
                  value={cbm > 0 ? cbm.toFixed(4) : ''}
                  className={`${inp} bg-gray-100 text-gray-500 cursor-default`}
                  placeholder={t('orders.create.autoLabel')} />
              </div>
            </div>

            <div className="mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={cargo.handed_over}
                  onChange={e => setCargo(p => ({...p, handed_over: e.target.checked}))}
                  className="accent-blue-600 w-4 h-4" />
                <span className="text-sm font-medium text-gray-700">H.OVER (Handed Over)</span>
              </label>
            </div>
          </div>

          <div>
            <label className={lbl}>BOE#</label>
            <input value={cargo.boe_number}
              onChange={e => setCargo(p => ({...p, boe_number: e.target.value}))}
              className={inp} placeholder="20100313..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>{t('orders.create.receiver')}</label>
              <input value={cargo.receiver_name}
                onChange={e => setCargo(p => ({...p, receiver_name: e.target.value}))} className={inp} />
            </div>
            <div>
              <label className={lbl}>{t('orders.create.receiverPhone')}</label>
              <input value={cargo.receiver_phone}
                onChange={e => setCargo(p => ({...p, receiver_phone: e.target.value}))} className={inp} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>{t('orders.create.shipper2')}</label>
              <textarea value={cargo.shipper_2}
                onChange={e => setCargo(p => ({...p, shipper_2: e.target.value}))}
                className={inp} rows={3} placeholder={t('orders.create.companyDetailsPlaceholder')} />
            </div>
            <div>
              <label className={lbl}>{t('orders.create.consignee2')}</label>
              <textarea value={cargo.consignee_2}
                onChange={e => setCargo(p => ({...p, consignee_2: e.target.value}))}
                className={inp} rows={3} placeholder={t('orders.create.companyDetailsPlaceholder')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>INSTR</label>
              <textarea value={cargo.instr}
                onChange={e => setCargo(p => ({...p, instr: e.target.value}))}
                className={inp} rows={2} />
            </div>
            <div>
              <label className={lbl}>Note</label>
              <textarea value={cargo.notes}
                onChange={e => setCargo(p => ({...p, notes: e.target.value}))}
                className={inp} rows={2} />
            </div>
          </div>

          {/* ── Notes (комментарии) ── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {t('orders.edit.commentsSection')}
                {notes.length > 0 && (
                  <span className="ml-2 bg-blue-100 text-blue-600 rounded-full px-1.5 py-0.5 text-xs font-bold">
                    {notes.length}
                  </span>
                )}
              </span>
            </div>

            {/* Ввод новой заметки */}
            <div className="p-3 border-b border-gray-100 flex gap-2">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && noteText.trim()) {
                    e.preventDefault()
                    addNoteMutation.mutate(noteText.trim())
                  }
                }}
                placeholder={t('orders.edit.notePlaceholder')}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
              />
              <button
                type="button"
                onClick={() => noteText.trim() && addNoteMutation.mutate(noteText.trim())}
                disabled={!noteText.trim() || addNoteMutation.isPending}
                className="self-end px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm transition"
              >
                {addNoteMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : '+'}
              </button>
            </div>

            {/* Список заметок */}
            <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
              {notesLoading ? (
                <div className="p-4 text-center text-gray-400 text-sm">{t('common.loading')}</div>
              ) : notes.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-sm">{t('orders.edit.notesEmpty')}</div>
              ) : (
                (notes as OrderNote[]).map(note => {
                  const dt = new Date(note.created_at)
                  const initials = note.user?.name
                    ? note.user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                    : '?'
                  return (
                    <div key={note.id} className="flex gap-3 px-4 py-3 hover:bg-gray-50 group">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-gray-700">{note.user?.name || '—'}</span>
                          <span className="text-xs text-gray-400">
                            {dt.toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-GB', { day: '2-digit', month: 'short' })}, {dt.toLocaleTimeString(i18n.language === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{note.text}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteNoteMutation.mutate(note.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition p-1 shrink-0"
                        title={t('common.delete')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* ── TAB 3: AWB ── */}
        <div className={tab === 'awb' ? 'space-y-4' : 'hidden'}>
          <div className="border border-gray-200 rounded-lg p-4">
            <p className={sec}>{t('orders.create.awbNumbers')}</p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className={lbl}>1-LEG-AWB</label>
                <input value={docs.final_awb}
                  onChange={e => setDocs(p => ({...p, final_awb: e.target.value}))}
                  className={inp} placeholder="176-26685746" />
              </div>
              <div>
                <label className={lbl}>2-LEG-AWB</label>
                <input value={docs.xbd_awb}
                  onChange={e => setDocs(p => ({...p, xbd_awb: e.target.value}))}
                  className={inp} />
              </div>
              <div>
                <label className={lbl}>FINAL-AWB</label>
                <input value={docs.svo_awb}
                  onChange={e => setDocs(p => ({...p, svo_awb: e.target.value}))}
                  className={inp} />
              </div>
            </div>
          </div>

          {/* Upload AWB */}
          <div>
            <p className={sec}>{t('orders.edit.awbDocSection')}</p>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange} className="hidden" />

            {ocrState === 'uploading' && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Loader2 size={16} className="text-blue-500 animate-spin" />
                <p className="text-sm text-blue-700">{t('orders.create.uploading')}</p>
              </div>
            )}
            {ocrState === 'ocr' && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="text-blue-500 animate-spin" />
                  <p className="text-sm text-blue-700">{t('orders.create.ocrAnalysis')} {ocrProgress}%</p>
                </div>
                <div className="w-full bg-blue-100 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${ocrProgress}%` }} />
                </div>
              </div>
            )}
            {ocrState === 'done' && (
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 size={16} className="text-green-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-800 truncate">
                    {awbFileName || t('orders.edit.awbUploaded')}
                  </p>
                  <p className="text-xs text-green-600">
                    {ocrConfidence >= 90 ? t('orders.create.textLayer') : `${t('orders.create.ocrConfidence')}: ${ocrConfidence}%`}
                  </p>
                </div>
                {awbFileURL && (
                  <a href={awbFileURL} target="_blank" rel="noreferrer"
                    className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                    <ExternalLink size={12} /> {t('common.open')}
                  </a>
                )}
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-gray-500 hover:underline">{t('common.replace')}</button>
              </div>
            )}
            {ocrState === 'error' && (
              <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle size={16} className="text-red-500" />
                <p className="text-sm text-red-700">{t('orders.create.errorManual')}</p>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="ml-auto text-xs text-blue-600">{t('common.retry')}</button>
              </div>
            )}
            {ocrState === 'idle' && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 p-5 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition">
                <Upload size={20} className="text-gray-400" />
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-700">{t('orders.create.uploadAwbBtn')}</p>
                  <p className="text-xs text-gray-400">{t('orders.create.uploadAwbHint')}</p>
                </div>
              </button>
            )}

            {awbPreviewURL && ocrState !== 'idle' && (
              <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                <p className="text-xs text-gray-500 px-3 py-1.5 bg-gray-50 border-b">{t('orders.create.awbDocPreview')}</p>
                {awbIsPDF
                  ? <embed src={awbPreviewURL} type="application/pdf" className="w-full" style={{ height: '280px' }} />
                  : <img src={awbPreviewURL} alt="AWB" className="w-full object-contain max-h-64" />
                }
              </div>
            )}
          </div>

          {awbFileKey && (
            <div className="border border-gray-200 rounded-lg p-4">
              <p className={sec}>{t('orders.create.awbDataIata')}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: t('orders.create.awbNumber'), field: 'awb_number', placeholder: '410-00192566' },
                  { label: t('orders.create.refNumber'), field: 'reference_number', placeholder: '' },
                  { label: t('orders.create.shipper'), field: 'shipper_name', placeholder: '' },
                  { label: t('orders.create.consignee'), field: 'consignee_name', placeholder: '' },
                  { label: t('orders.create.goodsDesc'), field: 'goods_description', placeholder: '' },
                ].map(f => (
                  <div key={f.field}>
                    <label className={lbl}>{f.label}</label>
                    <input value={(awb as unknown as Record<string, string>)[f.field] || ''}
                      onChange={e => setAWB(p => ({...p, [f.field]: e.target.value}))}
                      className={inp} placeholder={f.placeholder} />
                  </div>
                ))}
                <div>
                  <label className={lbl}>{t('orders.create.paymentMode')}</label>
                  <select value={awb.mode_of_payment}
                    onChange={e => setAWB(p => ({...p, mode_of_payment: e.target.value}))} className={inp}>
                    <option value="Prepaid">Prepaid</option>
                    <option value="Collect">Collect</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── TAB 4: ФИНАНСЫ ── */}
        <div className={tab === 'finance' ? 'space-y-4' : 'hidden'}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>AMOUNT</label>
              <div className="flex gap-2">
                <input type="number" min="0" step="0.01" value={fin.total_amount}
                  onChange={e => setFin(p => ({...p, total_amount: e.target.value}))}
                  className={inp} placeholder="0.00" />
                <select value={fin.currency}
                  onChange={e => setFin(p => ({...p, currency: e.target.value as Currency}))}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none w-24">
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={lbl}>ADD AMOUNT</label>
              <input type="number" min="0" step="0.01" value={fin.add_amount}
                onChange={e => setFin(p => ({...p, add_amount: e.target.value}))}
                className={inp} placeholder="0.00" />
            </div>
          </div>

          <div className="border border-blue-100 rounded-lg p-4 bg-blue-50/30">
            <p className={sec}>{t('orders.create.invoiceSection')}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>INV AMOUNT (USD)</label>
                <input type="number" min="0" step="0.01" value={fin.inv_amount_usd}
                  onChange={e => handleInvUSDChange(e.target.value)}
                  className={inp} placeholder="0.00" />
              </div>
              <div>
                <label className={lbl}>Rate</label>
                <input type="number" min="0" step="0.0001" value={fin.exchange_rate}
                  onChange={e => handleRateChange(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>INV AMOUNT (AED)</label>
                <input type="number" min="0" step="0.01" value={fin.inv_amount_aed}
                  onChange={e => setFin(p => ({...p, inv_amount_aed: e.target.value}))}
                  className={`${inp} bg-gray-50`} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className={lbl}>Invoice Status</label>
                <select value={fin.invoice_status}
                  onChange={e => setFin(p => ({...p, invoice_status: e.target.value}))} className={inp}>
                  {INVOICE_STATUSES.map(s => <option key={s} value={s}>{s || t('orders.create.invoiceNotSet')}</option>)}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={fin.cx_notified}
                    onChange={e => setFin(p => ({...p, cx_notified: e.target.checked}))}
                    className="accent-blue-600 w-4 h-4" />
                  <span className="text-sm font-medium text-gray-700">CX NOTIFIED</span>
                </label>
              </div>
            </div>
          </div>

          {fin.inv_amount_usd && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 space-y-1">
              {fin.total_amount && (
                <div className="flex justify-between">
                  <span>AMOUNT:</span>
                  <span className="font-medium">{fin.total_amount} {fin.currency}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1">
                <span className="font-semibold">INV AMOUNT:</span>
                <span className="font-bold text-blue-700">
                  ${fin.inv_amount_usd} / AED {fin.inv_amount_aed}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── TAB 5: ИСТОРИЯ ── */}
        <div className={tab === 'history' ? '' : 'hidden'}>
          {logsLoading ? (
            <div className="py-12 text-center text-gray-400">
              <Loader2 size={24} className="animate-spin mx-auto mb-2" />
              {t('orders.edit.historyLoading')}
            </div>
          ) : groupedLogs.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <History size={36} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm">{t('orders.edit.historyEmpty')}</p>
            </div>
          ) : (
            <div className="space-y-0">
              {groupedLogs.map((group, i) => {
                const u = group.log.user
                const initials = u?.name ? u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'
                const dt = new Date(group.log.created_at)
                const locale = i18n.language === 'ru' ? 'ru-RU' : 'en-GB'
                const dateStr = dt.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
                const timeStr = dt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={group.log.id} className="flex gap-3">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center w-8 shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                        group.log.action === 'created' ? 'bg-green-500' : 'bg-blue-500'
                      }`}>
                        {group.log.action === 'created' ? '★' : initials}
                      </div>
                      {i < groupedLogs.length - 1 && (
                        <div className="w-0.5 bg-gray-200 flex-1 my-1 min-h-[12px]" />
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 pb-4 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{u?.name || '—'}</span>
                        <span className="text-xs text-gray-400">{dateStr}, {timeStr}</span>
                      </div>
                      {group.log.action === 'created' ? (
                        <p className="text-sm text-green-600 font-medium">{t('orders.edit.orderCreated')}</p>
                      ) : (
                        <div className="space-y-1">
                          {group.changes.map((log, j) => (
                            <div key={j} className="text-sm flex items-center gap-1 flex-wrap">
                              <span className="font-medium text-gray-600 shrink-0">{log.field}:</span>
                              <span className={`px-1.5 py-0.5 rounded text-xs ${log.old_value ? 'bg-red-50 text-red-500 line-through' : 'text-gray-400'}`}>
                                {log.old_value || '—'}
                              </span>
                              <span className="text-gray-400 text-xs">→</span>
                              <span className="px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700 font-medium">
                                {log.new_value || '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

        <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-100">
          <div className="flex gap-2 text-xs text-gray-400">
            {TABS.map((t, i) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`px-2 py-1 rounded transition ${
                  tab === t.key ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100'
                }`}>
                {i + 1}. {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              {t('common.cancel')}
            </button>
            {tab !== 'history' && (
              <button type="submit" disabled={updateMutation.isPending}
                className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50">
                {updateMutation.isPending ? t('orders.edit.saving') : t('orders.edit.saveBtn')}
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  )
}
