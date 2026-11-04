import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { FlowieLogo } from '@/components/brand/flowie-logo';
import { cn } from '@/lib/utils';

/**
 * Shared indeterminate loader keeps its label available while brand motion loops.
 * Reduced-motion browsers receive static artwork through FlowieLogo's picture source.
 * VI: Loader không xác định tiến độ dùng chung giữ nhãn truy cập khi motion thương hiệu lặp.
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
         <VStack gap={0} padding={3} className="rounded-2xl bg-muted/50" aria-hidden="true">
            <FlowieLogo loading />
         </VStack>
         <Text type="supporting">{label}</Text>
      </VStack>
   );
}
