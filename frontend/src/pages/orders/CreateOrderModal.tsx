import { useRef, useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/ui/Modal'
import { ordersApi } from '../../api/orders'
import { clientsApi } from '../../api/clients'
import { usersApi } from '../../api/users'
import { filesApi } from '../../api/files'
import { catalogsApi } from '../../api/catalogs'
import { extractAWBFromFile, isPDFFile } from '../../lib/awbOcr'
import type { AWBData, Currency, JobType, NTR, User } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

// ── Справочники ────────────────────────────────────────────────────────────

const PRIORITY_OPTIONS = [
  { value: 'ROUTINE',  label: 'ROUTINE',  color: 'border-gray-300 bg-white text-gray-600' },
  { value: 'CRITICAL', label: 'CRITICAL', color: 'border-orange-400 bg-orange-50 text-orange-700' },
  { value: 'AOG',      label: 'AOG',      color: 'border-red-500 bg-red-50 text-red-700' },
  { value: 'TOPAOG',   label: 'TOP AOG',  color: 'border-red-700 bg-red-100 text-red-900' },
]

type DimRow = { l: string; w: string; h: string }

const serializeDims = (dims: DimRow[]) =>
  dims.map(d => `${d.l || 0}x${d.w || 0}x${d.h || 0}`).join(' ')

const INVOICE_STATUSES = ['', 'Inv Sent', 'Pending', 'Paid', 'Cancelled']
const CURRENCIES: Currency[] = ['USD', 'AED', 'TJS', 'RUB']

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

type Tab = 'main' | 'cargo' | 'awb' | 'finance' | 'assigned'

export default function CreateOrderModal({ open, onClose }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInput2Ref = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('main')
  const [error, setError] = useState('')

  // ── Tab 1: Основное ────────────────────────────────────────────────────────
  const [main, setMain] = useState({
    our_ref: '',
    supplier: '',
    client_id: '',
    job_type: 'T-IN' as JobType,
    flight_type: '',
    status: 'new',
    job_status: 'OPEN',
    assigned_to_id: '',
    payment_timing: 'on_dispatch',
    priority: 'ROUTINE',
  })

  // ── Tab 2: Груз ────────────────────────────────────────────────────────────
  const [cargo, setCargo] = useState({
    origin_city: '',
    dest_city: '',
    ntr: 'GEN' as NTR,
    pieces: '1',
    weight_kg: '',
    chargeable_weight: '',
    handed_over: false,
    boe_number: '',
    shipper_2: '',
    consignee_2: '',
    receiver_name: '',
    receiver_phone: '',
    notes: '',
    instr: '',
  })
  const [dims, setDims] = useState<DimRow[]>([{ l: '', w: '', h: '' }])

  // ── Tab 3: AWB ─────────────────────────────────────────────────────────────
  const [docs, setDocs] = useState({
    final_awb: '',
    xbd_awb: '',
    svo_awb: '',
  })
  const [awb, setAWB] = useState<AWBData>(emptyAWB())
  const [awbFileURL, setAWBFileURL] = useState('')
  const [awbFileKey, setAWBFileKey] = useState('')
  const [awbFileName, setAWBFileName] = useState('')
  const [awbPreviewURL, setAWBPreviewURL] = useState('')
  const [awbIsPDF, setAWBIsPDF] = useState(false)
  const [ocrState, setOcrState] = useState<'idle' | 'uploading' | 'ocr' | 'done' | 'error'>('idle')
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrConfidence, setOcrConfidence] = useState(0)

  const [awb2FileURL, setAWB2FileURL] = useState('')
  const [awb2FileKey, setAWB2FileKey] = useState('')
  const [awb2FileName, setAWB2FileName] = useState('')
  const [awb2PreviewURL, setAWB2PreviewURL] = useState('')
  const [awb2IsPDF, setAWB2IsPDF] = useState(false)
  const [upload2State, setUpload2State] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')

  // ── Tab 4: Финансы ─────────────────────────────────────────────────────────
  const [fin, setFin] = useState({
    total_amount: '',
    add_amount: '',
    currency: 'USD' as Currency,
    exchange_rate: '3.67',
    inv_amount_usd: '',
    inv_amount_aed: '',
    invoice_status: '',
    cx_notified: false,
  })

  // ── Данные ────────────────────────────────────────────────────────────────
  const { data: jobTypes = [] } = useQuery({
    queryKey: ['catalogs', 'job_type'],
    queryFn: () => catalogsApi.list('job_type', true).then(r => r.data),
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
    enabled: open,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersApi.list().then(r => r.data).catch(() => []),
    enabled: open,
  })

  // ── Мутации ────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (data: object) => ordersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onClose()
      resetForm()
    },
    onError: () => setError(t('orders.create.errorCreate')),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => filesApi.uploadAWB(file),
  })

  // ── Обработка файла AWB ────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAWBFileName(file.name)
    setOcrState('uploading')
    setOcrProgress(0)
    setError('')
    const previewURL = URL.createObjectURL(file)
    setAWBPreviewURL(previewURL)
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
        // Авто-заполнение полей из AWB
        if (extracted.airport_of_departure)
          setCargo(p => ({ ...p, origin_city: extracted.airport_of_departure! }))
        if (extracted.airport_of_destination)
          setCargo(p => ({ ...p, dest_city: extracted.airport_of_destination! }))
        if (extracted.consignee_name)
          setCargo(p => ({ ...p, receiver_name: extracted.consignee_name! }))
        if (extracted.goods_description)
          setCargo(p => ({ ...p, notes: extracted.goods_description!.split('\n')[0] }))
        if (extracted.gross_weight)
          setCargo(p => ({ ...p, weight_kg: String(extracted.gross_weight) }))
        if (extracted.number_of_pieces) {
          const n = extracted.number_of_pieces!
          setCargo(p => ({ ...p, pieces: String(n) }))
          setDims(prev => {
            if (n > prev.length) return [...prev, ...Array.from({ length: n - prev.length }, () => ({ l: '', w: '', h: '' }))]
            return prev.slice(0, Math.max(1, n))
          })
        }
        if (extracted.chargeable_weight)
          setCargo(p => ({ ...p, chargeable_weight: String(extracted.chargeable_weight) }))
        if (extracted.awb_number)
          setDocs(p => ({ ...p, final_awb: extracted.awb_number! }))
        if (extracted.total_prepaid)
          setFin(p => ({
            ...p,
            inv_amount_usd: String(extracted.total_prepaid),
            inv_amount_aed: String((extracted.total_prepaid! * 3.67).toFixed(2)),
          }))
      }
      setOcrState('done')
    } catch {
      setOcrState('error')
      setError(t('orders.create.errorCreate'))
    }
  }

  const handleFile2Change = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAWB2FileName(file.name)
    setUpload2State('uploading')
    const previewURL = URL.createObjectURL(file)
    setAWB2PreviewURL(previewURL)
    setAWB2IsPDF(isPDFFile(file))
    try {
      const res = await uploadMutation.mutateAsync(file)
      setAWB2FileKey(res.data.file_key)
      setAWB2FileURL(res.data.file_url)
      setUpload2State('done')
    } catch {
      setUpload2State('error')
    }
  }

  // ── Авто-расчёт AED ───────────────────────────────────────────────────────
  const handleInvUSDChange = (val: string) => {
    const usd = parseFloat(val) || 0
    const rate = parseFloat(fin.exchange_rate) || 3.67
    setFin(p => ({
      ...p,
      inv_amount_usd: val,
      inv_amount_aed: usd > 0 ? (usd * rate).toFixed(2) : '',
    }))
  }

  const handleRateChange = (val: string) => {
    const rate = parseFloat(val) || 3.67
    const usd = parseFloat(fin.inv_amount_usd) || 0
    setFin(p => ({
      ...p,
      exchange_rate: val,
      inv_amount_aed: usd > 0 ? (usd * rate).toFixed(2) : p.inv_amount_aed,
    }))
  }

  // ── Сброс ─────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setMain({ our_ref: '', supplier: '', client_id: '', job_type: 'T-IN',
      flight_type: '', status: 'new', job_status: 'OPEN', assigned_to_id: '',
      payment_timing: 'on_dispatch', priority: 'ROUTINE' })
    setCargo({ origin_city: '', dest_city: '', ntr: 'GEN', pieces: '1',
      weight_kg: '', chargeable_weight: '', handed_over: false,
      boe_number: '', shipper_2: '', consignee_2: '', receiver_name: '',
      receiver_phone: '', notes: '', instr: '' })
    setDims([{ l: '', w: '', h: '' }])
    setDocs({ final_awb: '', xbd_awb: '', svo_awb: '' })
    setAWB(emptyAWB())
    setAWBFileURL(''); setAWBFileKey(''); setAWBFileName('')
    setAWBPreviewURL(''); setAWBIsPDF(false)
    setOcrState('idle'); setOcrProgress(0)
    setAWB2FileURL(''); setAWB2FileKey(''); setAWB2FileName('')
    setAWB2PreviewURL(''); setAWB2IsPDF(false); setUpload2State('idle')
    setFin({ total_amount: '', add_amount: '', currency: 'USD', exchange_rate: '3.67',
      inv_amount_usd: '', inv_amount_aed: '', invoice_status: '', cx_notified: false })
    setError(''); setTab('main')
  }

  // ── Сабмит ────────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!main.client_id) { setError(t('orders.create.errorSelectClient')); return }
    setError('')
    mutation.mutate({
      // Tab 1
      our_ref:        main.our_ref,
      supplier:       main.supplier,
      client_id:      Number(main.client_id),
      job_type:       main.job_type,
      flight_type:    main.flight_type,
      status:         main.status,
      job_status:     main.job_status,
      assigned_to_id: main.assigned_to_id ? Number(main.assigned_to_id) : null,
      payment_timing: main.payment_timing,
      priority:       main.priority,
      // Tab 2
      origin_country: '',
      origin_city:    cargo.origin_city,
      dest_country:   '',
      dest_city:      cargo.dest_city,
      ntr:            cargo.ntr,
      pieces:         Number(cargo.pieces) || 1,
      weight_kg:      Number(cargo.weight_kg) || 0,
      chargeable_weight: autoCWT > 0 ? autoCWT : (Number(cargo.chargeable_weight) || 0),
      dimensions:     serializeDims(dims),
      handed_over:    cargo.handed_over,
      boe_number:     cargo.boe_number,
      shipper_2:      cargo.shipper_2,
      consignee_2:    cargo.consignee_2,
      receiver_name:  cargo.receiver_name,
      receiver_phone: cargo.receiver_phone,
      notes:          cargo.notes,
      instr:          cargo.instr,
      // Tab 3
      final_awb: docs.final_awb,
      xbd_awb:   docs.xbd_awb,
      svo_awb:   docs.svo_awb,
      awb: awbFileKey ? { ...awb, file_key: awbFileKey, file_url: awbFileURL } : undefined,
      awb2_file_key: awb2FileKey || undefined,
      awb2_file_url: awb2FileURL || undefined,
      // Tab 4
      total_amount:   Number(fin.total_amount) || 0,
      add_amount:     Number(fin.add_amount) || 0,
      currency:       fin.currency,
      exchange_rate:  Number(fin.exchange_rate) || 3.67,
      inv_amount_usd: Number(fin.inv_amount_usd) || 0,
      inv_amount_aed: Number(fin.inv_amount_aed) || 0,
      invoice_status: fin.invoice_status,
      cx_notified:    fin.cx_notified,
    })
  }

  // ── Стили ─────────────────────────────────────────────────────────────────
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'
  const sec = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'

  const TABS: { key: Tab; label: string }[] = [
    { key: 'main',     label: t('orders.create.tabMain') },
    { key: 'cargo',    label: t('orders.create.tabCargo') },
    { key: 'awb',      label: t('orders.create.tabAwb') },
    { key: 'finance',  label: t('orders.create.tabFinance') },
    { key: 'assigned', label: t('orders.create.tabAssigned') },
  ]

  return (
    <Modal open={open} onClose={onClose} title={t('orders.create.title')} size="xl">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5 -mx-6 px-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.key === 'awb' && (awbFileKey || awb2FileKey) && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-green-500 inline-block" />
            )}
            {t.key === 'assigned' && main.assigned_to_id && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-blue-500 inline-block" />
            )}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 1 — ОСНОВНОЕ
            REF# | OUR REF | SUPPLIER | CUSTOMER | JOB TYPE | ASSIGNED | STATUS
        ══════════════════════════════════════════════════════════════════════ */}
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
                onChange={e => setMain(p => ({...p, job_type: e.target.value as JobType}))}
                className={inp}>
                {jobTypes.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>SUPPLIER</label>
              <input value={main.supplier}
                onChange={e => setMain(p => ({...p, supplier: e.target.value}))}
                className={inp} placeholder="AIRBORNE, AVNUR TRADING..." />
            </div>
            <div>
              <label className={lbl}>CUSTOMER *</label>
              <select value={main.client_id}
                onChange={e => setMain(p => ({...p, client_id: e.target.value}))}
                className={inp} required>
                <option value="">{t('orders.create.selectClient')}</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={lbl}>STATUS</label>
            <select value={main.status}
              onChange={e => setMain(p => ({...p, status: e.target.value}))}
              className={inp}>
              {statuses.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>JOB STATUS</label>
              <div className="flex gap-3">
                {['OPEN', 'CLOSED'].map(js => (
                  <label key={js} className={`flex-1 flex items-center justify-center gap-2 p-2.5 border rounded-lg cursor-pointer transition text-sm font-medium ${
                    main.job_status === js
                      ? js === 'OPEN' ? 'border-green-500 bg-green-50 text-green-700'
                                      : 'border-gray-500 bg-gray-50 text-gray-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                    <input type="radio" name="job_status" value={js}
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
                onChange={e => setMain(p => ({...p, payment_timing: e.target.value}))}
                className={inp}>
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
                    <input type="radio" name="flight_type" value={ft.value}
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
                    <input type="radio" name="priority" value={p.value}
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

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 2 — ГРУЗ
            ORG | DES | NTR | #PC | KG | CWT | DIMS | H.OVER | BOE# | SHIPPER 2 | CONSIGNEE 2
        ══════════════════════════════════════════════════════════════════════ */}
        <div className={tab === 'cargo' ? 'space-y-4' : 'hidden'}>

          {/* Маршрут */}
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

          {/* Характеристики груза */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <p className={sec}>{t('orders.create.cargoProps')}</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className={lbl}>{t('orders.create.ntrLabel')}</label>
                <select value={cargo.ntr}
                  onChange={e => setCargo(p => ({...p, ntr: e.target.value as NTR}))}
                  className={inp}>
                  {ntrTypes.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>{t('orders.create.pcLabel')}</label>
                <input type="number" min="1" value={cargo.pieces}
                  onChange={e => handlePiecesChange(e.target.value)}
                  className={inp} />
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

            {/* H.OVER */}
            <div className="mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={cargo.handed_over}
                  onChange={e => setCargo(p => ({...p, handed_over: e.target.checked}))}
                  className="accent-blue-600 w-4 h-4" />
                <span className="text-sm font-medium text-gray-700">{t('orders.create.handedOver')}</span>
              </label>
            </div>
          </div>

          {/* BOE и документы */}
          <div>
            <label className={lbl}>BOE# (Bill of Entry)</label>
            <input value={cargo.boe_number}
              onChange={e => setCargo(p => ({...p, boe_number: e.target.value}))}
              className={inp} placeholder="20100313..." />
          </div>

          {/* Получатель */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>{t('orders.create.receiver')}</label>
              <input value={cargo.receiver_name}
                onChange={e => setCargo(p => ({...p, receiver_name: e.target.value}))}
                className={inp} />
            </div>
            <div>
              <label className={lbl}>{t('orders.create.receiverPhone')}</label>
              <input value={cargo.receiver_phone}
                onChange={e => setCargo(p => ({...p, receiver_phone: e.target.value}))}
                className={inp} />
            </div>
          </div>

          {/* Shipper 2 / Consignee 2 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>{t('orders.create.shipper2')}</label>
              <textarea value={cargo.shipper_2}
                onChange={e => setCargo(p => ({...p, shipper_2: e.target.value}))}
                className={inp} rows={3}
                placeholder={t('orders.create.companyDetailsPlaceholder')} />
            </div>
            <div>
              <label className={lbl}>{t('orders.create.consignee2')}</label>
              <textarea value={cargo.consignee_2}
                onChange={e => setCargo(p => ({...p, consignee_2: e.target.value}))}
                className={inp} rows={3}
                placeholder={t('orders.create.companyDetailsPlaceholder')} />
            </div>
          </div>

          {/* INSTR и Note */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>INSTR</label>
              <textarea value={cargo.instr}
                onChange={e => setCargo(p => ({...p, instr: e.target.value}))}
                className={inp} rows={2} placeholder={t('orders.create.instrPlaceholder')} />
            </div>
            <div>
              <label className={lbl}>Note</label>
              <textarea value={cargo.notes}
                onChange={e => setCargo(p => ({...p, notes: e.target.value}))}
                className={inp} rows={2} placeholder={t('orders.create.notePlaceholder')} />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 3 — AWB / ДОКУМЕНТЫ
            FINAL AWB | XBD MILE AWB | MLE-SVO AWB | Загрузка AWB документа
        ══════════════════════════════════════════════════════════════════════ */}
        <div className={tab === 'awb' ? 'space-y-4' : 'hidden'}>

          {/* AWB номера */}
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
                  className={inp} placeholder="176-..." />
              </div>
              <div>
                <label className={lbl}>FINAL-AWB</label>
                <input value={docs.svo_awb}
                  onChange={e => setDocs(p => ({...p, svo_awb: e.target.value}))}
                  className={inp} placeholder="555-..." />
              </div>
            </div>
          </div>

          {/* Upload sections */}
          <div className="grid grid-cols-2 gap-4">

            {/* Upload 1-LEG-AWB (with OCR) */}
            <div>
              <p className={sec}>{t('orders.create.upload1LegAwb')}</p>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange} className="hidden" />

              {ocrState === 'uploading' && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Loader2 size={14} className="text-blue-500 animate-spin shrink-0" />
                  <p className="text-xs text-blue-700">{t('orders.create.uploading')}</p>
                </div>
              )}
              {ocrState === 'ocr' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="text-blue-500 animate-spin shrink-0" />
                    <p className="text-xs text-blue-700">{t('orders.create.ocrAnalysis')} {ocrProgress}%</p>
                  </div>
                  <div className="w-full bg-blue-100 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${ocrProgress}%` }} />
                  </div>
                </div>
              )}
              {ocrState === 'done' && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-green-800 truncate">{awbFileName}</p>
                    <p className="text-xs text-green-600">
                      {ocrConfidence >= 90 ? t('orders.create.textLayer')
                        : ocrConfidence > 0 ? `${t('orders.create.ocrConfidence')}: ${ocrConfidence}%`
                        : t('orders.create.fileSavedManual')}
                    </p>
                  </div>
                  {awbFileURL && (
                    <a href={awbFileURL} target="_blank" rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1 shrink-0">
                      <ExternalLink size={11} /> {t('common.open')}
                    </a>
                  )}
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-gray-500 hover:underline shrink-0">{t('common.replace')}</button>
                </div>
              )}
              {ocrState === 'error' && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                  <p className="text-xs text-red-700 flex-1">{t('orders.create.errorManual')}</p>
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-blue-600 shrink-0">{t('common.retry')}</button>
                </div>
              )}
              {ocrState === 'idle' && (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition">
                  <Upload size={18} className="text-gray-400 shrink-0" />
                  <div className="text-left">
                    <p className="text-xs font-medium text-gray-700">{t('orders.create.uploadAwbBtn')}</p>
                    <p className="text-xs text-gray-400">{t('orders.create.uploadAwbHint')}</p>
                  </div>
                </button>
              )}
              {awbPreviewURL && ocrState !== 'idle' && (
                <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                  <p className="text-xs text-gray-500 px-3 py-1.5 bg-gray-50 border-b">{t('orders.create.awbDocPreview')}</p>
                  {awbIsPDF
                    ? <embed src={awbPreviewURL} type="application/pdf" className="w-full" style={{ height: '220px' }} />
                    : <img src={awbPreviewURL} alt="AWB" className="w-full object-contain max-h-52" />
                  }
                </div>
              )}
            </div>

            {/* Upload 2-LEG-AWB (simple upload, no OCR) */}
            <div>
              <p className={sec}>{t('orders.create.upload2LegAwb')}</p>
              <input ref={fileInput2Ref} type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFile2Change} className="hidden" />

              {upload2State === 'uploading' && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Loader2 size={14} className="text-blue-500 animate-spin shrink-0" />
                  <p className="text-xs text-blue-700">{t('orders.create.uploading')}</p>
                </div>
              )}
              {upload2State === 'done' && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                  <p className="text-xs font-medium text-green-800 truncate flex-1">{awb2FileName}</p>
                  {awb2FileURL && (
                    <a href={awb2FileURL} target="_blank" rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1 shrink-0">
                      <ExternalLink size={11} /> {t('common.open')}
                    </a>
                  )}
                  <button type="button" onClick={() => fileInput2Ref.current?.click()}
                    className="text-xs text-gray-500 hover:underline shrink-0">{t('common.replace')}</button>
                </div>
              )}
              {upload2State === 'error' && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                  <p className="text-xs text-red-700 flex-1">{t('orders.create.errorManual')}</p>
                  <button type="button" onClick={() => fileInput2Ref.current?.click()}
                    className="text-xs text-blue-600 shrink-0">{t('common.retry')}</button>
                </div>
              )}
              {upload2State === 'idle' && (
                <button type="button" onClick={() => fileInput2Ref.current?.click()}
                  className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition">
                  <Upload size={18} className="text-gray-400 shrink-0" />
                  <div className="text-left">
                    <p className="text-xs font-medium text-gray-700">{t('orders.create.upload2LegAwbBtn')}</p>
                    <p className="text-xs text-gray-400">{t('orders.create.upload2LegAwbHint')}</p>
                  </div>
                </button>
              )}
              {awb2PreviewURL && upload2State !== 'idle' && (
                <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                  <p className="text-xs text-gray-500 px-3 py-1.5 bg-gray-50 border-b">{t('orders.create.awb2DocPreview')}</p>
                  {awb2IsPDF
                    ? <embed src={awb2PreviewURL} type="application/pdf" className="w-full" style={{ height: '220px' }} />
                    : <img src={awb2PreviewURL} alt="AWB 2" className="w-full object-contain max-h-52" />
                  }
                </div>
              )}
            </div>

          </div>

          {/* IATA поля из AWB */}
          {(ocrState === 'done' || awbFileKey) && (
            <div className="border border-gray-200 rounded-lg p-4">
              <p className={sec}>{t('orders.create.awbDataIata')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>{t('orders.create.awbNumber')}</label>
                  <input value={awb.awb_number}
                    onChange={e => setAWB(p => ({...p, awb_number: e.target.value}))}
                    className={inp} placeholder="410-00192566" />
                </div>
                <div>
                  <label className={lbl}>{t('orders.create.refNumber')}</label>
                  <input value={awb.reference_number}
                    onChange={e => setAWB(p => ({...p, reference_number: e.target.value}))}
                    className={inp} />
                </div>
                <div>
                  <label className={lbl}>{t('orders.create.shipper')}</label>
                  <input value={awb.shipper_name}
                    onChange={e => setAWB(p => ({...p, shipper_name: e.target.value}))}
                    className={inp} />
                </div>
                <div>
                  <label className={lbl}>{t('orders.create.consignee')}</label>
                  <input value={awb.consignee_name}
                    onChange={e => setAWB(p => ({...p, consignee_name: e.target.value}))}
                    className={inp} />
                </div>
                <div>
                  <label className={lbl}>{t('orders.create.goodsDesc')}</label>
                  <input value={awb.goods_description}
                    onChange={e => setAWB(p => ({...p, goods_description: e.target.value}))}
                    className={inp} />
                </div>
                <div>
                  <label className={lbl}>{t('orders.create.paymentMode')}</label>
                  <select value={awb.mode_of_payment}
                    onChange={e => setAWB(p => ({...p, mode_of_payment: e.target.value}))}
                    className={inp}>
                    <option value="Prepaid">Prepaid</option>
                    <option value="Collect">Collect</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 4 — ФИНАНСЫ
            AMOUNT | ADD AMOUNT | INV USD | Rate | INV AED | Invoice Status | CX NOTIFIED
        ══════════════════════════════════════════════════════════════════════ */}
        <div className={tab === 'finance' ? 'space-y-4' : 'hidden'}>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>{t('orders.create.amountLabel')}</label>
              <div className="flex gap-2">
                <input type="number" min="0" step="0.01" value={fin.total_amount}
                  onChange={e => setFin(p => ({...p, total_amount: e.target.value}))}
                  className={inp} placeholder="0.00" />
                <select value={fin.currency}
                  onChange={e => setFin(p => ({...p, currency: e.target.value as Currency}))}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-24">
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={lbl}>{t('orders.create.addAmountLabel')}</label>
              <input type="number" min="0" step="0.01" value={fin.add_amount}
                onChange={e => setFin(p => ({...p, add_amount: e.target.value}))}
                className={inp} placeholder="0.00" />
            </div>
          </div>

          {/* Инвойс */}
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
                <label className={lbl}>Rate (USD→AED)</label>
                <input type="number" min="0" step="0.0001" value={fin.exchange_rate}
                  onChange={e => handleRateChange(e.target.value)}
                  className={inp} />
              </div>
              <div>
                <label className={lbl}>{t('orders.create.invAmountAedLabel')}</label>
                <input type="number" min="0" step="0.01" value={fin.inv_amount_aed}
                  onChange={e => setFin(p => ({...p, inv_amount_aed: e.target.value}))}
                  className={`${inp} bg-gray-50`} placeholder={t('orders.create.autoLabel')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className={lbl}>Invoice Status</label>
                <select value={fin.invoice_status}
                  onChange={e => setFin(p => ({...p, invoice_status: e.target.value}))}
                  className={inp}>
                  {INVOICE_STATUSES.map(s => (
                    <option key={s} value={s}>{s || t('orders.create.invoiceNotSet')}</option>
                  ))}
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

          {/* Итог */}
          {(fin.inv_amount_usd || fin.inv_amount_aed) && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 space-y-1">
              {fin.total_amount && (
                <div className="flex justify-between">
                  <span>AMOUNT:</span>
                  <span className="font-medium">{fin.total_amount} {fin.currency}</span>
                </div>
              )}
              {fin.add_amount && (
                <div className="flex justify-between">
                  <span>ADD AMOUNT:</span>
                  <span className="font-medium">{fin.add_amount} {fin.currency}</span>
                </div>
              )}
              {fin.inv_amount_usd && (
                <div className="flex justify-between border-t pt-1">
                  <span className="font-semibold">INV AMOUNT:</span>
                  <span className="font-bold text-blue-700">
                    ${fin.inv_amount_usd} / AED {fin.inv_amount_aed}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 5 — НАЗНАЧЕНО
        ══════════════════════════════════════════════════════════════════════ */}
        <div className={tab === 'assigned' ? 'space-y-3' : 'hidden'}>
          {/* Не назначен */}
          <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
            !main.assigned_to_id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
          }`}>
            <input type="radio" name="assigned_user" value=""
              checked={!main.assigned_to_id}
              onChange={() => setMain(p => ({...p, assigned_to_id: ''}))}
              className="hidden" />
            <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
              <span className="text-gray-500 text-sm font-bold">—</span>
            </div>
            <p className="text-sm font-medium text-gray-600">{t('orders.create.notAssigned')}</p>
          </label>

          {/* Карточки пользователей */}
          {(users as User[]).filter(u => u.active).map(u => (
            <label key={u.id} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
              main.assigned_to_id === String(u.id)
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}>
              <input type="radio" name="assigned_user" value={u.id}
                checked={main.assigned_to_id === String(u.id)}
                onChange={() => setMain(p => ({...p, assigned_to_id: String(u.id)}))}
                className="hidden" />
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-bold">{u.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{u.name}</p>
                <p className="text-xs text-gray-500 truncate">{u.email}</p>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                {u.role}
              </span>
            </label>
          ))}

          {(users as User[]).filter(u => u.active).length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">{t('users.noUsers')}</p>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
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
            <button type="submit"
              disabled={mutation.isPending || ocrState === 'uploading' || ocrState === 'ocr'}
              className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50">
              {mutation.isPending ? t('orders.create.creating') : t('orders.create.createBtn')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
