import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Modal from '../../components/ui/Modal'
import { ordersApi } from '../../api/orders'
import type { Order } from '../../types'
import { PackageCheck } from 'lucide-react'

interface Props {
  order: Order | null
  onClose: () => void
}

export default function IssueFromWarehouseModal({ order, onClose }: Props) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => ordersApi.issueFromWarehouse(order!.id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onClose()
      setNote('')
      setError('')
    },
    onError: (e: any) => setError(e?.response?.data?.error || 'Ошибка выдачи'),
  })

  if (!order) return null

  return (
    <Modal open={!!order} onClose={onClose} title="Выдача со склада" size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <PackageCheck size={32} className="text-yellow-600 shrink-0" />
          <div>
            <p className="font-semibold text-gray-900">{order.tracking_number}</p>
            <p className="text-sm text-gray-600">Клиент: {order.client?.name}</p>
            <p className="text-sm text-gray-600">Маршрут: {order.origin_country} → {order.dest_country}</p>
          </div>
        </div>

        <p className="text-sm text-gray-600">
          Подтвердите выдачу товара со склада. Статус заказа изменится на <strong>«Отправлен»</strong>.
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Примечание</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            placeholder="Кто выдал, особые отметки..." />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            Отмена
          </button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="px-6 py-2 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition disabled:opacity-50">
            {mutation.isPending ? 'Выдача...' : 'Подтвердить выдачу'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
