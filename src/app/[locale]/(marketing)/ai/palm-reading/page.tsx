import PalmReadingBot from '@/ai/chat/components/PalmReadingBot';
import { constructMetadata } from '@/lib/metadata';
import { ZapIcon } from 'lucide-react';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata | undefined> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const pt = await getTranslations({ locale, namespace: 'PalmReadingPage' });

  return constructMetadata({
    title: pt('title') + ' | ' + t('title'),
    description: pt('description'),
    locale,
    pathname: '/ai/palm-reading',
  });
}

export default async function PalmReadingPage() {
  const t = await getTranslations('PalmReadingPage');

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/50">
      <div className="container mx-auto px-4 py-8 md:py-16">
        {/* Header Section */}
        <div className="text-center space-y-6 mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            {t('title')}
          </h1>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <ZapIcon className="size-4" />
            {t('subtitle')}
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t('description')}
          </p>
        </div>

        {/* Palm Reading Bot */}
        <div className="max-w-4xl mx-auto">
          <PalmReadingBot />
        </div>
      </div>
    </div>
  );
}

