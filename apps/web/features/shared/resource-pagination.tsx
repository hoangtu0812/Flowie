'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/shared/messages.vi';

import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import type { PageMetadata } from '@/features/issues/issue-query';

export function ResourcePagination({
   count,
   page,
   loading,
   error,
   loadMore,
   reload,
   label = 'results',
}: {
   count: number;
   page?: PageMetadata;
   loading: boolean;
   error?: string;
   loadMore: () => unknown;
   reload: () => unknown;
   label?: string;
}) {
   const tx = useMessages(messages);

   return (
      <DesignSurface>
         <HStack padding={3} gap={3} wrap="wrap" justify="between">
            <Text type="supporting">
               {page
                  ? tx('{count} of {total} {label} loaded', { count, total: page.total, label })
                  : loading
                    ? tx('Loading…')
                    : ''}
            </Text>
            {error && <Text role="alert">{error}</Text>}
            {page?.nextCursor && (
               <Button
                  label={
                     error
                        ? tx('Retry more {label}', { label })
                        : tx('Load more {label}', { label })
                  }
                  isLoading={loading}
                  onClick={() => void loadMore()}
               />
            )}
            {error && !page?.nextCursor && (
               <Button label={tx('Try again')} isLoading={loading} onClick={() => void reload()} />
            )}
         </HStack>
      </DesignSurface>
   );
}
