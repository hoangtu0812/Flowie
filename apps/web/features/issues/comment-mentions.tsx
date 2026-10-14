'use client';
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { mentionOptions } from './comments-api';
export function CommentMentions({
   workspaceId,
   issueId,
   selected,
   onChange,
   disabled,
}: {
   workspaceId: string;
   issueId: string;
   selected: string[];
   onChange: (ids: string[]) => void;
   disabled: boolean;
}) {
   const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
   const [search, setSearch] = useState('');
   const [error, setError] = useState<string>();
   const [open, setOpen] = useState(false);
   useEffect(() => {
      if (!open) return;
      let active = true;
      mentionOptions(workspaceId, issueId)
         .then((result) => {
            if (active) setMembers(result);
         })
         .catch((reason) => {
            if (active) setError(reason.message);
         });
      return () => {
         active = false;
      };
   }, [workspaceId, issueId, open]);
   return (
      <VStack gap={2}>
         <Button
            label={open ? 'Hide mention picker' : `Mention members (${selected.length})`}
            size="sm"
            isDisabled={disabled}
            onClick={() => setOpen(!open)}
         />
         {open && (
            <>
               <TextInput label="Find a member to mention" value={search} onChange={setSearch} />
               {error && <Text role="alert">{error}</Text>}
               <Text type="supporting">
                  Selected members receive a notification when you submit.
               </Text>
               <HStack gap={2} wrap="wrap">
                  {members
                     .filter((member) => member.name.toLowerCase().includes(search.toLowerCase()))
                     .map((member) => (
                        <Button
                           key={member.id}
                           label={`@${member.name}`}
                           size="sm"
                           aria-pressed={selected.includes(member.id)}
                           isDisabled={disabled}
                           variant={selected.includes(member.id) ? 'primary' : 'secondary'}
                           onClick={() =>
                              onChange(
                                 selected.includes(member.id)
                                    ? selected.filter((id) => id !== member.id)
                                    : [...selected, member.id]
                              )
                           }
                        />
                     ))}
               </HStack>
            </>
         )}
      </VStack>
   );
}
