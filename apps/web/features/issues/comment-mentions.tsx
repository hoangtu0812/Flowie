'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { AtSign } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { mentionOptions } from './comments-api';
import { insertMention, mentionSearchKey as searchKey, trailingMentionQuery } from './mention-text';

type Member = { id: string; name: string; avatarUrl?: string | null };

/**
 * Wraps the comment textarea with `@` autocomplete and a member picker. Choosing a member
 * inserts `@Name` into the draft and adds their id to the mention list; removing that text
 * from the draft drops the mention again, so the notification list always matches what the
 * comment shows.
 * VI: Bọc ô nhập comment với gợi ý `@` và bộ chọn thành viên. Chọn một thành viên sẽ chèn
 * VI: `@Tên` vào bản nháp và thêm id vào danh sách mention; xoá đoạn đó khỏi bản nháp thì bỏ
 * VI: mention, để danh sách nhận thông báo luôn khớp với nội dung comment.
 */
export function CommentMentions({
   workspaceId,
   issueId,
   selected,
   onChange,
   draft,
   onDraftChange,
   disabled,
   children,
}: {
   workspaceId: string;
   issueId: string;
   selected: string[];
   onChange: (ids: string[]) => void;
   draft: string;
   onDraftChange: (value: string) => void;
   disabled: boolean;
   children: ReactNode;
}) {
   const [members, setMembers] = useState<Member[]>([]);
   const [search, setSearch] = useState('');
   const [error, setError] = useState<string>();
   const [open, setOpen] = useState(false);
   const [active, setActive] = useState(0);
   const [dismissed, setDismissed] = useState<string>();
   const query = draft !== dismissed ? trailingMentionQuery(draft) : null;

   // Members load when the picker opens or an `@` is typed, and reload for the next session so
   // newly added team members appear without a page refresh.
   // VI: Danh sách thành viên tải khi mở bộ chọn hoặc gõ `@`, và tải lại ở lần sau để thành viên
   // VI: mới vào nhóm xuất hiện mà không cần tải lại trang.
   const wanted = open || query !== null;
   useEffect(() => {
      if (!wanted) return;
      let current = true;
      mentionOptions(workspaceId, issueId)
         .then((result) => {
            if (current) setMembers(result);
         })
         .catch((reason) => {
            if (current) setError(reason.message);
         });
      return () => {
         current = false;
      };
   }, [workspaceId, issueId, wanted]);

   useEffect(() => {
      if (!members.length) return;
      const kept = selected.filter((id) => {
         const member = members.find((candidate) => candidate.id === id);
         return !member || draft.includes(`@${member.name}`);
      });
      if (kept.length !== selected.length) onChange(kept);
   }, [draft, members, selected, onChange]);

   const suggestions =
      query === null
         ? []
         : members
              .filter((member) => searchKey(member.name).includes(searchKey(query)))
              .slice(0, 6);
   const highlighted = Math.min(active, Math.max(suggestions.length - 1, 0));

   function insert(member: Member) {
      onDraftChange(insertMention(draft, member.name));
      if (!selected.includes(member.id)) onChange([...selected, member.id]);
      setActive(0);
   }

   return (
      <VStack gap={2}>
         <div
            className="relative"
            onKeyDownCapture={(event) => {
               if (!suggestions.length || event.nativeEvent.isComposing) return;
               if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  const step = event.key === 'ArrowDown' ? 1 : -1;
                  setActive((highlighted + step + suggestions.length) % suggestions.length);
               } else if (event.key === 'Enter' || event.key === 'Tab') {
                  // Capture-phase handling keeps Enter from also submitting the comment.
                  // VI: Xử lý ở pha capture để Enter không đồng thời gửi comment.
                  event.preventDefault();
                  event.stopPropagation();
                  insert(suggestions[highlighted]);
               } else if (event.key === 'Escape') {
                  event.stopPropagation();
                  setDismissed(draft);
               }
            }}
         >
            {children}
            {suggestions.length > 0 && (
               <div
                  role="listbox"
                  aria-label="Members to mention"
                  className="absolute left-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-md"
               >
                  {suggestions.map((member, index) => (
                     <button
                        key={member.id}
                        type="button"
                        role="option"
                        aria-selected={index === highlighted}
                        className={cn(
                           'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                           index === highlighted ? 'bg-accent' : 'hover:bg-accent/60'
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insert(member)}
                     >
                        <Avatar className="size-5 shrink-0">
                           <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                           <AvatarFallback className="text-[10px] font-medium uppercase">
                              {member.name.slice(0, 1)}
                           </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{member.name}</span>
                     </button>
                  ))}
               </div>
            )}
         </div>
         <HStack gap={2} vAlign="center">
            <Button
               label={open ? 'Hide mention picker' : `Mention members (${selected.length})`}
               tooltip={open ? 'Hide mention picker' : 'Mention members (or type @)'}
               icon={<AtSign className="size-4" />}
               isIconOnly={!selected.length}
               size="sm"
               variant={open ? 'secondary' : 'ghost'}
               aria-pressed={open}
               isDisabled={disabled}
               onClick={() => setOpen(!open)}
            >
               {selected.length ? String(selected.length) : undefined}
            </Button>
            {error && <Text role="alert">{error}</Text>}
         </HStack>
         {open && (
            <>
               <TextInput label="Find a member to mention" value={search} onChange={setSearch} />
               <Text type="supporting">
                  Selected members receive a notification when you submit.
               </Text>
               <HStack gap={2} wrap="wrap">
                  {members
                     .filter((member) => searchKey(member.name).includes(searchKey(search)))
                     .map((member) => (
                        <Button
                           key={member.id}
                           label={`@${member.name}`}
                           size="sm"
                           aria-pressed={selected.includes(member.id)}
                           isDisabled={disabled}
                           variant={selected.includes(member.id) ? 'primary' : 'secondary'}
                           onClick={() =>
                              selected.includes(member.id)
                                 ? onChange(selected.filter((id) => id !== member.id))
                                 : insert(member)
                           }
                        />
                     ))}
               </HStack>
            </>
         )}
      </VStack>
   );
}
