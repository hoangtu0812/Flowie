import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
let pending: Promise<{ id: string }> | undefined;
/** Coalesce simultaneous identity reads without caching an account across sessions. */
export function loadCurrentUser(): Promise<{ id: string }> {
   if (pending) return pending;
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   pending = authenticatedFetch(`${api}/users/me`)
      .then(responseData<{ id: string }>)
      .finally(() => {
         pending = undefined;
      });
   return pending;
}
