'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadCurrentWorkspace } from '@/lib/workspaces';
import { SubmissionGate } from '@/features/shared/submission-gate';
import {
   loadIssueActivity,
   postIssueComment,
   type IssueActivity,
   type IssueComment,
} from './comments-api';

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
               setActivities(result.activities);
               setComments(result.comments);
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
                  setComments((previous) => [...previous, comment]);
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

   return {
      activities,
      replyTo,
      setReplyTo,
      mentionIds,
      setMentionIds,
      changeComment: (comment: IssueComment) =>
         setComments((items) => items.map((item) => (item.id === comment.id ? comment : item))),
      deleteComment: (id: string) => setComments((items) => items.filter((item) => item.id !== id)),
      comments,
      workspaceId,
      draft,
      setDraft,
      loading,
      sending,
      error,
      submitError,
      submit,
      retry: () => setReload((value) => value + 1),
   };
}
