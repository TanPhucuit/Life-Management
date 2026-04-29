import { create } from 'zustand';

interface User {
  id: string;
  username: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  status: 'completed' | 'not_completed';
  topic_id: string;
}

interface AppStore {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;

  // Month selection
  selectedMonth: number | null;
  selectedYear: number;
  setSelectedMonth: (month: number, year: number) => void;
  resetSelectedMonth: () => void;

  // Current month/year for analytics
  currentMonth: number;
  currentYear: number;
  setCurrentMonth: (month: number, year: number) => void;

  // Tasks
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, task: Partial<Task>) => void;
  removeTask: (id: string) => void;

  // Loading state
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // Auth - no default user
  user: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || 'null') : null,
  isAuthenticated: typeof window !== 'undefined' ? !!localStorage.getItem('user') : false,

  setUser: (user) =>
    set(() => ({
      user,
      isAuthenticated: user !== null,
    })),

  logout: () =>
    set(() => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user');
      }
      return { user: null, isAuthenticated: false };
    }),

  // Month selection
  selectedMonth: null,
  selectedYear: 2026,

  setSelectedMonth: (month, year) =>
    set(() => ({
      selectedMonth: month,
      selectedYear: year,
      currentMonth: month,
      currentYear: year,
    })),

  resetSelectedMonth: () =>
    set(() => ({
      selectedMonth: null,
      selectedYear: 2026,
    })),

  // Current month/year
  currentMonth: new Date().getMonth() + 1,
  currentYear: new Date().getFullYear(),

  setCurrentMonth: (month, year) =>
    set(() => ({
      currentMonth: month,
      currentYear: year,
    })),

  // Tasks
  tasks: [],

  setTasks: (tasks) =>
    set(() => ({
      tasks,
    })),

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task],
    })),

  updateTask: (id, taskUpdate) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...taskUpdate } : t)),
    })),

  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    })),

  // Loading
  isLoading: false,

  setIsLoading: (loading) =>
    set(() => ({
      isLoading: loading,
    })),
}));
