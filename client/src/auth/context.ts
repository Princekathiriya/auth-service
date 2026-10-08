import { createContext } from 'react';
import type { User } from '../lib/types';

export type AuthState =
  | { status: 'loading' } // checking the refresh cookie on startup
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User };

export interface AuthContextValue {
  state: AuthState;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  setUser(user: User): void;
  /** The server already ended the session (e.g. after a password reset): just forget it locally. */
  forgetSession(): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
