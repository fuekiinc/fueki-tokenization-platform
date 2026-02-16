import toast from 'react-hot-toast';

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // MetaMask user rejection
    if ('code' in error && (error as any).code === 4001) return 'Transaction was rejected';
    if ('code' in error && (error as any).code === 'ACTION_REJECTED') return 'Transaction was rejected';
    // Insufficient funds
    if (error.message.includes('insufficient funds')) return 'Insufficient balance for this transaction';
    if (error.message.includes('INSUFFICIENT_FUNDS')) return 'Insufficient balance for this transaction';
    // Network errors
    if (error.message.includes('network') || error.message.includes('NETWORK')) return 'Network error. Please check your connection';
    if (error.message.includes('timeout')) return 'Request timed out. Please try again';
    // Return the actual message if it's short enough
    if (error.message.length < 100) return error.message;
  }
  return 'An unexpected error occurred';
}

export function showError(error: unknown, context?: string): void {
  const message = getErrorMessage(error);
  toast.error(context ? `${context}: ${message}` : message);
}
