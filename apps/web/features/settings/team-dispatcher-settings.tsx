'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { authenticatedFetch } from '@/lib/workspaces';
import { Bot } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard, SettingsRow } from './shared';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type DispatcherSettings = {
   teamId: string;
   enabled: boolean;
   dryRun: boolean;
   maxActionsPerDay: number;
   assignUnassigned: boolean;
   nudgeOverdue: boolean;
   lastRunAt: string | null;
   lastRunResult: {
      dryRun?: boolean;
      applied?: number;
      nudged?: number;
      wouldApply?: number;
      wouldNudge?: number;
      reported?: boolean;
   } | null;
};

/** Per-team autonomous dispatcher controls: opt-in, dry-run, budget and scope. */
export function TeamDispatcherSettings({
   workspaceId,
   teamId,
}: {
   workspaceId: string;
   teamId: string;
}) {
   const [settings, setSettings] = useState<DispatcherSettings | null>(null);
   const [draft, setDraft] = useState({
      enabled: false,
      dryRun: true,
      maxActionsPerDay: 5,
      assignUnassigned: true,
      nudgeOverdue: true,
   });
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [running, setRunning] = useState(false);

   const load = useCallback(async () => {
      setLoading(true);
      try {
         const response = await authenticatedFetch(
            `${api}/teams/${teamId}/dispatcher?workspaceId=${workspaceId}`
         );
         if (!response.ok) throw new Error('Could not load dispatcher settings.');
         const payload = ((await response.json()) as { data: DispatcherSettings }).data;
         setSettings(payload);
         setDraft({
            enabled: payload.enabled,
            dryRun: payload.dryRun,
            maxActionsPerDay: payload.maxActionsPerDay,
            assignUnassigned: payload.assignUnassigned,
            nudgeOverdue: payload.nudgeOverdue,
         });
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not load dispatcher.');
      } finally {
         setLoading(false);
      }
   }, [teamId, workspaceId]);

   useEffect(() => {
      void load();
   }, [load]);

   const save = async () => {
      setSaving(true);
      try {
         const response = await authenticatedFetch(
            `${api}/teams/${teamId}/dispatcher?workspaceId=${workspaceId}`,
            {
               method: 'PUT',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify(draft),
            }
         );
         if (!response.ok) throw new Error('Could not save dispatcher settings.');
         const payload = ((await response.json()) as { data: DispatcherSettings }).data;
         setSettings(payload);
         toast.success('Dispatcher settings saved.');
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not save dispatcher.');
      } finally {
         setSaving(false);
      }
   };

   const runNow = async () => {
      setRunning(true);
      try {
         const response = await authenticatedFetch(
            `${api}/teams/${teamId}/dispatcher/run?workspaceId=${workspaceId}`,
            { method: 'POST' }
         );
         const payload = (await response.json().catch(() => null)) as {
            data?: { applied?: unknown[]; nudged?: unknown[] };
            message?: string;
         } | null;
         if (!response.ok) throw new Error(payload?.message ?? 'Dispatcher run failed.');
         const applied = payload?.data?.applied?.length ?? 0;
         const nudged = payload?.data?.nudged?.length ?? 0;
         toast.success(`Dispatcher run finished: ${applied} assigned, ${nudged} nudged.`);
         void load();
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Dispatcher run failed.');
      } finally {
         setRunning(false);
      }
   };

   const lastRun = settings?.lastRunResult
      ? `${settings.lastRunResult.dryRun ? '[dry-run] ' : ''}${settings.lastRunResult.applied ?? 0} assigned · ${settings.lastRunResult.nudged ?? 0} nudged`
      : 'Never run';

   return (
      <SettingsCard>
         <SettingsRow
            icon={<Bot className="size-4" />}
            title="Auto dispatcher"
            description="Assign unassigned issues and nudge overdue owners daily at 08:30 (GMT+7)"
            trailing={
               <Switch
                  checked={draft.enabled}
                  onCheckedChange={(value) =>
                     setDraft((current) => ({ ...current, enabled: value }))
                  }
               />
            }
         />
         <SettingsRow
            title="Dry-run mode"
            description="Report only: no assignments, no nudges until turned off"
            trailing={
               <Switch
                  checked={draft.dryRun}
                  onCheckedChange={(value) =>
                     setDraft((current) => ({ ...current, dryRun: value }))
                  }
               />
            }
         />
         <SettingsRow
            title="Assign unassigned issues"
            description="Lowest workload first, skill match from past completions"
            trailing={
               <Switch
                  checked={draft.assignUnassigned}
                  onCheckedChange={(value) =>
                     setDraft((current) => ({ ...current, assignUnassigned: value }))
                  }
               />
            }
         />
         <SettingsRow
            title="Nudge overdue owners"
            description="One in-app reminder per issue per day"
            trailing={
               <Switch
                  checked={draft.nudgeOverdue}
                  onCheckedChange={(value) =>
                     setDraft((current) => ({ ...current, nudgeOverdue: value }))
                  }
               />
            }
         />
         <SettingsRow
            title="Daily action budget"
            description="Max auto-assignments per day; nudges are unlimited"
            trailing={
               <Input
                  type="number"
                  min={1}
                  max={20}
                  className="h-8 w-20"
                  value={draft.maxActionsPerDay}
                  onChange={(event) =>
                     setDraft((current) => ({
                        ...current,
                        maxActionsPerDay: Math.min(
                           20,
                           Math.max(1, Number(event.target.value) || 1)
                        ),
                     }))
                  }
               />
            }
         />
         <SettingsRow
            title="Last run"
            description={loading ? 'Loading…' : lastRun}
            trailing={
               <div className="flex items-center gap-2">
                  <Button
                     size="xs"
                     variant="outline"
                     disabled={running}
                     onClick={() => void runNow()}
                  >
                     {running ? 'Running…' : 'Run now'}
                  </Button>
                  <Button size="xs" disabled={saving} onClick={() => void save()}>
                     {saving ? 'Saving…' : 'Save'}
                  </Button>
               </div>
            }
         />
      </SettingsCard>
   );
}
