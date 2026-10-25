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
