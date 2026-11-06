'use client';
import { Button } from '@astryxdesign/core/Button';

/**
 * Inline confirmation bar for a destructive security action (device or credential revocation).
 * The question sits on the left and two small buttons on the right; on narrow screens the
 * buttons wrap under the question so they never overflow a 390px viewport.
 * VI: Thanh xác nhận nội tuyến cho thao tác bảo mật không hoàn tác (thu hồi thiết bị hoặc
 * credential). Câu hỏi bên trái, hai nút nhỏ bên phải; ở màn hình hẹp các nút xuống dòng dưới
 * câu hỏi để không tràn khung 390px.
 */
export function ConfirmRow({
   question,
   confirmLabel,
   cancelLabel,
   busy,
   onConfirm,
   onCancel,
}: {
   question: string;
   confirmLabel: string;
   cancelLabel: string;
   busy: boolean;
   onConfirm: () => void;
   onCancel: () => void;
}) {
   return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-container px-4 py-3">
         <span className="flex-1 min-w-48 text-sm">{question}</span>
         <div className="flex flex-wrap items-center gap-2">
            <Button
               label={confirmLabel}
               size="sm"
               variant="destructive"
               onClick={onConfirm}
               isLoading={busy}
            />
            <Button
               label={cancelLabel}
               size="sm"
               variant="ghost"
               onClick={onCancel}
               isDisabled={busy}
            />
         </div>
      </div>
   );
}
