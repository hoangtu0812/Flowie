'use client';

import { usePathname } from 'next/navigation';

export function FeatureUnavailable() {
   const pathname = usePathname();
   const label = pathname.split('/').filter(Boolean).at(-1)?.replace(/-/g, ' ') ?? 'Feature';
   return (
      <section className="mx-auto grid min-h-[360px] w-full max-w-3xl place-items-center p-6 text-center">
         <div>
            <h1 className="text-xl font-semibold">{label[0]?.toUpperCase() + label.slice(1)}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
               This area has no server-backed data configured yet. It intentionally shows no sample
               data.
            </p>
         </div>
      </section>
   );
}
