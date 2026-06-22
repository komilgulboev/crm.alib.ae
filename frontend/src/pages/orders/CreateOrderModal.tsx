import { useRef, useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Loader2, CheckCircle2, AlertCircle, ExternalLink, X, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/ui/Modal'
import { ordersApi } from '../../api/orders'
import { clientsApi } from '../../api/clients'
import { usersApi } from '../../api/users'
import { filesApi } from '../../api/files'
import { catalogsApi } from '../../api/catalogs'
import { extractAWBFromFile, isPDFFile } from '../../lib/awbOcr'
import type { AWBData, Currency, NTR } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

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

const DEFAULT_DOC_CATEGORIES = [
  { value: 'invoice',      label: 'Invoice' },
  { value: 'packing_list', label: 'Packing List' },
  { value: 'boe',          label: 'BOE' },
]

const DEFAULT_JOB_TYPES = [
  { value: 'T-IN',  label: 'T-IN' },
  { value: 'L-EXP', label: 'L-EXP' },
  { value: 'T-OUT', label: 'T-OUT' },
  { value: 'T-EXP', label: 'T-EXP' },
  { value: 'GEN',   label: 'GEN' },
]

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

type Tab = 'main' | 'cargo' | 'awb' | 'finance' | 'documents'

type LocalDoc = {
  localId: string
  category: string
  file_key: string
  file_url: string
  file_name: string
  state: 'uploading' | 'done' | 'error'
}

export default function CreateOrderModal({ open, onClose }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInput2Ref = useRef<HTMLInputElement>(null)
  const docFileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('main')
  const [error, setError] = useState('')

  // ── Tab 1: Main ────────────────────────────────────────────────────────────
  const [supplierRows, setSupplierRows] = useState<{ supplier: string; job_type: string }[]>([{ supplier: '', job_type: 'T-IN' }])
  const [shippers, setShippers] = useState<string[]>([])
  const [shipperSelectValue, setShipperSelectValue] = useState('')
  const [main, setMain] = useState({
    our_ref: '',
    client_id: '',
    flight_type: '',
    status: 'new',
    job_status: 'OPEN',
    assigned_to_id: '',
    payment_timing: 'on_dispatch',
    priority: 'ROUTINE',
  })

  // ── Tab 2: Cargo ───────────────────────────────────────────────────────────
  const [cargo, setCargo] = useState({
    origin_city: '',
    transit_city: '',
    dest_city: '',
    ntr: 'GEN' as NTR,
    pieces: '1',
    weight_kg: '',
    chargeable_weight: '',
    handed_over: false,
    handed_over_by_id: '',
    boe_number: '',
    consignee_2: '',
    receiver_name: '',
    receiver_phone: '',
    notes: '',
    instr: '',
  })
  const [dims, setDims] = useState<DimRow[]>([{ l: '', w: '', h: '' }])

  // ── Tab 3: AWB ─────────────────────────────────────────────────────────────
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

  const [awb2FileURL, setAWB2FileURL] = useState('')
  const [awb2FileKey, setAWB2FileKey] = useState('')
  const [awb2FileName, setAWB2FileName] = useState('')
  const [awb2PreviewURL, setAWB2PreviewURL] = useState('')
  const [awb2IsPDF, setAWB2IsPDF] = useState(false)
  const [upload2State, setUpload2State] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')

  // ── Tab 5: Documents ───────────────────────────────────────────────────────
  const [localDocs, setLocalDocs] = useState<LocalDoc[]>([])
  const [docCategory, setDocCategory] = useState('')

  // ── Tab 4: Finance ─────────────────────────────────────────────────────────
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

  // ── Data ──────────────────────────────────────────────────────────────────
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

  const { data: docCatalog = [] } = useQuery({
    queryKey: ['catalogs', 'doc_category'],
    queryFn: () => catalogsApi.list('doc_category', true).then(r => r.data),
  })

  const { data: shipperCatalog = [] } = useQuery({
    queryKey: ['catalogs', 'shipper'],
    queryFn: () => catalogsApi.list('shipper', true).then(r => r.data),
  })

  const docCategories = docCatalog.length > 0
    ? docCatalog.map(c => ({ value: c.value, label: c.label }))
    : DEFAULT_DOC_CATEGORIES

  const effectiveJobTypes = jobTypes.length > 0 ? jobTypes : DEFAULT_JOB_TYPES

  // ── Cargo auto-calc ───────────────────────────────────────────────────────
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

  // ── Mutations ─────────────────────────────────────────────────────────────
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

  // ── Supplier + Job Type rows ───────────────────────────────────────────────
  const addSupplierRow = () => setSupplierRows(p => [...p, { supplier: '', job_type: effectiveJobTypes[0]?.value || '' }])
  const removeSupplierRow = (i: number) => setSupplierRows(p => p.length > 1 ? p.filter((_, idx) => idx !== i) : p)
  const updateSupplierRow = (i: number, field: 'supplier' | 'job_type', value: string) =>
    setSupplierRows(p => p.map((r, idx) => idx === i ? { ...r, [field]: value } : r))

  // ── Shipper multi-select ───────────────────────────────────────────────────
  const addShipper = () => {
    const v = shipperSelectValue.trim()
    if (v && !shippers.includes(v)) setShippers(p => [...p, v])
    setShipperSelectValue('')
  }
  const removeShipper = (s: string) => setShippers(p => p.filter(x => x !== s))

  // ── AWB file handling ─────────────────────────────────────────────────────
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

  // ── Document upload ───────────────────────────────────────────────────────
  const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const cat = docCategory || docCategories[0]?.value || 'other'
    const newDocs: LocalDoc[] = files.map(f => ({
      localId: `${Date.now()}-${Math.random()}`,
      category: cat, file_key: '', file_url: '', file_name: f.name, state: 'uploading',
    }))
    setLocalDocs(prev => [...prev, ...newDocs])
    await Promise.all(files.map(async (file, i) => {
      const { localId } = newDocs[i]
      try {
        const res = await uploadMutation.mutateAsync(file)
        setLocalDocs(prev => prev.map(d => d.localId === localId
          ? { ...d, file_key: res.data.file_key, file_url: res.data.file_url, state: 'done' } : d))
      } catch {
        setLocalDocs(prev => prev.map(d => d.localId === localId ? { ...d, state: 'error' } : d))
      }
    }))
    e.target.value = ''
  }

  const removeLocalDoc = (localId: string) => setLocalDocs(prev => prev.filter(d => d.localId !== localId))

  // ── Finance auto-calc ─────────────────────────────────────────────────────
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

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setSupplierRows([{ supplier: '', job_type: 'T-IN' }])
    setShippers([])
    setShipperSelectValue('')
    setMain({ our_ref: '', client_id: '', flight_type: '', status: 'new', job_status: 'OPEN',
      assigned_to_id: '', payment_timing: 'on_dispatch', priority: 'ROUTINE' })
    setCargo({ origin_city: '', transit_city: '', dest_city: '', ntr: 'GEN', pieces: '1',
      weight_kg: '', chargeable_weight: '', handed_over: false, handed_over_by_id: '',
      boe_number: '', consignee_2: '', receiver_name: '',
      receiver_phone: '', notes: '', instr: '' })
    setDims([{ l: '', w: '', h: '' }])
    setDocs({ final_awb: '', xbd_awb: '', svo_awb: '' })
    setAWB(emptyAWB())
    setAWBFileURL(''); setAWBFileKey(''); setAWBFileName('')
    setAWBPreviewURL(''); setAWBIsPDF(false)
    setOcrState('idle'); setOcrProgress(0)
    setAWB2FileURL(''); setAWB2FileKey(''); setAWB2FileName('')
    setAWB2PreviewURL(''); setAWB2IsPDF(false); setUpload2State('idle')
    setLocalDocs([]); setDocCategory('')
    setFin({ total_amount: '', add_amount: '', currency: 'USD', exchange_rate: '3.67',
      inv_amount_usd: '', inv_amount_aed: '', invoice_status: '', cx_notified: false })
    setError(''); setTab('main')
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!main.client_id) { setError(t('orders.create.errorSelectClient')); return }
    setError('')
    mutation.mutate({
      our_ref:        main.our_ref,
      client_id:      Number(main.client_id),
      suppliers: supplierRows
        .filter(r => r.supplier.trim())
        .map(r => ({ supplier: r.supplier.trim(), job_type: r.job_type })),
      flight_type:    main.flight_type,
      status:         main.status,
      job_status:     main.job_status,
      assigned_to_id: main.assigned_to_id ? Number(main.assigned_to_id) : null,
      payment_timing: main.payment_timing,
      priority:       main.priority,
      origin_country: '',
      origin_city:    cargo.origin_city,
      transit_city:   cargo.transit_city,
      dest_country:   '',
      dest_city:      cargo.dest_city,
      ntr:            cargo.ntr,
      pieces:         Number(cargo.pieces) || 1,
      weight_kg:      Number(cargo.weight_kg) || 0,
      chargeable_weight: autoCWT > 0 ? autoCWT : (Number(cargo.chargeable_weight) || 0),
      dimensions:     serializeDims(dims),
      handed_over:    cargo.handed_over,
      handed_over_by_id: cargo.handed_over_by_id ? Number(cargo.handed_over_by_id) : null,
      boe_number:     cargo.boe_number,
      documents: localDocs.filter(d => d.state === 'done').map(d => ({
        category: d.category, file_key: d.file_key, file_url: d.file_url, file_name: d.file_name,
      })),
      shipper_2:      shippers.join(','),
      consignee_2:    cargo.consignee_2,
      receiver_name:  cargo.receiver_name,
      receiver_phone: cargo.receiver_phone,
      notes:          cargo.notes,
      instr:          cargo.instr,
      final_awb: docs.final_awb,
      xbd_awb:   docs.xbd_awb,
      svo_awb:   docs.svo_awb,
      awb: awbFileKey ? { ...awb, file_key: awbFileKey, file_url: awbFileURL } : undefined,
      awb2_file_key: awb2FileKey || undefined,
      awb2_file_url: awb2FileURL || undefined,
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

  // ── Styles ────────────────────────────────────────────────────────────────
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'
  const sec = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'

  const TABS: { key: Tab; label: string }[] = [
    { key: 'main',      label: t('orders.create.tabMain') },
    { key: 'cargo',     label: t('orders.create.tabCargo') },
    { key: 'awb',       label: t('orders.create.tabAwb') },
    { key: 'finance',   label: t('orders.create.tabFinance') },
    { key: 'documents', label: 'Documents' },
  ]

  return (
    <Modal open={open} onClose={onClose} title={t('orders.create.title')} size="xl">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5 -mx-6 px-6 overflow-x-auto">
        {TABS.map(tb => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition ${
              tab === tb.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tb.label}
            {tb.key === 'awb' && (awbFileKey || awb2FileKey) && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-green-500 inline-block" />
            )}
            {tb.key === 'documents' && localDocs.filter(d => d.state === 'done').length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                {localDocs.filter(d => d.state === 'done').length}
              </span>
            )}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 1 — MAIN
        ══════════════════════════════════════════════════════════════════════ */}
        <div className={tab === 'main' ? 'space-y-4' : 'hidden'}>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>OUR REF</label>
              <input value={main.our_ref} onChange={e => setMain(p => ({...p, our_ref: e.target.value}))}
                className={inp} placeholder={t('orders.create.ourRefPlaceholder')} />
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

          {/* Supplier + Job Type rows */}
          <div>
            <label className={lbl}>{t('orders.create.suppliersLabel')}</label>
            <div className="space-y-2">
              {supplierRows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={row.supplier}
                    onChange={e => updateSupplierRow(i, 'supplier', e.target.value)}
                    className={inp}
                    placeholder={t('orders.create.supplierPlaceholder')}
                  />
                  <select
                    value={row.job_type}
                    onChange={e => updateSupplierRow(i, 'job_type', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none w-40">
                    {effectiveJobTypes.map(jt => <option key={jt.value} value={jt.value}>{jt.label}</option>)}
                  </select>
                  <button type="button" onClick={() => removeSupplierRow(i)}
                    disabled={supplierRows.length === 1}
                    className="px-2.5 py-2 border border-gray-300 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-30">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addSupplierRow}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
              <Plus size={13} /> {t('orders.create.addSupplierRow')}
            </button>
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
                onChange={e => setMain(p => ({...p, status: e.target.value}))}
                className={inp}>
                {statuses.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
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
            TAB 2 — CARGO
        ══════════════════════════════════════════════════════════════════════ */}
        <div className={tab === 'cargo' ? 'space-y-4' : 'hidden'}>

          {/* Route: ORG → TRANSIT → DES */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>{t('orders.create.orgLabel')}</label>
              <input value={cargo.origin_city}
                onChange={e => setCargo(p => ({...p, origin_city: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)}))}
                className={`${inp} uppercase tracking-widest font-mono`} placeholder="DXB" maxLength={3} />
            </div>
            <div>
              <label className={lbl}>TRANSIT</label>
              <input value={cargo.transit_city}
                onChange={e => setCargo(p => ({...p, transit_city: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)}))}
                className={`${inp} uppercase tracking-widest font-mono`} placeholder="DOH" maxLength={3} />
            </div>
            <div>
              <label className={lbl}>{t('orders.create.desLabel')}</label>
              <input value={cargo.dest_city}
                onChange={e => setCargo(p => ({...p, dest_city: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)}))}
                className={`${inp} uppercase tracking-widest font-mono`} placeholder="CAI" maxLength={3} />
            </div>
          </div>

          {/* Cargo props */}
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

            <div className="mt-3 grid grid-cols-2 gap-3 items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={cargo.handed_over}
                  onChange={e => setCargo(p => ({...p, handed_over: e.target.checked}))}
                  className="accent-blue-600 w-4 h-4" />
                <span className="text-sm font-medium text-gray-700">{t('orders.create.handedOver')}</span>
              </label>
              <div>
                <label className={lbl}>Handed Over By</label>
                <select value={cargo.handed_over_by_id}
                  onChange={e => setCargo(p => ({...p, handed_over_by_id: e.target.value}))} className={inp}>
                  <option value="">— не выбрано —</option>
                  {(users as {id: number; name: string}[]).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className={lbl}>BOE# (Bill of Entry)</label>
            <input value={cargo.boe_number}
              onChange={e => setCargo(p => ({...p, boe_number: e.target.value}))}
              className={inp} placeholder="20100313..." />
          </div>

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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>{t('orders.create.shipper2')}</label>
              <div className="flex gap-2">
                <select
                  value={shipperSelectValue}
                  onChange={e => setShipperSelectValue(e.target.value)}
                  className={inp}>
                  <option value="">{t('orders.create.shipperSelectPlaceholder')}</option>
                  {shipperCatalog.filter(s => !shippers.includes(s.value)).map(s => (
                    <option key={s.id} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <button type="button" onClick={addShipper} disabled={!shipperSelectValue}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 flex items-center gap-1">
                  <Plus size={14} />
                </button>
              </div>
              {shippers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {shippers.map(s => {
                    const entry = shipperCatalog.find(c => c.value === s)
                    return (
                      <span key={s} className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-full">
                        {entry?.label || s}
                        {entry?.linked_value && (
                          <span className="px-1 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-mono">{entry.linked_value}</span>
                        )}
                        <button type="button" onClick={() => removeShipper(s)}
                          className="text-blue-400 hover:text-blue-700 transition">
                          <X size={10} />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
            <div>
              <label className={lbl}>{t('orders.create.consignee2')}</label>
              <textarea value={cargo.consignee_2}
                onChange={e => setCargo(p => ({...p, consignee_2: e.target.value}))}
                className={inp} rows={3}
                placeholder={t('orders.create.companyDetailsPlaceholder')} />
            </div>
          </div>

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
            TAB 3 — AWB
        ══════════════════════════════════════════════════════════════════════ */}
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

          <div className="grid grid-cols-2 gap-4">
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
            TAB 4 — FINANCE
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
            TAB 5 — DOCUMENTS
        ══════════════════════════════════════════════════════════════════════ */}
        <div className={tab === 'documents' ? 'space-y-4' : 'hidden'}>

          {/* Upload form */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <p className={sec}>Attach Document</p>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className={lbl}>Category</label>
                <select value={docCategory}
                  onChange={e => setDocCategory(e.target.value)}
                  className={inp}>
                  {docCategories.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <input ref={docFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  multiple onChange={handleDocFileChange} className="hidden" />
                <button type="button" onClick={() => {
                    if (!docCategory && docCategories.length > 0) setDocCategory(docCategories[0].value)
                    docFileRef.current?.click()
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition">
                  <Upload size={14} /> Upload File(s)
                </button>
              </div>
            </div>
          </div>

          {/* Document list */}
          {localDocs.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No documents attached yet. Select a category and upload files above.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="divide-y divide-gray-100">
                {localDocs.map(doc => {
                  const catLabel = docCategories.find(c => c.value === doc.category)?.label || doc.category
                  return (
                    <div key={doc.localId} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded shrink-0">{catLabel}</span>
                      {doc.state === 'uploading' && <Loader2 size={13} className="text-blue-500 animate-spin shrink-0" />}
                      {doc.state === 'done'      && <CheckCircle2 size={13} className="text-green-500 shrink-0" />}
                      {doc.state === 'error'     && <AlertCircle size={13} className="text-red-500 shrink-0" />}
                      <span className="flex-1 text-sm text-gray-700 truncate">{doc.file_name}</span>
                      {doc.state === 'done' && doc.file_url && (
                        <a href={doc.file_url} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 shrink-0">
                          <ExternalLink size={11} /> Open
                        </a>
                      )}
                      <button type="button" onClick={() => removeLocalDoc(doc.localId)}
                        className="text-gray-300 hover:text-red-500 transition shrink-0 ml-1">
                        <X size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

        <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-100">
          <div className="flex gap-2 text-xs text-gray-400 flex-wrap">
            {TABS.map((tb, i) => (
              <button key={tb.key} type="button" onClick={() => setTab(tb.key)}
                className={`px-2 py-1 rounded transition ${
                  tab === tb.key ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100'
                }`}>
                {i + 1}. {tb.label}
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
