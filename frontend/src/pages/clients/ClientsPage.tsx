import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Phone } from 'lucide-react'
import api from '../../api/client'
import type { Client } from '../../types'
import { formatCurrency } from '../../lib/utils'
import CreateClientModal from './CreateClientModal'

export default function ClientsPage() {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients', search],
    queryFn: () =>
      api.get<Client[]>('/clients', { params: search ? { search } : {} }).then((r) => r.data),
  })

  return (
    <div>
      <CreateClientModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Клиенты</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition"
        >
          <Plus size={16} />
          Добавить клиента
        </button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени или телефону..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Загрузка...</div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Клиентов не найдено</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Имя</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Телефон</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Страна</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Баланс</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map((client: Client) => (
                <tr key={client.id} className="hover:bg-gray-50 transition cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{client.name}</div>
                    {client.email && <div className="text-gray-400 text-xs">{client.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Phone size={12} />
                      {client.phone}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{client.country || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={client.balance < 0 ? 'text-red-600 font-medium' : 'text-gray-900'}>
                      {formatCurrency(client.balance, client.currency)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      client.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {client.active ? 'Активен' : 'Неактивен'}
                    </span>
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
