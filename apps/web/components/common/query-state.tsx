'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from './design-surface';

export function QueryState({
   title = 'Could not load data',
   message,
   onRetry,
}: {
   title?: string;
   message: string;
   onRetry?: () => unknown;
}) {
   return (
      <DesignSurface>
         <VStack as="section" gap={3} padding={6} role="alert">
            <Heading level={2}>{title}</Heading>
            <Text>{message}</Text>
            {onRetry && (
               <Button
                  label="Retry"
                  onClick={() => {
                     void onRetry();
                  }}
               />
            )}
         </VStack>
      </DesignSurface>
   );
}
