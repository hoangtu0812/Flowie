'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { statusUserColors, User } from '@/mock-data/users';
import { useIssuesStore } from '@/store/issues-store';
import { CheckIcon, CircleUserRound, UserIcon } from 'lucide-react';
import { useState } from 'react';

interface AssigneeUserProps {
   user: User | null;
   /** Persists the choice when supplied; without it the control stays read-only. */
   issueId?: string;
   /**
    * Saves the choice instead of the issues store, for issues the store has not loaded (sub-issue
    * tree rows). VI: Lưu lựa chọn thay cho issues store, cho issue mà store chưa tải (hàng của cây
    * sub-issue).
    */
   onAssign?: (assignee: User | null) => Promise<unknown>;
   /**
    * Texts for another person field such as the reporter; defaults describe the assignee.
    * VI: Nhãn cho trường người khác như reporter; mặc định là nhãn của assignee.
    */
   labels?: { field: string; menu: string; empty: string };
   /**
    * Renders the trigger as a full property row (avatar, field label, name) aligned with the other
    * labeled rows of the properties panel, without the presence dot, which belongs to list avatars.
    * VI: Hiển thị nút chọn thành một dòng thuộc tính đầy đủ (avatar, nhãn, tên) thẳng cột với các
    * VI: dòng có nhãn khác của panel thuộc tính, không có chấm trạng thái, vốn dành cho avatar ở danh sách.
    */
   row?: boolean;
}

const assigneeLabels = { field: 'Assignee', menu: 'Assign to...', empty: 'No assignee' };

export function AssigneeUser({
   user,
   issueId,
   onAssign,
   labels = assigneeLabels,
   row = false,
}: AssigneeUserProps) {
   const [open, setOpen] = useState(false);
   const [saving, setSaving] = useState(false);
   const { members, updateIssueAssignee } = useIssuesStore();

   const assign = async (nextAssignee: User | null) => {
      setOpen(false);
      if (!issueId || nextAssignee?.id === user?.id) return;
      setSaving(true);
      await (onAssign ? onAssign(nextAssignee) : updateIssueAssignee(issueId, nextAssignee));
      setSaving(false);
   };

   const renderAvatar = () => {
      if (row) {
         return user ? (
            <Avatar className="size-4 shrink-0">
               <AvatarImage src={user.avatarUrl} alt="" />
               <AvatarFallback className="text-[9px]">{user.name[0]}</AvatarFallback>
            </Avatar>
         ) : (
            <CircleUserRound className="size-4 shrink-0 text-muted-foreground" />
         );
      }
      if (user) {
         return (
            <Avatar className="size-6 shrink-0">
               <AvatarImage src={user.avatarUrl} alt={user.name} />
               <AvatarFallback>{user.name[0]}</AvatarFallback>
            </Avatar>
         );
      }
      return (
         <div className="size-6 flex items-center justify-center">
            <CircleUserRound className="size-5 text-zinc-600" />
         </div>
      );
   };

   // Without an issue the avatar is pure presentation — rendering a picker that
   // cannot save anything is what made this control look mocked.
   if (!issueId) {
      return <span className="relative w-fit block">{renderAvatar()}</span>;
   }

   return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
         <DropdownMenuTrigger asChild>
            <button
               aria-label={`${labels.field}: ${user?.name ?? labels.empty}`}
               type="button"
               className={
                  row
                     ? 'flex items-center gap-2 -ml-1 px-1 py-0.5 rounded-md text-left hover:bg-accent/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
                     : 'relative w-fit focus:outline-none disabled:opacity-60'
               }
               disabled={saving}
               onClick={(event) => event.stopPropagation()}
            >
               {renderAvatar()}
               {row && (
                  <>
                     <span className="w-20 shrink-0 text-xs text-muted-foreground">
                        {labels.field}
                     </span>
                     <span className="min-w-0 flex-1 truncate text-sm">
                        {user?.name ?? labels.empty}
                     </span>
                  </>
               )}
               {!row && user && (
                  <span
                     className="border-background absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full border-2"
                     style={{ backgroundColor: statusUserColors[user.status] }}
                  >
                     <span className="sr-only">{user.status}</span>
                  </span>
               )}
            </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="w-[206px]">
            <DropdownMenuLabel>{labels.menu}</DropdownMenuLabel>
            <DropdownMenuItem
               onClick={(event) => {
                  event.stopPropagation();
                  void assign(null);
               }}
            >
               <div className="flex items-center gap-2">
                  <UserIcon className="h-5 w-5" />
                  <span>{labels.empty}</span>
               </div>
               {!user && <CheckIcon className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {members.map((member) => (
               <DropdownMenuItem
                  key={member.id}
                  onClick={(event) => {
                     event.stopPropagation();
                     void assign(member);
                  }}
               >
                  <div className="flex items-center gap-2 min-w-0">
                     <Avatar className="h-5 w-5">
                        <AvatarImage src={member.avatarUrl} alt={member.name} />
                        <AvatarFallback>{member.name[0]}</AvatarFallback>
                     </Avatar>
                     <span className="truncate">{member.name}</span>
                  </div>
                  {user?.id === member.id && <CheckIcon className="ml-auto h-4 w-4 shrink-0" />}
               </DropdownMenuItem>
            ))}
            {members.length === 0 && (
               <DropdownMenuItem disabled>No workspace members yet</DropdownMenuItem>
            )}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
