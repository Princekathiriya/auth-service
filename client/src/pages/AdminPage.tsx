import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { adminApi } from '../lib/api';
import { useAuth } from '../auth/useAuth';
import { ErrorBanner, describeError } from '../components/Form';
import type { Role, UserList } from '../lib/types';

export function AdminPage() {
  const { state } = useAuth();
  const me = state.status === 'authenticated' ? state.user : null;
  const [query, setQuery] = useState({ page: 1, search: '', role: '' as Role | '' });
  const [data, setData] = useState<UserList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await adminApi.listUsers(query));
      setError(null);
    } catch (err) {
      setError(describeError(err).message);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await action();
      await load();
    } catch (err) {
      setError(describeError(err).message); // e.g. LAST_ADMIN, DEMOTE_FIRST: the server is the source of truth
    } finally {
      setBusyId(null);
    }
  }

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setQuery({ page: 1, search: String(form.get('search')), role: String(form.get('role')) as Role | '' });
  }

  // Hiding this page from non-admins is UX only. The API returns 403 regardless.
  if (me?.role !== 'admin') {
    return (
      <main className="card">
        <h1>Admin</h1>
        <p role="alert" className="banner banner-error">You need admin access to view this page.</p>
        <p><Link to="/">Back to profile</Link></p>
      </main>
    );
  }

  return (
    <main className="card wide">
      <h1>Users</h1>
      <ErrorBanner message={error} />
      <form className="toolbar" onSubmit={onSearch} role="search">
        <label className="visually-hidden" htmlFor="search">Search by email</label>
        <input id="search" name="search" placeholder="Search by email" defaultValue={query.search} />
        <label className="visually-hidden" htmlFor="role-filter">Role</label>
        <select id="role-filter" name="role" defaultValue={query.role}>
          <option value="">All roles</option>
          <option value="user">Users</option>
          <option value="admin">Admins</option>
        </select>
        <button type="submit">Search</button>
      </form>

      {!data ? (
        <p className="muted">Loading…</p>
      ) : data.users.length === 0 ? (
        <p className="muted">No users found.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Email</th><th>Name</th><th>Role</th><th><span className="visually-hidden">Actions</span></th></tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const isMe = u.id === me.id;
                return (
                  <tr key={u.id}>
                    <td>
                      {u.email}
                      {!u.emailVerified && <span className="badge warn">unverified</span>}
                    </td>
                    <td>{u.name}</td>
                    <td>
                      <select
                        aria-label={`Role for ${u.email}`}
                        value={u.role}
                        disabled={isMe || busyId === u.id}
                        title={isMe ? 'You cannot change your own role' : undefined}
                        onChange={(e) => void run(u.id, () => adminApi.changeRole(u.id, e.target.value as Role))}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="secondary danger"
                        disabled={isMe || u.role === 'admin' || busyId === u.id}
                        title={u.role === 'admin' ? 'Demote this admin before deleting' : undefined}
                        onClick={() => {
                          if (window.confirm(`Delete ${u.email}? This cannot be undone.`)) void run(u.id, () => adminApi.deleteUser(u.id));
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <nav className="pager" aria-label="Pagination">
          <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}>Previous</button>
          <span className="muted">Page {data.page} of {data.totalPages} ({data.total} users)</span>
          <button type="button" className="secondary" disabled={data.page >= data.totalPages} onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}>Next</button>
        </nav>
      )}
      <p><Link to="/">Back to profile</Link></p>
    </main>
  );
}
