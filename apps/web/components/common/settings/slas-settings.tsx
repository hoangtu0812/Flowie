'use client';

import {
   loadCurrentWorkspaceTeams,
   type WorkspaceTeam,
} from '@/components/common/teams/team-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Archive, Clock3, Flame } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashedSmiley } from './settings-placeholder';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
type Priority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type DurationUnit = 'minutes' | 'hours' | 'days';
type SlaPolicy = {
   id: string;
   name: string;
   description: string | null;
   teamId: string | null;
   priority: Priority | null;
   deadlineMinutes: number;
   enabled: boolean;
   team: { id: string; name: string; identifier: string; icon: string | null } | null;
   createdBy: { id: string; name: string; avatarUrl: string | null };
};

const priorityLabels: Record<Priority, string> = {
   NONE: 'No priority',
   LOW: 'Low',
   MEDIUM: 'Medium',
   HIGH: 'High',
   URGENT: 'Urgent',
};
const unitMinutes: Record<DurationUnit, number> = { minutes: 1, hours: 60, days: 1440 };

function durationParts(minutes: number): { value: string; unit: DurationUnit } {
   if (minutes % 1440 === 0) return { value: String(minutes / 1440), unit: 'days' };
   if (minutes % 60 === 0) return { value: String(minutes / 60), unit: 'hours' };
   return { value: String(minutes), unit: 'minutes' };
}

function durationLabel(minutes: number) {
   const { value, unit } = durationParts(minutes);
   return `${value} ${Number(value) === 1 ? unit.slice(0, -1) : unit}`;
}

function errorMessage(payload: unknown, fallback: string) {
   const message = (payload as { message?: string | string[] } | null)?.message;
   return Array.isArray(message) ? message[0] : (message ?? fallback);
}

