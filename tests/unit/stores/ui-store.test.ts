/**
 * uiStore tests.
 *
 * Verifies modal queue behavior and auto-dismiss toast handling.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../../src/store/uiStore';

describe('useUIStore', () => {
  beforeEach(() => {
    vi.useRealTimers();
    useUIStore.setState({
      activeTab: 'dashboard',
      isModalOpen: false,
      modalContent: null,
      modalQueue: [],
      notifications: [],
      toasts: [],
      theme: 'dark',
      isSidebarOpen: true,
      isMobileMenuOpen: false,
      isPanelCollapsed: false,
    });
  });

  it('queues modal content while another modal is open', () => {
    useUIStore.getState().openModal({ title: 'Modal A', body: 'A body' });
    useUIStore.getState().openModal({ title: 'Modal B', body: 'B body' });

    expect(useUIStore.getState().isModalOpen).toBe(true);
    expect(useUIStore.getState().modalContent?.title).toBe('Modal A');
    expect(useUIStore.getState().modalQueue).toHaveLength(1);

    useUIStore.getState().closeModal();

    expect(useUIStore.getState().modalContent?.title).toBe('Modal B');
    expect(useUIStore.getState().modalQueue).toHaveLength(0);
  });

  it('auto-dismisses toast after duration', () => {
    vi.useFakeTimers();

    useUIStore.getState().addToast({
      id: 'toast-1',
      type: 'info',
      message: 'Hello',
      duration: 500,
    });

    expect(useUIStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(600);

    expect(useUIStore.getState().toasts).toHaveLength(0);
  });
});
