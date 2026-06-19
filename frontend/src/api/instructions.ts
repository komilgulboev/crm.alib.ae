import api from './client'
import type { TransitEmailConfig, OrderInstruction } from '../types'

export const instructionsApi = {
  // Transit email config CRUD
  listConfigs: (activeOnly?: boolean) =>
    api.get<TransitEmailConfig[]>('/transit-emails', { params: activeOnly ? { active: 'true' } : {} }),

  createConfig: (data: Partial<TransitEmailConfig>) =>
    api.post<TransitEmailConfig>('/transit-emails', data),

  updateConfig: (id: number, data: Partial<TransitEmailConfig>) =>
    api.put<TransitEmailConfig>(`/transit-emails/${id}`, data),

  deleteConfig: (id: number) =>
    api.delete(`/transit-emails/${id}`),

  // Get pre-filled instruction for an order
  getOrderInstruction: (orderId: number) =>
    api.get<OrderInstruction>(`/orders/${orderId}/instruction`),

  // Send email
  sendEmail: (data: {
    subject: string
    body: string
    to: string[]
    attachment_urls: string[]
    attachment_names: string[]
  }) => api.post<{ message: string; sent_at: string }>('/instructions/send', data),
}
