// Mock data for frontend testing
export const mockUser = {
  id: '1',
  username: 'testuser',
};

export const mockTopics = [
  { id: '1', user_id: '1', name: 'Study', created_at: new Date().toISOString() },
  { id: '2', user_id: '1', name: 'Exercise', created_at: new Date().toISOString() },
  { id: '3', user_id: '1', name: 'Work', created_at: new Date().toISOString() },
];

export type MockTaskStatus = 'completed' | 'not_completed';

export const mockTasks = [
  {
    id: '1',
    user_id: '1',
    topic_id: '1',
    title: 'Complete Chapter 3',
    description: 'Read and summarize chapter 3 of the textbook',
    deadline: new Date(2026, 4, 30).toISOString(),
    status: 'not_completed',
    created_at: new Date().toISOString(),
  },
  {
    id: '2',
    user_id: '1',
    topic_id: '1',
    title: 'Solve Practice Problems',
    description: 'Complete problems 1-10 at the end of chapter',
    deadline: new Date(2026, 4, 28).toISOString(),
    status: 'completed',
    created_at: new Date().toISOString(),
  },
  {
    id: '3',
    user_id: '1',
    topic_id: '2',
    title: 'Morning Run',
    description: '5km run at the park',
    deadline: new Date(2026, 4, 27).toISOString(),
    status: 'not_completed',
    created_at: new Date().toISOString(),
  },
  {
    id: '4',
    user_id: '1',
    topic_id: '3',
    title: 'Project Presentation',
    description: 'Prepare slides for quarterly presentation',
    deadline: new Date(2026, 5, 5).toISOString(),
    status: 'not_completed',
    created_at: new Date().toISOString(),
  },
] satisfies Array<{
  id: string;
  user_id: string;
  topic_id: string;
  title: string;
  description: string;
  deadline: string;
  status: MockTaskStatus;
  created_at: string;
}>;

export const mockDates = [
  // April 2026
  {
    id: '1',
    user_id: '1',
    month_id: null,
    day: 20,
    month: 4,
    year: 2026,
    focused_minutes: 120,
    key_of_success: 3,
  },
  {
    id: '2',
    user_id: '1',
    month_id: null,
    day: 21,
    month: 4,
    year: 2026,
    focused_minutes: 90,
    key_of_success: 2,
  },
  {
    id: '3',
    user_id: '1',
    month_id: null,
    day: 22,
    month: 4,
    year: 2026,
    focused_minutes: 180,
    key_of_success: 3,
  },
  {
    id: '4',
    user_id: '1',
    month_id: null,
    day: 23,
    month: 4,
    year: 2026,
    focused_minutes: 60,
    key_of_success: 1,
  },
  {
    id: '5',
    user_id: '1',
    month_id: null,
    day: 24,
    month: 4,
    year: 2026,
    focused_minutes: 0,
    key_of_success: 0,
  },
  {
    id: '6',
    user_id: '1',
    month_id: null,
    day: 25,
    month: 4,
    year: 2026,
    focused_minutes: 150,
    key_of_success: 2,
  },
  {
    id: '7',
    user_id: '1',
    month_id: null,
    day: 26,
    month: 4,
    year: 2026,
    focused_minutes: 200,
    key_of_success: 3,
  },
];
