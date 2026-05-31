import api from './client'
import type { Payment } from '../types'

export const paymentsApi = {
  list: () => api.get<Payment[]>('/payments'),

  listByOrder: (orderId: number) =>
    api.get<Payment[]>(`/payments/order/${orderId}`),

  create: (data: Partial<Payment>) => api.post<Payment>('/payments', data),
}
