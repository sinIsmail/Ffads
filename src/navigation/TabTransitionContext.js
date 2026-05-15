// Ffads — Tab Transition Context
// Shares the navigation direction (left/right) between FloatingTabBar and
// the SlideTabScreen wrapper so screens can slide in the correct direction.

import React, { createContext, useContext, useRef } from 'react';

const TabTransitionContext = createContext({
  directionRef: { current: 0 }, // -1 = going left, 1 = going right
  prevIndexRef:  { current: 1 }, // Scanner is default (index 1)
});

export function TabTransitionProvider({ children }) {
  const directionRef = useRef(0);
  const prevIndexRef  = useRef(1);

  return (
    <TabTransitionContext.Provider value={{ directionRef, prevIndexRef }}>
      {children}
    </TabTransitionContext.Provider>
  );
}

export function useTabTransition() {
  return useContext(TabTransitionContext);
}
