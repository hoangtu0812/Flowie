import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { securityApi } from './types';

export type MfaStatus = {
   available: boolean;
   enabled: boolean;
   hasPassword: boolean;
   recoveryRemaining: number;
};
export type Enrollment = { secret: string; uri: string; qr: string; expiresAt: string };
export type FactorKind = 'AUTHENTICATOR' | 'RECOVERY';
export const factorOptions = [
   { value: 'AUTHENTICATOR', label: 'Authenticator code' },
   { value: 'RECOVERY', label: 'Recovery code' },
];
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
