'use client';

import { CircleAlert, RotateCw } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { VStack } from '@astryxdesign/core/Layout';
import { useLocale } from '@/features/shared/use-locale';
import { DesignSurface } from './design-surface';

/**
 * Load-failure placeholder for a page or panel: a centred icon, title, the error message and
 * a small Retry button. EmptyState sizes its actions to their content, so the button never
 * stretches across the panel the way it did inside a bare VStack.
 * VI: Màn hình báo lỗi tải dữ liệu cho trang hoặc panel: icon, tiêu đề, thông báo lỗi và nút
 * VI: Thử lại nhỏ, căn giữa. EmptyState giữ nút theo kích thước nội dung, nên nút không còn bị
 * VI: kéo dãn hết chiều ngang như khi nằm trực tiếp trong VStack.
 */
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
         <VStack as="section" padding={6} role="alert">
            <EmptyState
               headingLevel={2}
               icon={<CircleAlert className="size-8 text-muted-foreground" />}
               title={title ?? t('loadFailed')}
               description={message}
               actions={
                  onRetry && (
                     <Button
                        size="sm"
                        label={t('retry')}
                        icon={<RotateCw className="size-3.5" />}
                        onClick={() => {
                           void onRetry();
                        }}
                     />
                  )
               }
            />
         </VStack>
      </DesignSurface>
   );
}
