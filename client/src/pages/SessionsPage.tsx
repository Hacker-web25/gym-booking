import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { todayIst } from '../dates';
import { Session, SessionCard } from '../components/SessionCard';

export function SessionsPage() {
  const [date, setDate] = useState(todayIst());

  const { data, isLoading, error } = useQuery({
    queryKey: ['sessions', date],
    queryFn: () => api<Session[]>(`/sessions?date=${date}`),
    refetchInterval: 5000,
  });

  return (
    <section>
      <h1>Sessions</h1>
      <div className="form-inline">
        <label htmlFor="session-date">Date</label>
        <input
          id="session-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value || todayIst())}
        />
      </div>
      {isLoading && <p className="muted">Loading sessions...</p>}
      {error && <p className="error" role="alert">Failed to load sessions.</p>}
      {data && data.length === 0 && <p className="muted">No sessions on this day.</p>}
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
