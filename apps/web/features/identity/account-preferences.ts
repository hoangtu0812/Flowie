import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import type { DefaultHome } from '@/store/ui-preferences-store';
export async function accountPreferences(accountId?: string) {
   const saved = await responseData<{
      accountId: string;
      values: { defaultHome: DefaultHome; defaultWorkspaceId?: string | null };
   }>(
      await authenticatedFetch(
         `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/users/me/ui-preferences`
      )
   );
   if (accountId && saved.accountId !== accountId)
      throw new Error('Your account changed. Sign in again.');
   useUiPreferencesStore.setState({
      accountId: saved.accountId,
      defaultHome: saved.values.defaultHome,
      defaultWorkspaceId: saved.values.defaultWorkspaceId ?? null,
   });
   return saved.values;
}

export async function saveDefaultWorkspace(accountId: string, workspaceId: string | null) {
   const url = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/users/me/ui-preferences`;
   const saved = await responseData<{ accountId: string; version: number }>(
      await authenticatedFetch(url)
   );
   if (saved.accountId !== accountId) throw new Error('Your account changed. Reload preferences.');
   await responseData(
      await authenticatedFetch(url, {
         method: 'PUT',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({
            accountId,
            expectedVersion: saved.version,
            values: { defaultWorkspaceId: workspaceId },
         }),
      })
   );
   useUiPreferencesStore.getState().reloadAccountPreferences();
}

/**
 * Records the release this account has now been shown, as its own request.
 *
 * Deliberately not a value synced by PreferenceSync. That controller reports
 * every failure as the account's preference sync status, and screens disable
 * preference actions while the status is not 'saved' — the workspace menu's
 * "Set as default workspace" among them. This write is bookkeeping nobody
 * asked for, triggered by merely opening the app, so a failed one must not
 * take unrelated controls down with it. The caller swallows the rejection; the
 * announcement simply returns on a later visit.
 *
 * Reading the version immediately before writing keeps this out of the
 * autosave controller's optimistic-version race, and reloading afterwards
 * hands that controller the version this write produced.
 *
 * VI: Ghi nhận bản phát hành vừa hiển thị cho tài khoản này, bằng một request
 * riêng.
 *
 * Cố ý không phải một giá trị do PreferenceSync đồng bộ. Controller đó báo mọi
 * lỗi thành trạng thái sync preferences của tài khoản, và các màn hình khoá
 * thao tác preferences khi trạng thái không phải 'saved' — trong đó có mục "Set
 * as default workspace" của menu workspace. Lệnh ghi này là ghi chép nền không
 * ai yêu cầu, chỉ do mở ứng dụng mà có, nên khi hỏng nó không được kéo theo các
 * control không liên quan. Nơi gọi nuốt lỗi; thông báo chỉ đơn giản quay lại ở
 * lần truy cập sau.
 *
 * Đọc version ngay trước khi ghi giúp tránh cuộc đua version lạc quan với
 * autosave controller, và việc tải lại sau đó trao cho controller ấy đúng
 * version mà lệnh ghi này tạo ra.
 */
export async function recordSeenRelease(accountId: string, version: string) {
   if (!version) return;
   const url = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/users/me/ui-preferences`;
   const saved = await responseData<{ accountId: string; version: number }>(
      await authenticatedFetch(url)
   );
   if (saved.accountId !== accountId) return;
   await responseData(
      await authenticatedFetch(url, {
         method: 'PUT',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({
            accountId,
            expectedVersion: saved.version,
            values: { lastSeenReleaseVersion: version },
         }),
      })
   );
   useUiPreferencesStore.getState().setLastSeenReleaseVersion(version);
   useUiPreferencesStore.getState().reloadAccountPreferences();
}
