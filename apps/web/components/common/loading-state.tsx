import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { FlowieLogo } from '@/components/brand/flowie-logo';
import { cn } from '@/lib/utils';

/**
 * Shared indeterminate loader shows the full supplied logo sequence while the label stays visible.
 * Reduced-motion browsers receive static artwork through FlowieLogo's picture source.
 * VI: Loader không xác định tiến độ dùng chung hiện đầy đủ trình tự logo gốc, nhãn luôn hiển thị.
 * Trình duyệt giảm chuyển động nhận ảnh tĩnh qua source của picture trong FlowieLogo.
 */
export function LoadingState({
   label = 'Loading…',
   className,
}: {
   label?: string;
   className?: string;
}) {
   return (
      <VStack
         gap={3}
         align="center"
         justify="center"
         className={cn('h-full min-h-32', className)}
         role="status"
      >
         <VStack gap={0} className="max-w-full" aria-hidden="true">
            <FlowieLogo loading label size="large" />
         </VStack>
         <Text type="supporting">{label}</Text>
      </VStack>
   );
}
