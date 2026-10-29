'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { mentionOptions } from './comments-api';
import { insertMention, mentionSearchKey as searchKey, trailingMentionQuery } from './mention-text';

type Member = { id: string; name: string; avatarUrl?: string | null };

/**
 * Wraps the comment textarea with `@` autocomplete. Choosing a member inserts `@Name` into
 * the draft and adds their id to the mention list; removing that text from the draft drops
 * the mention again, so the notification list always matches what the comment shows.
 * Typing `@` is the only way to mention; there is no separate picker button.
 * VI: Bọc ô nhập comment với gợi ý khi gõ `@`. Chọn một thành viên sẽ chèn `@Tên` vào bản
 * VI: nháp và thêm id vào danh sách mention; xoá đoạn đó khỏi bản nháp thì bỏ mention, để danh
 * VI: sách nhận thông báo luôn khớp với nội dung comment. Gõ `@` là cách duy nhất để mention;
 * VI: không còn nút chọn thành viên riêng.
 */
export function CommentMentions({
   workspaceId,
   issueId,
   selected,
   onChange,
   draft,
   onDraftChange,
   children,
}: {
   workspaceId: string;
   issueId: string;
   selected: string[];
   onChange: (ids: string[]) => void;
   draft: string;
   onDraftChange: (value: string) => void;
   children: ReactNode;
}) {
   const [members, setMembers] = useState<Member[]>([]);
   const [error, setError] = useState<string>();
   const [active, setActive] = useState(0);
   const [dismissed, setDismissed] = useState<string>();
   const query = draft !== dismissed ? trailingMentionQuery(draft) : null;

   // Members load when an `@` is typed, and reload for the next one so newly added team
   // members appear without a page refresh.
   // VI: Danh sách thành viên tải khi gõ `@`, và tải lại ở lần sau để thành viên mới vào nhóm
   // VI: xuất hiện mà không cần tải lại trang.
   const wanted = query !== null;
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
         {error && <Text role="alert">{error}</Text>}
      </VStack>
   );
}
