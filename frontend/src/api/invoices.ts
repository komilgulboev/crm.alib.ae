import api from './client'
import type { Invoice, InvoiceLineItem } from '../types'

export interface CreateInvoicePayload {
  order_id: number
  invoice_date?: string
  due_date?: string
  terms?: string
  chargeable_weight?: number
  tax_rate?: number
  currency?: string
  accepts_cash?: boolean
  notes?: string
  line_items: Omit<InvoiceLineItem, 'id' | 'invoice_id' | 'taxable_amount' | 'tax_amount' | 'amount'>[]
  bank_account_ids?: number[]
}

export const invoicesApi = {
  listByOrder: (orderId: number) =>
    api.get<Invoice[]>(`/invoices/order/${orderId}`),

  get: (id: number) => api.get<Invoice>(`/invoices/${id}`),

  create: (data: CreateInvoicePayload) => api.post<Invoice>('/invoices', data),

  delete: (id: number) => api.delete(`/invoices/${id}`),
}
