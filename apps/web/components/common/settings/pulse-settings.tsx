'use client';

import { loadCurrentWorkspaceTeams } from '@/components/common/teams/team-types';
import { authenticatedFetch } from '@/lib/workspaces';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Activity, FolderKanban, MessageSquareText } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashedSmiley } from './settings-placeholder';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
type PulseItem = {
   id: string;
   kind: 'activity' | 'project-update';
   title: string;
   body: string | null;
   health: string | null;
   createdAt: string;
   actor: { id: string; name: string; avatarUrl: string | null } | null;
   entity: { type: 'issue' | 'project'; id: string; label: string } | null;
};

/** Original read-only Pulse shell backed by accessible workspace activity and project updates. */
export default function PulseSettings() {
   const params = useParams<{ orgId: string }>();
   const router = useRouter();
   const [items, setItems] = useState<PulseItem[]>([]);
   const [filter, setFilter] = useState('');
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string>();

   const load = useCallback(async () => {
      setLoading(true);
      setLoadError(undefined);
      try {
         const { workspaceId } = await loadCurrentWorkspaceTeams();
         const response = await authenticatedFetch(
            `${api}/pulse?${new URLSearchParams({ workspaceId, limit: '150' })}`,
            { credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not load workspace updates.');
         setItems(((await response.json()) as { data: PulseItem[] }).data);
      } catch (caught) {
         setLoadError(
            caught instanceof Error ? caught.message : 'Could not load workspace updates.'
         );
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void load();
   }, [load]);

   const visibleItems = useMemo(() => {
      const value = filter.trim().toLowerCase();
      if (!value) return items;
      return items.filter(
         (item) =>
            item.title.toLowerCase().includes(value) ||
            item.body?.toLowerCase().includes(value) ||
            item.entity?.label.toLowerCase().includes(value)
      );
   }, [filter, items]);

   const openEntity = (item: PulseItem) => {
      if (!item.entity) return;
      const segment = item.entity.type === 'issue' ? 'issue' : 'project';
      const suffix = item.entity.type === 'project' ? '/overview' : '';
      router.push(`/${params.orgId}/${segment}/${item.entity.id}${suffix}`);
   };

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-2xl font-medium">Pulse</h1>
            <p className="text-sm text-muted-foreground mt-1">
               A feed of important updates across your workspace
            </p>

            <div className="flex items-center justify-between gap-3 mt-6">
               <Input
                  placeholder="Filter by name..."
                  className="w-72 h-8"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
               />
            </div>

            {loading && <p className="py-12 text-sm text-muted-foreground">Loading updates…</p>}
            {loadError && <p className="py-12 text-sm text-destructive">{loadError}</p>}
            {!loading && !loadError && visibleItems.length === 0 && (
               <div className="flex flex-col items-center justify-center gap-5 py-32">
                  <DashedSmiley />
                  <p className="text-sm text-muted-foreground">
                     {items.length === 0 ? 'No updates' : 'No matching updates'}
                  </p>
               </div>
            )}
            {!loading && !loadError && visibleItems.length > 0 && (
               <div className="mt-5 overflow-hidden rounded-lg border bg-container divide-y">
                  {visibleItems.map((item) => (
                     <button
                        key={item.id}
                        type="button"
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/50 disabled:cursor-default"
                        onClick={() => openEntity(item)}
                        disabled={!item.entity}
                     >
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
                           {item.kind === 'project-update' ? (
                              <MessageSquareText className="size-4" />
                           ) : (
                              <Activity className="size-4" />
                           )}
                        </span>
                        <span className="min-w-0 flex-1">
                           <span className="block truncate text-sm font-medium">{item.title}</span>
                           {item.entity && (
                              <span className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                                 {item.entity.type === 'project' && (
                                    <FolderKanban className="size-3 shrink-0" />
                                 )}
                                 {item.entity.label}
                              </span>
                           )}
                           {item.body && (
                              <span className="mt-2 line-clamp-2 block text-sm text-muted-foreground">
                                 {item.body}
                              </span>
                           )}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                           {item.health && (
                              <Badge variant="outline" className="px-2 py-0.5 font-normal">
                                 {item.health}
                              </Badge>
                           )}
                           <span className="text-xs text-muted-foreground">
                              {new Date(item.createdAt).toLocaleString()}
                           </span>
                        </span>
                     </button>
                  ))}
               </div>
            )}
         </div>
      </div>
   );
}
