import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AuthCard({
   title,
   description,
   children,
   footer,
}: {
   title: string;
   description: string;
   children: ReactNode;
   footer: ReactNode;
}) {
   return (
      <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
         <Card className="w-full max-w-md">
            <CardHeader className="space-y-2">
               <Link href="/" className="text-sm font-semibold tracking-tight">
                  Flowie
               </Link>
               <CardTitle>{title}</CardTitle>
               <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
               {children}
               <p className="text-center text-sm text-muted-foreground">{footer}</p>
            </CardContent>
         </Card>
      </main>
   );
}
