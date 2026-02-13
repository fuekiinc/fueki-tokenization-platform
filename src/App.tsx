import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'

// Eager-load the core pages (small, always used)
import DashboardPage from './pages/DashboardPage'
import MintPage from './pages/MintPage'
import PortfolioPage from './pages/PortfolioPage'

// Lazy-load heavier pages so a crash in one doesn't break the whole app
const ExchangePage = lazy(() => import('./pages/ExchangePage'))
const OrbitalAMMPage = lazy(() => import('./pages/OrbitalAMMPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="mint" element={<MintPage />} />
        <Route path="portfolio" element={<PortfolioPage />} />
        <Route path="exchange" element={<Suspense fallback={<PageLoader />}><ExchangePage /></Suspense>} />
        <Route path="advanced" element={<Suspense fallback={<PageLoader />}><OrbitalAMMPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
