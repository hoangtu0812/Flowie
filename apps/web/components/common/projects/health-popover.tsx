'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Project } from '@/types/projects';
import { AlertCircle, Bell, CircleCheck, CircleX, HelpCircle } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';

type ProjectUpdate = {
   id: string;
   body: string;
   createdAt: string;
   author: { id: string; name: string; avatarUrl: string | null };
};

interface HealthPopoverProps {
   project: Project;
   workspaceId?: string;
}

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function HealthPopover({ project, workspaceId }: HealthPopoverProps) {
   const [open, setOpen] = useState(false);
   const [subscribed, setSubscribed] = useState(false);
   const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
   const [loading, setLoading] = useState(false);
   const [saving, setSaving] = useState(false);
   const [showComposer, setShowComposer] = useState(false);
   const [body, setBody] = useState('');
   const [message, setMessage] = useState<string>();
   const isMobile = useIsMobile();

   const getHealthIcon = (healthId: string) => {
      switch (healthId) {
         case 'on-track':
            return <CircleCheck className="size-4 text-green-500" />;
         case 'off-track':
            return <CircleX className="size-4 text-red-500" />;
         case 'at-risk':
            return <AlertCircle className="size-4 text-amber-500" />;
         case 'no-update':
         default:
            return <HelpCircle className="size-4 text-muted-foreground" />;
      }
   };

   useEffect(() => {
      if (!open || !workspaceId) return;
      let active = true;
      setLoading(true);
      setMessage(undefined);
      void Promise.all([
         fetch(`${api}/projects/${project.id}/subscription?workspaceId=${workspaceId}`, {
            credentials: 'include',
         }),
         fetch(`${api}/projects/${project.id}/updates?workspaceId=${workspaceId}`, {
            credentials: 'include',
         }),
      ])
         .then(async ([subscriptionResponse, updatesResponse]) => {
            if (!subscriptionResponse.ok || !updatesResponse.ok) {
               throw new Error('Could not load project updates.');
            }
            const subscriptionPayload = (await subscriptionResponse.json()) as {
               data: { subscribed: boolean };
            };
            const updatesPayload = (await updatesResponse.json()) as { data: ProjectUpdate[] };
            if (!active) return;
            setSubscribed(subscriptionPayload.data.subscribed);
            setUpdates(updatesPayload.data);
         })
         .catch((caught: unknown) => {
            if (active) {
               setMessage(
                  caught instanceof Error ? caught.message : 'Could not load project updates.'
               );
            }
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [open, project.id, workspaceId]);

   const toggleSubscription = async () => {
      if (!workspaceId || saving) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await fetch(
            `${api}/projects/${project.id}/subscription?workspaceId=${workspaceId}`,
            { method: subscribed ? 'DELETE' : 'POST', credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not update project subscription.');
         const payload = (await response.json()) as { data: { subscribed: boolean } };
         setSubscribed(payload.data.subscribed);
      } catch (caught) {
         setMessage(
            caught instanceof Error ? caught.message : 'Could not update project subscription.'
         );
      } finally {
         setSaving(false);
      }
   };

   const createUpdate = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedBody = body.trim();
      if (!workspaceId || !trimmedBody || saving) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await fetch(`${api}/projects/${project.id}/updates`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, body: trimmedBody }),
         });
         if (!response.ok) throw new Error('Could not create project update.');
         const payload = (await response.json()) as { data: ProjectUpdate };
         setUpdates((current) => [payload.data, ...current]);
         setSubscribed(true);
         setBody('');
         setShowComposer(false);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not create project update.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               className="flex items-center justify-center gap-1 h-7 px-2"
               size="sm"
               variant="ghost"
            >
               {getHealthIcon(project.health.id)}
               <span className="text-xs mt-[1px] ml-0.5 hidden xl:inline">
                  {project.health.name}
               </span>
            </Button>
         </PopoverTrigger>
         <PopoverContent
            side={isMobile ? 'bottom' : 'left'}
            className={cn('p-0 w-[480px]', isMobile ? 'w-full' : '')}
         >
            <div className="flex items-center justify-between border-b p-3">
               <div className="flex items-center gap-2 min-w-0">
                  {project.icon && (
                     <project.icon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <h4 className="font-medium text-sm truncate">{project.name}</h4>
               </div>
               <div className="flex items-center gap-2 shrink-0">
                  <Button
                     onClick={() => void toggleSubscription()}
                     disabled={!workspaceId || saving || loading}
                     title={!workspaceId ? 'Workspace is not ready yet' : undefined}
                     variant="ghost"
                     size="sm"
                     className="h-7 px-2 text-xs"
                  >
                     {subscribed ? 'Subscribed' : 'Subscribe'}
                  </Button>
                  <Button
                     onClick={() => setShowComposer((visible) => !visible)}
                     disabled={!workspaceId || saving || loading}
                     title={!workspaceId ? 'Workspace is not ready yet' : undefined}
                     variant="outline"
                     size="sm"
                     className="h-7 px-2 text-xs flex items-center gap-1"
                  >
                     <Bell className="size-3" />
                     New update
                  </Button>
               </div>
            </div>
            <div className="p-3 space-y-3">
               <div className="flex items-center justify-start gap-3">
                  <div className="flex items-center gap-2">
                     {getHealthIcon(project.health.id)}
                     <span className="text-sm">{project.health.name}</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                     <Avatar className="size-5">
                        <AvatarImage
                           src={project.lead.avatarUrl || undefined}
                           alt={project.lead.name}
                        />
                        <AvatarFallback>{project.lead.name.charAt(0)}</AvatarFallback>
                     </Avatar>
                     <span className="text-xs text-muted-foreground truncate">
                        {project.lead.name}
                     </span>
                     <span className="text-xs text-muted-foreground">·</span>
                     <span className="text-xs text-muted-foreground">
                        {new Date(project.startDate).toLocaleDateString()}
                     </span>
                  </div>
               </div>
               <p className="text-sm text-muted-foreground">{project.health.description}</p>
               {showComposer && (
                  <form className="space-y-2 border-t pt-3" onSubmit={createUpdate}>
                     <Textarea
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="Share a project update…"
                        maxLength={4000}
                        rows={3}
                        autoFocus
                        required
                     />
                     <div className="flex justify-end gap-2">
                        <Button
                           type="button"
                           size="xs"
                           variant="ghost"
                           onClick={() => setShowComposer(false)}
                        >
                           Cancel
                        </Button>
                        <Button type="submit" size="xs" disabled={saving || !body.trim()}>
                           {saving ? 'Posting…' : 'Post update'}
                        </Button>
                     </div>
                  </form>
               )}
               {message && <p className="text-xs text-destructive">{message}</p>}
               {loading && <p className="text-xs text-muted-foreground">Loading updates…</p>}
               {!loading && updates.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                     <p className="text-xs font-medium text-muted-foreground">Recent updates</p>
                     {updates.slice(0, 3).map((update) => (
                        <div key={update.id} className="rounded-md bg-muted/40 px-2.5 py-2">
                           <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Avatar className="size-4">
                                 <AvatarImage
                                    src={update.author.avatarUrl || undefined}
                                    alt={update.author.name}
                                 />
                                 <AvatarFallback>{update.author.name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span>{update.author.name}</span>
                              <span>·</span>
                              <span>{new Date(update.createdAt).toLocaleDateString()}</span>
                           </div>
                           <p className="mt-1 whitespace-pre-wrap text-sm">{update.body}</p>
                        </div>
                     ))}
                  </div>
               )}
            </div>
         </PopoverContent>
      </Popover>
   );
}
