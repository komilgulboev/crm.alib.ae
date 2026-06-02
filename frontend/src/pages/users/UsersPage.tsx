import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, UserCheck, UserX, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usersApi } from '../../api/users'
import { useAuthStore } from '../../store/auth'
import CreateUserModal from './CreateUserModal'
import EditUserModal from './EditUserModal'
import type { User, Role } from '../../types'
import { formatDate } from '../../lib/utils'

const ROLE_COLORS: Record<Role, string> = {
  superadmin: 'bg-purple-100 text-purple-800',
  manager:    'bg-blue-100 text-blue-800',
  warehouse:  'bg-yellow-100 text-yellow-800',
  accountant: 'bg-green-100 text-green-800',
  driver:     'bg-orange-100 text-orange-800',
  client:     'bg-gray-100 text-gray-600',
}

export default function UsersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then(r => r.data),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      usersApi.update(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const roleLabel = (role: Role) => t(`users.roles.${role}` as const)

  return (
    <div>
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditUserModal user={editUser} onClose={() => setEditUser(null)} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('users.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('users.subtitle')}</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition"
        >
          <Plus size={16} />
          {t('users.addUser')}
        </button>
      </div>

      {/* Role summary */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {(Object.keys(ROLE_COLORS) as Role[]).map(role => {
          const count = users.filter(u => u.role === role).length
          return (
            <div key={role} className="bg-white rounded-xl shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[role]}`}>
                {roleLabel(role)}
              </span>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">{t('common.loading')}</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-400">{t('users.noUsers')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('users.colEmployee')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('users.colContact')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('users.colRole')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('users.colStatus')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('users.colAdded')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user: User) => {
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
                            {isSelf && <span className="ml-2 text-xs text-blue-500">{t('nav.you')}</span>}
                          </p>
                          <p className="text-xs text-gray-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 text-xs font-medium ${
                        user.active ? 'text-green-600' : 'text-gray-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {user.active ? t('users.active') : t('users.deactivated')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditUser(user)}
                          title={t('common.edit')}
                          className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition"
                        >
                          <Pencil size={16} />
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => toggleActive.mutate({ id: user.id, active: !user.active })}
                            title={user.active ? t('common.deactivate') : t('common.activate')}
                            className={`p-1.5 rounded-lg transition ${
                              user.active
                                ? 'text-red-400 hover:bg-red-50 hover:text-red-600'
                                : 'text-green-500 hover:bg-green-50 hover:text-green-700'
                            }`}
                          >
                            {user.active ? <UserX size={16} /> : <UserCheck size={16} />}
                          </button>
                        )}
                      </div>
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
