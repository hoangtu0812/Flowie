'use client';

import { ContentBlocks } from '@/components/common/issues/details/content-blocks';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format, parseISO } from 'date-fns';
import { ArrowRight, ChevronDown, FileText, PenLine, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useRef } from 'react';
import { DocumentOutline, getOutlineItems } from './document-outline';
import { toIssueUi, toProjectDetailUi, toProjectUi } from './project-detail-ui-adapter';
import { ProjectSidePanel } from './project-side-panel';
import { useLiveProject } from './use-live-project';

interface ProjectOverviewProps {
   projectId: string;
}

const formatDay = (iso?: string | null) => (iso ? format(parseISO(iso), 'MMM do') : '—');

/** Project "Overview" tab: description column + properties side panel. */
export default function ProjectOverview({ projectId }: ProjectOverviewProps) {
   const { project, issues, milestones, updates, activities, loading, error } =
      useLiveProject(projectId);
   const { orgId } = useParams<{ orgId: string }>();
   const scrollRef = useRef<HTMLDivElement>(null);
   const uiProject = useMemo(
      () => (project ? toProjectUi(project, issues) : undefined),
      [issues, project]
   );
   const detail = useMemo(
      () => (project ? toProjectDetailUi(project, milestones, updates, activities) : undefined),
      [activities, milestones, project, updates]
   );
   const uiIssues = useMemo(
      () => (uiProject ? issues.map((issue) => toIssueUi(issue, uiProject)) : []),
      [issues, uiProject]
   );
   const outlineItems = useMemo(
      () => getOutlineItems(detail?.description ?? []),
      [detail?.description]
   );

   if (loading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading project…</div>;
   if (error || !project || !uiProject || !detail)
      return (
         <div className="px-8 py-10 text-sm text-destructive">{error ?? 'Project not found.'}</div>
      );

   return (
      <div className="w-full h-full flex overflow-hidden">
         {/* Main column */}
         <div className="flex-1 min-w-0 h-full relative">
            <DocumentOutline items={outlineItems} scrollRef={scrollRef} />
            <div ref={scrollRef} className="h-full overflow-y-auto">
               <div className="max-w-3xl mx-auto px-6 lg:px-10 py-10">
                  <div className="inline-flex size-10 bg-muted/50 items-center justify-center rounded-md mb-4">
                     <uiProject.icon className="size-6" />
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight">{uiProject.name}</h1>
                  <p className="mt-3 text-muted-foreground leading-relaxed">
                     {detail.summary || 'No summary yet.'}
                  </p>

                  {/* Inline properties */}
                  <div className="mt-6 flex flex-col gap-2.5 text-sm">
                     <div className="flex items-center gap-3">
                        <span className="w-24 text-muted-foreground shrink-0">Properties</span>
                        <div className="flex items-center gap-3 flex-wrap">
                           <span className="inline-flex items-center gap-1.5">
                              <uiProject.status.icon />
                              {uiProject.status.name}
                           </span>
                           <span className="inline-flex items-center gap-1.5">
                              <uiProject.priority.icon className="size-3.5 text-muted-foreground" />
                              {uiProject.priority.name}
                           </span>
                           <span className="inline-flex items-center gap-1.5">
                              <Avatar className="size-4">
                                 <AvatarImage
                                    src={uiProject.lead.avatarUrl || undefined}
                                    alt={uiProject.lead.name}
                                 />
                                 <AvatarFallback>{uiProject.lead.name[0]}</AvatarFallback>
                              </Avatar>
                              {uiProject.lead.name}
                           </span>
                           <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              {formatDay(uiProject.startDate)}
                              <ArrowRight className="size-3" />
                              {formatDay(uiProject.targetDate)}
                           </span>
                           {uiProject.team && (
                              <span className="inline-flex items-center gap-1.5">
                                 {uiProject.team.icon ?? '👥'} {uiProject.team.name}
                              </span>
                           )}
                        </div>
                     </div>

                     {uiProject.initiative && (
                        <div className="flex items-center gap-3">
                           <span className="w-24 text-muted-foreground shrink-0">Initiatives</span>
                           <span className="inline-flex items-center gap-1.5">
                              📄 {uiProject.initiative}
                              <button className="text-muted-foreground hover:text-foreground transition-colors">
                                 <Plus className="size-3.5" />
                              </button>
                           </span>
                        </div>
                     )}

                     <div className="flex items-center gap-3">
                        <span className="w-24 text-muted-foreground shrink-0">Labels</span>
                        <div className="flex items-center gap-1.5">
                           {uiProject.labels.map((label) => (
                              <span
                                 key={label.id}
                                 className="inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5"
                              >
                                 <span
                                    className="size-2 rounded-full"
                                    style={{ backgroundColor: label.color }}
                                 />
                                 {label.name}
                                 <ChevronDown className="size-3 text-muted-foreground" />
                              </span>
                           ))}
                           <button className="text-muted-foreground hover:text-foreground transition-colors">
                              <Plus className="size-3.5" />
                           </button>
                        </div>
                     </div>

                     {detail.resources.length > 0 && (
                        <div className="flex items-center gap-3">
                           <span className="w-24 text-muted-foreground shrink-0">Resources</span>
                           <div className="flex items-center gap-2 flex-wrap">
                              {detail.resources.map((resource) => (
                                 <a
                                    key={resource.label}
                                    href={resource.url}
                                    className="inline-flex items-center gap-1.5 text-xs border rounded-md px-2 py-1 hover:bg-accent/50 transition-colors"
                                 >
                                    <FileText className="size-3.5 text-muted-foreground" />
                                    {resource.label}
                                 </a>
                              ))}
                              <button className="text-muted-foreground hover:text-foreground transition-colors">
                                 <Plus className="size-3.5" />
                              </button>
                           </div>
                        </div>
                     )}
                  </div>

                  {/* Update CTA */}
                  <Link
                     href={`/${orgId}/project/${uiProject.id}/activity`}
                     className="mt-8 flex items-center justify-center gap-2 border rounded-lg py-4 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
                  >
                     <PenLine className="size-4" />
                     Write {detail.updates.length === 0 ? 'first ' : ''}project update
                  </Link>

                  {/* Description */}
                  <div className="mt-10">
                     <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground mb-2">
                        Description
                        <ChevronDown className="size-3.5" />
                     </div>
                     <div className="text-[15px] leading-relaxed">
                        {detail.description.length ? (
                           <ContentBlocks blocks={detail.description} />
                        ) : (
                           <p className="text-muted-foreground">No description yet.</p>
                        )}
                     </div>
                  </div>
               </div>
            </div>
         </div>

         {/* Side panel */}
         <ProjectSidePanel project={uiProject} detail={detail} issues={uiIssues} />
      </div>
   );
}
