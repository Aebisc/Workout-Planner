import { useEffect, useState } from 'react';

/**
 * Hook to detect if the current view is mobile.
 * Returns true if window width <= 768px or coarse pointer (touch device).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    const isSmall = window.innerWidth <= 768;
    const isTouch =
      window.matchMedia('(pointer: coarse)').matches ||
      (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0);
    return isMobileUA || isSmall || isTouch;
  });

  useEffect(() => {
    const checkMobile = () => {
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      const isSmall = window.innerWidth <= 768;
      const isTouch =
        window.matchMedia('(pointer: coarse)').matches ||
        (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0);
      setIsMobile(isMobileUA || isSmall || isTouch);
    };

    window.addEventListener('resize', checkMobile);
    const mql = window.matchMedia('(pointer: coarse)');
    mql.addEventListener?.('change', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
      mql.removeEventListener?.('change', checkMobile);
    };
  }, []);

  return isMobile;
}
