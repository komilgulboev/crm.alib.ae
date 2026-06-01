import api from './client'
import type { CatalogEntry } from '../types'

export const catalogsApi = {
  list: (type?: string, activeOnly?: boolean) =>
    api.get<CatalogEntry[]>('/catalogs', {
      params: {
        ...(type ? { type } : {}),
        ...(activeOnly ? { active: 'true' } : {}),
      },
    }),

  create: (data: Omit<CatalogEntry, 'id' | 'created_at' | 'updated_at'>) =>
    api.post<CatalogEntry>('/catalogs', data),

  update: (id: number, data: Partial<CatalogEntry>) =>
    api.put<CatalogEntry>(`/catalogs/${id}`, data),

  delete: (id: number) => api.delete(`/catalogs/${id}`),
}
