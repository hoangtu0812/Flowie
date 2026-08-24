'use client';

import { ContentBlocks } from '@/components/common/issues/details/content-blocks';
import { IssuePropertiesPanel } from '@/components/common/issues/details/issue-properties-panel';
import { LabelBadge } from '@/components/common/issues/label-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getNotificationIcon } from '@/lib/notification-utils';
import { loadCurrentWorkspace } from '@/lib/workspaces';
import type { ContentBlock } from '@circle/contracts';
import { useIssuesStore } from '@/store/issues-store';
import { type InboxNotification, useNotificationsStore } from '@/store/notifications-store';
import { ArrowUpRight, Check, Paperclip, Send } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { NotificationBox } from './icons/motification-box';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

interface IssuePreviewProps {
   notification?: InboxNotification;
   onMarkAsRead?: (id: string) => Promise<void> | void;
}

type ProjectPreview = {
   id: string;
   identifier: string;
   name: string;
   description: string | null;
};

const descriptionBlocks = (description: string): ContentBlock[] =>
   description
      .split(/\n{2,}/)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ type: 'paragraph', text }));

export default function IssuePreview({ notification, onMarkAsRead }: IssuePreviewProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const { getUnreadCount } = useNotificationsStore();
   const { issues, loadIssues } = useIssuesStore();
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [project, setProject] = useState<ProjectPreview>();
   const [draft, setDraft] = useState('');
   const [attachment, setAttachment] = useState<File>();
   const [saving, setSaving] = useState(false);
   const fileInputRef = useRef<HTMLInputElement>(null);

   useEffect(() => {
      if (notification?.entityType === 'issue') void loadIssues();
   }, [loadIssues, notification?.entityType]);

   useEffect(() => {
      void loadCurrentWorkspace()
         .then((workspace) => setWorkspaceId(workspace.id))
         .catch(() => setWorkspaceId(undefined));
   }, []);

   useEffect(() => {
      if (!workspaceId || notification?.entityType !== 'project') {
         setProject(undefined);
         return;
      }
      void fetch(
         `${api}/projects/${notification.entityId}?${new URLSearchParams({ workspaceId })}`,
         { credentials: 'include' }
      )
         .then(async (response) => {
            if (!response.ok) throw new Error();
            setProject(((await response.json()) as { data: ProjectPreview }).data);
         })
         .catch(() => setProject(undefined));
   }, [notification?.entityId, notification?.entityType, workspaceId]);

   const issue = useMemo(() => {
      if (!notification || notification.entityType !== 'issue') return undefined;
      return issues.find(
         (candidate) =>
            candidate.id === notification.entityId ||
            candidate.identifier === notification.identifier
      );
   }, [issues, notification]);

   if (!notification) {
      const unreadCount = getUnreadCount();
      return (
         <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <NotificationBox className="w-16 h-16 mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold text-muted-foreground mb-2">
               {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
               Select a notification from the list to view its details and take action.
            </p>
         </div>
      );
   }

   const selectAttachment = (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > MAX_ATTACHMENT_SIZE) {
         toast.error('Files must be 10 MB or smaller.');
         return;
      }
      setAttachment(file);
   };

   const submitComment = async () => {
      if (!workspaceId || !issue || !draft.trim()) return;
      setSaving(true);
      try {
         const response = await fetch(`${api}/comments`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, issueId: issue.id, content: draft.trim() }),
         });
         if (!response.ok) throw new Error('Could not add the comment.');
         const payload = (await response.json()) as { data: { id: string } };
         if (attachment) {
            const form = new FormData();
            form.set('workspaceId', workspaceId);
            form.set('entityType', 'comment');
            form.set('entityId', payload.data.id);
            form.set('file', attachment);
            const upload = await fetch(`${api}/attachments`, {
               method: 'POST',
               credentials: 'include',
               body: form,
            });
            if (!upload.ok) throw new Error('Comment saved, but attachment upload failed.');
         }
         setDraft('');
         setAttachment(undefined);
         toast.success('Comment added');
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not add the comment.');
      } finally {
         setSaving(false);
      }
   };

   const header = issue?.identifier ?? project?.identifier ?? notification.identifier;

   return (
      <div className="flex flex-col h-full overflow-hidden">
         <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
               {issue ? <issue.status.icon /> : getNotificationIcon(notification.type, 'size-4')}
               <span className="text-sm font-medium truncate">{header}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
               {!notification.read && onMarkAsRead && (
                  <Button
                     variant="outline"
                     size="xs"
                     onClick={() => void onMarkAsRead(notification.id)}
                     className="gap-1"
                  >
                     <Check className="size-4" />
                     Mark as read
                  </Button>
               )}
               {issue && (
                  <Button variant="ghost" size="xs" asChild>
                     <Link href={`/${orgId}/issue/${issue.identifier}`}>
                        Open <ArrowUpRight className="size-3.5 ml-0.5" />
                     </Link>
                  </Button>
               )}
               {project && (
                  <Button variant="ghost" size="xs" asChild>
                     <Link href={`/${orgId}/project/${project.id}/overview`}>
                        Open <ArrowUpRight className="size-3.5 ml-0.5" />
                     </Link>
                  </Button>
               )}
            </div>
         </div>

         <div className="flex-1 min-h-0 flex overflow-hidden">
            <div className="flex-1 min-w-0 overflow-y-auto">
               <div className="pt-8 pb-6 px-6 w-full max-w-3xl mx-auto">
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg mb-8">
                     <div className="relative shrink-0">
                        <Avatar className="size-7">
                           <AvatarImage
                              src={notification.user.avatarUrl ?? undefined}
                              alt={notification.user.name}
                           />
                           <AvatarFallback className="text-xs">
                              {notification.user.name[0]}
                           </AvatarFallback>
                        </Avatar>
                        <div className="absolute -bottom-1 -right-1 size-4 rounded-full bg-accent border border-background flex items-center justify-center">
                           {getNotificationIcon(notification.type, 'size-2.5')}
                        </div>
                     </div>
                     <div className="min-w-0 text-sm">
                        <span className="font-medium">{notification.user.name}</span>{' '}
                        <span className="text-muted-foreground">· {notification.timestamp}</span>
                        <p className="text-foreground/90 mt-0.5">{notification.content}</p>
                     </div>
                  </div>

                  <h3 className="text-2xl font-semibold text-foreground text-balance">
                     {issue?.title ?? project?.name ?? notification.title}
                  </h3>

                  {project && (
                     <div className="mt-6">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                           {project.description || 'No description provided.'}
                        </p>
                     </div>
                  )}

                  {issue && (
                     <>
                        <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-4 text-sm xl:hidden">
                           <span className="flex items-center gap-1.5">
                              <issue.status.icon /> {issue.status.name}
                           </span>
                           <span className="flex items-center gap-1.5 text-muted-foreground">
                              <issue.priority.icon className="size-3.5" /> {issue.priority.name}
                           </span>
                           {issue.assignee && (
                              <span className="flex items-center gap-1.5">
                                 <Avatar className="size-4">
                                    <AvatarImage
                                       src={issue.assignee.avatarUrl ?? undefined}
                                       alt={issue.assignee.name}
                                    />
                                    <AvatarFallback className="text-[9px]">
                                       {issue.assignee.name[0]}
                                    </AvatarFallback>
                                 </Avatar>
                                 {issue.assignee.name}
                              </span>
                           )}
                           <LabelBadge label={issue.labels} />
                        </div>

                        <div className="mt-6">
                           {issue.description ? (
                              <ContentBlocks blocks={descriptionBlocks(issue.description)} />
                           ) : (
                              <p className="text-sm text-muted-foreground">
                                 No description provided.
                              </p>
                           )}
                        </div>

                        <div className="relative w-full flex flex-col mt-10">
                           <Textarea
                              value={draft}
                              onChange={(event) => setDraft(event.target.value)}
                              className="w-full rounded-lg border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent pb-14 resize-none"
                              placeholder="Leave a comment..."
                              rows={3}
                           />
                           {attachment && (
                              <p className="absolute left-4 bottom-4 text-xs text-muted-foreground truncate max-w-[60%]">
                                 {attachment.name}
                              </p>
                           )}
                           <input
                              ref={fileInputRef}
                              type="file"
                              className="hidden"
                              onChange={selectAttachment}
                           />
                           <div className="absolute right-3 bottom-3 flex items-center gap-3">
                              <Button
                                 size="icon"
                                 variant="ghost"
                                 onClick={() => fileInputRef.current?.click()}
                              >
                                 <Paperclip className="w-4 h-4" />
                              </Button>
                              <Button
                                 size="icon"
                                 variant="secondary"
                                 disabled={saving || !workspaceId || !draft.trim()}
                                 onClick={() => void submitComment()}
                              >
                                 <Send className="w-4 h-4" />
                              </Button>
                           </div>
                        </div>
                     </>
                  )}
               </div>
            </div>

            {issue && (
               <aside className="hidden xl:block w-64 shrink-0 border-l overflow-y-auto bg-container px-4 py-5">
                  <IssuePropertiesPanel issue={issue} orgId={orgId} />
               </aside>
            )}
         </div>
      </div>
   );
}
