const API_BASE = '/api';

export interface Utilisateur {
  id: string;
  email: string | null;
  nom: string;
  prenom: string;
  role: 'SUPER_ADMIN' | 'GERANT' | 'SERVEUR';
  compteClientId: string | null;
  etablissementId: string | null;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error ?? 'Une erreur est survenue');
  }

  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<Utilisateur>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  loginPin: (etablissementId: string, codePin: string) =>
    apiFetch<Utilisateur>('/auth/login-pin', {
      method: 'POST',
      body: JSON.stringify({ etablissementId, codePin }),
    }),

  me: () => apiFetch<Utilisateur>('/auth/me'),

  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
};
