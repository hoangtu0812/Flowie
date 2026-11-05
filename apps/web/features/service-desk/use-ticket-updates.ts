'use client';

import { useEffect, useRef } from 'react';
import { openNotificationStream } from '@/lib/notification-stream';

/**
 * Calls `refresh` when a ticket notification reaches this person, when a dropped connection
 * returns, and when the window regains focus, which also covers tickets this person is not
 * notified about. The socket follows `workspaceId`, so changing workspace closes the old one.
 * `refresh` is read through a ref so a new function does not reopen the socket.
 * VI: Gọi `refresh` khi người này nhận thông báo ticket, khi kết nối bị rớt đã trở lại, và khi cửa
 * VI: sổ được focus, trường hợp cuối cũng bao gồm ticket mà người này không nhận thông báo. Socket
 * VI: theo `workspaceId`, nên đổi workspace sẽ đóng socket cũ. `refresh` được đọc qua ref để hàm
 * VI: mới không làm mở lại socket.
 */
export function useTicketUpdates(workspaceId: string | undefined, refresh: () => unknown) {
   const latest = useRef(refresh);
   useEffect(() => {
      latest.current = refresh;
   });
   useEffect(() => {
      if (!workspaceId) return;
      const run = () => void latest.current();
      window.addEventListener('focus', run);
      const close = openNotificationStream(workspaceId, {
         onReconnect: run,
         onNotification: (notification) => {
            if (notification?.entityType === 'ticket') run();
         },
      });
      return () => {
         window.removeEventListener('focus', run);
         close();
      };
   }, [workspaceId]);
}
