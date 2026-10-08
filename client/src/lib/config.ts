export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/** "Sign in with Google" is a full-page navigation to the API, not a fetch call. */
export const GOOGLE_LOGIN_URL = `${API_URL}/auth/google`;
