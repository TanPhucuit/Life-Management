export interface ApiTopic {
  id: string;
  user_id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface ApiTask {
  id: string;
  user_id: string;
  topic_id: string;
  title: string;
  description?: string | null;
  deadline?: string | null;
  status: 'completed' | 'not_completed';
  created_at?: string;
  updated_at?: string;
}

export interface ApiSession {
  id: string;
  user_id: string;
  task_id: string;
  start_time: string;
  end_time: string;
  session_date: string;
  in_time_status: 'in_time' | 'out_time';
  focused_minutes?: number;
  key_of_success?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ApiDate {
  id: string;
  user_id: string;
  month_id?: string | null;
  day: number;
  month: number;
  year: number;
  focused_minutes: number;
  key_of_success: number;
  created_at?: string;
  updated_at?: string;
}

const API_URL = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : '';

const getApiUrl = (endpoint: string): string => {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!API_URL) return normalizedEndpoint.startsWith('/api') ? normalizedEndpoint : `/api${normalizedEndpoint}`;
  let baseUrl = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  let path = normalizedEndpoint;
  if (baseUrl.endsWith('/api')) return `${baseUrl}${path}`;
  if (!path.startsWith('/api')) path = `/api${path}`;
  return `${baseUrl}${path}`;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = getApiUrl(path);
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || 'Request failed');
  }

  return response.json() as Promise<T>;
}

export const api = {
  getTopics(userId: string) {
    return requestJson<ApiTopic[]>(`/api/topics?userId=${encodeURIComponent(userId)}`);
  },
  createTopic(userId: string, name: string) {
    return requestJson<ApiTopic>(`/api/topics`, {
      method: 'POST',
      body: JSON.stringify({ userId, name }),
    });
  },
  updateTopic(id: string, name: string) {
    return requestJson<ApiTopic>(`/api/topics`, {
      method: 'PUT',
      body: JSON.stringify({ id, name }),
    });
  },
  deleteTopic(id: string) {
    return requestJson<{ success: boolean }>(`/api/topics?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  getTasks(userId: string, topicId?: string) {
    const params = new URLSearchParams({ userId });
    if (topicId) params.set('topicId', topicId);
    return requestJson<ApiTask[]>(`/api/tasks?${params.toString()}`);
  },
  createTask(input: {
    userId: string;
    topicId: string;
    title: string;
    description?: string;
    deadline?: string;
  }) {
    return requestJson<ApiTask>(`/api/tasks`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateTask(input: {
    id: string;
    status?: ApiTask['status'];
    title?: string;
    description?: string;
    deadline?: string;
  }) {
    return requestJson<ApiTask>(`/api/tasks`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  deleteTask(id: string) {
    return requestJson<{ success: boolean }>(`/api/tasks?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  getDates(userId: string, month?: number, year?: number) {
    const params = new URLSearchParams({ userId });
    if (month !== undefined && year !== undefined) {
      params.set('month', String(month));
      params.set('year', String(year));
    }
    return requestJson<ApiDate[]>(`/api/dates?${params.toString()}`);
  },
  createDate(input: {
    userId: string;
    monthId?: string;
    day: number;
    month: number;
    year: number;
    focusedMinutes?: number;
    keyOfSuccess?: number;
  }) {
    return requestJson<ApiDate>(`/api/dates`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateDate(input: {
    id: string;
    focusedMinutes?: number;
    keyOfSuccess?: number;
  }) {
    return requestJson<ApiDate>(`/api/dates`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  getSessions(userId: string, filters?: { taskId?: string; date?: string; month?: number; year?: number }) {
    const params = new URLSearchParams({ userId });
    if (filters?.taskId) params.set('taskId', filters.taskId);
    if (filters?.date) params.set('date', filters.date);
    if (filters?.month !== undefined && filters?.year !== undefined) {
      params.set('month', String(filters.month));
      params.set('year', String(filters.year));
    }
    return requestJson<ApiSession[]>(`/api/sessions?${params.toString()}`);
  },
  createSession(input: {
    userId: string;
    taskId: string;
    startTime: string;
    endTime: string;
    sessionDate: string;
  }) {
    return requestJson<ApiSession>(`/api/sessions`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateSession(input: {
    id: string;
    startTime?: string;
    endTime?: string;
    sessionDate?: string;
    inTimeStatus?: ApiSession['in_time_status'];
    focusedMinutes?: number;
    keyOfSuccess?: number;
  }) {
    return requestJson<ApiSession>(`/api/sessions`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  deleteSession(id: string) {
    return requestJson<{ success: boolean }>(`/api/sessions?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
