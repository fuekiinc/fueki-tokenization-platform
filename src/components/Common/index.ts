// ---------------------------------------------------------------------------
// Common component barrel exports
// ---------------------------------------------------------------------------

export { default as Badge } from './Badge';
export { default as Button } from './Button';
export { default as Card } from './Card';
export { default as EmptyState } from './EmptyState';
export { default as GlassPanel } from './GlassPanel';
export { default as Modal } from './Modal';
export { default as Spinner } from './Spinner';
export { default as StatCard } from './StatCard';
export { default as Tooltip, InfoTooltip } from './Tooltip';

// ---------------------------------------------------------------------------
// Transaction flow (3-phase confirmation modal)
// ---------------------------------------------------------------------------

export { useTransactionFlow } from './TransactionFlow';

// ---------------------------------------------------------------------------
// Prop type re-exports for consumer convenience
// ---------------------------------------------------------------------------

export type { BadgeProps } from './Badge';
export type { ButtonProps } from './Button';
export type { EmptyStateProps } from './EmptyState';
export type { ModalProps } from './Modal';
export type { SpinnerProps } from './Spinner';
export type { StatCardProps } from './StatCard';
export type { TooltipProps, InfoTooltipProps } from './Tooltip';

// Transaction flow types
export type {
  TransactionFlowConfig,
  TransactionType,
  TransactionDetail,
  UseTransactionFlowReturn,
} from './TransactionFlow';
