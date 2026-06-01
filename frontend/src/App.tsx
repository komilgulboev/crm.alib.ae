import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/layout/Layout'
import LoginPage from './pages/auth/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import OrdersPage from './pages/orders/OrdersPage'
import ClientsPage from './pages/clients/ClientsPage'
import PaymentsPage from './pages/payments/PaymentsPage'
import UsersPage from './pages/users/UsersPage'
import BankAccountsPage from './pages/settings/BankAccountsPage'
import CatalogsPage from './pages/admin/CatalogsPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="bank-accounts" element={<BankAccountsPage />} />
            <Route path="catalogs" element={<CatalogsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
