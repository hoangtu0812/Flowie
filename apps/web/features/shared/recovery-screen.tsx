'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/shared/messages.vi';

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
   const tx = useMessages(messages);

   return (
      <DesignSurface>
         <VStack gap={4} padding={6} className="h-full w-full" justify="center" align="center">
            <Heading level={1}>{title}</Heading>
            <Text role="alert">{message}</Text>
            {reference && (
               <Text color="secondary">
                  {tx('Reference:')} {reference}
               </Text>
            )}
            <HStack gap={3}>
               {retry && <Button label={tx('Try again')} onClick={retry} />}
               <Button label={tx('Return home')} href={home} />
            </HStack>
         </VStack>
      </DesignSurface>
   );
}
