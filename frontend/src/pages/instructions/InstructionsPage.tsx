import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Mail, Send, Settings, Plus, Trash2, Edit2, Check, X,
  AlertCircle, CheckCircle2, Loader2, ChevronDown, ChevronUp,
  ExternalLink, Eye,
} from 'lucide-react'
import { ordersApi } from '../../api/orders'
import { instructionsApi } from '../../api/instructions'
import { useAuthStore } from '../../store/auth'
import type { Order, TransitEmailConfig } from '../../types'

// ── Transit email config editor ──────────────────────────────────────────────

function TransitEmailConfigSection() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<TransitEmailConfig | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ transit_code: '', emails: '', description: '', active: true })

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['transit-emails'],
    queryFn: () => instructionsApi.listConfigs().then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: (d: typeof form) => instructionsApi.createConfig(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transit-emails'] })
      setCreating(false)
      setForm({ transit_code: '', emails: '', description: '', active: true })
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TransitEmailConfig> }) =>
      instructionsApi.updateConfig(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transit-emails'] })
      setEditing(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => instructionsApi.deleteConfig(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transit-emails'] }),
  })

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Настройка email по транзитным точкам</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition"
        >
          <Plus size={13} /> Добавить
        </button>
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>
      ) : (
        <div className="divide-y divide-gray-100">
          {creating && (
            <div className="p-4 bg-blue-50 space-y-3">
              <p className="text-xs font-semibold text-blue-700 uppercase">Новая конфигурация</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Транзит (код аэропорта)</label>
                  <input value={form.transit_code} onChange={e => setForm(p => ({ ...p, transit_code: e.target.value.toUpperCase() }))}
                    className={inp} placeholder="CAI" maxLength={10} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Описание</label>
                  <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    className={inp} placeholder="Delta Express — Cairo" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email адреса (через запятую)</label>
                <textarea value={form.emails} onChange={e => setForm(p => ({ ...p, emails: e.target.value }))}
                  className={inp} rows={2} placeholder="agent1@example.com, agent2@example.com" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setCreating(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Отмена
                </button>
                <button
                  onClick={() => createMut.mutate(form)}
                  disabled={!form.transit_code || !form.emails || createMut.isPending}
                  className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                  {createMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Сохранить
                </button>
              </div>
            </div>
          )}

          {configs.length === 0 && !creating && (
            <div className="p-6 text-center text-gray-400 text-sm">
              Нет настроек. Добавьте конфигурацию email для каждого транзитного аэропорта.
            </div>
          )}

          {configs.map(cfg => (
            <div key={cfg.id} className="px-5 py-3">
              {editing?.id === cfg.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Транзит</label>
                      <input value={editing.transit_code}
                        onChange={e => setEditing(p => p ? ({ ...p, transit_code: e.target.value.toUpperCase() }) : p)}
                        className={inp} maxLength={10} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Описание</label>
                      <input value={editing.description}
                        onChange={e => setEditing(p => p ? ({ ...p, description: e.target.value }) : p)}
                        className={inp} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email адреса</label>
                    <textarea value={editing.emails}
                      onChange={e => setEditing(p => p ? ({ ...p, emails: e.target.value }) : p)}
                      className={inp} rows={2} />
                  </div>
                  <div className="flex items-center gap-3 justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editing.active}
                        onChange={e => setEditing(p => p ? ({ ...p, active: e.target.checked }) : p)}
                        className="accent-blue-600 w-4 h-4" />
                      <span className="text-sm text-gray-700">Активна</span>
                    </label>
                    <div className="flex gap-2">
                      <button onClick={() => setEditing(null)}
                        className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                        Отмена
                      </button>
                      <button
                        onClick={() => updateMut.mutate({ id: editing.id, data: editing })}
                        disabled={updateMut.isPending}
                        className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                        {updateMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Сохранить
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
                    <span className="text-blue-700 font-bold text-sm">{cfg.transit_code}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-gray-800">{cfg.transit_code}</span>
                      {cfg.description && <span className="text-xs text-gray-500">— {cfg.description}</span>}
                      {!cfg.active && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">неактивна</span>}
                    </div>
                    <p className="text-xs text-gray-500 break-all">{cfg.emails}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => setEditing(cfg)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => deleteMut.mutate(cfg.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Send instruction modal ────────────────────────────────────────────────────

interface SendModalProps {
  orderId: number
  onClose: () => void
}

function SendInstructionModal({ orderId, onClose }: SendModalProps) {
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
  const [to, setTo] = useState<string>('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState('')

  const { data: instr, isLoading } = useQuery({
    queryKey: ['order-instruction', orderId],
    queryFn: () => instructionsApi.getOrderInstruction(orderId).then(r => r.data),
    onSuccess: (data) => {
      setTo(data.to.join(', '))
      setSubject(data.subject)
      setBody(data.body)
      // Select all docs by default
      setSelectedDocs(new Set(data.documents.map(d => d.url)))
    },
  } as Parameters<typeof useQuery>[0])

  const sendMut = useMutation({
    mutationFn: () => {
      const docs = (instr?.documents || []).filter(d => selectedDocs.has(d.url))
      return instructionsApi.sendEmail({
        subject,
        body,
        to: to.split(',').map(e => e.trim()).filter(Boolean),
        attachment_urls: docs.map(d => d.url),
        attachment_names: docs.map(d => d.name),
      })
    },
    onSuccess: () => setSent(true),
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Ошибка отправки'
      setSendError(msg)
    },
  })

  const toggleDoc = (url: string) => {
    setSelectedDocs(prev => {
      const next = new Set(prev)
      next.has(url) ? next.delete(url) : next.add(url)
      return next
    })
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

  if (isLoading) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3">
        <Loader2 size={28} className="animate-spin text-blue-600" />
        <p className="text-sm text-gray-600">Загрузка данных...</p>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Mail size={18} className="text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">Отправить инструкцию</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={20} />
          </button>
        </div>

        {sent ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <CheckCircle2 size={48} className="text-green-500" />
            <p className="text-lg font-semibold text-gray-800">Email отправлен!</p>
            <button onClick={onClose}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              Закрыть
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {!instr?.smtp_ready && (
                <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700">
                    SMTP не настроен. Добавьте переменные <code className="bg-amber-100 px-1 rounded">SMTP_HOST</code>, <code className="bg-amber-100 px-1 rounded">SMTP_USER</code>, <code className="bg-amber-100 px-1 rounded">SMTP_PASSWORD</code> в .env файл.
                    Email можно скопировать вручную.
                  </p>
                </div>
              )}

              {instr?.to.length === 0 && (
                <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle size={16} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-yellow-700">
                    Нет настроенных получателей для транзита <strong>{instr.order.transit_city || '(не указан)'}</strong>.
                    Настройте email в разделе выше или введите вручную.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Кому (через запятую)</label>
                <input value={to} onChange={e => setTo(e.target.value)} className={inp} placeholder="email1@example.com, email2@example.com" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Тема</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} className={inp} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Текст письма</label>
                <textarea value={body} onChange={e => setBody(e.target.value)}
                  className={inp} rows={10} style={{ fontFamily: 'monospace', fontSize: '12px' }} />
              </div>

              {(instr?.documents || []).length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Вложения</label>
                  <div className="space-y-1.5">
                    {instr!.documents.map(doc => (
                      <label key={doc.url} className="flex items-center gap-3 p-2.5 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition">
                        <input type="checkbox" checked={selectedDocs.has(doc.url)}
                          onChange={() => toggleDoc(doc.url)}
                          className="accent-blue-600 w-4 h-4 flex-shrink-0" />
                        <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{doc.category}</span>
                        <span className="text-sm text-gray-700 flex-1 truncate">{doc.name}</span>
                        <a href={doc.url} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-500 hover:underline flex items-center gap-0.5 flex-shrink-0"
                          onClick={e => e.stopPropagation()}>
                          <ExternalLink size={11} />
                        </a>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {sendError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle size={14} className="text-red-500 mt-0.5" />
                  <p className="text-xs text-red-700">{sendError}</p>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-100 gap-3">
              <button onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                Отмена
              </button>
              <button
                onClick={() => sendMut.mutate()}
                disabled={sendMut.isPending || !to.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition disabled:opacity-50">
                {sendMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Отправить
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InstructionsPage() {
  const { user } = useAuthStore()
  const [showConfig, setShowConfig] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list().then(r => r.data),
  })

  const filtered = orders.filter(o => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      o.tracking_number.toLowerCase().includes(q) ||
      o.transit_city?.toLowerCase().includes(q) ||
      o.client?.name?.toLowerCase().includes(q) ||
      o.final_awb?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Instructions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Отправка инструкций партнёрам по транзитным точкам</p>
        </div>
        {user?.role === 'superadmin' && (
          <button
            onClick={() => setShowConfig(p => !p)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
            <Settings size={15} />
            Настройки email
            {showConfig ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>

      {/* Transit email config (superadmin only) */}
      {showConfig && user?.role === 'superadmin' && <TransitEmailConfigSection />}

      {/* Orders list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по REF#, транзиту, клиенту, AWB..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400">{filtered.length} заказов</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 size={24} className="animate-spin mx-auto text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Нет заказов</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((order: Order) => (
              <OrderRow key={order.id} order={order} onSend={() => setSelectedOrderId(order.id)} />
            ))}
          </div>
        )}
      </div>

      {selectedOrderId && (
        <SendInstructionModal orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
      )}
    </div>
  )
}

function OrderRow({ order, onSend }: { order: Order; onSend: () => void }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
      <div className="flex-shrink-0 text-center w-24">
        <p className="text-xs font-mono font-semibold text-gray-800">{order.tracking_number}</p>
        {order.our_ref && <p className="text-xs text-gray-400 truncate">{order.our_ref}</p>}
      </div>

      <div className="flex items-center gap-2 w-32 flex-shrink-0">
        <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{order.origin_city || '—'}</span>
        <span className="text-gray-300 text-xs">→</span>
        {order.transit_city && (
          <>
            <span className="text-xs font-mono bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-amber-700 font-semibold">{order.transit_city}</span>
            <span className="text-gray-300 text-xs">→</span>
          </>
        )}
        <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{order.dest_city || '—'}</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate">{order.client?.name || '—'}</p>
        {order.final_awb && (
          <p className="text-xs text-gray-400 font-mono truncate">AWB: {order.final_awb}</p>
        )}
      </div>

      <div className="flex-shrink-0 flex items-center gap-2">
        {order.transit_city ? (
          <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
            Transit: {order.transit_city}
          </span>
        ) : (
          <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Нет транзита</span>
        )}
      </div>

      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={onSend}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition">
          <Eye size={12} /> Инструкция
        </button>
      </div>
    </div>
  )
}
