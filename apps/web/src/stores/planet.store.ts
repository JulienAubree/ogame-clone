import { create } from 'zustand';

interface PlanetState {
  activePlanetId: string | null;
  setActivePlanet: (id: string) => void;
  clearActivePlanet: () => void;
}

export const usePlanetStore = create<PlanetState>((set) => ({
  activePlanetId: localStorage.getItem('activePlanetId'),

  setActivePlanet: (id: string) => {
    localStorage.setItem('activePlanetId', id);
    set({ activePlanetId: id });
  },

  clearActivePlanet: () => {
    localStorage.removeItem('activePlanetId');
    set({ activePlanetId: null });
  },
}));
