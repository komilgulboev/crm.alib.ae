import api from './client'
import type { User } from '../types'

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { email, password }),

  me: () => api.get<User>('/auth/me'),

  logout: () => api.post('/auth/logout'),
}
