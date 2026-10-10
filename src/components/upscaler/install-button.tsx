'use client';

import * as React from 'react';
import { MaterialIcon } from './material-icon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Custom install affordance for the PWA build. Renders nothing until the
 * browser fires `beforeinstallprompt` (and hides itself once installed).
 */
export function InstallButton() {
  const [evt, setEvt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = React.useState(false);

  React.useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!evt || installed) return null;

  const install = async () => {
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
    } catch {
      /* user dismissed or browser refused */
    }
    setEvt(null);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-2 text-muted-foreground"
            onClick={() => void install()}
            aria-label="Install PixelForge as an app"
          >
            <MaterialIcon name="download" size={17} />
            <span className="hidden text-xs sm:inline">Install</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Install PixelForge, launches like an app</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
