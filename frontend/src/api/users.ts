import api from './client'
import type { User, Role } from '../types'

export const usersApi = {
  list: () => api.get<User[]>('/users'),

  create: (data: { name: string; email: string; phone: string; password: string; role: Role }) =>
    api.post<User>('/users', data),

  update: (id: number, data: Partial<User> & { active?: boolean }) =>
    api.put<User>(`/users/${id}`, data),

  deactivate: (id: number) => api.delete(`/users/${id}`),
}
