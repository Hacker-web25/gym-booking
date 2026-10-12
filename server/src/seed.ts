import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function istHourIso(offsetHoursFromNow: number): string {
  // Floor "now" to the current IST hour, then add N hours.
  const nowUtcMs = Date.now();
  const flooredIst = Math.floor((nowUtcMs + IST_OFFSET_MS) / HOUR_MS) * HOUR_MS - IST_OFFSET_MS;
  return new Date(flooredIst + offsetHoursFromNow * HOUR_MS).toISOString();
}

async function run() {
  console.log('Seeding...');

  // Wipe existing data (safe to re-run).
  await pool.query('TRUNCATE waitlist, bookings, sessions, users RESTART IDENTITY CASCADE');

  // Users
  const adminHash = await bcrypt.hash('admin1234', 10);
  const memberHash = await bcrypt.hash('member1234', 10);

  await pool.query(
    `INSERT INTO users (email, password_hash, name, role) VALUES
     ($1, $2, 'Gym Admin', 'admin'),
     ($3, $4, 'Alice',  'member'),
     ($5, $4, 'Bob',    'member'),
     ($6, $4, 'Charlie','member'),
     ($7, $4, 'Dhruv',  'member')`,
    [
      'admin@gym.local', adminHash,
      'alice@gym.local', memberHash,
      'bob@gym.local',
      'charlie@gym.local',
      'dhruv@gym.local',
    ],
  );

  // Sessions: today, tomorrow and the day after, one per hour from 6:00 to 21:00 IST.
  // Plus the current hour (even outside gym hours) so check-in can always be tried.
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const slots = new Set<string>();
  for (let day = 0; day < 3; day++) {
    const d = new Date(istNow.getTime() + day * 24 * HOUR_MS).toISOString().slice(0, 10);
    for (let hour = 6; hour <= 21; hour++) {
      slots.add(`${d}T${String(hour).padStart(2, '0')}:00:00+05:30`);
    }
  }
  slots.add(istHourIso(0));
  for (const startsAt of slots) {
    await pool.query(
      `INSERT INTO sessions (starts_at, ends_at, capacity)
       VALUES ($1::timestamptz, $1::timestamptz + INTERVAL '1 hour', 20)
       ON CONFLICT (starts_at) DO NOTHING`,
      [startsAt],
    );
  }

  console.log('Seed complete.');
  console.log('');
  console.log('Credentials:');
  console.log('  Admin   : admin@gym.local / admin1234');
  console.log('  Members : alice@gym.local, bob@gym.local, charlie@gym.local, dhruv@gym.local / member1234');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
