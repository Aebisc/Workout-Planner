import { useEffect, useState } from 'react';

/**
 * Hook to detect if the current view should render the dedicated Mobile UI.
 * Triggers on mobile/tablet User-Agents OR viewports <= 768px.
 */
export function useIsMobile(): boolean {
  const checkIsMobile = (): boolean => {
    if (typeof window === 'undefined') return false;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    const isSmallViewport = window.innerWidth <= 768;
    return isMobileUA || isSmallViewport;
  };

  const [isMobile, setIsMobile] = useState<boolean>(checkIsMobile);

  useEffect(() => {
    const handleResize = () => setIsMobile(checkIsMobile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}
