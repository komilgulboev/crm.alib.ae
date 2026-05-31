import api from './client'
import type { BankAccount } from '../types'

export const bankAccountsApi = {
  list: (activeOnly = false) =>
    api.get<BankAccount[]>('/bank-accounts', { params: activeOnly ? { active: 'true' } : {} }),

  create: (data: Partial<BankAccount>) => api.post<BankAccount>('/bank-accounts', data),

  update: (id: number, data: Partial<BankAccount>) =>
    api.put<BankAccount>(`/bank-accounts/${id}`, data),

  delete: (id: number) => api.delete(`/bank-accounts/${id}`),
}
