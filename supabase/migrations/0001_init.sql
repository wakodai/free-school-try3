-- guardians table
create table if not exists guardians (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  line_user_id text unique not null,
  contact_note text,
  created_at timestamptz default now()
);

-- students table
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  created_at timestamptz default now()
);

-- guardian_students mapping
create table if not exists guardian_students (
  guardian_id uuid references guardians(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  primary key (guardian_id, student_id)
);

-- attendance plans
create table if not exists attendance_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present','absent','late','early','unknown')),
  note text,
  source text,
  created_at timestamptz default now(),
  unique (student_id, date)
);

-- helpful index
create index if not exists attendance_plans_date_idx on attendance_plans(date);
