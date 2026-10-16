export type ActivityPerson = { name: string; avatarUrl?: string | null };
export type InitiativeUpdate = {
   id: string;
   body: string;
   health: string;
   createdAt: string;
   author?: ActivityPerson | null;
};
export type InitiativeAuditEvent = {
   id: string;
   action: string;
   createdAt: string;
   actor?: ActivityPerson | null;
};
