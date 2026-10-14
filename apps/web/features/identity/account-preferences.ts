import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import type { DefaultHome } from '@/store/ui-preferences-store';
export async function accountHome(accountId?: string): Promise<DefaultHome> {
   const saved = await responseData<{ accountId: string; values: { defaultHome: DefaultHome } }>(
      await authenticatedFetch(
         `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/users/me/ui-preferences`
      )
   );
   if (accountId && saved.accountId !== accountId)
      throw new Error('Your account changed. Sign in again.');
   useUiPreferencesStore.setState({
      accountId: saved.accountId,
      defaultHome: saved.values.defaultHome,
   });
   return saved.values.defaultHome;
}
