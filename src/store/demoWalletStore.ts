import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Demo wallet lifecycle store -- consumed by DashboardPage and other components
// to show appropriate loading / error states while the demo wallet initialises.
// ---------------------------------------------------------------------------

interface DemoWalletState {
  /** True while the async wallet setup is in progress. */
  isSettingUp: boolean;
  /** Non-null when setup failed (RPC unreachable, missing env var, etc.). */
  setupError: string | null;
  /** True once setup completed successfully. */
  isReady: boolean;
}

interface DemoWalletActions {
  markSettingUp: () => void;
  markReady: () => void;
  markError: (msg: string) => void;
  reset: () => void;
}

const initialDemoWalletState: DemoWalletState = {
  isSettingUp: false,
  setupError: null,
  isReady: false,
};

export const useDemoWalletStore = create<DemoWalletState & DemoWalletActions>()(
  (set) => ({
    ...initialDemoWalletState,
    markSettingUp: () =>
      set({ isSettingUp: true, setupError: null, isReady: false }),
    markReady: () =>
      set({ isSettingUp: false, setupError: null, isReady: true }),
    markError: (msg: string) =>
      set({ isSettingUp: false, setupError: msg, isReady: false }),
    reset: () => set({ ...initialDemoWalletState }),
  }),
);
