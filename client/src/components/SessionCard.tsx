import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';

export interface Session {
  id: number;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked: number;
  seats_left: number;
  waitlist_count: number;
}

function formatIst(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

interface MyBooking {
  session_id: number;
  status: 'confirmed' | 'cancelled';
}

interface MyWaitlist {
  session_id: number;
  position: number;
}

export function SessionCard({ session }: { session: Session }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Same query keys as the My bookings page, so all cards share one request each.
  const myBookings = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api<MyBooking[]>('/me/bookings'),
    enabled: !!user,
  });
  const myWaitlist = useQuery({
    queryKey: ['my-waitlist'],
    queryFn: () => api<MyWaitlist[]>('/me/waitlist'),
    enabled: !!user,
  });
  const isBooked = !!myBookings.data?.some(
    (b) => b.session_id === session.id && b.status === 'confirmed',
  );
  const waitlistEntry = myWaitlist.data?.find((w) => w.session_id === session.id);

  const bookMutation = useMutation({
    mutationFn: () =>
      api<{ outcome: 'confirmed' | 'waitlisted'; waitlist_position?: number }>(
        `/sessions/${session.id}/book`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
      qc.invalidateQueries({ queryKey: ['my-waitlist'] });
    },
  });

  const full = session.seats_left === 0;
  const start = new Date(session.starts_at).getTime();
  const past = start + 60 * 60 * 1000 < Date.now();

  return (
    <article className="card" aria-label={`Session at ${formatIst(session.starts_at)}`}>
      <header>
        <h3>{formatIst(session.starts_at)} – {formatIst(session.ends_at)}</h3>
        <span className={`badge ${full ? 'badge-full' : 'badge-open'}`}>
          {full ? 'Full' : `${session.seats_left} / ${session.capacity} seats left`}
        </span>
      </header>
      {session.waitlist_count > 0 && (
        <p className="muted">{session.waitlist_count} on waitlist</p>
      )}
      {!user ? (
        <p className="muted">Log in to book</p>
      ) : past ? (
        <p className="muted">Session ended</p>
      ) : isBooked ? (
        <p className="success" role="status">Booked ✓ (see My bookings for your check-in code)</p>
      ) : waitlistEntry ? (
        <p className="success" role="status">On waitlist, position {waitlistEntry.position}</p>
      ) : (
        <button
          type="button"
          className="btn-primary"
          onClick={() => bookMutation.mutate()}
          disabled={bookMutation.isPending}
        >
          {bookMutation.isPending ? 'Booking...' : full ? 'Join waitlist' : 'Book'}
        </button>
      )}
      {bookMutation.isError && (
        <p className="error" role="alert">
          {(bookMutation.error as ApiError).message}
        </p>
      )}
    </article>
  );
}
