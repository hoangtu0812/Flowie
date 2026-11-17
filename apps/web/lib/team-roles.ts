/**
 * Team member roles (DTD-918) and what each may do, mirroring `app/modules/access/team_roles.py`.
 * A role belongs to one team, so checks take the team id the record lives in.
 * VI: Vai trò thành viên team (DTD-918) và quyền của từng vai trò, khớp với
 * VI: `app/modules/access/team_roles.py`. Vai trò thuộc về một team nên các hàm kiểm tra nhận id
 * VI: team chứa bản ghi.
 */
export type TeamRole = 'LEAD' | 'MEMBER' | 'VIEWER' | 'BOT';
export type TeamRoles = Record<string, TeamRole>;

export const TEAM_ROLES: Array<{ value: TeamRole; label: string }> = [
   { value: 'MEMBER', label: 'Member' },
   { value: 'LEAD', label: 'Lead' },
   { value: 'VIEWER', label: 'Viewer' },
   { value: 'BOT', label: 'Bot' },
];

/**
 * Whether the person may be assigned an issue of the team: everyone but its VIEWERs. Without a
 * team (or without role data) nobody is filtered, matching the API, which only refuses VIEWERs.
 * VI: Người đó có được giao issue của team hay không: mọi người trừ VIEWER của team. Không có team
 * VI: (hoặc không có dữ liệu vai trò) thì không lọc ai, khớp với API vốn chỉ từ chối VIEWER.
 */
export const isAssignable = (roles: TeamRoles | undefined, teamId?: string | null) =>
   !teamId || roles?.[teamId] !== 'VIEWER';

/**
 * Whether the person is a bot: BOT in the given team, or in any team when none is given.
 * VI: Người đó có phải bot không: BOT trong team được truyền vào, hoặc ở bất kỳ team nào khi không
 * VI: truyền team.
 */
export const isBot = (roles: TeamRoles | undefined, teamId?: string | null) =>
   teamId ? roles?.[teamId] === 'BOT' : Object.values(roles ?? {}).includes('BOT');
