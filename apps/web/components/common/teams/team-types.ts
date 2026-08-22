export type ApiTeam = {
   id: string;
   identifier: string;
   name: string;
   icon: string | null;
   color: string | null;
   createdAt: string;
   updatedAt: string;
   members: Array<{
      role: 'LEAD' | 'MEMBER';
      user: { id: string; name: string; avatarUrl: string | null };
   }>;
   _count: { projects: number; cycles: number };
};
