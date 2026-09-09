'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { authenticatedFetch } from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type WorkloadMember = {
   userId: string;
   name: string;
   avatarUrl: string | null;
   role: string;
   openCount: number;
   estOpen: number;
   overdueCount: number;
   score: number;
   weeklyVelocity: number;
   band: 'healthy' | 'busy' | 'overloaded' | 'unknown';
};

type WorkloadReport = {
   teamId: string;
   members: WorkloadMember[];
   teamAverageScore: number;
};

type Suggestion = {
   issueId: string;
   identifier: string;
   title: string;
   priority: string;
   estimatedEffort: number | null;
   suggestedUserId: string;
   suggestedUserName: string;
   reason: string;
};

const bandStyle: Record<WorkloadMember['band'], { label: string; className: string }> = {
   healthy: { label: 'Healthy', className: 'bg-emerald-500/10 text-emerald-600' },
   busy: { label: 'Busy', className: 'bg-amber-500/10 text-amber-600' },
   overloaded: { label: 'Overloaded', className: 'bg-red-500/10 text-red-600' },
   unknown: { label: 'No data', className: 'bg-muted text-muted-foreground' },
};

/** Deterministic workload per member plus rule-based assignment suggestions. */
export function TeamWorkload({ workspaceId, teamId }: { workspaceId: string; teamId: string }) {
   const [report, setReport] = useState<WorkloadReport | null>(null);
   const [loading, setLoading] = useState(true);
   const [dialogOpen, setDialogOpen] = useState(false);
   const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
   const [unassignedTotal, setUnassignedTotal] = useState(0);
   const [suggesting, setSuggesting] = useState(false);
   const [applyingId, setApplyingId] = useState<string | null>(null);

   const loadWorkload = useCallback(async () => {
      setLoading(true);
      try {
         const response = await authenticatedFetch(
            `${api}/teams/${teamId}/workload?workspaceId=${workspaceId}`
         );
         if (!response.ok) throw new Error('Could not load team workload.');
         setReport(((await response.json()) as { data: WorkloadReport }).data);
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not load team workload.');
      } finally {
         setLoading(false);
      }
   }, [teamId, workspaceId]);

   useEffect(() => {
      void loadWorkload();
   }, [loadWorkload]);

   const openSuggestions = async () => {
      setDialogOpen(true);
      setSuggesting(true);
      try {
         const response = await authenticatedFetch(
            `${api}/teams/${teamId}/assignment-suggestions?workspaceId=${workspaceId}`
         );
         if (!response.ok) throw new Error('Could not load assignment suggestions.');
         const payload = (await response.json()) as {
            data: { suggestions: Suggestion[]; unassignedTotal: number };
         };
         setSuggestions(payload.data.suggestions);
         setUnassignedTotal(payload.data.unassignedTotal);
      } catch (caught) {
         toast.error(
            caught instanceof Error ? caught.message : 'Could not load assignment suggestions.'
         );
         setDialogOpen(false);
      } finally {
         setSuggesting(false);
      }
   };

   const applySuggestion = async (suggestion: Suggestion) => {
      setApplyingId(suggestion.issueId);
      try {
         const response = await authenticatedFetch(
            `${api}/issues/${suggestion.issueId}?workspaceId=${workspaceId}`,
            {
               method: 'PATCH',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ assigneeId: suggestion.suggestedUserId }),
            }
         );
         if (!response.ok) throw new Error('Could not assign this issue.');
         setSuggestions((current) =>
            current.filter((entry) => entry.issueId !== suggestion.issueId)
         );
         setUnassignedTotal((total) => Math.max(0, total - 1));
         toast.success(`${suggestion.identifier} assigned to ${suggestion.suggestedUserName}.`);
         void loadWorkload();
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not assign this issue.');
      } finally {
         setApplyingId(null);
      }
   };

   const maxScore = Math.max(1, ...(report?.members.map((member) => member.score) ?? [1]));

   return (
      <div className="border-b px-6 py-4">
         <div className="flex items-center justify-between gap-3">
            <div>
               <h2 className="text-sm font-semibold">Workload</h2>
               <p className="text-xs text-muted-foreground">
                  {loading
                     ? 'Measuring open effort, priority pressure and overdue items…'
                     : `Team average score ${report?.teamAverageScore ?? 0} · based on open issues, not AI guesses.`}
               </p>
            </div>
            <Button size="xs" variant="secondary" onClick={() => void openSuggestions()}>
               <Sparkles className="size-3.5 mr-1" />
               Suggest assignments
            </Button>
         </div>
         {!loading && report && (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
               {report.members.map((member) => {
                  const band = bandStyle[member.band];
                  return (
                     <div key={member.userId} className="rounded-md border px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                           <Avatar className="size-6 shrink-0">
                              <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                              <AvatarFallback>{member.name[0]}</AvatarFallback>
                           </Avatar>
                           <span className="text-sm font-medium truncate">{member.name}</span>
                           <span
                              className={cn(
                                 'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                                 band.className
                              )}
                           >
                              {band.label}
                           </span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                           <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{
                                 width: `${Math.min(100, (member.score / maxScore) * 100)}%`,
                              }}
                           />
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                           {member.openCount} open · {member.estOpen}d est · {member.overdueCount}{' '}
                           overdue · {member.weeklyVelocity}d/week
                        </p>
                     </div>
                  );
               })}
               {report.members.length === 0 && (
                  <p className="text-sm text-muted-foreground">No members in this team yet.</p>
               )}
            </div>
         )}

         <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-2xl">
               <DialogHeader>
                  <DialogTitle>Suggested assignments</DialogTitle>
                  <DialogDescription>
                     {suggesting
                        ? 'Scoring unassigned issues…'
                        : `${unassignedTotal} unassigned open ${unassignedTotal === 1 ? 'issue' : 'issues'}. Lowest load first, skill matches from past completions.`}
                  </DialogDescription>
               </DialogHeader>
               <div className="max-h-[50vh] space-y-2 overflow-y-auto">
                  {suggestions.map((suggestion) => (
                     <div
                        key={suggestion.issueId}
                        className="flex items-center gap-3 rounded-md border px-3 py-2.5"
                     >
                        <div className="min-w-0 flex-1">
                           <p className="text-sm font-medium truncate">
                              <span className="text-muted-foreground font-normal mr-1.5">
                                 {suggestion.identifier}
                              </span>
                              {suggestion.title}
                           </p>
                           <p className="mt-0.5 text-xs text-muted-foreground truncate">
                              → {suggestion.suggestedUserName} · {suggestion.reason}
                           </p>
                        </div>
                        <Button
                           size="xs"
                           variant="outline"
                           disabled={applyingId === suggestion.issueId}
                           onClick={() => void applySuggestion(suggestion)}
                        >
                           {applyingId === suggestion.issueId ? 'Assigning…' : 'Apply'}
                        </Button>
                     </div>
                  ))}
                  {!suggesting && suggestions.length === 0 && (
                     <p className="text-sm text-muted-foreground">
                        Nothing to assign — every open issue already has an owner.
                     </p>
                  )}
               </div>
            </DialogContent>
         </Dialog>
      </div>
   );
}
