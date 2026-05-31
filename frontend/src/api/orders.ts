import api from './client'
import type { Order, DashboardStats } from '../types'

export const ordersApi = {
  list: (params?: Record<string, string>) =>
    api.get<Order[]>('/orders', { params }),

  get: (id: number) => api.get<Order>(`/orders/${id}`),

  create: (data: Partial<Order>) => api.post<Order>('/orders', data),

  update: (id: number, data: Partial<Order>) => api.put<Order>(`/orders/${id}`, data),

  updateStatus: (id: number, status: string, note?: string) =>
    api.patch(`/orders/${id}/status`, { status, note }),

  delete: (id: number) => api.delete(`/orders/${id}`),

  issueFromWarehouse: (id: number, note?: string) =>
    api.post(`/orders/${id}/issue`, { note }),

  dashboardStats: () => api.get<DashboardStats>('/dashboard/stats'),
}
