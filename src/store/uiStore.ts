import { create } from 'zustand';
import type { Notification, ModalContent } from '../types/index.ts';

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface UIState {
  activeTab: string;
  isModalOpen: boolean;
  modalContent: ModalContent | null;
  notifications: Notification[];
}

export interface UIActions {
  setActiveTab: (tab: string) => void;
  openModal: (content: ModalContent) => void;
  closeModal: () => void;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
}

export type UIStore = UIState & UIActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialUIState: UIState = {
  activeTab: 'dashboard',
  isModalOpen: false,
  modalContent: null,
  notifications: [],
};

// ---------------------------------------------------------------------------
// Notification auto-dismiss timers.
// Kept at module level so they can be cleared when notifications are removed
// manually or when the store is reset.
// ---------------------------------------------------------------------------

const _notificationTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUIStore = create<UIStore>()((set) => ({
  ...initialUIState,

  setActiveTab: (tab) => set({ activeTab: tab }),

  openModal: (content) =>
    set({ isModalOpen: true, modalContent: content }),

  closeModal: () =>
    set({ isModalOpen: false, modalContent: null }),

  addNotification: (notification) => {
    set((state) => ({
      notifications: [...state.notifications, notification],
    }));

    // Schedule auto-dismiss unless explicitly disabled.
    if (notification.autoDismiss !== false) {
      const delay = notification.duration ?? 5_000;
      const timer = setTimeout(() => {
        _notificationTimers.delete(notification.id);
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== notification.id),
        }));
      }, delay);
      _notificationTimers.set(notification.id, timer);
    }
  },

  removeNotification: (id) => {
    // Clear any pending auto-dismiss timer to prevent a no-op firing later.
    const timer = _notificationTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      _notificationTimers.delete(id);
    }
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));
