import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, UserCheck, UserX } from 'lucide-react'
import { usersApi } from '../../api/users'
import { useAuthStore } from '../../store/auth'
import CreateUserModal from './CreateUserModal'
import type { User, Role } from '../../types'
import { formatDate } from '../../lib/utils'

const ROLE_LABELS: Record<Role, { label: string; color: string }> = {
  superadmin: { label: 'Суперадмин',     color: 'bg-purple-100 text-purple-800' },
  manager:    { label: 'Менеджер',        color: 'bg-blue-100 text-blue-800' },
  warehouse:  { label: 'Склад',           color: 'bg-yellow-100 text-yellow-800' },
  accountant: { label: 'Бухгалтер',       color: 'bg-green-100 text-green-800' },
  driver:     { label: 'Водитель',        color: 'bg-orange-100 text-orange-800' },
  client:     { label: 'Клиент',          color: 'bg-gray-100 text-gray-600' },
}

export default function UsersPage() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then(r => r.data),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      usersApi.update(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  return (
    <div>
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Пользователи</h1>
          <p className="text-sm text-gray-500 mt-1">Управление доступом сотрудников</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition"
        >
          <Plus size={16} />
          Добавить пользователя
        </button>
      </div>

      {/* Сводка по ролям */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {(Object.entries(ROLE_LABELS) as [Role, { label: string; color: string }][]).map(([role, info]) => {
          const count = users.filter(u => u.role === role).length
          return (
            <div key={role} className="bg-white rounded-xl shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${info.color}`}>
                {info.label}
              </span>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Загрузка...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Пользователей нет</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Сотрудник</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Контакт</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Роль</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Добавлен</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user: User) => {
                const roleInfo = ROLE_LABELS[user.role]
                const isSelf = user.id === currentUser?.id
                return (
                  <tr key={user.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
                          {user.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {user.name}
                            {isSelf && <span className="ml-2 text-xs text-blue-500">(вы)</span>}
                          </p>
                          <p className="text-xs text-gray-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${roleInfo.color}`}>
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 text-xs font-medium ${
                        user.active ? 'text-green-600' : 'text-gray-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {user.active ? 'Активен' : 'Деактивирован'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3">
                      {!isSelf && (
                        <button
                          onClick={() => toggleActive.mutate({ id: user.id, active: !user.active })}
                          title={user.active ? 'Деактивировать' : 'Активировать'}
                          className={`p-1.5 rounded-lg transition ${
                            user.active
                              ? 'text-red-400 hover:bg-red-50 hover:text-red-600'
                              : 'text-green-500 hover:bg-green-50 hover:text-green-700'
                          }`}
                        >
                          {user.active ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
