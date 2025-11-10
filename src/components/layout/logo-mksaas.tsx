import { websiteConfig } from '@/config/website';
import { cn } from '@/lib/utils';
import Image from 'next/image';

export function MkSaaSLogo({ className }: { className?: string }) {
  const logo = websiteConfig.metadata.images?.logoLight ?? '/logo.png';
  
  return (
    <Image
      src={logo}
      alt="Logo of PalmReading"
      title="Logo of PalmReading"
      width={96}
      height={96}
      className={cn('size-8 rounded-md', className)}
    />
  );
}
