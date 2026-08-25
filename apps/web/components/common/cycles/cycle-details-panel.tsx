'use client';

import { PanelFilterTarget, usePanelFilter } from '@/components/common/issues/use-panel-filter';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Cycle, cycleStatusLabel, formatCycleDateRange } from '@/mock-data/cycles';
import { Issue } from '@/types/issues';
import { useRightPanelStore } from '@/store/right-panel-store';
import { FileText, Plus, User, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadCurrentWorkspaceTeams } from '../teams/team-types';
import { CapacityRing } from './capacity-ring';
import { CycleBurnupChart } from './cycle-burnup-chart';
import { CyclePlayIcon } from './cycle-line';

interface BreakdownRow {
   key: string;
   label: string;
   leading: React.ReactNode;
   total: number;
   completedPercent: number;
   /** When set, clicking the row toggles this exclusive filter. */
   filter?: PanelFilterTarget;
}

interface CycleDetailsPanelProps {
   cycle: Cycle;
   issues: Issue[];
}

interface CycleDocument {
   id: string;
   title: string;
   updatedAt: string;
}

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const isCompleted = (issue: Issue) => issue.status.category === 'completed';

function buildBreakdown<T>(
   issues: Issue[],
   getKey: (issue: Issue) => T | undefined,
   describe: (key: T) => Omit<BreakdownRow, 'total' | 'completedPercent'>
): BreakdownRow[] {
   const buckets = new Map<T, Issue[]>();
   for (const issue of issues) {
      const key = getKey(issue);
      if (key === undefined) continue;
      const bucket = buckets.get(key) ?? [];
      bucket.push(issue);
      buckets.set(key, bucket);
   }

   return [...buckets.entries()]
      .map(([key, bucket]) => ({
         ...describe(key),
         total: bucket.length,
         completedPercent: Math.round((bucket.filter(isCompleted).length / bucket.length) * 100),
      }))
      .sort((a, b) => b.total - a.total);
}

interface BreakdownListProps {
   rows: BreakdownRow[];
   isActive: (target: PanelFilterTarget) => boolean;
   toggle: (target: PanelFilterTarget) => void;
}

function BreakdownList({ rows, isActive, toggle }: BreakdownListProps) {
   if (rows.length === 0) {
      return <p className="text-xs text-muted-foreground px-1 py-3">Nothing to show yet.</p>;
   }

   return (
      <div className="flex flex-col">
         {rows.map((row) => {
            const active = row.filter ? isActive(row.filter) : false;
            return (
               <button
                  key={row.key}
                  type="button"
                  onClick={row.filter ? () => toggle(row.filter!) : undefined}
                  className={cn(
                     'group flex w-full items-center justify-between gap-3 py-2 px-2 -mx-2 rounded-md text-left transition-colors',
                     row.filter && 'cursor-pointer hover:bg-accent/50',
                     active && 'bg-accent hover:bg-accent'
                  )}
               >
                  <div className="flex items-center gap-2 min-w-0">
                     {row.leading}
                     <span className="text-sm truncate">{row.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-sm text-muted-foreground">
                     {row.filter && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                           {active ? 'Clear filter' : 'Filter'}
                        </span>
                     )}
                     <CapacityRing value={row.completedPercent} color="#6771c5" />
                     <span className="whitespace-nowrap">
                        {row.completedPercent}% of {row.total}
                     </span>
                  </div>
               </button>
            );
         })}
      </div>
   );
}

/**
 * Right side panel with the cycle summary: dates, progress stats,
 * compact burn-up chart and breakdowns by assignee / label / priority / project.
 */
