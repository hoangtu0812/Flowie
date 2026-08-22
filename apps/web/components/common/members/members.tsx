'use client';

import { useMembersFilterStore } from '@/store/members-filter-store';
import { ArrowDown } from 'lucide-react';
import { useMemo } from 'react';
import MemberLine from './member-line';
import { useLiveMembers } from './use-live-members';

const roleLabel = (role: string) => (role === 'OWNER' || role === 'ADMIN' ? 'Admin' : 'Member');

export default function Members() {
   const { filters, sort } = useMembersFilterStore();
   const { members, loading, error } = useLiveMembers();

   const displayed = useMemo(() => {
      let list = members.slice();
      if (filters.role.length > 0)
         list = list.filter((member) => filters.role.includes(roleLabel(member.workspaceRole)));
      return list.sort((a, b) => {
         switch (sort) {
            case 'name-asc':
               return a.name.localeCompare(b.name);
            case 'name-desc':
               return b.name.localeCompare(a.name);
            case 'joined-asc':
               return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
            case 'joined-desc':
               return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
            case 'teams-asc':
               return a.teams.length - b.teams.length;
            case 'teams-desc':
               return b.teams.length - a.teams.length;
            default:
               return 0;
         }
      });
   }, [filters.role, members, sort]);

   if (loading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading members…</div>;
   if (error) return <div className="px-8 py-10 text-sm text-destructive">{error}</div>;

   return (
      <div className="w-full">
         <div className="bg-container px-6 py-1.5 text-sm flex items-center text-muted-foreground border-b sticky top-0 z-10">
            <div className="flex-1 min-w-0 flex items-center gap-1">
               Name <ArrowDown className="size-3" />
            </div>
            <div className="w-[110px] shrink-0">Status</div>
            <div className="hidden lg:block w-[100px] shrink-0">Joined</div>
            <div className="hidden md:block w-[170px] shrink-0">Teams</div>
            <div className="hidden sm:block w-[90px] shrink-0">Last seen</div>
         </div>
         <div className="w-full">
            {displayed.map((member) => (
               <MemberLine key={member.id} member={member} />
            ))}
         </div>
      </div>
   );
}
