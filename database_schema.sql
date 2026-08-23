-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Topics Table
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  topic_color VARCHAR(30),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Months Table
CREATE TABLE months (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  total_hours DECIMAL(10, 2) DEFAULT 0,
  days_in_month INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, month, year)
);

-- Weeks Table
CREATE TABLE weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_id UUID NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_order INTEGER NOT NULL CHECK (week_order >= 1 AND week_order <= 5),
  total_hours DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dates Table
CREATE TABLE dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_id UUID NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  focused_minutes INTEGER DEFAULT 0,
  focused_hours DECIMAL(10, 2) GENERATED ALWAYS AS (focused_minutes / 60.0) STORED,
  key_of_success INTEGER DEFAULT 0 CHECK (key_of_success >= 0 AND key_of_success <= 3),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, day, month, year)
);

-- Notes Table
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_id UUID NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks Table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_date TIMESTAMP,
  deadline TIMESTAMP,
  status VARCHAR(20) DEFAULT 'not_completed' CHECK (status IN ('not_completed', 'in_progress', 'completed')),
  sort_order INTEGER DEFAULT 0,
  task_color VARCHAR(20),
  task_color_start VARCHAR(20),
  task_color_end VARCHAR(20),
  archived_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions Table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  session_name VARCHAR(255),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  session_date DATE NOT NULL,
  in_time_status VARCHAR(20) DEFAULT 'in_time' CHECK (in_time_status IN ('in_time', 'out_time')),
  focused_minutes INTEGER,
  key_of_success INTEGER DEFAULT 0 CHECK (key_of_success >= 0 AND key_of_success <= 3),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Active Timers Table — the one focus timer currently running for a user. Its
-- existence IS the "counting" state: started_at is a true instant (timestamptz,
-- unlike the naive local timestamps the rest of this app uses for scheduling),
-- so elapsed time is computed correctly as (now - started_at) regardless of
-- which device/timezone reopens the page. Stopping the timer reads this row,
-- writes one row to `sessions` (one run = one focus session), and deletes it.
CREATE TABLE active_timers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cycle Ticks Table
CREATE TABLE cycle_ticks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  hour INTEGER NOT NULL CHECK (hour >= 8 AND hour <= 21),
  is_checked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, day, month, year, hour)
);

-- IELTS Hours Table
CREATE TABLE ielts_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  reading_hours DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (reading_hours >= 0),
  listening_hours DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (listening_hours >= 0),
  writing_hours DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (writing_hours >= 0),
  speaking_hours DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (speaking_hours >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for better performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_topics_user_id ON topics(user_id);
CREATE INDEX idx_months_user_id ON months(user_id);
CREATE INDEX idx_months_year_month ON months(user_id, year, month);
CREATE INDEX idx_weeks_month_id ON weeks(month_id);
CREATE INDEX idx_dates_user_id ON dates(user_id);
CREATE INDEX idx_dates_month_id ON dates(month_id);
CREATE INDEX idx_dates_year_month_day ON dates(user_id, year, month, day);
CREATE INDEX idx_notes_month_id ON notes(month_id);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_topic_id ON tasks(topic_id);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_user_topic_parent ON tasks(user_id, topic_id, parent_task_id);
CREATE INDEX idx_tasks_archived_at ON tasks(archived_at);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_task_id ON sessions(task_id);
CREATE INDEX idx_sessions_date ON sessions(session_date);
CREATE INDEX idx_cycle_ticks_user_id ON cycle_ticks(user_id);
CREATE INDEX idx_cycle_ticks_year_month_day ON cycle_ticks(user_id, year, month, day);
CREATE INDEX idx_ielts_hours_user_id ON ielts_hours(user_id);
CREATE INDEX idx_active_timers_user_id ON active_timers(user_id);
CREATE INDEX idx_active_timers_task_id ON active_timers(task_id);

-- Non-destructive migration for existing Supabase projects.
-- Run this block if your database was created before task tree support.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_color VARCHAR(20);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_color_start VARCHAR(20);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_color_end VARCHAR(20);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMP;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('not_completed', 'in_progress', 'completed'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS focused_minutes INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS key_of_success INTEGER DEFAULT 0 CHECK (key_of_success >= 0 AND key_of_success <= 3);

CREATE TABLE IF NOT EXISTS cycle_ticks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  hour INTEGER NOT NULL CHECK (hour >= 8 AND hour <= 21),
  is_checked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, day, month, year, hour)
);

CREATE TABLE IF NOT EXISTS ielts_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  reading_hours DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (reading_hours >= 0),
  listening_hours DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (listening_hours >= 0),
  writing_hours DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (writing_hours >= 0),
  speaking_hours DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (speaking_hours >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_topic_parent ON tasks(user_id, topic_id, parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks(archived_at);
CREATE INDEX IF NOT EXISTS idx_cycle_ticks_user_id ON cycle_ticks(user_id);
CREATE INDEX IF NOT EXISTS idx_cycle_ticks_year_month_day ON cycle_ticks(user_id, year, month, day);
CREATE INDEX IF NOT EXISTS idx_ielts_hours_user_id ON ielts_hours(user_id);

CREATE TABLE IF NOT EXISTS active_timers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_active_timers_user_id ON active_timers(user_id);
CREATE INDEX IF NOT EXISTS idx_active_timers_task_id ON active_timers(task_id);

-- Recursive task tree view for reporting. The application also computes this
-- in the API so the UI keeps working if the view has not been deployed yet.
CREATE OR REPLACE VIEW task_tree_view WITH (security_invoker = true) AS
WITH RECURSIVE task_tree AS (
  SELECT
    t.id,
    t.user_id,
    t.topic_id,
    t.parent_task_id,
    t.id AS root_task_id,
    t.title,
    t.description,
    t.deadline,
    t.status,
    t.sort_order,
    t.task_color,
    t.task_color_start,
    t.task_color_end,
    t.archived_at,
    t.created_at,
    t.updated_at,
    0 AS depth,
    t.start_date
  FROM tasks t
  WHERE t.parent_task_id IS NULL

  UNION ALL

  SELECT
    child.id,
    child.user_id,
    child.topic_id,
    child.parent_task_id,
    parent.root_task_id,
    child.title,
    child.description,
    child.deadline,
    child.status,
    child.sort_order,
    child.task_color,
    child.task_color_start,
    child.task_color_end,
    child.archived_at,
    child.created_at,
    child.updated_at,
    parent.depth + 1 AS depth,
    child.start_date
  FROM tasks child
  JOIN task_tree parent ON parent.id = child.parent_task_id
)
SELECT
  task_tree.id,
  task_tree.user_id,
  task_tree.topic_id,
  task_tree.parent_task_id,
  task_tree.root_task_id,
  task_tree.title,
  task_tree.description,
  task_tree.deadline,
  task_tree.status,
  task_tree.sort_order,
  task_tree.task_color,
  task_tree.task_color_start,
  task_tree.task_color_end,
  task_tree.archived_at,
  task_tree.created_at,
  task_tree.updated_at,
  task_tree.depth,
  (SELECT COUNT(*) FROM tasks c WHERE c.parent_task_id = task_tree.id AND c.archived_at IS NULL) AS child_count,
  (SELECT COUNT(*) FROM task_tree d WHERE d.root_task_id = task_tree.id AND d.id <> task_tree.id AND d.archived_at IS NULL) AS descendant_count,
  task_tree.start_date
FROM task_tree;
