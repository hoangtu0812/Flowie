import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { securityApi } from './types';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';

export type MfaStatus = {
   available: boolean;
   enabled: boolean;
   hasPassword: boolean;
   recoveryRemaining: number;
};
export type Enrollment = { secret: string; uri: string; qr: string; expiresAt: string };
export type FactorKind = 'AUTHENTICATOR' | 'RECOVERY';
export function useFactorOptions() {
   const tx = useMessages(messages);
   return [
      { value: 'AUTHENTICATOR', label: tx('Authenticator code') },
      { value: 'RECOVERY', label: tx('Recovery code') },
   ];
}
export const mfaRequest = async <T>(path: string, body?: unknown) =>
   responseData<T>(
      await authenticatedFetch(
         `${securityApi}/mfa${path}`,
         body === undefined
            ? undefined
            : {
                 method: 'POST',
                 body: JSON.stringify(body),
                 headers: { 'Content-Type': 'application/json' },
              }
      )
   );
