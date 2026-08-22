'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type ViewFilters = { query?: string; issueCategory?: string; projectType?: string };
type SavedView = {
   id: string;
   name: string;
   entityType: 'issue' | 'project';
   filters: ViewFilters;
   isShared: boolean;
   createdBy: { id: string; name: string };
};
type Issue = {
   id: string;
   identifier: string;
   title: string;
   status: { name: string; category: string };
   project: { identifier: string; name: string } | null;
};
type Project = { id: string; identifier: string; name: string; type: string; status: string };

export function RealViews() {
   const { orgId } = useParams<{ orgId: string }>();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [views, setViews] = useState<SavedView[]>([]);
   const [issues, setIssues] = useState<Issue[]>([]);
   const [projects, setProjects] = useState<Project[]>([]);
   const [name, setName] = useState('');
   const [entityType, setEntityType] = useState<'issue' | 'project'>('issue');
   const [shared, setShared] = useState(false);
   const [filters, setFilters] = useState<ViewFilters>({});
   const [activeViewId, setActiveViewId] = useState<string>();
   const [error, setError] = useState<string>();

   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspaceId = (
         (await workspaceResponse.json()) as { data: Array<{ workspace: { id: string } }> }
      ).data[0]?.workspace.id;
      if (!workspaceId) throw new Error('No workspace is available.');
      setWorkspaceId(workspaceId);
      const [viewResponse, issueResponse, projectResponse] = await Promise.all([
         fetch(`${api}/views?workspaceId=${workspaceId}`, { credentials: 'include' }),
         fetch(`${api}/issues?workspaceId=${workspaceId}`, { credentials: 'include' }),
         fetch(`${api}/projects?workspaceId=${workspaceId}`, { credentials: 'include' }),
      ]);
      if (!viewResponse.ok || !issueResponse.ok || !projectResponse.ok)
         throw new Error('Could not load saved views.');
      const [viewPayload, issuePayload, projectPayload] = (await Promise.all([
         viewResponse.json(),
         issueResponse.json(),
         projectResponse.json(),
      ])) as [{ data: SavedView[] }, { data: Issue[] }, { data: Project[] }];
      setViews(viewPayload.data);
      setIssues(issuePayload.data);
      setProjects(projectPayload.data);
   }, [api]);

   useEffect(() => {
      void load().catch(() => setError('Could not load saved views.'));
   }, [load]);

   const results = useMemo(() => {
      const query = filters.query?.trim().toLowerCase();
      if (entityType === 'issue') {
         return issues.filter(
            (issue) =>
               (!filters.issueCategory || issue.status.category === filters.issueCategory) &&
               (!query ||
                  `${issue.identifier} ${issue.title} ${issue.project?.name ?? ''}`
                     .toLowerCase()
                     .includes(query))
         );
      }
      return projects.filter(
         (project) =>
            (!filters.projectType || project.type === filters.projectType) &&
            (!query ||
               `${project.identifier} ${project.name} ${project.status}`
                  .toLowerCase()
                  .includes(query))
      );
   }, [entityType, filters, issues, projects]);

   const create = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || name.trim().length < 2) return;
      const response = await fetch(`${api}/views`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({
            workspaceId,
            name: name.trim(),
            entityType,
            isShared: shared,
            filters,
         }),
      });
      if (!response.ok) return setError('Could not create saved view.');
      setName('');
      setShared(false);
      await load();
   };

   const apply = (view: SavedView) => {
      setActiveViewId(view.id);
      setEntityType(view.entityType);
      setFilters(view.filters ?? {});
   };

   const remove = async (view: SavedView) => {
      if (!workspaceId || !window.confirm(`Delete view “${view.name}”?`)) return;
      const response = await fetch(`${api}/views/${view.id}?workspaceId=${workspaceId}`, {
         method: 'DELETE',
         credentials: 'include',
      });
      if (!response.ok) return setError('Only the creator can delete this view.');
      if (activeViewId === view.id) setActiveViewId(undefined);
      await load();
   };

   return (
      <section className="mx-auto w-full max-w-5xl p-6">
         <div className="flex items-baseline justify-between gap-3">
            <div>
               <h1 className="text-xl font-semibold">Saved views</h1>
               <p className="mt-1 text-sm text-muted-foreground">
                  Filter live projects and issues, then save the exact view for later.
               </p>
            </div>
            <span className="text-xs text-muted-foreground">{views.length} saved</span>
         </div>

         <div className="mt-6 rounded-lg border p-4">
            <div className="flex flex-wrap gap-2">
               <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  onChange={(event) => {
                     setEntityType(event.target.value as 'issue' | 'project');
                     setFilters({});
                     setActiveViewId(undefined);
                  }}
                  value={entityType}
               >
                  <option value="issue">Issues</option>
                  <option value="project">Projects</option>
               </select>
               <input
                  className="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  onChange={(event) => {
                     setFilters((current) => ({
                        ...current,
                        query: event.target.value || undefined,
                     }));
                     setActiveViewId(undefined);
                  }}
                  placeholder="Search identifier, name, or title"
                  value={filters.query ?? ''}
               />
               {entityType === 'issue' ? (
                  <select
                     className="rounded-md border bg-background px-3 py-2 text-sm"
                     onChange={(event) => {
                        setFilters((current) => ({
                           ...current,
                           issueCategory: event.target.value || undefined,
                        }));
                        setActiveViewId(undefined);
                     }}
                     value={filters.issueCategory ?? ''}
                  >
                     <option value="">All statuses</option>
                     <option value="BACKLOG">Backlog</option>
                     <option value="UNSTARTED">Unstarted</option>
                     <option value="STARTED">Started</option>
                     <option value="COMPLETED">Completed</option>
                     <option value="CANCELED">Canceled</option>
                  </select>
               ) : (
                  <select
                     className="rounded-md border bg-background px-3 py-2 text-sm"
                     onChange={(event) => {
                        setFilters((current) => ({
                           ...current,
                           projectType: event.target.value || undefined,
                        }));
                        setActiveViewId(undefined);
                     }}
                     value={filters.projectType ?? ''}
                  >
                     <option value="">All project types</option>
                     {[
                        'GENERAL',
                        'PRODUCT',
                        'MARKETING',
                        'OPERATIONS',
                        'EVENT',
                        'CLIENT',
                        'RESEARCH',
                        'CUSTOM',
                     ].map((type) => (
                        <option key={type} value={type}>
                           {type}
                        </option>
                     ))}
                  </select>
               )}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
               {results.length} live {entityType === 'issue' ? 'issues' : 'projects'} match this
               filter.
               {activeViewId && ' Applied from a saved view.'}
            </p>
         </div>

         <form className="mt-4 flex flex-wrap gap-2 rounded-lg border p-3" onSubmit={create}>
            <input
               className="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
               onChange={(event) => setName(event.target.value)}
               placeholder="Name this view"
               value={name}
            />
            <label className="flex items-center gap-2 px-2 text-sm">
               <input
                  checked={shared}
                  onChange={(event) => setShared(event.target.checked)}
                  type="checkbox"
               />
               Share with workspace
            </label>
            <button
               className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
               disabled={name.trim().length < 2}
               type="submit"
            >
               Save current filter
            </button>
         </form>

         {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
         <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="overflow-hidden rounded-lg border">
               {results.length ? (
                  results.slice(0, 50).map((result) => {
                     const isIssue = entityType === 'issue';
                     const item = result as Issue & Project;
                     return (
                        <Link
                           className="block border-b px-4 py-3 text-sm last:border-0 hover:bg-muted/50"
                           href={
                              isIssue
                                 ? `/${orgId}/issue/${item.id}`
                                 : `/${orgId}/project/${item.id}/overview`
                           }
                           key={item.id}
                        >
                           <div className="flex justify-between gap-3">
                              <span className="font-medium">
                                 {item.identifier} · {isIssue ? item.title : item.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                 {isIssue ? item.status.name : `${item.type} · ${item.status}`}
                              </span>
                           </div>
                        </Link>
                     );
                  })
               ) : (
                  <p className="p-6 text-sm text-muted-foreground">No matching records.</p>
               )}
            </div>
            <div className="overflow-hidden rounded-lg border">
               {views.length ? (
                  views.map((view) => (
                     <article className="border-b p-3 last:border-0" key={view.id}>
                        <button
                           className="block text-left text-sm font-medium hover:underline"
                           onClick={() => apply(view)}
                           type="button"
                        >
                           {view.name}
                        </button>
                        <p className="mt-1 text-xs text-muted-foreground">
                           {view.entityType}s · {view.isShared ? 'shared' : 'personal'}
                        </p>
                        <button
                           className="mt-2 text-xs text-destructive"
                           onClick={() => void remove(view)}
                           type="button"
                        >
                           Delete
                        </button>
                     </article>
                  ))
               ) : (
                  <p className="p-4 text-sm text-muted-foreground">No saved views yet.</p>
               )}
            </div>
         </div>
      </section>
   );
}
