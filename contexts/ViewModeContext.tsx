import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Dimensions } from 'react-native';

export type ViewMode = 'phone' | 'desktop';

interface ViewModeContextType {
  viewMode: ViewMode;
  toggleViewMode: () => void;
  setViewMode: (mode: ViewMode) => void;
  isDesktop: boolean;
  /** The simulated desktop width in points */
  desktopWidth: number;
  /** Scale factor applied when in desktop mode */
  scaleFactor: number;
  /** The actual screen width */
  screenWidth: number;
  /** The actual screen height */
  screenHeight: number;
}

const ViewModeContext = createContext<ViewModeContextType>({
  viewMode: 'phone',
  toggleViewMode: () => {},
  setViewMode: () => {},
  isDesktop: false,
  desktopWidth: 1200,
  scaleFactor: 1,
  screenWidth: Dimensions.get('window').width,
  screenHeight: Dimensions.get('window').height,
});

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>('phone');

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const desktopWidth = 1200;
  const scaleFactor = viewMode === 'desktop' ? screenWidth / desktopWidth : 1;

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'phone' ? 'desktop' : 'phone'));
  }, []);

  const isDesktop = viewMode === 'desktop';

  const value = useMemo(
    () => ({
      viewMode,
      toggleViewMode,
      setViewMode,
      isDesktop,
      desktopWidth,
      scaleFactor,
      screenWidth,
      screenHeight,
    }),
    [viewMode, toggleViewMode, isDesktop, desktopWidth, scaleFactor, screenWidth, screenHeight]
  );

  return (
    <ViewModeContext.Provider value={value}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
