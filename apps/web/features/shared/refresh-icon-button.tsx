'use client';
import { Button } from '@astryxdesign/core/Button';
import { RefreshCw } from 'lucide-react';

/**
 * Small ghost icon button that reloads a settings list. `label` stays the accessible name and
 * the tooltip, so tests and screen readers still find "Refresh devices" and similar labels.
 * VI: Nút icon ghost cỡ nhỏ để tải lại một danh sách cài đặt. `label` vẫn là tên truy cập và
 * tooltip, nên test và trình đọc màn hình vẫn tìm thấy "Refresh devices" và các nhãn tương tự.
 */
export function RefreshIconButton({
   label,
   onClick,
   isDisabled,
}: {
   label: string;
   onClick: () => void;
   isDisabled?: boolean;
}) {
   return (
      <Button
         label={label}
         tooltip={label}
         icon={<RefreshCw className="size-3.5" />}
         isIconOnly
         variant="ghost"
         size="sm"
         onClick={onClick}
         isDisabled={isDisabled}
      />
   );
}
