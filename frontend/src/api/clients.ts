import api from './client'
import type { Client } from '../types'

export const clientsApi = {
  list: (params?: Record<string, string>) =>
    api.get<Client[]>('/clients', { params }),

  get: (id: number) => api.get<Client>(`/clients/${id}`),

  create: (data: Partial<Client>) => api.post<Client>('/clients', data),

  update: (id: number, data: Partial<Client>) => api.put<Client>(`/clients/${id}`, data),

  delete: (id: number) => api.delete(`/clients/${id}`),
}
