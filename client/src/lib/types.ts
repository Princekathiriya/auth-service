export type Role = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}
