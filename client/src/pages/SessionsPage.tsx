import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { Session, SessionCard } from '../components/SessionCard';

export function SessionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api<Session[]>('/sessions'),
    refetchInterval: 5000,
  });

  return (
    <section>
      <h1>Today's sessions</h1>
      {isLoading && <p className="muted">Loading sessions...</p>}
      {error && <p className="error" role="alert">Failed to load sessions.</p>}
      {data && data.length === 0 && <p className="muted">No sessions scheduled today.</p>}
      {data && data.length > 0 && (
        <div className="card-grid">
          {data.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </section>
  );
}
