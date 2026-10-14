'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useLocale } from '@/features/shared/use-locale';
import { DesignSurface } from './design-surface';

export function QueryState({
   title,
   message,
   onRetry,
}: {
   title?: string;
   message: string;
   onRetry?: () => unknown;
}) {
   const { t } = useLocale();
   return (
      <DesignSurface>
         <VStack as="section" gap={3} padding={6} role="alert">
            <Heading level={2}>{title ?? t('loadFailed')}</Heading>
            <Text>{message}</Text>
            {onRetry && (
               <Button
                  label={t('retry')}
                  onClick={() => {
                     void onRetry();
                  }}
               />
            )}
         </VStack>
      </DesignSurface>
   );
}
