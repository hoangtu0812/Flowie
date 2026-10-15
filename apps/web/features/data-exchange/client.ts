import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
export const exchangeApi =
   (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1') + '/data-exchange';
export async function exchange<T>(path: string, body?: unknown): Promise<T> {
   return responseData<T>(
      await authenticatedFetch(
         exchangeApi + path,
         body === undefined
            ? undefined
            : {
                 method: 'POST',
                 headers: { 'content-type': 'application/json' },
                 body: JSON.stringify(body),
              }
      )
   );
}
export type ImportResult = {
   id: string;
   state: string;
   expiresAt: string;
   counts: Record<string, number>;
   rows: {
      rowNumber: number;
      externalId: string | null;
      title: string;
      priority?: string;
      issueType?: string;
      state: string;
      errorCode: string | null;
      identifier: string | null;
   }[];
   nextAfter: number | null;
};
export type RecentImport = { id: string; state: string; createdAt: string; sourceKey: string };
export const importRunning = (state?: string) => state === 'QUEUED' || state === 'RUNNING';
export const importFields = [
   'externalId',
   'title',
   'description',
   'priority',
   'issueType',
   'severity',
   'environment',
   'reproductionSteps',
   'expectedResult',
   'actualResult',
   'statusId',
   'projectId',
   'assigneeId',
   'startDate',
   'targetDate',
   'dueDate',
];
