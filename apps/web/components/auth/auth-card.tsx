import Link from 'next/link';
import type { ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
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
      <DesignSurface>
         <VStack as="main" minHeight="100svh" align="center" justify="center" padding={4}>
            <VStack
               gap={5}
               maxWidth={440}
               width="100%"
               padding={6}
               className="rounded-lg border border-border bg-card shadow-lg"
            >
               <Link href="/" aria-label="Flowie home">
                  <FlowieLogo loading={loading} label />
               </Link>
               <Heading level={1}>{title}</Heading>
               <Text>{description}</Text>
               {children}
               <Text as="p">{footer}</Text>
            </VStack>
         </VStack>
      </DesignSurface>
   );
}
