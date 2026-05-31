import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { ordersApi } from '../../api/orders'
import { clientsApi } from '../../api/clients'
import { usersApi } from '../../api/users'
import { filesApi } from '../../api/files'
import { extractAWBFromFile, isPDFFile } from '../../lib/awbOcr'
import type { AWBData, Currency, JobType, NTR, Order } from '../../types'

interface Props {
  order: Order | null
  onClose: () => void
}

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'T-IN',  label: 'T-IN  — Transport Import' },
  { value: 'L-EXP', label: 'L-EXP — Local Export' },
  { value: 'T-OUT', label: 'T-OUT — Transport Out' },
  { value: 'T-EXP', label: 'T-EXP — Transport Export' },
  { value: 'GEN',   label: 'GEN   — General' },
]

const NTR_TYPES: { value: NTR; label: string }[] = [
  { value: 'GEN', label: 'GEN — General' },
  { value: 'DG',  label: 'DG  — Dangerous Goods' },
  { value: 'PER', label: 'PER — Perishables' },
  { value: 'VAL', label: 'VAL — Valuables' },
  { value: 'EAP', label: 'EAP — Express Air Parcel' },
]

const STATUSES = [
  { value: 'new',                label: 'Новый' },
  { value: 'accepted',          label: 'Принят' },
  { value: 'collection_details',label: 'Collection Details' },
  { value: 'warehouse',         label: 'На складе' },
  { value: 'dispatched',        label: 'Dispatched' },
  { value: 'in_transit',        label: 'In Transit' },
  { value: 'customs',           label: 'Таможня' },
  { value: 'departed',          label: 'Departed' },
  { value: 'arrived',           label: 'Arrived' },
  { value: 'handed_over',       label: 'Handed Over' },
  { value: 'delivered',         label: 'Delivered' },
  { value: 'completed',         label: 'Completed' },
  { value: 'closed',            label: 'Closed' },
  { value: 'problem',           label: 'Проблема' },
]

const INVOICE_STATUSES = ['', 'Inv Sent', 'Pending', 'Paid', 'Cancelled']
const CURRENCIES: Currency[] = ['USD', 'AED', 'TJS', 'RUB']

