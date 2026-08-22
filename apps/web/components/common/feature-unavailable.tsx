'use client';

import { FlowieLogo } from '@/components/brand/flowie-logo';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function FeatureUnavailable() {
   const pathname = usePathname();
   const router = useRouter();
   const { orgId } = useParams<{ orgId: string }>();

   useEffect(() => {
      if (!orgId) return;
      router.replace(pathname.includes('/settings/') ? `/${orgId}/settings` : `/${orgId}/projects`);
   }, [orgId, pathname, router]);

   return (
      <section className="grid min-h-[360px] place-items-center p-6" aria-live="polite">
         <FlowieLogo loading label />
      </section>
   );
}
