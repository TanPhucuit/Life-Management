# Quick Start Guide - Life Management System

## 1. Setup Supabase Database

### Step 1: Create Supabase Account
- Go to https://supabase.com and create a free account
- Create a new project

### Step 2: Import Database Schema
- Go to SQL Editor in your Supabase dashboard
- Create a new query and paste the contents of `database_schema.sql`
- Run the query to create all tables and indexes

### Step 3: Get Your Credentials
- Copy your Project URL (Settings > API)
- Copy your Anon Key (Settings > API)
- Copy your Service Role Key (Settings > API)

## 2. Configure Environment Variables

### Step 1: Create .env.local
```bash
# Copy the example file
cp .env.example .env.local
```

### Step 2: Fill in Your Credentials
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_NAME=Life Management
# NEXT_PUBLIC_API_URL=http://localhost:3000  # Only set if using a separate API server
NODE_ENV=development
```

**Note:** For production/Vercel deployment, do NOT set `NEXT_PUBLIC_API_URL`. The app will use relative paths (`/api/*`) which is the correct behavior.

## 3. Install & Run

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start Development Server
```bash
npm run dev
```

### Step 3: Open in Browser
- Visit http://localhost:3000
- You should see the login page

## 4. Test the Application

### Create Your First Account
1. Click "Sign Up"
2. Enter any username and password
3. Click "Sign Up" button

### Explore Features
1. **Calendar**: View and edit dates
   - Click on a date to open the editor
   - Input focused minutes
   - Set key of success (0-3)
   - Click Save

2. **Tasks**: Create and manage tasks
   - Create a topic first
   - Add tasks to the topic
   - Check/uncheck completed tasks
   - Delete tasks

3. **Analytics**: View your progress
   - Switch between "This Month", "Weekly", and "Comparison"
   - View various charts

## 5. File Structure Overview

```
app/
├── page.tsx              → Main entry point
├── layout.tsx            → Root layout
├── components/           → All React components
├── lib/                  → Helper functions & Supabase client
├── api/                  → Backend API routes
└── globals.css          → Global styles
```

## 6. Frontend Components

| Component | Purpose |
|-----------|---------|
| Login.tsx | User authentication |
| Dashboard.tsx | Main app layout |
| CalendarView.tsx | Monthly calendar |
| DayCard.tsx | Daily data editor |
| TaskManager.tsx | Task/topic management |
| Analytics.tsx | Charts and statistics |

## 7. Troubleshooting

### Page is blank
- Check browser console for errors (F12)
- Verify .env.local is properly configured
- Make sure Supabase credentials are correct

### Can't login
- Verify the user was created in Supabase
- Check the `users` table in Supabase
- Ensure username and password match exactly

### Charts not showing
- Make sure you have data in the dates table
- Check the Analytics component console for errors
- Verify Recharts is installed (npm install recharts)

### Data not saving
- Check Supabase connection in console
- Verify Row Level Security (RLS) is disabled for tables
- Check if user_id is being sent correctly

## 8. What's Ready for Review

✅ **Login/Register Page**
- Clean glassmorphic design
- Form validation
- Error handling

✅ **Calendar View**
- Interactive month view
- Day editor modal
- Color-coded success tracking
- Hour conversion

✅ **Task Management**
- Topic organization
- Task creation/deletion
- Status tracking
- Deadline support

✅ **Analytics Dashboard**
- Key of Success pie chart
- Daily study hours
- Trend analysis
- Weekly/monthly comparison

✅ **Modern UI/UX**
- 3D effects and animations
- Responsive layout
- Dark theme with gradients
- Smooth transitions

## 9. Next Steps

After you review and approve the frontend:

1. ✉️ **Email feedback** with any changes needed
2. 🔧 **I'll implement changes** to the frontend
3. 📱 **Once approved**, I'll build the complete backend
4. 🚀 **Then deploy** to Vercel

## 10. Contact & Support

For any issues or questions:
- Check the README.md for more details
- Review FRONTEND_GUIDE.md for architecture
- Check browser console (F12) for error messages

---

**Ready to start? Run `npm install && npm run dev` and visit http://localhost:3000** 🚀
