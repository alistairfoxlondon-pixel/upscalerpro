'use client';

import * as React from 'react';
import { MaterialIcon } from './material-icon';
import { cn } from '@/lib/utils';

/** Reference style scroll to top button, appears after scrolling down. */
export function ScrollTop() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Scroll back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={cn(
        'fixed bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-md border bg-card text-foreground shadow-md transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
      )}
    >
      <MaterialIcon name="keyboard_arrow_up" size={22} />
    </button>
  );
}
