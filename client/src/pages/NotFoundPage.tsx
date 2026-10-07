import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="card">
      <h1>Page not found</h1>
      <p><Link to="/">Go home</Link></p>
    </main>
  );
}
