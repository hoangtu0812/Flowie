'use client';

import { useEffect, useMemo, useState } from 'react';
import {
   Typeahead,
   TypeaheadItem,
   type SearchableItem,
   type SearchSource,
} from '@astryxdesign/core/Typeahead';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@/components/ui/button';
import { authenticatedFetch } from '@/lib/workspaces';
import { DesignSurface } from '@/components/common/design-surface';

export interface InvitationUser extends SearchableItem {
   email: string;
}

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function InvitationUserPicker({
   workspaceId,
   value,
   onChange,
   disabled,
}: {
   workspaceId: string;
   value: InvitationUser | null;
   onChange: (user: InvitationUser | null) => void;
   disabled: boolean;
}) {
   const [error, setError] = useState(false);
   const [hasMore, setHasMore] = useState(false);
   const [attempt, setAttempt] = useState(0);
   const source = useMemo(() => {
      let controller: AbortController | undefined;
      const search = async (query: string): Promise<InvitationUser[]> => {
         controller?.abort();
         const pending = new AbortController();
         controller = pending;
         setError(false);
         setHasMore(false);
         try {
            const parameters = new URLSearchParams({ q: query.slice(0, 120) });
            const response = await authenticatedFetch(
               `${api}/workspaces/${workspaceId}/invitation-candidates?${parameters}`,
               {
                  signal: pending.signal,
                  cache: 'no-store',
               }
            );
            if (!response.ok) throw new Error('User search failed');
            const payload = (await response.json()) as {
               data: { id: string; name: string; email: string }[];
               meta: { hasMore: boolean };
            };
            if (pending.signal.aborted) return [];
            setHasMore(payload.meta.hasMore);
            return payload.data.map((user) => ({
               id: user.id,
               label: user.name,
               email: user.email,
            }));
         } catch {
            if (!pending.signal.aborted) setError(true);
            return [];
         }
      };
      return {
         search,
         bootstrap: () => search(''),
         cancel: () => controller?.abort(),
      } satisfies SearchSource<InvitationUser>;
   }, [workspaceId]);
   useEffect(() => () => source.cancel(), [source]);
   return (
      <DesignSurface>
         <Typeahead
            key={attempt}
            label="Person"
            placeholder="Search by name or email…"
            description="Choose an existing Flowie user. Members and pending invitations are excluded."
            searchSource={source}
            value={value}
            onChange={onChange}
            onChangeQuery={() => onChange(null)}
            isDisabled={disabled}
            hasAutoFocus
            hasEntriesOnFocus
            maxMenuItems={25}
            debounceMs={250}
            isRequired
            emptySearchResultsText={
               error ? 'Could not load users.' : 'No matching users available to invite.'
            }
            renderItem={(item: InvitationUser) => (
               <TypeaheadItem item={item} description={item.email} />
            )}
         />
         {value && <Text>{value.email}</Text>}
         {hasMore && (
            <Text>Showing the first 25 users. Type a name or email to narrow the list.</Text>
         )}
         {error && (
            <>
               <Text role="alert">Could not load users. Please try again.</Text>
               <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAttempt((count) => count + 1)}
               >
                  Retry user search
               </Button>
            </>
         )}
      </DesignSurface>
   );
}
