'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';
import { loadTicketEmail, saveTicketEmail, type TicketEmailChannels } from './service-desk-api';

/**
 * Lets requesters turn off emails about their own tickets where they read those tickets, since
 * they rarely open Settings. It stays hidden while the server has no SMTP, or if the settings
 * cannot be read, because the page works without it. A failed save puts the switch back.
 * VI: Cho người yêu cầu tắt email về ticket của mình ngay nơi họ đọc ticket, vì họ ít khi mở
 * VI: Settings. Công tắc ẩn khi server chưa có SMTP, hoặc khi không đọc được cài đặt, vì trang vẫn
 * VI: dùng được khi không có nó. Lưu lỗi thì công tắc trở về trạng thái cũ.
 */
export function TicketEmailSwitch({ workspaceId }: { workspaceId: string }) {
   const tx = useMessages(messages);
   const [channels, setChannels] = useState<TicketEmailChannels>();
   const [error, setError] = useState<string>();

   useEffect(() => {
      let current = true;
      loadTicketEmail(workspaceId)
         .then((loaded) => current && setChannels(loaded))
         .catch(() => undefined);
      return () => {
         current = false;
      };
   }, [workspaceId]);

   if (!channels?.emailAvailable) return null;

   const change = async (ticketEmailEnabled: boolean) => {
      const next = { ...channels, ticketEmailEnabled };
      setChannels(next);
      setError(undefined);
      try {
         await saveTicketEmail(workspaceId, next);
      } catch (caught) {
         setChannels(channels);
         setError(caught instanceof Error ? caught.message : 'Could not save email settings.');
      }
   };

   return (
      <div className="shrink-0 border-t px-4 py-2">
         <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ticket-email">{tx('Email me about my tickets')}</Label>
            <Switch
               id="ticket-email"
               checked={channels.ticketEmailEnabled}
               onCheckedChange={(checked) => void change(checked)}
            />
         </div>
         {error && (
            <p role="alert" className="mt-1 text-sm text-destructive">
               {error}
            </p>
         )}
      </div>
   );
}
