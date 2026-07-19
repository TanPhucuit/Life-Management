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
  sessionReady: boolean;
  sessionError: string | null;
  setUser: (user: User | null) => void;
  setSessionState: (ready: boolean, error?: string | null) => void;
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

const getUserFromStorage = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    // Basic UUID validation to prevent database errors for old mock data (like id: "1")
    if (user && user.id && typeof user.id === 'string' && user.id.length > 10 && user.id.includes('-')) {
      return user;
    }
    localStorage.removeItem('user');
    return null;
  } catch {
    return null;
  }
};

const storedUser = getUserFromStorage();

export const useAppStore = create<AppStore>((set) => ({
  // Authentication UI is disabled. A persisted user is reused immediately,
  // otherwise SessionBootstrap resolves the personal workspace owner.
  user: storedUser,
  isAuthenticated: storedUser !== null,
  sessionReady: storedUser !== null,
  sessionError: null,

  setUser: (user) =>
    set(() => ({
      user,
      isAuthenticated: user !== null,
      sessionReady: user !== null,
      sessionError: null,
    })),

  setSessionState: (sessionReady, sessionError = null) => set({ sessionReady, sessionError }),

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
