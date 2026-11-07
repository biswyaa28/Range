import React, { createContext, useContext } from 'react';
import type { AppRoute } from '@/hooks';
import type { HomeData } from './homeData';

export interface HomeActions {
  navigate: (route: AppRoute) => void;
  openDeadlines: () => void;
  addTask: () => void;
  startFocus: () => void;
}

export interface HomeContextValue {
  data: HomeData;
  actions: HomeActions;
}

const HomeContext = createContext<HomeContextValue | null>(null);

export const HomeProvider: React.FC<{
  value: HomeContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return <HomeContext.Provider value={value}>{children}</HomeContext.Provider>;
};

export function useHome(): HomeContextValue {
  const value = useContext(HomeContext);
  if (!value) {
    throw new Error('useHome must be used within a HomeProvider');
  }
  return value;
}
