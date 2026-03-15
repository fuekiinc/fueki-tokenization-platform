import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { normalizeKycStatus } from '../../lib/auth/kycStatus';

/**
 * Persistent top-of-page banner shown to users in demo mode.
 *
 * - Clearly communicates they're in a temporary preview on Holesky testnet.
 * - Allows ending the demo early via "Exit Demo".
 * - Auto-detects when KYC has been approved mid-demo and shows a celebratory
 *   message with a CTA to reload for full access.
 */
export default function DemoBanner() {
  const user = useAuthStore((s) => s.user);
  const endDemo = useAuthStore((s) => s.endDemo);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [isEnding, setIsEnding] = useState(false);

  const kycStatus = normalizeKycStatus(user?.kycStatus);
  const isApproved = kycStatus === 'approved';

  // Auto-transition: if KYC is approved while demo is active, notify user.
  const [showApprovalNotice, setShowApprovalNotice] = useState(false);
  useEffect(() => {
    if (isApproved && user?.demoActive) {
      setShowApprovalNotice(true);
    }
  }, [isApproved, user?.demoActive]);

  if (!user?.demoActive) return null;

  const handleExitDemo = async () => {
    setIsEnding(true);
    try {
      await endDemo();
      await logout();
      navigate('/login');
    } finally {
      setIsEnding(false);
    }
  };

  const handleGoToFullAccess = () => {
    // Reload the page so the auth store re-fetches user state with approved KYC.
    window.location.href = '/dashboard';
  };

  if (showApprovalNotice) {
    return (
      <div className="relative z-[60] w-full bg-gradient-to-r from-emerald-600 to-green-600 text-white">
        <div className="mx-auto flex max-w-[1920px] items-center justify-center gap-3 px-4 py-2.5 text-sm font-medium">
          <span>Your KYC has been approved! You now have full access to the platform.</span>
          <button
            onClick={handleGoToFullAccess}
            className={clsx(
              'rounded-lg bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide',
              'transition-colors hover:bg-white/30',
            )}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-[60] w-full bg-gradient-to-r from-amber-600 to-orange-600 text-white">
      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-3 px-4 py-2.5 sm:justify-center">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">
            You are in Demo Mode on Arbitrum Sepolia Testnet. This is a one-time preview session.
          </span>
          <span className="sm:hidden">
            Demo Mode &mdash; Arbitrum Sepolia Testnet
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExitDemo}
            disabled={isEnding}
            className={clsx(
              'rounded-lg bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide',
              'transition-colors hover:bg-white/30',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isEnding ? 'Ending...' : 'Exit Demo'}
          </button>
          <button
            onClick={handleExitDemo}
            disabled={isEnding}
            className="rounded-lg p-1 transition-colors hover:bg-white/20"
            aria-label="Close demo banner"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
