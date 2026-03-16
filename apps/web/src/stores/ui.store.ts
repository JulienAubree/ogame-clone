import { create } from 'zustand';

type SheetType = 'base' | 'galaxie' | 'social' | 'plus' | null;

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  activeSheet: SheetType;
  openSheet: (sheet: Exclude<SheetType, null>) => void;
  closeSheet: () => void;
  toggleSheet: (sheet: Exclude<SheetType, null>) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  activeSheet: null,
  openSheet: (sheet) => set({ activeSheet: sheet }),
  closeSheet: () => set({ activeSheet: null }),
  toggleSheet: (sheet) => set((s) => ({ activeSheet: s.activeSheet === sheet ? null : sheet })),
}));
