'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Icon button that copies text to the clipboard and shows a check for two seconds.
 * `text` is read on click, so a caller can pass a function that reads the rendered DOM
 * (for example a code block's textContent) instead of keeping a second copy of it.
 * A clipboard refusal (insecure origin, denied permission) is reported with a toast.
 * VI: Nút icon chép văn bản vào clipboard và hiện dấu tích trong hai giây. `text` được
 * VI: đọc khi bấm, nên nơi gọi có thể truyền hàm đọc DOM đã hiển thị (ví dụ textContent
 * VI: của code block) thay vì giữ thêm một bản sao. Clipboard bị từ chối (origin không an
 * VI: toàn, không có quyền) được báo bằng toast.
 */
export function CopyButton({
   text,
   label = 'Copy',
   className,
}: {
   text: string | (() => string);
   label?: string;
   className?: string;
}) {
   const [copied, setCopied] = useState(false);
   const copy = async () => {
      try {
         await navigator.clipboard.writeText(typeof text === 'function' ? text() : text);
         setCopied(true);
         window.setTimeout(() => setCopied(false), 2000);
      } catch {
         toast.error('Could not access the clipboard');
      }
   };
   return (
      <Button
         type="button"
         variant="ghost"
         size="icon"
         className={cn('size-7 text-muted-foreground hover:text-foreground', className)}
         onClick={() => void copy()}
         aria-label={copied ? 'Copied' : label}
         title={label}
      >
         {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
   );
}
