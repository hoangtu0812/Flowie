const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type StreamNotification = {
   id: string;
   userId: string;
   readAt?: string | null;
   entityType?: string;
   entityId?: string;
};

/**
 * Keeps one socket to the notification stream of a workspace, reconnecting with growing delays.
 * `onReconnect` fires after a dropped connection returns, because anything sent during the gap is
 * lost and the REST data must be read again. Returns a function that closes the socket for good.
 * VI: Giữ một socket tới luồng thông báo của workspace, tự kết nối lại với thời gian chờ tăng dần.
 * VI: `onReconnect` chạy khi kết nối bị rớt đã trở lại, vì tin gửi trong lúc rớt bị mất và phải đọc
 * VI: lại dữ liệu REST. Trả về hàm đóng hẳn socket.
 */
export function openNotificationStream(
   workspaceId: string,
   handlers: {
      onNotification: (notification?: StreamNotification) => void;
      onReconnect: () => void;
   }
) {
   let closed = false;
   let socket: WebSocket | undefined;
   let reconnectTimer: number | undefined;
   let heartbeatTimer: number | undefined;
   let attempt = 0;
   let connected = false;

   const connect = () => {
      const stream = new URL(`${api}/notifications/stream`);
      stream.protocol = stream.protocol === 'https:' ? 'wss:' : 'ws:';
      stream.searchParams.set('workspaceId', workspaceId);
      socket = new WebSocket(stream);
      socket.onopen = () => {
         attempt = 0;
         if (connected) handlers.onReconnect();
         connected = true;
         heartbeatTimer = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
         }, 25_000);
      };
      socket.onmessage = (event) => {
         if (event.data === 'pong') return;
         try {
            const payload = JSON.parse(event.data) as {
               type?: string;
               notification?: StreamNotification;
            };
            if (payload.type === 'notification.created')
               handlers.onNotification(payload.notification);
         } catch {
            // Ignore malformed data; the durable REST list remains the source of truth.
            // VI: Bỏ qua dữ liệu lỗi; danh sách REST vẫn là nguồn dữ liệu chính.
         }
      };
      socket.onclose = () => {
         if (heartbeatTimer) window.clearInterval(heartbeatTimer);
         if (!closed) {
            const delay = Math.min(30_000, 1_000 * 2 ** attempt++);
            reconnectTimer = window.setTimeout(connect, delay);
         }
      };
   };
   connect();
   return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      socket?.close();
   };
}
