// End-to-end test against a running server (npm run dev) and a migrated, seeded DB.
// Run:  npm run test:e2e
// It creates its own users and one far-future session, then deletes the session.

const BASE = process.env.API_URL ?? 'http://localhost:4000';

let failures = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) console.log(`PASS  ${label}`);
  else {
    failures++;
    console.error(`FAIL  ${label}`, extra ?? '');
  }
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function main() {
  const run = Date.now().toString(36);

  // 1. Admin logs in and creates a fresh session (random day far in the future).
  const admin = await api('POST', '/auth/login', undefined, {
    email: 'admin@gym.local',
    password: 'admin1234',
  });
  check('admin can log in', admin.status === 200 && !!admin.json?.token, admin);
  const adminTok: string = admin.json.token;

  let session: any;
  for (let i = 0; i < 20; i++) {
    const d = new Date(Date.now() + (200 + Math.floor(Math.random() * 3000)) * 86400000);
    const date = d.toISOString().slice(0, 10);
    const r = await api('POST', '/admin/sessions', adminTok, { date, hour: 7 });
    if (r.status === 201) {
      session = r.json;
      break;
    }
  }
  check('admin can create a session', !!session, session);
  const sid = session.id;

  // 2. Register 25 users.
  const users: { token: string; id: number; email: string }[] = [];
  for (let i = 0; i < 25; i++) {
    const email = `t${run}_${i}@test.local`;
    const r = await api('POST', '/auth/register', undefined, {
      email,
      password: 'password123',
      name: `Tester ${i}`,
    });
    if (r.status !== 201) {
      check(`register user ${i}`, false, r);
      return;
    }
    users.push({ token: r.json.token, id: r.json.user.id, email });
  }
  check('25 users registered', users.length === 25);

  // 3. The key test: 25 people book the same 20-seat session at the same time.
  const results = await Promise.all(users.map((u) => api('POST', `/sessions/${sid}/book`, u.token)));
  const confirmed = results.filter((r) => r.json?.outcome === 'confirmed').length;
  const waitlisted = results.filter((r) => r.json?.outcome === 'waitlisted').length;
  check('exactly 20 confirmed out of 25 parallel bookings', confirmed === 20, { confirmed, waitlisted });
  check('the other 5 are waitlisted', waitlisted === 5, { confirmed, waitlisted });

  const roster = await api('GET', `/admin/sessions/${sid}/roster`, adminTok);
  check('roster shows 20 confirmed', roster.json?.confirmed?.length === 20, roster.json?.confirmed?.length);
  check('roster shows 5 on the waitlist', roster.json?.waitlist?.length === 5, roster.json?.waitlist?.length);
  check(
    'admin roster does not expose check-in codes',
    !JSON.stringify(roster.json).toLowerCase().includes('checkin_code'),
  );

  // 4. Double booking is rejected.
  const confirmedIdx = results.findIndex((r) => r.json?.outcome === 'confirmed');
  const again = await api('POST', `/sessions/${sid}/book`, users[confirmedIdx].token);
  check('booking the same session twice gives 409', again.status === 409, again);

  // 5. Cancel one confirmed booking -> first person on the waitlist is promoted.
  const firstWaiting = roster.json.waitlist[0];
  const canceller = users[confirmedIdx];
  const myBookings = await api('GET', '/me/bookings', canceller.token);
  const mine = myBookings.json.find((b: any) => b.session_id === sid || b.sessionId === sid) ?? myBookings.json[0];
  check('member sees their own check-in code', !!(mine?.checkin_code ?? mine?.checkinCode), mine);
  const cancel = await api('DELETE', `/bookings/${mine.id}`, canceller.token);
  check('member can cancel their booking', cancel.status === 200 || cancel.status === 204, cancel);

  const roster2 = await api('GET', `/admin/sessions/${sid}/roster`, adminTok);
  check('still 20 confirmed after promotion', roster2.json.confirmed.length === 20, roster2.json.confirmed.length);
  check('waitlist shrank to 4', roster2.json.waitlist.length === 4, roster2.json.waitlist.length);
  check(
    'the FIRST waitlisted user was promoted (FIFO)',
    roster2.json.confirmed.some((c: any) => c.user_id === firstWaiting.user_id),
  );

  // 6. Check-in by code works once, not twice.
  const promotedUser = users.find((u) => u.id === firstWaiting.user_id)!;
  const pb = await api('GET', '/me/bookings', promotedUser.token);
  const pbooking = pb.json.find((b: any) => b.status === 'confirmed' && (b.session_id === sid || b.sessionId === sid));
  const code = pbooking?.checkin_code ?? pbooking?.checkinCode;
  check('promoted member received a check-in code', !!code, pbooking);
  // Outside the window (this session is months away) check-in must be refused.
  const early = await api('POST', '/admin/checkin', adminTok, { code });
  check('check-in outside the time window is refused (409)', early.status === 409, early);

  // Inside the window: use a session that is running right now.
  const nowMs = Date.now();
  const isOpen = (x: any) =>
    nowMs >= new Date(x.starts_at).getTime() - 15 * 60000 && nowMs <= new Date(x.ends_at).getTime();
  let list = await api('GET', '/sessions', users[0].token);
  let live = (list.json as any[]).find(isOpen);
  if (!live) {
    // Create a session for the current IST hour (IST = UTC+5:30), then look again.
    const ist = new Date(nowMs + 5.5 * 3600000);
    await api('POST', '/admin/sessions', adminTok, {
      date: ist.toISOString().slice(0, 10),
      hour: ist.getUTCHours(),
    });
    list = await api('GET', '/sessions', users[0].token);
    live = (list.json as any[]).find(isOpen);
  }
  check('found a session that is open for check-in', !!live, list.json);

  const w = users[24]; // someone who is not already in the live session
  const liveBook = await api('POST', `/sessions/${live.id}/book`, w.token);
  check('member books the live session', liveBook.json?.outcome === 'confirmed', liveBook);
  const wb = await api('GET', '/me/bookings', w.token);
  const wbooking = wb.json.find((b: any) => b.status === 'confirmed' && (b.session_id === live.id || b.sessionId === live.id));
  const liveCode = wbooking?.checkin_code ?? wbooking?.checkinCode;
  check('member received a check-in code', !!liveCode, wbooking);

  const ci1 = await api('POST', '/admin/checkin', adminTok, { code: liveCode });
  check('admin check-in with a valid code succeeds', ci1.status === 200, ci1);
  const ci2 = await api('POST', '/admin/checkin', adminTok, { code: liveCode });
  check('using the same code twice is rejected (409)', ci2.status === 409, ci2);
  const ci3 = await api('POST', '/admin/checkin', adminTok, { code: 'WRONG123' });
  check('unknown code gives 404', ci3.status === 404, ci3);
  // Leave the live session as we found it.
  await api('DELETE', `/bookings/${wbooking.id}`, w.token);

  // 7. Access control and validation.
  const noTok = await api('POST', `/sessions/${sid}/book`);
  check('no token -> 401', noTok.status === 401, noTok);
  const memberAdmin = await api('POST', '/admin/sessions', users[0].token, { date: '2030-01-01', hour: 7 });
  check('member calling an admin route -> 403', memberAdmin.status === 403, memberAdmin);
  const bad = await api('POST', '/auth/register', undefined, { email: 'nope', password: '1', name: '' });
  check('invalid register body -> 422', bad.status === 422, bad);
  const wrongPw = await api('POST', '/auth/login', undefined, { email: users[0].email, password: 'wrongwrong' });
  check('wrong password -> 401', wrongPw.status === 401, wrongPw);

  // 8. Cleanup.
  await api('DELETE', `/admin/sessions/${sid}`, adminTok);

  console.log(failures === 0 ? '\nAll e2e checks passed.' : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
