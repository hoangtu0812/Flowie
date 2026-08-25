'use client';

import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { WorkspaceTeam } from '@/components/common/teams/team-types';
import { type FormEvent, useEffect, useState } from 'react';

export type TeamSettingsEditKind =
   'general' | 'access' | 'template' | 'automation' | 'cycles' | 'hierarchy';

type Template = { id: string; name: string };

const titles: Record<TeamSettingsEditKind, string> = {
   general: 'General settings',
   access: 'Access and permissions',
   template: 'Default issue template',
   automation: 'Workflows & automations',
   cycles: 'Cycle cadence',
   hierarchy: 'Team hierarchy',
};

export function TeamSettingsDialog({
   kind,
   team,
   teams,
   templates,
   onOpenChange,
   onSave,
}: {
   kind?: TeamSettingsEditKind;
   team: WorkspaceTeam;
   teams: WorkspaceTeam[];
   templates: Template[];
   onOpenChange: (open: boolean) => void;
   onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
   const [name, setName] = useState(team.name);
   const [description, setDescription] = useState(team.description ?? '');
   const [icon, setIcon] = useState(team.icon ?? '👥');
   const [joinPolicy, setJoinPolicy] = useState(team.joinPolicy);
   const [templateId, setTemplateId] = useState(team.defaultIssueTemplateId ?? 'none');
   const [autoCloseDays, setAutoCloseDays] = useState(team.autoCloseDays?.toString() ?? '');
   const [autoArchiveDays, setAutoArchiveDays] = useState(team.autoArchiveDays?.toString() ?? '');
   const [cycleCadenceWeeks, setCycleCadenceWeeks] = useState(
      team.cycleCadenceWeeks?.toString() ?? ''
   );
   const [parentTeamId, setParentTeamId] = useState(team.parentTeamId ?? 'none');
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   useEffect(() => {
      if (!kind) return;
      setName(team.name);
      setDescription(team.description ?? '');
      setIcon(team.icon ?? '👥');
      setJoinPolicy(team.joinPolicy);
      setTemplateId(team.defaultIssueTemplateId ?? 'none');
      setAutoCloseDays(team.autoCloseDays?.toString() ?? '');
      setAutoArchiveDays(team.autoArchiveDays?.toString() ?? '');
      setCycleCadenceWeeks(team.cycleCadenceWeeks?.toString() ?? '');
      setParentTeamId(team.parentTeamId ?? 'none');
      setError(undefined);
   }, [kind, team]);

   const optionalNumber = (value: string, maximum: number) => {
      if (!value.trim()) return null;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
         throw new Error(`Enter a whole number from 1 to ${maximum}.`);
      }
      return parsed;
   };

   const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!kind) return;
      setSaving(true);
      setError(undefined);
      try {
         const data: Record<TeamSettingsEditKind, Record<string, unknown>> = {
            general: {
               name: name.trim(),
               description: description.trim(),
               icon: icon.trim() || '👥',
            },
            access: { joinPolicy },
            template: { defaultIssueTemplateId: templateId === 'none' ? null : templateId },
            automation: {
               autoCloseDays: optionalNumber(autoCloseDays, 3650),
               autoArchiveDays: optionalNumber(autoArchiveDays, 3650),
            },
            cycles: { cycleCadenceWeeks: optionalNumber(cycleCadenceWeeks, 12) },
            hierarchy: { parentTeamId: parentTeamId === 'none' ? null : parentTeamId },
         };
         if (kind === 'general' && name.trim().length < 2) {
            throw new Error('Team name must contain at least two characters.');
         }
         await onSave(data[kind]);
         onOpenChange(false);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not update team settings.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <Dialog open={Boolean(kind)} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{kind ? titles[kind] : 'Team settings'}</DialogTitle>
               <DialogDescription>Changes are saved to this team immediately.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={submit}>
               {kind === 'general' && (
                  <>
                     <div className="space-y-2">
                        <Label htmlFor="team-name">Name</Label>
                        <Input
                           id="team-name"
                           value={name}
                           onChange={(event) => setName(event.target.value)}
                           autoFocus
                        />
                     </div>
                     <div className="space-y-2">
                        <Label htmlFor="team-description">Description</Label>
                        <Textarea
                           id="team-description"
                           value={description}
                           onChange={(event) => setDescription(event.target.value)}
                           rows={5}
                        />
                     </div>
                     <div className="space-y-2">
                        <Label htmlFor="team-icon">Icon</Label>
                        <Input
                           id="team-icon"
                           value={icon}
                           onChange={(event) => setIcon(event.target.value)}
                           maxLength={32}
                           placeholder="👥"
                        />
                        <p className="text-xs text-muted-foreground">
                           Use an emoji or a short symbol displayed throughout this team.
                        </p>
                     </div>
                  </>
               )}
               {kind === 'access' && (
                  <div className="space-y-2">
                     <Label>Who can join this team?</Label>
                     <Select
                        value={joinPolicy}
                        onValueChange={(value: 'OPEN' | 'INVITE_ONLY') => setJoinPolicy(value)}
                     >
                        <SelectTrigger>
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="OPEN">Open</SelectItem>
                           <SelectItem value="INVITE_ONLY">Invite only</SelectItem>
                        </SelectContent>
                     </Select>
                     <p className="text-sm text-muted-foreground">
                        {joinPolicy === 'OPEN'
                           ? 'Any active workspace member can join this team.'
                           : 'Only workspace administrators can add new team members.'}
                     </p>
                  </div>
               )}
               {kind === 'template' && (
                  <div className="space-y-2">
                     <Label>Template</Label>
                     <Select value={templateId} onValueChange={setTemplateId}>
                        <SelectTrigger>
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="none">None</SelectItem>
                           {templates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                 {template.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               )}
               {kind === 'automation' && (
                  <>
                     <div className="space-y-2">
                        <Label htmlFor="auto-close-days">Auto-close completed issues after</Label>
                        <Input
                           id="auto-close-days"
                           type="number"
                           min={1}
                           max={3650}
                           placeholder="Off"
                           value={autoCloseDays}
                           onChange={(event) => setAutoCloseDays(event.target.value)}
                        />
                     </div>
                     <div className="space-y-2">
                        <Label htmlFor="auto-archive-days">Auto-archive closed issues after</Label>
                        <Input
                           id="auto-archive-days"
                           type="number"
                           min={1}
                           max={3650}
                           placeholder="Off"
                           value={autoArchiveDays}
                           onChange={(event) => setAutoArchiveDays(event.target.value)}
                        />
                     </div>
                  </>
               )}
               {kind === 'cycles' && (
                  <div className="space-y-2">
                     <Label htmlFor="cycle-cadence">Cadence in weeks</Label>
                     <Input
                        id="cycle-cadence"
                        type="number"
                        min={1}
                        max={12}
                        placeholder="Off"
                        value={cycleCadenceWeeks}
                        onChange={(event) => setCycleCadenceWeeks(event.target.value)}
                     />
                  </div>
               )}
               {kind === 'hierarchy' && (
                  <div className="space-y-2">
                     <Label>Parent team</Label>
                     <Select value={parentTeamId} onValueChange={setParentTeamId}>
                        <SelectTrigger>
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="none">None</SelectItem>
                           {teams
                              .filter((candidate) => candidate.id !== team.id)
                              .map((candidate) => (
                                 <SelectItem key={candidate.id} value={candidate.id}>
                                    {candidate.name}
                                 </SelectItem>
                              ))}
                        </SelectContent>
                     </Select>
                  </div>
               )}
               {error && <p className="text-sm text-destructive">{error}</p>}
               <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                     Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                     {saving ? 'Saving…' : 'Save'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}
