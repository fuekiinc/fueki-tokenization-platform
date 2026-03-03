import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  AlertTriangle,
  FileCheck,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import AdminStatsGrid from '../components/Admin/AdminStatsGrid';
import AdminUserTable from '../components/Admin/AdminUserTable';
import AdminKYCQueue from '../components/Admin/AdminKYCQueue';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabId = 'dashboard' | 'users' | 'kyc';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'kyc', label: 'KYC Review', icon: FileCheck },
];

// ---------------------------------------------------------------------------
// AdminPage
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  // Role-based access control: only admin and super_admin can view this page.
  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
    if (user) {
      return (
        <div className="mx-auto max-w-xl py-16 text-center">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="mb-3 text-2xl font-bold text-white">
            Access Denied
          </h1>
          <p className="text-[15px] leading-relaxed text-gray-400">
            You do not have permission to access the admin panel. Contact a
            system administrator if you believe this is an error.
          </p>
        </div>
      );
    }

    return <Navigate to="/login" replace />;
  }

  return (
    <div className="w-full">
      {/* Page header */}
      <div className="mb-12 sm:mb-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Admin Panel
              </h1>
            </div>
            <p className="mt-3 text-base leading-relaxed text-gray-400">
              Manage users, review KYC submissions, and monitor platform
              activity.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="mt-10 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      {/* Tab bar */}
      <div className="mb-8">
        <div className="inline-flex gap-1 rounded-xl bg-white/[0.03] p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'kyc' && <KYCTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard tab
// ---------------------------------------------------------------------------

function DashboardTab() {
  return (
    <div className="space-y-8">
      <AdminStatsGrid />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------

function UsersTab() {
  return (
    <div className="space-y-6">
      <AdminUserTable />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KYC Review tab
// ---------------------------------------------------------------------------

function KYCTab() {
  return (
    <div className="space-y-6">
      <AdminKYCQueue />
    </div>
  );
}
