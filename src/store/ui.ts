import { create } from 'zustand';
import { dayIndexOf } from '@/domain/time';
import type { OccurrenceKey, PersonId } from '@/domain/types';

export type Tab = 'plan' | 'home' | 'rooms' | 'time' | 'split';
export type PlanView = 'list' | 'day' | 'month';
export type SceneMode = '3d' | 'plan';

interface UiStore {
  tab: Tab;
  planView: PlanView;
  /** Which day the timeline shows. Monday = 0. */
  dayCursor: number;
  monthCursor: string | null;
  monthSelection: string | null;
  openRoom: string | null;
  taskSheet: OccurrenceKey | null;
  /** A run of back-to-back jobs the timeline drew as one block. */
  clusterSheet: OccurrenceKey[] | null;
  whoFilter: PersonId | 'all';
  hideDone: boolean;
  sceneMode: SceneMode;
  showFurniture: boolean;
  /** Section cut height in metres. The scene owns the ceiling constant. */
  cut: number;

  setTab(tab: Tab): void;
  setPlanView(view: PlanView): void;
  setDayCursor(day: number): void;
  setMonthCursor(iso: string | null): void;
  setMonthSelection(iso: string | null): void;
  openRoomDetail(slug: string | null): void;
  setTaskSheet(key: OccurrenceKey | null): void;
  setClusterSheet(keys: OccurrenceKey[] | null): void;
  setWhoFilter(who: PersonId | 'all'): void;
  toggleHideDone(): void;
  setSceneMode(mode: SceneMode): void;
  toggleFurniture(): void;
  setCut(metres: number): void;
}

export const useUi = create<UiStore>((set) => ({
  tab: 'plan',
  planView: 'list',
  dayCursor: dayIndexOf(new Date()),
  monthCursor: null,
  monthSelection: null,
  openRoom: null,
  taskSheet: null,
  clusterSheet: null,
  whoFilter: 'all',
  hideDone: false,
  sceneMode: '3d',
  showFurniture: true,
  cut: 2.55,

  setTab: (tab) => set((s) => ({ tab, openRoom: tab === 'rooms' ? s.openRoom : null })),
  setPlanView: (planView) => set({ planView }),
  setDayCursor: (dayCursor) => set({ dayCursor }),
  setMonthCursor: (monthCursor) => set({ monthCursor, monthSelection: null }),
  setMonthSelection: (monthSelection) => set({ monthSelection }),
  openRoomDetail: (openRoom) => set({ openRoom }),
  setTaskSheet: (taskSheet) => set({ taskSheet, clusterSheet: null }),
  setClusterSheet: (clusterSheet) => set({ clusterSheet }),
  setWhoFilter: (whoFilter) => set({ whoFilter }),
  toggleHideDone: () => set((s) => ({ hideDone: !s.hideDone })),
  setSceneMode: (sceneMode) => set({ sceneMode }),
  toggleFurniture: () => set((s) => ({ showFurniture: !s.showFurniture })),
  setCut: (cut) => set({ cut }),
}));
