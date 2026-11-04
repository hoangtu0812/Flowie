import { HStack } from '@astryxdesign/core/Layout';
import { cn } from '@/lib/utils';
import { withBasePath } from '@/lib/base-path';

export function FlowieLogo({
   className,
   loading = false,
   label = false,
}: {
   className?: string;
   loading?: boolean;
   label?: boolean;
}) {
   const source = withBasePath(label ? '/brand/flowie-logo.svg' : '/flowie-icon.svg');
   return (
      <HStack gap={0} className={cn('inline-flex shrink-0', className)}>
         {loading ? (
            <picture className={label ? 'block w-40 shrink-0' : 'block w-36 shrink-0'}>
               <source
                  media="(prefers-reduced-motion: reduce)"
                  srcSet={withBasePath('/brand/flowie-logo.svg')}
               />
               {/* Local brand artwork renders as an inert image; reduced motion always gets the static logo.
             VI: Asset thương hiệu local hiển thị dưới dạng ảnh bất hoạt; giảm chuyển động luôn dùng logo tĩnh. */}
               <img
                  src={withBasePath('/brand/flowie-motion.svg')}
                  width={1170}
                  height={450}
                  alt="Flowie"
                  className="block h-auto w-full rounded"
               />
            </picture>
         ) : (
            <svg
               role="img"
               aria-label="Flowie"
               viewBox={label ? '0 0 1170 450' : '35 50 375 350'}
               className={label ? 'block h-auto w-32 shrink-0 rounded' : 'block size-8 shrink-0'}
            >
               <image
                  href={source}
                  x={label ? 0 : 35}
                  y={label ? 0 : 50}
                  width={label ? 1170 : 375}
                  height={label ? 450 : 350}
               />
            </svg>
         )}
      </HStack>
   );
}
