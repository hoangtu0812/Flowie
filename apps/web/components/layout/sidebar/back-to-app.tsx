'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/navigation/messages.vi';

import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export function BackToApp() {
   const tx = useMessages(messages);
   const { orgId } = useParams<{ orgId: string }>();
   return (
      <div className="w-full flex items-center justify-between gap-2">
         <Button className="w-fit" size="xs" variant="outline" asChild>
            <Link href={`/${orgId}/inbox`}>
               <ChevronLeft className="size-4" />
               {tx('Back to app')}
            </Link>
         </Button>
         <ThemeToggle />
      </div>
   );
}
