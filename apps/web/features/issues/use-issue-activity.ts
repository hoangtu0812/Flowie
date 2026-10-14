'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadCurrentWorkspace } from '@/lib/workspaces';
import { SubmissionGate } from '@/features/shared/submission-gate';
import {
   loadIssueActivity,
   loadFeedPage,
   postIssueComment,
   type IssueActivity,
   type IssueComment,
} from './comments-api';
import { mergeFeed } from './feed-merge';

export function useIssueActivity(issueId: string) {
   const [activities, setActivities] = useState<IssueActivity[]>([]);
   const [comments, setComments] = useState<IssueComment[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [draft, setDraft] = useState('');
   const [loading, setLoading] = useState(true);
   const [replyTo, setReplyTo] = useState<IssueComment>();
   const [mentionIds, setMentionIds] = useState<string[]>([]);
   const request = useRef<{ signature: string; key: string } | undefined>(undefined);
   const [sending, setSending] = useState(false);
   const [error, setError] = useState<string>();
   const [submitError, setSubmitError] = useState<string>();
   const gate = useRef(new SubmissionGate());
   const scope = useMemo(() => ({ issueId }), [issueId]);
   const current = useRef(scope);
   current.current = scope;
   const [reload, setReload] = useState(0);
   const [activityCursor, setActivityCursor] = useState<string | null>();
   const [commentCursor, setCommentCursor] = useState<string | null>();
   const [paging, setPaging] = useState(false);
   const pageGate = useRef(new SubmissionGate());
   const replyCursors = useRef<Record<string, string | null>>({});

   useEffect(() => {
      setActivities([]);
      setComments([]);
      setDraft('');
      setReplyTo(undefined);
      setMentionIds([]);
      request.current = undefined;
      setSubmitError(undefined);
      setSending(false);
      gate.current = new SubmissionGate();
      pageGate.current = new SubmissionGate();
      replyCursors.current = {};
      setActivityCursor(undefined);
      setCommentCursor(undefined);
      setPaging(false);
   }, [issueId]);

   useEffect(() => {
      let active = true;
      setLoading(true);
      setError(undefined);
      setWorkspaceId(undefined);
      void loadCurrentWorkspace()
         .then(async (workspace) => {
            const result = await loadIssueActivity(workspace.id, issueId);
            if (active) {
               setWorkspaceId(workspace.id);
               setActivities((items) => mergeFeed(items, result.activities));
               setComments((items) => mergeFeed(items, result.comments));
               setActivityCursor(result.activityCursor);
               setCommentCursor(result.commentCursor);
            }
         })
         .catch((caught: unknown) => {
            if (active)
               setError(
                  caught instanceof Error ? caught.message : 'Could not load issue activity.'
               );
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [issueId, reload]);

   const submit = useCallback(
      () =>
         gate.current.run(async () => {
            const content = draft.trim();
            if (!content || !workspaceId) return;
            setSending(true);
            setSubmitError(undefined);
            try {
               const signature = JSON.stringify({
                  issueId,
                  content,
                  parent: replyTo?.id,
                  mentionIds,
               });
               if (request.current?.signature !== signature)
                  request.current = { signature, key: crypto.randomUUID() };
               const comment = await postIssueComment(workspaceId, issueId, content, {
                  parentCommentId: replyTo?.id,
                  mentionIds,
                  clientRequestKey: request.current.key,
               });
               if (current.current === scope) {
                  request.current = undefined;
                  setReplyTo(undefined);
                  setMentionIds([]);
                  setComments((previous) =>
                     mergeFeed(
                        previous.map((item) =>
                           item.id === comment.parentCommentId
                              ? {
                                   ...item,
                                   replyCount:
                                      (item.replyCount ??
                                         previous.filter(
                                            (child) => child.parentCommentId === item.id
                                         ).length) + 1,
                                }
                              : item
                        ),
                        [comment]
                     )
                  );
                  setDraft((latest) => (latest === draft ? '' : latest));
               }
            } catch (caught) {
               if (current.current === scope)
                  setSubmitError(
                     caught instanceof Error
                        ? caught.message
                        : 'Could not post comment. Your draft is retained.'
                  );
            } finally {
               if (current.current === scope) setSending(false);
            }
         }),
      [draft, issueId, workspaceId, replyTo, mentionIds, scope]
   );

   const loadMore = (kind: 'comments' | 'activities', parentId?: string) =>
      pageGate.current.run(async () => {
         if (!workspaceId) return;
         const cursor = parentId
            ? replyCursors.current[parentId]
            : kind === 'comments'
              ? commentCursor
              : activityCursor;
         if (cursor === null || (!parentId && !cursor)) return;
         setPaging(true);
         setError(undefined);
         try {
            if (kind === 'comments') {
               const page = await loadFeedPage<IssueComment>(
                  workspaceId,
                  issueId,
                  kind,
                  cursor ?? undefined,
                  parentId
               );
               if (current.current !== scope) return;
               setComments((items) => mergeFeed(items, page.data));
               if (parentId) replyCursors.current[parentId] = page.meta?.nextCursor ?? null;
               else setCommentCursor(page.meta?.nextCursor);
            } else {
               const page = await loadFeedPage<IssueActivity>(
                  workspaceId,
                  issueId,
                  kind,
                  cursor ?? undefined
               );
               if (current.current !== scope) return;
               setActivities((items) =>
                  mergeFeed(
                     items,
                     page.data.filter((item) => item.type !== 'comment.created')
                  )
               );
               setActivityCursor(page.meta?.nextCursor);
            }
         } catch (reason) {
            if (current.current === scope)
               setError(
                  reason instanceof Error ? reason.message : 'Could not load older activity.'
               );
         } finally {
            if (current.current === scope) setPaging(false);
         }
      });

   return {
      activities,
      replyTo,
      setReplyTo,
      mentionIds,
      setMentionIds,
      changeComment: (comment: IssueComment) =>
         setComments((items) => items.map((item) => (item.id === comment.id ? comment : item))),
      deleteComment: (id: string) =>
         setComments((items) => {
            const deleted = items.find((item) => item.id === id);
            return items
               .filter((item) => item.id !== id)
               .map((item) =>
                  item.id === deleted?.parentCommentId
                     ? { ...item, replyCount: Math.max(0, (item.replyCount ?? 1) - 1) }
                     : item
               );
         }),
      comments,
      workspaceId,
      draft,
      setDraft,
      loading,
      sending,
      error,
      submitError,
      submit,
      activityCursor,
      commentCursor,
      paging,
      loadMore,
      retry: () => setReload((value) => value + 1),
   };
}
