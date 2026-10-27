import { authenticatedFetch, workspaceSlugFromLocation } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { loadCurrentUser } from '@/features/identity/current-user';
import { withBasePath } from '@/lib/base-path';

export async function showDesktopNotification(
   workspaceId: string,
   record: { id: string; userId: string; readAt?: string | null }
) {
   if (
      !('Notification' in window) ||
      Notification.permission !== 'granted' ||
      document.visibilityState !== 'hidden' ||
      record.readAt
   )
      return;
   const slug = workspaceSlugFromLocation();
   try {
      const user = await loadCurrentUser();
      if (user.id !== record.userId) return;
      const settings = await responseData<{ desktopEnabled: boolean }>(
         await authenticatedFetch(
            `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/notifications/channels?${new URLSearchParams({ workspaceId })}`
         )
      );
      if (!settings.desktopEnabled || workspaceSlugFromLocation() !== slug) return;
      const notification = new Notification('Flowie', {
         body: 'You have a new notification.',
         tag: record.id,
      });
      notification.onclick = () => {
         window.focus();
         window.location.assign(withBasePath(`/${encodeURIComponent(slug ?? '')}/inbox`));
         notification.close();
      };
   } catch {
      /* Browser delivery cannot block the durable Inbox. */
   }
}
