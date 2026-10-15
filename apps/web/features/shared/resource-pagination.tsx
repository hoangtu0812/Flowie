'use client';
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
   return (
      <DesignSurface>
         <HStack padding={3} gap={3} wrap="wrap" justify="between">
            <Text type="supporting">
               {page ? `${count} of ${page.total} ${label} loaded` : loading ? 'Loading…' : ''}
            </Text>
            {error && <Text role="alert">{error}</Text>}
            {page?.nextCursor && (
               <Button
                  label={error ? `Retry more ${label}` : `Load more ${label}`}
                  isLoading={loading}
                  onClick={() => void loadMore()}
               />
            )}
            {error && !page?.nextCursor && (
               <Button label="Try again" isLoading={loading} onClick={() => void reload()} />
            )}
         </HStack>
      </DesignSurface>
   );
}
