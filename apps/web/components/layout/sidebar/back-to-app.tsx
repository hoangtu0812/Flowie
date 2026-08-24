'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { useParams } from 'next/navigation';

export function BackToApp() {
   const { orgId } = useParams<{ orgId: string }>();
   return (
      <div className="w-full flex items-center justify-between gap-2">
         <Button className="w-fit" size="xs" variant="outline" asChild>
            <Link href={`/${orgId}`}>
               <ChevronLeft className="size-4" />
               Back to app
            </Link>
         </Button>
         <ThemeToggle />
      </div>
   );
}
