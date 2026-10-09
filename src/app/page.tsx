import { SiteHeader } from '@/components/upscaler/site-header';
import { Hero } from '@/components/upscaler/hero';
import { Workspace } from '@/components/upscaler/workspace';
import { Features } from '@/components/upscaler/features';
import { Faq } from '@/components/upscaler/faq';
import { OssCredits } from '@/components/upscaler/oss-credits';
import { SiteFooter } from '@/components/upscaler/site-footer';

export default function Home() {
  return (
    <div id="top" className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Workspace />
        <Features />
        <Faq />
        <OssCredits />
      </main>
      <SiteFooter />
    </div>
  );
}