type Tab = 'main' | 'cargo' | 'awb' | 'finance'

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
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('main')
  const [error, setError] = useState('')

  // ── State ──────────────────────────────────────────────────────────────────
  const [main, setMain] = useState({
    our_ref: '', supplier: '', client_id: '', job_type: 'T-IN' as JobType,
    status: 'new', job_status: 'OPEN', assigned_to_id: '', payment_timing: 'on_dispatch',
  })
  const [cargo, setCargo] = useState({
    origin_city: '', dest_city: '', ntr: 'GEN' as NTR, pieces: '1',
    weight_kg: '', chargeable_weight: '', dimensions: '', handed_over: false,
    boe_number: '', shipper_2: '', consignee_2: '', receiver_name: '',
    receiver_phone: '', notes: '', instr: '',
  })
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
      status:         order.status || 'new',
      job_status:     order.job_status || 'OPEN',
      assigned_to_id: order.assigned_to_id ? String(order.assigned_to_id) : '',
      payment_timing: order.payment_timing || 'on_dispatch',
    })
    setCargo({
      origin_city:       order.origin_city || '',
      dest_city:         order.dest_city || '',
      ntr:               (order.ntr as NTR) || 'GEN',
      pieces:            String(order.pieces || 1),
      weight_kg:         order.weight_kg ? String(order.weight_kg) : '',
      chargeable_weight: order.chargeable_weight ? String(order.chargeable_weight) : '',
      dimensions:        order.dimensions || '',
      handed_over:       order.handed_over || false,
      boe_number:        order.boe_number || '',
      shipper_2:         order.shipper_2 || '',
      consignee_2:       order.consignee_2 || '',
      receiver_name:     order.receiver_name || '',
      receiver_phone:    order.receiver_phone || '',
      notes:             order.notes || '',
      instr:             order.instr || '',
    })
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
  }, [order])

  // ── Данные ────────────────────────────────────────────────────────────────
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
    onError: () => setError('Ошибка при сохранении'),
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
    if (!main.client_id) { setError('Выберите клиента'); return }
    setError('')
    updateMutation.mutate({
      our_ref: main.our_ref, supplier: main.supplier,
      client_id: Number(main.client_id), job_type: main.job_type,
      status: main.status, job_status: main.job_status,
      assigned_to_id: main.assigned_to_id ? Number(main.assigned_to_id) : null,
      payment_timing: main.payment_timing,
      origin_country: '', origin_city: cargo.origin_city,
      dest_country: '', dest_city: cargo.dest_city,
      ntr: cargo.ntr, pieces: Number(cargo.pieces) || 1,
      weight_kg: Number(cargo.weight_kg) || 0,
      chargeable_weight: Number(cargo.chargeable_weight) || 0,
      dimensions: cargo.dimensions, handed_over: cargo.handed_over,
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
    { key: 'main',    label: 'Основное' },
    { key: 'cargo',   label: 'Груз' },
    { key: 'awb',     label: 'AWB / Документы' },
    { key: 'finance', label: 'Финансы' },
  ]

  if (!order) return null

  return (
    <Modal open={!!order} onClose={onClose}
      title={`Редактирование — ${order.tracking_number}`} size="xl">

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
                className={inp} placeholder="Ваш референс" />
            </div>
            <div>
              <label className={lbl}>JOB TYPE</label>
              <select value={main.job_type}
                onChange={e => setMain(p => ({...p, job_type: e.target.value as JobType}))} className={inp}>
                {JOB_TYPES.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
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
                <option value="">— Выберите клиента —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>ASSIGNED</label>
              <select value={main.assigned_to_id}
                onChange={e => setMain(p => ({...p, assigned_to_id: e.target.value}))} className={inp}>
                <option value="">— Не назначен —</option>
                {(users as {id: number; name: string}[]).map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>STATUS</label>
              <select value={main.status}
                onChange={e => setMain(p => ({...p, status: e.target.value}))} className={inp}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
              <label className={lbl}>Когда принять оплату</label>
              <select value={main.payment_timing}
                onChange={e => setMain(p => ({...p, payment_timing: e.target.value}))} className={inp}>
                <option value="on_dispatch">При отправке</option>
                <option value="on_receipt">При получении</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── TAB 2: ГРУЗ ── */}
        <div className={tab === 'cargo' ? 'space-y-4' : 'hidden'}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>ORG (аэропорт отправки)</label>
              <input value={cargo.origin_city}
                onChange={e => setCargo(p => ({...p, origin_city: e.target.value}))}
                className={inp} placeholder="DXB, MAN, TOO..." />
            </div>
            <div>
              <label className={lbl}>DES (аэропорт назначения)</label>
              <input value={cargo.dest_city}
                onChange={e => setCargo(p => ({...p, dest_city: e.target.value}))}
                className={inp} placeholder="CAI, DYU, SVO..." />
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <p className={sec}>Характеристики груза</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>NTR</label>
                <select value={cargo.ntr}
                  onChange={e => setCargo(p => ({...p, ntr: e.target.value as NTR}))} className={inp}>
                  {NTR_TYPES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>#PC (мест)</label>
                <input type="number" min="1" value={cargo.pieces}
                  onChange={e => setCargo(p => ({...p, pieces: e.target.value}))} className={inp} />
              </div>
              <div>
                <label className={lbl}>KG (вес)</label>
                <input type="number" min="0" step="0.01" value={cargo.weight_kg}
                  onChange={e => setCargo(p => ({...p, weight_kg: e.target.value}))}
                  className={inp} placeholder="0.00" />
              </div>
              <div>
                <label className={lbl}>CWT (опл. вес)</label>
                <input type="number" min="0" step="0.01" value={cargo.chargeable_weight}
                  onChange={e => setCargo(p => ({...p, chargeable_weight: e.target.value}))}
                  className={inp} placeholder="0.00" />
              </div>
              <div className="col-span-2">
                <label className={lbl}>DIMS</label>
                <input value={cargo.dimensions}
                  onChange={e => setCargo(p => ({...p, dimensions: e.target.value}))}
                  className={inp} placeholder="45x32x61" />
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
              <label className={lbl}>Получатель</label>
              <input value={cargo.receiver_name}
                onChange={e => setCargo(p => ({...p, receiver_name: e.target.value}))} className={inp} />
            </div>
            <div>
              <label className={lbl}>Телефон получателя</label>
              <input value={cargo.receiver_phone}
                onChange={e => setCargo(p => ({...p, receiver_phone: e.target.value}))} className={inp} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>SHIPPER 2</label>
              <textarea value={cargo.shipper_2}
                onChange={e => setCargo(p => ({...p, shipper_2: e.target.value}))}
                className={inp} rows={3} placeholder="Полные данные отправителя..." />
            </div>
            <div>
              <label className={lbl}>CONSIGNEE 2</label>
              <textarea value={cargo.consignee_2}
                onChange={e => setCargo(p => ({...p, consignee_2: e.target.value}))}
                className={inp} rows={3} placeholder="Полные данные получателя..." />
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
        </div>

        {/* ── TAB 3: AWB ── */}
        <div className={tab === 'awb' ? 'space-y-4' : 'hidden'}>
          <div className="border border-gray-200 rounded-lg p-4">
            <p className={sec}>Номера AWB</p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className={lbl}>FINAL AWB</label>
                <input value={docs.final_awb}
                  onChange={e => setDocs(p => ({...p, final_awb: e.target.value}))}
                  className={inp} placeholder="176-26685746" />
              </div>
              <div>
                <label className={lbl}>XBD MILE AWB</label>
                <input value={docs.xbd_awb}
                  onChange={e => setDocs(p => ({...p, xbd_awb: e.target.value}))}
                  className={inp} />
              </div>
              <div>
                <label className={lbl}>MLE-SVO AWB</label>
                <input value={docs.svo_awb}
                  onChange={e => setDocs(p => ({...p, svo_awb: e.target.value}))}
                  className={inp} />
              </div>
            </div>
          </div>

          {/* Загрузка AWB */}
          <div>
            <p className={sec}>AWB документ</p>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange} className="hidden" />

            {ocrState === 'uploading' && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Loader2 size={16} className="text-blue-500 animate-spin" />
                <p className="text-sm text-blue-700">Загрузка...</p>
              </div>
            )}
            {ocrState === 'ocr' && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="text-blue-500 animate-spin" />
                  <p className="text-sm text-blue-700">OCR... {ocrProgress}%</p>
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
                    {awbFileName || 'AWB документ загружен'}
                  </p>
                  <p className="text-xs text-green-600">
                    {ocrConfidence >= 90 ? 'Данные точные' : `Уверенность: ${ocrConfidence}%`}
                  </p>
                </div>
                {awbFileURL && (
                  <a href={awbFileURL} target="_blank" rel="noreferrer"
                    className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                    <ExternalLink size={12} /> Открыть
                  </a>
                )}
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-gray-500 hover:underline">Заменить</button>
              </div>
            )}
            {ocrState === 'error' && (
              <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle size={16} className="text-red-500" />
                <p className="text-sm text-red-700">Ошибка — заполните вручную</p>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="ml-auto text-xs text-blue-600">Повторить</button>
              </div>
            )}
            {ocrState === 'idle' && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 p-5 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition">
                <Upload size={20} className="text-gray-400" />
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-700">Загрузить AWB документ</p>
                  <p className="text-xs text-gray-400">PDF или JPG/PNG</p>
                </div>
              </button>
            )}

            {awbPreviewURL && ocrState !== 'idle' && (
              <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                <p className="text-xs text-gray-500 px-3 py-1.5 bg-gray-50 border-b">AWB документ</p>
                {awbIsPDF
                  ? <embed src={awbPreviewURL} type="application/pdf" className="w-full" style={{ height: '280px' }} />
                  : <img src={awbPreviewURL} alt="AWB" className="w-full object-contain max-h-64" />
                }
              </div>
            )}
          </div>

          {awbFileKey && (
            <div className="border border-gray-200 rounded-lg p-4">
              <p className={sec}>Данные AWB (IATA)</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Номер AWB', field: 'awb_number', placeholder: '410-00192566' },
                  { label: 'Референс', field: 'reference_number', placeholder: '' },
                  { label: 'Грузоотправитель', field: 'shipper_name', placeholder: '' },
                  { label: 'Грузополучатель', field: 'consignee_name', placeholder: '' },
                  { label: 'Описание товара', field: 'goods_description', placeholder: '' },
                ].map(f => (
                  <div key={f.field}>
                    <label className={lbl}>{f.label}</label>
                    <input value={(awb as unknown as Record<string, string>)[f.field] || ''}
                      onChange={e => setAWB(p => ({...p, [f.field]: e.target.value}))}
                      className={inp} placeholder={f.placeholder} />
                  </div>
                ))}
                <div>
                  <label className={lbl}>Вид оплаты AWB</label>
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
            <p className={sec}>Инвойс</p>
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
                  {INVOICE_STATUSES.map(s => <option key={s} value={s}>{s || '— не указан —'}</option>)}
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
              Отмена
            </button>
            <button type="submit" disabled={updateMutation.isPending}
              className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50">
              {updateMutation.isPending ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
