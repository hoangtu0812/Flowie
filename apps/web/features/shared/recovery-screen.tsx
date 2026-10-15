'use client';

import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';

export function RecoveryScreen({
   title,
   message,
   retry,
   reference,
   home = '/',
}: {
   title: string;
   message: string;
   retry?: () => void;
   reference?: string;
   home?: string;
}) {
   return (
      <DesignSurface>
         <VStack gap={4} padding={6} className="h-full w-full" justify="center" align="center">
            <Heading level={1}>{title}</Heading>
            <Text role="alert">{message}</Text>
            {reference && <Text color="secondary">Reference: {reference}</Text>}
            <HStack gap={3}>
               {retry && <Button label="Try again" onClick={retry} />}
               <Button label="Return home" href={home} />
            </HStack>
         </VStack>
      </DesignSurface>
   );
}