export function CycleDetailsPanel({ cycle, issues }: CycleDetailsPanelProps) {
   const { closePanel } = useRightPanelStore();
   const { isActive, toggle } = usePanelFilter();
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [documents, setDocuments] = useState<CycleDocument[]>([]);
   const [availableDocuments, setAvailableDocuments] = useState<CycleDocument[]>([]);
   const [linkDialogOpen, setLinkDialogOpen] = useState(false);
   const [selectedDocumentId, setSelectedDocumentId] = useState<string>();
   const [loadingDocuments, setLoadingDocuments] = useState(true);
   const [submitting, setSubmitting] = useState(false);
   const [documentError, setDocumentError] = useState<string>();

   const completedPercent = cycle.scope > 0 ? Math.round((cycle.completed / cycle.scope) * 100) : 0;
   const startedPercent = cycle.scope > 0 ? Math.round((cycle.started / cycle.scope) * 100) : 0;

   const assigneeRows = useMemo(
      () =>
         buildBreakdown(
            issues,
            (issue) => issue.assignee?.id ?? 'no-assignee',
            (key) => {
               const assignee = issues.find((i) => i.assignee?.id === key)?.assignee;
               if (!assignee) {
                  return {
                     key: 'no-assignee',
                     label: 'No assignee',
                     leading: (
                        <div className="size-5 rounded-full border border-dashed flex items-center justify-center shrink-0">
                           <User className="size-3 text-muted-foreground" />
                        </div>
                     ),
                     filter: { columnId: 'assignee' as const, value: 'unassigned' },
                  };
               }
               return {
                  key: assignee.id,
                  label: assignee.name,
                  leading: (
                     <Avatar className="size-5 shrink-0">
                        <AvatarImage src={assignee.avatarUrl} alt={assignee.name} />
                        <AvatarFallback>{assignee.name[0]}</AvatarFallback>
                     </Avatar>
                  ),
                  filter: { columnId: 'assignee' as const, value: assignee.id },
               };
            }
         ),
      [issues]
   );

   const labelRows = useMemo(
      () =>
         buildBreakdown(
            issues,
            (issue) => issue.labels[0]?.id,
            (key) => {
               const label = issues
                  .flatMap((issue) => issue.labels)
                  .find((candidate) => candidate.id === key);
               return {
                  key: String(key),
                  label: label?.name ?? 'Unlabeled',
                  leading: (
                     <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: label?.color ?? 'gray' }}
                     />
                  ),
                  filter: { columnId: 'labels' as const, value: String(key) },
               };
            }
         ),
      [issues]
   );

   const priorityRows = useMemo(
      () =>
         buildBreakdown(
            issues,
            (issue) => issue.priority.id,
            (key) => {
               const priority = issues.find((i) => i.priority.id === key)?.priority;
               const Icon = priority?.icon;
               return {
                  key: String(key),
                  label: priority?.name ?? 'No priority',
                  leading: Icon ? (
                     <Icon className="size-3.5 text-muted-foreground shrink-0" />
                  ) : null,
                  filter: { columnId: 'priority' as const, value: String(key) },
               };
            }
         ),
      [issues]
   );

   const projectRows = useMemo(
      () =>
         buildBreakdown(
            issues,
            (issue) => issue.project?.id,
            (key) => {
               const project = issues.find((i) => i.project?.id === key)?.project;
               const Icon = project?.icon;
               return {
                  key: String(key),
                  label: project?.name ?? 'No project',
                  leading: Icon ? (
                     <Icon className="size-3.5 text-muted-foreground shrink-0" />
                  ) : null,
                  filter: { columnId: 'project' as const, value: String(key) },
               };
            }
         ),
      [issues]
   );

   const loadDocuments = useCallback(
      async (id: string) => {
         const response = await fetch(
            `${api}/cycles/${cycle.id}/documents?${new URLSearchParams({ workspaceId: id }).toString()}`,
            { credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not load cycle documents.');
         const payload = (await response.json()) as { data: CycleDocument[] };
         setDocuments(payload.data);
      },
      [cycle.id]
   );

   useEffect(() => {
      let active = true;
      void (async () => {
         setLoadingDocuments(true);
         setDocumentError(undefined);
         try {
            const { workspaceId: id } = await loadCurrentWorkspaceTeams();
            if (!active) return;
            setWorkspaceId(id);
            await loadDocuments(id);
         } catch (caught) {
            if (active) {
               setDocuments([]);
               setDocumentError(
                  caught instanceof Error ? caught.message : 'Could not load cycle documents.'
               );
            }
         } finally {
            if (active) setLoadingDocuments(false);
         }
      })();
      return () => {
         active = false;
      };
   }, [loadDocuments]);

   const openLinkDialog = async () => {
      if (!workspaceId) return;
      setDocumentError(undefined);
      setLinkDialogOpen(true);
      try {
         const response = await fetch(
            `${api}/cycles/${cycle.id}/available-documents?${new URLSearchParams({ workspaceId }).toString()}`,
            { credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not load available documents.');
         const payload = (await response.json()) as { data: CycleDocument[] };
         setAvailableDocuments(payload.data);
         setSelectedDocumentId((current) =>
            payload.data.some((document) => document.id === current) ? current : undefined
         );
      } catch (caught) {
         setDocumentError(
            caught instanceof Error ? caught.message : 'Could not load available documents.'
         );
      }
   };

   const linkDocument = async () => {
      if (!workspaceId || !selectedDocumentId) return;
      setSubmitting(true);
      setDocumentError(undefined);
      try {
         const response = await fetch(`${api}/cycles/${cycle.id}/documents`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, documentId: selectedDocumentId }),
         });
         if (!response.ok) throw new Error('Could not link document.');
         await loadDocuments(workspaceId);
         setLinkDialogOpen(false);
         setSelectedDocumentId(undefined);
      } catch (caught) {
         setDocumentError(caught instanceof Error ? caught.message : 'Could not link document.');
      } finally {
         setSubmitting(false);
      }
   };

   const unlinkDocument = async (documentId: string) => {
      if (!workspaceId) return;
      setSubmitting(true);
      setDocumentError(undefined);
      try {
         const response = await fetch(
            `${api}/cycles/${cycle.id}/documents/${documentId}?${new URLSearchParams({ workspaceId }).toString()}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not unlink document.');
         await loadDocuments(workspaceId);
      } catch (caught) {
         setDocumentError(caught instanceof Error ? caught.message : 'Could not unlink document.');
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <div className="flex flex-col h-full w-full">
         {/* Header */}
         <div className="px-4 pt-4 shrink-0">
            <div className="flex items-center justify-between gap-2">
               <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs px-2 py-1 rounded-md bg-accent text-muted-foreground">
                     {cycleStatusLabel[cycle.status]}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-md bg-accent text-muted-foreground">
                     {formatCycleDateRange(cycle)}
                  </span>
               </div>
               <Button variant="ghost" size="icon" className="size-7" onClick={closePanel}>
                  <X className="size-4" />
               </Button>
            </div>

            <div className="flex items-center gap-2 mt-4">
               <CyclePlayIcon />
               <h2 className="text-lg font-semibold">{cycle.name}</h2>
            </div>

            <button
               type="button"
               onClick={() => void openLinkDialog()}
               disabled={!workspaceId || loadingDocuments}
               className="flex items-center gap-1.5 mt-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
               <Plus className="size-4" />
               Add document or link...
            </button>
            {documents.length > 0 && (
               <div className="mt-3 space-y-1">
                  {documents.map((document) => (
                     <div key={document.id} className="group flex items-center gap-2 text-sm">
                        <FileText className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="min-w-0 truncate">{document.title}</span>
                        <button
                           type="button"
                           onClick={() => void unlinkDocument(document.id)}
                           disabled={submitting}
                           aria-label={`Unlink ${document.title}`}
                           className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                           <X className="size-3.5" />
                        </button>
                     </div>
                  ))}
               </div>
            )}
            {documentError && <p className="mt-2 text-xs text-destructive">{documentError}</p>}
         </div>

         {/* Progress */}
         <div className="px-4 mt-6 shrink-0">
            <h3 className="text-sm font-medium mb-3">Progress</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="size-2 rounded-[2px] bg-[#8f9299]" />
                     Scope
                  </div>
                  <div className="text-sm">
                     <span className="font-medium">{cycle.scope}</span>{' '}
                     {cycle.scopeDelta !== 0 && (
                        <span className="text-xs text-red-500">+{cycle.scopeDelta}%</span>
                     )}
                  </div>
               </div>
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="size-2 rounded-[2px] bg-[#facc15]" />
                     Started
                  </div>
                  <div className="text-sm">
                     <span className="font-medium">{cycle.started}</span>{' '}
                     <span className="text-xs text-muted-foreground">• {startedPercent}%</span>
                  </div>
               </div>
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="size-2 rounded-[2px] bg-[#6771c5]" />
                     Completed
                  </div>
                  <div className="text-sm">
                     <span className="font-medium">{cycle.completed}</span>{' '}
                     <span className="text-xs text-muted-foreground">• {completedPercent}%</span>
                  </div>
               </div>
            </div>
            <CycleBurnupChart cycle={cycle} height={150} compact />
         </div>

         {/* Breakdowns */}
         <div className="px-4 mt-6 pb-6 flex-1 overflow-y-auto">
            <Tabs defaultValue="assignees">
               <TabsList className="h-8 bg-transparent gap-1 p-0">
                  <TabsTrigger value="assignees" className="text-xs px-2.5 rounded-full">
                     Assignees
                  </TabsTrigger>
                  <TabsTrigger value="labels" className="text-xs px-2.5 rounded-full">
                     Labels
                  </TabsTrigger>
                  <TabsTrigger value="priority" className="text-xs px-2.5 rounded-full">
                     Priority
                  </TabsTrigger>
                  <TabsTrigger value="projects" className="text-xs px-2.5 rounded-full">
                     Projects
                  </TabsTrigger>
               </TabsList>
               <TabsContent value="assignees">
                  <BreakdownList rows={assigneeRows} isActive={isActive} toggle={toggle} />
               </TabsContent>
               <TabsContent value="labels">
                  <BreakdownList rows={labelRows} isActive={isActive} toggle={toggle} />
               </TabsContent>
               <TabsContent value="priority">
                  <BreakdownList rows={priorityRows} isActive={isActive} toggle={toggle} />
               </TabsContent>
               <TabsContent value="projects">
                  <BreakdownList rows={projectRows} isActive={isActive} toggle={toggle} />
               </TabsContent>
            </Tabs>
         </div>

         <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
            <DialogContent className="sm:max-w-[480px]">
               <DialogHeader>
                  <DialogTitle>Link document</DialogTitle>
                  <DialogDescription>
                     Choose a workspace or team document for this cycle.
                  </DialogDescription>
               </DialogHeader>
               <div className="max-h-64 space-y-1 overflow-y-auto">
                  {availableDocuments.length === 0 ? (
                     <p className="py-4 text-sm text-muted-foreground">
                        No documents are available.
                     </p>
                  ) : (
                     availableDocuments.map((document) => (
                        <label
                           key={document.id}
                           className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent"
                        >
                           <input
                              type="radio"
                              name="cycle-document"
                              checked={selectedDocumentId === document.id}
                              onChange={() => setSelectedDocumentId(document.id)}
                           />
                           <FileText className="size-4 text-muted-foreground shrink-0" />
                           <span className="min-w-0 truncate text-sm">{document.title}</span>
                        </label>
                     ))
                  )}
               </div>
               <DialogFooter>
                  <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
                     Cancel
                  </Button>
                  <Button
                     onClick={() => void linkDocument()}
                     disabled={!selectedDocumentId || submitting}
                  >
                     {submitting ? 'Linking…' : 'Link document'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
