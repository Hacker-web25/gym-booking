import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import { Session } from '../components/SessionCard';

interface Roster {
  session: { id: number; starts_at: string; ends_at: string; capacity: number };
  confirmed: Array<{ id: number; user_id: number; name: string; email: string; checked_in_at: string | null }>;
  waitlist: Array<{ id: number; user_id: number; name: string; email: string; position: number }>;
}

function formatIst(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function AdminPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [hour, setHour] = useState<number>(6);
  const [capacity, setCapacity] = useState<number>(20);
  const [createError, setCreateError] = useState<string | null>(null);
  const [checkinCode, setCheckinCode] = useState('');
  const [checkinMsg, setCheckinMsg] = useState<string | null>(null);
  const [checkinErr, setCheckinErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api<Session[]>('/sessions'),
    refetchInterval: 5000,
  });

  const roster = useQuery({
    queryKey: ['roster', selectedId],
    queryFn: () => api<Roster>(`/admin/sessions/${selectedId}/roster`),
    enabled: selectedId !== null,
    refetchInterval: 5000,
  });

  const createSession = useMutation({
    mutationFn: (body: { date: string; hour: number; capacity: number }) =>
      api('/admin/sessions', { method: 'POST', body }),
    onSuccess: () => {
      setCreateError(null);
      qc.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (err) => {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create session');
    },
  });

  const deleteSession = useMutation({
    mutationFn: (id: number) => api(`/admin/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      setSelectedId(null);
    },
  });

  async function handleCheckin(e: FormEvent) {
    e.preventDefault();
    setCheckinErr(null);
    setCheckinMsg(null);
    try {
      const result = await api<{ user: { name: string }; session: { starts_at: string } }>(
        '/admin/checkin',
        { method: 'POST', body: { code: checkinCode.trim().toUpperCase() } },
      );
      setCheckinMsg(`✓ ${result.user.name} checked in for ${formatIst(result.session.starts_at)}`);
      setCheckinCode('');
      qc.invalidateQueries({ queryKey: ['roster'] });
    } catch (err) {
      setCheckinErr(err instanceof ApiError ? err.message : 'Check-in failed');
    }
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createSession.mutate({ date, hour, capacity });
  }

  return (
    <section>
      <h1>Admin</h1>

      <h2>Create session</h2>
      <form onSubmit={handleCreate} className="form-inline">
        <label htmlFor="date">Date</label>
        <input
          id="date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <label htmlFor="hour">Hour (0–23 IST)</label>
        <input
          id="hour"
          type="number"
          min={0}
          max={23}
          required
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
        />
        <label htmlFor="capacity">Capacity</label>
        <input
          id="capacity"
          type="number"
          min={1}
          max={500}
          required
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
        <button type="submit" className="btn-primary">Create</button>
      </form>
      {createError && <p className="error" role="alert">{createError}</p>}

      <h2>Check in by code</h2>
      <form onSubmit={handleCheckin} className="form-inline">
        <label htmlFor="code">Code</label>
        <input
          id="code"
          type="text"
          required
          value={checkinCode}
          onChange={(e) => setCheckinCode(e.target.value)}
          placeholder="e.g. 2K7B4N"
          style={{ textTransform: 'uppercase' }}
        />
        <button type="submit" className="btn-primary">Check in</button>
      </form>
      {checkinMsg && <p className="success" role="status">{checkinMsg}</p>}
      {checkinErr && <p className="error" role="alert">{checkinErr}</p>}

      <h2>Today's sessions</h2>
      {sessions.isLoading && <p className="muted">Loading...</p>}
      {sessions.data && (
        <ul className="list">
          {sessions.data.map((s) => (
            <li key={s.id} className="card">
              <div>
                <strong>{formatIst(s.starts_at)}</strong>
                <br />
                <span className="muted">
                  {s.booked}/{s.capacity} booked · {s.waitlist_count} waitlisted
                </span>
              </div>
              <div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setSelectedId(s.id)}
                >
                  Roster
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => deleteSession.mutate(s.id)}
                  disabled={deleteSession.isPending}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selectedId !== null && (
        <section className="roster">
          <h3>Roster for session {selectedId}</h3>
          {roster.isLoading && <p className="muted">Loading roster...</p>}
          {roster.data && (
            <>
              <h4>Confirmed ({roster.data.confirmed.length})</h4>
              <ul>
                {roster.data.confirmed.map((p) => (
                  <li key={p.id}>
                    {p.name} ({p.email})
                    {p.checked_in_at ? ' · checked in ✓' : ''}
                  </li>
                ))}
              </ul>
              <h4>Waitlist ({roster.data.waitlist.length})</h4>
              <ol>
                {roster.data.waitlist.map((p) => (
                  <li key={p.id}>{p.name} ({p.email})</li>
                ))}
              </ol>
            </>
          )}
          <button type="button" className="btn-ghost" onClick={() => setSelectedId(null)}>
            Close
          </button>
        </section>
      )}
    </section>
  );
}
