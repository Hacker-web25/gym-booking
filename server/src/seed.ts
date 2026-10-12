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

  // Sessions: next 6 hourly slots (one in the past so the UI shows a mix).
  const offsets = [-1, 0, 1, 2, 3, 4];
  for (const o of offsets) {
    await pool.query(
      `INSERT INTO sessions (starts_at, ends_at, capacity)
       VALUES ($1::timestamptz, $1::timestamptz + INTERVAL '1 hour', 20)`,
      [istHourIso(o)],
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
