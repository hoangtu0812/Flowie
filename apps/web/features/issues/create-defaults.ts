import type { User } from '../../types/users';
export type IssueMemberOption = {
   id: string;
   name: string;
   email: string;
   avatarUrl?: string | null;
};
export function issueMember(member: IssueMemberOption, team: string): User {
   return {
      ...member,
      avatarUrl: member.avatarUrl ?? '',
      status: 'offline',
      role: 'Member',
      joinedDate: '',
      teamIds: team ? [team] : [],
      timezone: 'UTC',
   };
}
export function initialAssignee(
   members: IssueMemberOption[],
   account: string,
   enabled: boolean,
   team: string
): User | null {
   const member = enabled ? members.find((value) => value.id === account) : undefined;
   return member ? issueMember(member, team) : null;
}
