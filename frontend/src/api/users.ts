import api from './client'
import type { User, Role } from '../types'

export interface UpdateUserPayload {
  name?: string
  email?: string
  phone?: string
  role?: Role
  active?: boolean
  telegram_chat_id?: string
  new_password?: string
}

export const usersApi = {
  list: () => api.get<User[]>('/users'),

  create: (data: { name: string; email: string; phone: string; password: string; role: Role; telegram_chat_id?: string }) =>
    api.post<User>('/users', data),

  update: (id: number, data: UpdateUserPayload) =>
    api.put<User>(`/users/${id}`, data),

  deactivate: (id: number) => api.delete(`/users/${id}`),
}