/** Original SLA settings shell backed by deadline policies applied during issue creation. */
export default function SlasSettings() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
   const [policies, setPolicies] = useState<SlaPolicy[]>([]);
   const [filter, setFilter] = useState('');
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string>();
   const [open, setOpen] = useState(false);
   const [editingId, setEditingId] = useState<string>();
   const [name, setName] = useState('');
   const [description, setDescription] = useState('');
   const [teamId, setTeamId] = useState('');
   const [priority, setPriority] = useState<Priority | ''>('');
   const [duration, setDuration] = useState('24');
   const [durationUnit, setDurationUnit] = useState<DurationUnit>('hours');
   const [enabled, setEnabled] = useState(true);
   const [saving, setSaving] = useState(false);
   const [formError, setFormError] = useState<string>();

   const load = useCallback(async () => {
      setLoading(true);
      setLoadError(undefined);
      try {
         const workspace = await loadCurrentWorkspaceTeams();
         const response = await fetch(
            `${api}/slas?${new URLSearchParams({ workspaceId: workspace.workspaceId })}`,
            { credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not load SLA policies.');
         setWorkspaceId(workspace.workspaceId);
         setTeams(workspace.teams);
         setPolicies(((await response.json()) as { data: SlaPolicy[] }).data);
      } catch (caught) {
         setLoadError(caught instanceof Error ? caught.message : 'Could not load SLA policies.');
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void load();
   }, [load]);

   const visiblePolicies = useMemo(() => {
      const value = filter.trim().toLowerCase();
      if (!value) return policies;
      return policies.filter(
         (policy) =>
            policy.name.toLowerCase().includes(value) ||
            policy.team?.name.toLowerCase().includes(value) ||
            (policy.priority && priorityLabels[policy.priority].toLowerCase().includes(value))
      );
   }, [filter, policies]);

   const reset = () => {
      setEditingId(undefined);
      setName('');
      setDescription('');
      setTeamId('');
      setPriority('');
      setDuration('24');
      setDurationUnit('hours');
      setEnabled(true);
      setFormError(undefined);
   };
   const openCreate = () => {
      reset();
      setOpen(true);
   };
   const openEdit = (policy: SlaPolicy) => {
      reset();
      const parts = durationParts(policy.deadlineMinutes);
      setEditingId(policy.id);
      setName(policy.name);
      setDescription(policy.description ?? '');
      setTeamId(policy.teamId ?? '');
      setPriority(policy.priority ?? '');
      setDuration(parts.value);
      setDurationUnit(parts.unit);
      setEnabled(policy.enabled);
      setOpen(true);
   };

   const save = async () => {
      const durationNumber = Number(duration);
      const deadlineMinutes = durationNumber * unitMinutes[durationUnit];
      if (
         !workspaceId ||
         name.trim().length < 2 ||
         !Number.isInteger(deadlineMinutes) ||
         deadlineMinutes < 15
      ) {
         setFormError('Name is required and the deadline must be at least 15 minutes.');
         return;
      }
      setSaving(true);
      setFormError(undefined);
      try {
         const query = new URLSearchParams({ workspaceId });
         const response = await fetch(
            editingId ? `${api}/slas/${editingId}?${query}` : `${api}/slas`,
            {
               method: editingId ? 'PATCH' : 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(editingId ? {} : { workspaceId }),
                  name: name.trim(),
                  description: description.trim() || null,
                  teamId: teamId || null,
                  priority: priority || null,
                  deadlineMinutes,
                  enabled,
               }),
            }
         );
         if (!response.ok) {
            throw new Error(
               errorMessage(await response.json().catch(() => null), 'Could not save SLA policy.')
            );
         }
         setOpen(false);
         reset();
         await load();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not save SLA policy.');
      } finally {
         setSaving(false);
      }
   };

   const archive = async () => {
      if (!workspaceId || !editingId) return;
      setSaving(true);
      setFormError(undefined);
      try {
         const response = await fetch(
            `${api}/slas/${editingId}?${new URLSearchParams({ workspaceId })}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not archive SLA policy.');
         setOpen(false);
         reset();
         await load();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not archive SLA policy.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-2xl font-medium">SLAs</h1>
            <p className="text-sm text-muted-foreground mt-1">
               Automatically apply deadlines to issues based on their properties
            </p>

            <div className="flex items-center justify-between gap-3 mt-6">
               <Input
                  placeholder="Filter by name..."
                  className="w-72 h-8"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
               />
               <Button size="xs" onClick={openCreate} disabled={!workspaceId}>
                  New SLA
               </Button>
            </div>

            {loading && <p className="py-12 text-sm text-muted-foreground">Loading SLAs…</p>}
            {loadError && <p className="py-12 text-sm text-destructive">{loadError}</p>}
            {!loading && !loadError && visiblePolicies.length === 0 && (
               <div className="flex flex-col items-center justify-center gap-5 py-32">
                  <DashedSmiley />
                  <p className="text-sm text-muted-foreground">
                     {policies.length === 0 ? 'No SLAs' : 'No matching SLAs'}
                  </p>
               </div>
            )}
            {!loading && !loadError && visiblePolicies.length > 0 && (
               <div className="mt-5 overflow-hidden rounded-lg border bg-container divide-y">
                  {visiblePolicies.map((policy) => (
                     <button
                        key={policy.id}
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
                        onClick={() => openEdit(policy)}
                     >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
                           <Flame className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                           <span className="block truncate text-sm font-medium">{policy.name}</span>
                           <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {policy.team?.name ?? 'All teams'} ·{' '}
                              {policy.priority ? priorityLabels[policy.priority] : 'Any priority'}
                           </span>
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                           <Clock3 className="size-3.5" />
                           {durationLabel(policy.deadlineMinutes)}
                        </span>
                        <Badge variant="outline" className="px-2 py-0.5 font-normal">
                           {policy.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                     </button>
                  ))}
               </div>
            )}
         </div>

         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[620px]">
               <DialogHeader>
                  <DialogTitle>{editingId ? 'Edit SLA' : 'New SLA'}</DialogTitle>
                  <DialogDescription>
                     The most specific matching policy sets the due date on newly created issues.
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <Input
                     value={name}
                     onChange={(event) => setName(event.target.value)}
                     placeholder="SLA name"
                     autoFocus
                  />
                  <Textarea
                     value={description}
                     onChange={(event) => setDescription(event.target.value)}
                     placeholder="Description"
                  />
                  <div className="grid grid-cols-2 gap-2">
                     <select
                        value={teamId}
                        onChange={(event) => setTeamId(event.target.value)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                        aria-label="Team"
                     >
                        <option value="">All teams</option>
                        {teams.map((team) => (
                           <option key={team.id} value={team.id}>
                              {team.name}
                           </option>
                        ))}
                     </select>
                     <select
                        value={priority}
                        onChange={(event) => setPriority(event.target.value as Priority | '')}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                        aria-label="Priority"
                     >
                        <option value="">Any priority</option>
                        {Object.entries(priorityLabels).map(([value, label]) => (
                           <option key={value} value={value}>
                              {label}
                           </option>
                        ))}
                     </select>
                  </div>
                  <div className="grid grid-cols-[1fr_160px] gap-2">
                     <Input
                        type="number"
                        min="1"
                        value={duration}
                        onChange={(event) => setDuration(event.target.value)}
                        aria-label="Deadline duration"
                     />
                     <select
                        value={durationUnit}
                        onChange={(event) => setDurationUnit(event.target.value as DurationUnit)}
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                        aria-label="Duration unit"
                     >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                     </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                     <Checkbox
                        checked={enabled}
                        onCheckedChange={(checked) => setEnabled(checked === true)}
                     />
                     Apply this SLA to matching new issues
                  </label>
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
               </div>
               <DialogFooter className="sm:justify-between">
                  {editingId ? (
                     <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => void archive()}
                        disabled={saving}
                     >
                        <Archive className="size-4" />
                        Archive
                     </Button>
                  ) : (
                     <span />
                  )}
                  <Button size="sm" onClick={() => void save()} disabled={saving}>
                     {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create SLA'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
