'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { HStack } from '@astryxdesign/core/Layout';
import { cn } from '@/lib/utils';
import { withBasePath } from '@/lib/base-path';

export function FlowieLogo({
   className,
   loading = false,
   label = false,
   size = 'default',
}: {
   className?: string;
   loading?: boolean;
   label?: boolean;
   size?: 'default' | 'large';
}) {
   const { resolvedTheme } = useTheme();
   const [mounted, setMounted] = useState(false);
   useEffect(() => setMounted(true), []);
   // The server cannot read saved themes; defer variant choice while keeping identical media dimensions.
   // VI: Server không đọc được theme đã lưu; hoãn chọn biến thể nhưng giữ cùng kích thước media.
   const suffix = mounted && resolvedTheme === 'dark' ? '-dark' : '';
   const source = withBasePath(label ? `/brand/flowie-logo${suffix}.svg` : '/flowie-icon.svg');
   const motion = withBasePath(
      label ? `/brand/flowie-motion${suffix}-v2.svg` : '/brand/flowie-symbol-motion-v2.svg'
   );
   const width = label ? 1110 : 400;
   const height = label ? 350 : 400;
   const fullWidth = size === 'large' ? 'w-64' : 'w-32';
   return (
      <HStack gap={0} className={cn('inline-flex max-w-full shrink-0', className)}>
         {loading ? (
            <picture className={cn('block max-w-full shrink-0', label ? fullWidth : 'size-14')}>
               <source media="(prefers-reduced-motion: reduce)" srcSet={source} />
               {/* The app theme chooses contrast; reduced motion retains the same dimensions and logo kind.
                   VI: Theme app chọn độ tương phản; giảm chuyển động giữ cùng kích thước và dạng logo. */}
               <img
                  src={motion}
                  width={width}
                  height={height}
                  alt="Flowie"
                  className="block h-auto w-full"
               />
            </picture>
         ) : (
            <svg
               role="img"
               aria-label="Flowie"
               viewBox={`0 0 ${width} ${height}`}
               className={cn('block max-w-full shrink-0', label ? `h-auto ${fullWidth}` : 'size-8')}
            >
               <image href={source} x={0} y={0} width={width} height={height} />
            </svg>
         )}
      </HStack>
   );
}
