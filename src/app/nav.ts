import type { ComponentType } from 'react';
import { HomeIcon, PlanIcon, RoomsIcon, SplitIcon, TimeIcon } from './icons';
import type { Tab } from '@/store/ui';

export interface NavItem {
  tab: Tab;
  label: string;
  /** What the panel is called once you are in it. */
  heading: string;
  Icon: ComponentType<{ size?: number }>;
}

export const NAV: readonly NavItem[] = [
  { tab: 'plan', label: 'Plan', heading: 'The plan', Icon: PlanIcon },
  { tab: 'home', label: 'Home', heading: 'The flat', Icon: HomeIcon },
  { tab: 'rooms', label: 'Rooms', heading: 'Rooms', Icon: RoomsIcon },
  { tab: 'time', label: 'Time', heading: 'Free time', Icon: TimeIcon },
  { tab: 'split', label: 'Split', heading: 'The split', Icon: SplitIcon },
];
