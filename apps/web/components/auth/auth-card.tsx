import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowieLogo } from '@/components/brand/flowie-logo';

export function AuthCard({
   title,
   description,
   children,
   footer,
   loading = false,
}: {
   title: string;
   description: string;
   children: ReactNode;
   footer: ReactNode;
   loading?: boolean;
}) {
   return (
      <main className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-background p-4">
         <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,oklch(0.78_0.15_55_/_0.22),transparent_38%),radial-gradient(circle_at_bottom_right,oklch(0.64_0.17_260_/_0.16),transparent_42%)]"
         />
         <Card className="w-full max-w-md border-border/80 bg-card/95 shadow-2xl shadow-black/10 backdrop-blur">
            <CardHeader className="space-y-4 pb-5">
               <Link
                  href="/"
                  className="w-fit rounded-md text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
               >
                  <FlowieLogo loading={loading} label />
               </Link>
               <div className="space-y-1.5">
                  <CardTitle className="text-2xl tracking-tight">{title}</CardTitle>
                  <CardDescription className="leading-6">{description}</CardDescription>
               </div>
            </CardHeader>
            <CardContent className="space-y-5">
               {children}
               <p className="text-center text-sm text-muted-foreground">{footer}</p>
            </CardContent>
         </Card>
      </main>
   );
}
