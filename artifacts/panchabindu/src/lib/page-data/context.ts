import { createContext, useContext } from 'react';

export const PageDataRefreshContext = createContext<() => void>(() => {});

export function usePageDataRefresh() {
  return useContext(PageDataRefreshContext);
}
