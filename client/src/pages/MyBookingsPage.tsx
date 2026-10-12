import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api';

interface MyBooking {
  id: number;
  session_id: number;
  status: 'confirmed' | 'cancelled';
  checkin_code: string | null;
  checked_in_at: string | null;
  starts_at: string;
  ends_at: string;
}

interface MyWaitlist {
  id: number;
  session_id: number;
  starts_at: string;
  ends_at: string;
  position: number;
}

function formatIst(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function MyBookingsPage() {
  const qc = useQueryClient();

  const bookings = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api<MyBooking[]>('/me/bookings'),
    refetchInterval: 10000,
  });

  const waitlist = useQuery({
    queryKey: ['my-waitlist'],
    queryFn: () => api<MyWaitlist[]>('/me/waitlist'),
    refetchInterval: 10000,
  });

  const cancel = useMutation({
    mutationFn: (id: number) => api(`/bookings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
      qc.invalidateQueries({ queryKey: ['my-waitlist'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const leave = useMutation({
    mutationFn: (sessionId: number) =>
      api(`/sessions/${sessionId}/waitlist`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-waitlist'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  return (
    <section>
      <h1>My bookings</h1>

      {bookings.isLoading && <p className="muted">Loading...</p>}
      {bookings.data && bookings.data.length === 0 && (
        <p className="muted">You have no bookings yet.</p>
      )}

      {bookings.data && bookings.data.length > 0 && (
        <ul className="list">
          {bookings.data.map((b) => (
            <li key={b.id} className="card">
              <div>
                <strong>{formatIst(b.starts_at)}</strong>
                <br />
                <span className={`badge ${b.status === 'confirmed' ? 'badge-open' : 'badge-full'}`}>
                  {b.status}
                </span>
                {b.checked_in_at && (
                  <span className="badge badge-open" style={{ marginLeft: 8 }}>checked in</span>
                )}
              </div>
              {b.status === 'confirmed' && b.checkin_code && (
                <div className="code" aria-label="Check-in code">
                  <span className="muted">Check-in code</span>
                  <strong>{b.checkin_code}</strong>
                </div>
              )}
              {b.status === 'confirmed' && !b.checked_in_at && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => cancel.mutate(b.id)}
                  disabled={cancel.isPending}
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>Waitlist</h2>
      {waitlist.isLoading && <p className="muted">Loading...</p>}
      {waitlist.data && waitlist.data.length === 0 && (
        <p className="muted">You are not on any waitlist.</p>
      )}
      {waitlist.data && waitlist.data.length > 0 && (
        <ul className="list">
          {waitlist.data.map((w) => (
            <li key={w.id} className="card">
              <div>
                <strong>{formatIst(w.starts_at)}</strong>
                <br />
                <span className="muted">Position {w.position}</span>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => leave.mutate(w.session_id)}
                disabled={leave.isPending}
              >
                Leave waitlist
              </button>
            </li>
          ))}
        </ul>
      )}

      {cancel.isError && (
        <p className="error" role="alert">{(cancel.error as ApiError).message}</p>
      )}
    </section>
  );
}
