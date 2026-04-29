# Life Management System

A modern web application for managing your life, tasks, and tracking your success across months, weeks, and days.

## Features

- **User Authentication**: Simple username/password authentication
- **Calendar Management**: Visual calendar with daily tracking
- **Task Management**: Organize tasks by topics with deadlines and status tracking
- **Analytics Dashboard**: Visualize your progress with charts and statistics
- **Key of Success Tracking**: Rate your days on a 0-3 scale
- **Study Hours Tracking**: Monitor focused study time
- **Beautiful UI**: Modern glassmorphic design with 3D effects

## Tech Stack

- **Frontend**: React 18 + Next.js 14
- **Styling**: Tailwind CSS + Framer Motion
- **Database**: Supabase (PostgreSQL)
- **Charts**: Recharts
- **State Management**: Zustand

## Setup Instructions

### 1. Database Setup

1. Create a Supabase project at https://supabase.com
2. Run the SQL schema from `database_schema.sql` in your Supabase SQL editor
3. Note your Supabase URL and Anon Key

### 2. Environment Configuration

1. Copy `.env.example` to `.env.local`
2. Fill in your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

### 3. Installation & Running

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000 in your browser
```

### 4. Deployment

Deploy to Vercel:
```bash
vercel
```

## Database Schema

### Users
- id (UUID)
- username (VARCHAR)
- password (VARCHAR)

### Topics
- id (UUID)
- user_id (FK)
- name (VARCHAR)

### Months
- id (UUID)
- user_id (FK)
- month (INTEGER 1-12)
- year (INTEGER)
- total_hours (DECIMAL)
- days_in_month (INTEGER)

### Weeks
- id (UUID)
- month_id (FK)
- week_order (INTEGER 1-5)
- total_hours (DECIMAL)

### Dates
- id (UUID)
- user_id (FK)
- month_id (FK)
- day (INTEGER)
- month (INTEGER)
- year (INTEGER)
- focused_minutes (INTEGER)
- focused_hours (DECIMAL - auto calculated)
- key_of_success (INTEGER 0-3)

### Tasks
- id (UUID)
- user_id (FK)
- topic_id (FK)
- title (VARCHAR)
- description (TEXT)
- deadline (TIMESTAMP)
- status (VARCHAR: completed/not_completed)

### Sessions
- id (UUID)
- user_id (FK)
- task_id (FK)
- start_time (TIMESTAMP)
- end_time (TIMESTAMP)
- session_date (DATE)
- in_time_status (VARCHAR: in_time/out_time)

### Notes
- id (UUID)
- month_id (FK)
- user_id (FK)
- content (TEXT)

## Usage

### Getting Started
1. Sign up with a username and password
2. Create topics for your different areas (e.g., "Study", "Exercise", "Work")
3. Create tasks within each topic
4. Use the calendar to track daily metrics:
   - Key of Success (0-3 scale)
   - Focused study minutes
5. View analytics to track your progress

### Calendar
- Click on any date to edit:
  - Focused study minutes (converted to hours)
  - Key of Success rating
- Color coding indicates your success rate

### Tasks
- Organize by topic
- Set deadlines
- Mark as completed
- Track task status

### Analytics
- **This Month**: View current month statistics
- **Weekly**: Compare performance across weeks
- **Comparison**: Compare hours studied across months

## Future Enhancements

- Session tracking with in-time/out-time monitoring
- Notes per month
- Automatic data aggregation
- Mobile app version
- Advanced reporting

## License

MIT
