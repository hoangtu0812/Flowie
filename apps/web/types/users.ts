export interface User {
   id: string;
   name: string;
   avatarUrl: string;
   email: string;
   status: 'online' | 'offline' | 'away';
   role: 'Member' | 'Admin' | 'Guest' | 'Application';
   joinedDate: string;
   teamIds: string[];
   timezone: string;
   lastSeenAt?: string | null;
   workspaceMemberId?: string;
   workspaceRole?: 'OWNER' | 'ADMIN' | 'MEMBER';
   membershipStatus?: 'ACTIVE' | 'INVITED';
}
