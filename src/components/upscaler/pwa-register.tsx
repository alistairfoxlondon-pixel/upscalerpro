'use client';

import * as React from 'react';

/** Registers the offline service worker in production builds only. */
export function PwaRegister() {
  React.useEffect(() => {
    if (
      process.env.NODE_ENV === 'production' &&
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator
    ) {
      const onLoad = () => {
        navigator.serviceWorker.register('/sw.js').catch(() => undefined);
      };
      if (document.readyState === 'complete') onLoad();
      else window.addEventListener('load', onLoad);
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);
  return null;
}
