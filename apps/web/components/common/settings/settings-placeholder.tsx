'use client';

import { FlowieLogo } from '@/components/brand/flowie-logo';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Redirects retired settings routes until their server-backed modules ship. */
export default function SettingsPlaceholder(props: { config?: unknown }) {
   void props;
   const router = useRouter();
   const { orgId } = useParams<{ orgId: string }>();

   useEffect(() => {
      if (orgId) router.replace(`/${orgId}/settings`);
   }, [orgId, router]);

   return (
      <section className="grid min-h-[360px] place-items-center p-6" aria-live="polite">
         <FlowieLogo loading label />
      </section>
   );
}
