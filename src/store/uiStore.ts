import { create } from 'zustand';
import type { Notification, ModalContent } from '../types/index.ts';

// ---------------------------------------------------------------------------
// Toast notification type
// ---------------------------------------------------------------------------

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface UIState {
  activeTab: string;
  isModalOpen: boolean;
  modalContent: ModalContent | null;
  modalQueue: ModalContent[];
  notifications: Notification[];
  toasts: Toast[];
  theme: 'dark' | 'light';
  isSidebarOpen: boolean;
  isMobileMenuOpen: boolean;
  isPanelCollapsed: boolean;
}

export interface UIActions {
  // Tab
  setActiveTab: (tab: string) => void;
  // Modal (with queue support)
  openModal: (content: ModalContent) => void;
  closeModal: () => void;
  // Notifications
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  // Toasts
  addToast: (toast: Toast) => void;
  removeToast: (id: string) => void;
  // Theme
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  // Sidebar / panels
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;
  setPanelCollapsed: (collapsed: boolean) => void;
  togglePanel: () => void;
}

export type UIStore = UIState & UIActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialUIState: UIState = {
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
};

// ---------------------------------------------------------------------------
// Notification auto-dismiss timers.
// Kept at module level so they can be cleared when notifications are removed
// manually or when the store is reset.
// ---------------------------------------------------------------------------

const _notificationTimers = new Map<string, ReturnType<typeof setTimeout>>();
const _toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUIStore = create<UIStore>()((set, get) => ({
  ...initialUIState,

  // ---- Tab ------------------------------------------------------------------

  setActiveTab: (tab) => set({ activeTab: tab }),

  // ---- Modal (with queue) ---------------------------------------------------

  openModal: (content) => {
    const { isModalOpen } = get();
    if (isModalOpen) {
      set((state) => ({
        modalQueue: [...state.modalQueue, content],
      }));
    } else {
      set({ isModalOpen: true, modalContent: content });
    }
  },

  closeModal: () => {
    const { modalQueue } = get();
    if (modalQueue.length > 0) {
      const [next, ...rest] = modalQueue;
      set({ modalContent: next, modalQueue: rest });
    } else {
      set({ isModalOpen: false, modalContent: null });
    }
  },

  // ---- Notifications --------------------------------------------------------

  addNotification: (notification) => {
    set((state) => ({
      notifications: [...state.notifications, notification],
    }));

    if (notification.autoDismiss !== false) {
      const delay = notification.duration ?? 5_000;
      const timer = setTimeout(() => {
        _notificationTimers.delete(notification.id);
        set((state) => ({
          notifications: state.notifications.filter(
            (n) => n.id !== notification.id,
          ),
        }));
      }, delay);
      _notificationTimers.set(notification.id, timer);
    }
  },

  removeNotification: (id) => {
    const timer = _notificationTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      _notificationTimers.delete(id);
    }
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearNotifications: () => {
    for (const timer of _notificationTimers.values()) {
      clearTimeout(timer);
    }
    _notificationTimers.clear();
    set({ notifications: [] });
  },

  // ---- Toasts ---------------------------------------------------------------

  addToast: (toast) => {
    set((state) => ({
      toasts: [...state.toasts, toast],
    }));

    const duration = toast.duration ?? 4_000;
    const timer = setTimeout(() => {
      _toastTimers.delete(toast.id);
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== toast.id),
      }));
    }, duration);
    _toastTimers.set(toast.id, timer);
  },

  removeToast: (id) => {
    const timer = _toastTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      _toastTimers.delete(id);
    }
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  // ---- Theme ----------------------------------------------------------------

  setTheme: (theme) => set({ theme }),

  toggleTheme: () =>
    set((state) => ({
      theme: state.theme === 'dark' ? 'light' : 'dark',
    })),

  // ---- Sidebar / panels -----------------------------------------------------

  setSidebarOpen: (open) => set({ isSidebarOpen: open }),

  toggleSidebar: () =>
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  setMobileMenuOpen: (open) => set({ isMobileMenuOpen: open }),

  toggleMobileMenu: () =>
    set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),

  setPanelCollapsed: (collapsed) => set({ isPanelCollapsed: collapsed }),

  togglePanel: () =>
    set((state) => ({ isPanelCollapsed: !state.isPanelCollapsed })),
}));

// ---------------------------------------------------------------------------
// Selectors -- use with shallow comparison for performance
// ---------------------------------------------------------------------------

export const selectActiveTab = (state: UIStore) => state.activeTab;
export const selectIsModalOpen = (state: UIStore) => state.isModalOpen;
export const selectModalContent = (state: UIStore) => state.modalContent;
export const selectNotifications = (state: UIStore) => state.notifications;
export const selectToasts = (state: UIStore) => state.toasts;
export const selectTheme = (state: UIStore) => state.theme;
export const selectIsSidebarOpen = (state: UIStore) => state.isSidebarOpen;
export const selectIsMobileMenuOpen = (state: UIStore) => state.isMobileMenuOpen;
export const selectIsPanelCollapsed = (state: UIStore) => state.isPanelCollapsed;
