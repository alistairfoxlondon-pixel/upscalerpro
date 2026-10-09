import { SiteHeader } from '@/components/upscaler/site-header';
import { Hero } from '@/components/upscaler/hero';
import { Workspace } from '@/components/upscaler/workspace';
import { SiteFooter } from '@/components/upscaler/site-footer';

export default function Home() {
  return (
    <div id="top" className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Workspace />
      </main>
      <SiteFooter />
    </div>
  );
}
