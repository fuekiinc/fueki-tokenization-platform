import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import DashboardPage from './pages/DashboardPage'
import MintPage from './pages/MintPage'
import PortfolioPage from './pages/PortfolioPage'
import ExchangePage from './pages/ExchangePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="mint" element={<MintPage />} />
        <Route path="portfolio" element={<PortfolioPage />} />
        <Route path="exchange" element={<ExchangePage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
