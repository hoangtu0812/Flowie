'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
   const [sending, setSending] = useState(false);
   const [error, setError] = useState<string>();
   const [submitError, setSubmitError] = useState<string>();
   const gate = useRef(new SubmissionGate());
   const current = useRef(issueId);
   current.current = issueId;
   const [reload, setReload] = useState(0);

   useEffect(() => {
      setActivities([]);
      setComments([]);
      setDraft('');
      setSubmitError(undefined);
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
               const comment = await postIssueComment(workspaceId, issueId, content);
               if (current.current === issueId) {
                  setComments((previous) => [...previous, comment]);
                  setDraft((latest) => (latest === draft ? '' : latest));
               }
            } catch (caught) {
               if (current.current === issueId)
                  setSubmitError(
                     caught instanceof Error
                        ? caught.message
                        : 'Could not post comment. Your draft is retained.'
                  );
            } finally {
               setSending(false);
            }
         }),
      [draft, issueId, workspaceId]
   );

   return {
      activities,
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
