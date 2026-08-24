'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIssuesStore } from '@/store/issues-store';
import { SmilePlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const reactionEmojis = ['👍', '👎', '🎉', '❤️', '👀'] as const;

type IssueReaction = { emoji: string; count: number; reacted: boolean };

/** Original Issue detail reaction affordance backed by persisted per-user reactions. */
export function IssueReactions({ issueId }: { issueId: string }) {
   const workspaceId = useIssuesStore((state) => state.workspaceId);
   const [reactions, setReactions] = useState<IssueReaction[]>([]);
   const [savingEmoji, setSavingEmoji] = useState<string>();
   const [error, setError] = useState<string>();

   const load = useCallback(async () => {
      if (!workspaceId) return;
      const query = new URLSearchParams({ workspaceId });
      const response = await fetch(`${api}/issues/${issueId}/reactions?${query}`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not load reactions.');
      const payload = (await response.json()) as { data: IssueReaction[] };
      setReactions(payload.data);
   }, [issueId, workspaceId]);

   useEffect(() => {
      void load().catch(() => setError('Could not load reactions.'));
   }, [load]);

   const toggleReaction = async (emoji: string) => {
      if (!workspaceId) return;
      const current = reactions.find((reaction) => reaction.emoji === emoji);
      setSavingEmoji(emoji);
      setError(undefined);
      try {
         const query = new URLSearchParams({ workspaceId });
         const response = await fetch(
            `${api}/issues/${issueId}/reactions/${encodeURIComponent(emoji)}?${query}`,
            current?.reacted
               ? { method: 'DELETE', credentials: 'include' }
               : {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ workspaceId, emoji }),
                 }
         );
         if (!response.ok) throw new Error('Could not save reaction.');
         await load();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not save reaction.');
      } finally {
         setSavingEmoji(undefined);
      }
   };

   return (
      <div className="flex items-center gap-1.5">
         <Popover>
            <PopoverTrigger asChild>
               <button
                  type="button"
                  disabled={!workspaceId || Boolean(savingEmoji)}
                  title="Add reaction"
                  className="disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Add reaction"
               >
                  <SmilePlus className="size-4" />
               </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="flex w-auto gap-1 p-1.5">
               {reactionEmojis.map((emoji) => (
                  <button
                     key={emoji}
                     type="button"
                     onClick={() => void toggleReaction(emoji)}
                     disabled={Boolean(savingEmoji)}
                     className="rounded p-1 text-base hover:bg-accent disabled:opacity-50"
                     aria-label={`React with ${emoji}`}
                  >
                     {emoji}
                  </button>
               ))}
            </PopoverContent>
         </Popover>
         {reactions.map((reaction) => (
            <button
               key={reaction.emoji}
               type="button"
               onClick={() => void toggleReaction(reaction.emoji)}
               disabled={Boolean(savingEmoji)}
               className="rounded-full border px-1.5 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
               data-state={reaction.reacted ? 'on' : 'off'}
               aria-label={`${reaction.reacted ? 'Remove' : 'Add'} ${reaction.emoji} reaction`}
            >
               {reaction.emoji} {reaction.count}
            </button>
         ))}
         {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
   );
}
