export interface HealthCheckResponse {
   status: 'ok';
   service: 'api';
   timestamp: string;
}

export interface AuthenticatedUser {
   id: string;
   email: string;
   name: string;
   username: string | null;
   avatarUrl: string | null;
   emailVerified: boolean;
}

export interface AuthResponse {
   user: AuthenticatedUser;
   workspace: {
      id: string;
      slug: string;
      name: string;
   } | null;
}
