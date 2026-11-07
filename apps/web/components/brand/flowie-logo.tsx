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
   const source = withBasePath(
      label ? `/brand/flowie-pixel-logo${suffix}.svg` : '/flowie-icon.svg'
   );
   // The supplied kit animates the full logo only. Its standalone icon ships as
   // Lottie and animated WebP for the mobile apps, and the WebP alone is 652KB,
   // which is not worth committing for a combination no screen renders: every
   // caller that sets `loading` also sets `label`. The icon therefore keeps its
   // static artwork while loading rather than gaining a motion file of its own.
   // VI: Bộ asset được cung cấp chỉ có animation cho logo đầy đủ. Phần icon
   // riêng được giao dưới dạng Lottie và WebP động cho app mobile, riêng tệp
   // WebP đã 652KB, không đáng đưa vào repository cho một tổ hợp không màn hình
   // nào render: mọi nơi truyền `loading` đều truyền cả `label`. Vì vậy icon giữ
   // ảnh tĩnh khi đang tải thay vì có thêm một tệp động riêng.
   const motion = label ? withBasePath(`/brand/flowie-pixel-motion${suffix}.svg`) : source;
   // The kit's own pixel dimensions. They set the media box's aspect ratio, so a
   // stale number here does not crop the artwork, it stretches it.
   // VI: Kích thước pixel gốc của bộ kit. Chúng quyết định tỷ lệ khung media, nên
   // một con số cũ ở đây không làm cắt hình mà làm hình bị kéo méo.
   const width = label ? 1100 : 390;
   const height = label ? 360 : 390;
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
