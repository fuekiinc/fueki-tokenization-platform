// ---------------------------------------------------------------------------
// Common component barrel exports
// ---------------------------------------------------------------------------

export { default as Badge } from './Badge.tsx';
export { default as Button } from './Button.tsx';
export { default as Card } from './Card.tsx';
export { default as EmptyState } from './EmptyState.tsx';
export { default as ExportButton } from './ExportButton.tsx';
export { default as FormField } from './FormField.tsx';
export { default as GlassPanel } from './GlassPanel.tsx';
export { default as Modal } from './Modal.tsx';
export { default as Spinner } from './Spinner.tsx';
export { default as StatCard } from './StatCard.tsx';
export { default as Tooltip, InfoTooltip } from './Tooltip.tsx';
export { default as TransactionRecoveryBanner } from './TransactionRecoveryBanner.tsx';

// ---------------------------------------------------------------------------
// State display components (loading, empty, error, skeleton)
// ---------------------------------------------------------------------------

export {
  EmptyState as StateEmptyState,
  LoadingState,
  ErrorState,
  CardSkeleton,
} from './StateDisplays.tsx';
export { SkeletonTable } from './SkeletonTable.tsx';

// ---------------------------------------------------------------------------
// Transaction flow (3-phase confirmation modal)
// ---------------------------------------------------------------------------

export { useTransactionFlow } from './TransactionFlow.tsx';

// ---------------------------------------------------------------------------
// Prop type re-exports for consumer convenience
// ---------------------------------------------------------------------------

export type { BadgeProps } from './Badge.tsx';
export type { ButtonProps } from './Button.tsx';
export type { EmptyStateProps } from './EmptyState.tsx';
export type { ExportButtonProps } from './ExportButton.tsx';
export type { FormFieldProps } from './FormField.tsx';
export type { ModalProps } from './Modal.tsx';
export type { SpinnerProps } from './Spinner.tsx';
export type { StatCardProps } from './StatCard.tsx';
export type { TooltipProps, InfoTooltipProps } from './Tooltip.tsx';

// Transaction flow types
export type {
  TransactionFlowConfig,
  TransactionType,
  TransactionDetail,
  UseTransactionFlowReturn,
} from './TransactionFlow.tsx';
