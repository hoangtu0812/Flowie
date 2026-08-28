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
import { authenticatedFetch } from '@/lib/workspaces';
import { CalendarClock, Check, LoaderCircle, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useLiveProjectData } from './use-live-project';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type Schedule = {
   issueId: string;
   identifier: string;
   title: string;
   startDate: string;
   targetDate: string;
   dueDate: string;
   rationale: string;
};

type Proposal = {
   summary: string;
   projectTargetDate: string;
   schedules: Schedule[];
};

/** Drafts project issue dates with the workspace AI provider before a user applies them. */
export function AiScheduleDialog() {
   const { workspaceId, project, reload } = useLiveProjectData();
   const [open, setOpen] = useState(false);
   const [proposal, setProposal] = useState<Proposal>();
   const [loading, setLoading] = useState(false);
   const [applying, setApplying] = useState(false);
   const [error, setError] = useState<string>();

   const draft = async () => {
      if (!workspaceId || !project) return;
      setOpen(true);
      setProposal(undefined);
      setError(undefined);
      setLoading(true);
      try {
         const response = await authenticatedFetch(`${api}/agent/projects/${project.id}/schedule`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId }),
         });
         const payload = (await response.json().catch(() => null)) as {
            data?: Proposal;
            message?: string;
         } | null;
         if (!response.ok || !payload?.data) {
            throw new Error(payload?.message ?? 'Could not create an AI schedule.');
         }
         setProposal(payload.data);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not create an AI schedule.');
      } finally {
         setLoading(false);
      }
   };

   const apply = async () => {
      if (!workspaceId || !project || !proposal) return;
      setApplying(true);
      setError(undefined);
      try {
         const response = await authenticatedFetch(
            `${api}/agent/projects/${project.id}/schedule/apply`,
            {
               method: 'POST',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  workspaceId,
                  schedules: proposal.schedules.map(
                     ({ issueId, startDate, targetDate, dueDate, rationale }) => ({
                        issueId,
                        startDate,
                        targetDate,
                        dueDate,
                        rationale,
                     })
                  ),
               }),
            }
         );
         const payload = (await response.json().catch(() => null)) as { message?: string } | null;
         if (!response.ok) throw new Error(payload?.message ?? 'Could not apply the AI schedule.');
         await reload();
         toast.success(`Scheduled ${proposal.schedules.length} issues.`);
         setOpen(false);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not apply the AI schedule.');
      } finally {
         setApplying(false);
      }
   };

   return (
      <>
         <Button size="xs" variant="outline" className="gap-1.5" onClick={() => void draft()}>
            <Sparkles className="size-3.5" />
            AI scheduling
         </Button>
         <Dialog open={open} onOpenChange={(next) => !loading && !applying && setOpen(next)}>
            <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
               <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                     <CalendarClock className="size-5" /> AI scheduling
                  </DialogTitle>
                  <DialogDescription>
                     The proposal uses the project target date and each issue&apos;s title,
                     description, effort, and parent-child relationship. Nothing changes until you
                     apply it.
                  </DialogDescription>
               </DialogHeader>
               {loading && (
                  <div className="h-40 grid place-items-center text-sm text-muted-foreground gap-2">
                     <LoaderCircle className="size-5 animate-spin" />
                     Reviewing project work and drafting dates…
                  </div>
               )}
               {error && (
                  <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                     {error}
                  </p>
               )}
               {proposal && (
                  <div className="min-h-0 overflow-y-auto space-y-3 pr-1">
                     <p className="text-sm">{proposal.summary}</p>
                     <p className="text-xs text-muted-foreground">
                        All dates stay within the project target date: {proposal.projectTargetDate}.
                     </p>
                     <div className="rounded-md border divide-y">
                        {proposal.schedules.map((schedule) => (
                           <div key={schedule.issueId} className="px-3 py-2.5 space-y-1">
                              <div className="flex items-center gap-2 text-sm min-w-0">
                                 <span className="text-muted-foreground shrink-0">
                                    {schedule.identifier}
                                 </span>
                                 <span className="font-medium truncate">{schedule.title}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                 {schedule.startDate} → {schedule.targetDate} · Due{' '}
                                 {schedule.dueDate}
                              </p>
                              <p className="text-xs text-muted-foreground">{schedule.rationale}</p>
                           </div>
                        ))}
                     </div>
                  </div>
               )}
               <DialogFooter>
                  <Button
                     variant="outline"
                     onClick={() => setOpen(false)}
                     disabled={loading || applying}
                  >
                     Cancel
                  </Button>
                  <Button onClick={() => void apply()} disabled={!proposal || applying}>
                     {applying ? (
                        <LoaderCircle className="size-4 animate-spin" />
                     ) : (
                        <Check className="size-4" />
                     )}
                     Apply schedule
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </>
   );
}
