'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api, ApiSession, ApiTask, ApiTopic } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { Plus, Trash2, CheckCircle, Circle, Clock, X, ListTodo, BookOpen, Pencil } from 'lucide-react';
import { BentoCard3D } from './BentoCard';

export default function TaskManager() {
  const { user } = useAppStore();
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [showNewTopicForm, setShowNewTopicForm] = useState(false);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editTopicName, setEditTopicName] = useState('');
  const [newTaskData, setNewTaskData] = useState({
    title: '',
    description: '',
    deadline: '',
  });
  const [newSessionData, setNewSessionData] = useState({
    sessionDate: '',
    startTime: '',
    endTime: '',
  });
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionData, setEditSessionData] = useState({
    sessionDate: '',
    startTime: '',
    endTime: '',
    inTimeStatus: 'in_time' as 'in_time' | 'out_time',
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const loadData = async () => {
      try {
        const [topicsData, tasksData, sessionsData] = await Promise.all([
          api.getTopics(user.id),
          api.getTasks(user.id),
          api.getSessions(user.id),
        ]);

        setTopics(topicsData);
        setTasks(tasksData);
        setSessions(sessionsData);
        setSelectedTopic((current) => current || topicsData[0]?.id || '');
      } catch (error) {
        console.error('Error loading task manager data:', error);
      }
    };

    void loadData();
  }, [user?.id]);

  const handleAddTopic = async () => {
    if (!newTopicName.trim()) return;
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const newTopic = await api.createTopic(user.id, newTopicName.trim());
      setTopics((current) => [newTopic, ...current]);
      setSelectedTopic(newTopic.id);
      setNewTopicName('');
      setShowNewTopicForm(false);
    } catch (error) {
      console.error('Error adding topic:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTopic = async (id: string) => {
    if (!editTopicName.trim()) return;
    try {
      setIsLoading(true);
      await api.updateTopic(id, editTopicName.trim());
      setTopics((current) => current.map((t) => (t.id === id ? { ...t, name: editTopicName.trim() } : t)));
      setEditingTopicId(null);
    } catch (error) {
      console.error('Error updating topic:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTopic = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa topic này và toàn bộ tasks bên trong?')) return;
    try {
      setIsLoading(true);
      await api.deleteTopic(id);
      setTopics((current) => current.filter((t) => t.id !== id));
      if (selectedTopic === id) {
        setSelectedTopic(topics.find((t) => t.id !== id)?.id || '');
      }
    } catch (error) {
      console.error('Error deleting topic:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTask = async () => {
    if (!selectedTopic || !newTaskData.title.trim()) return;
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const newTask = await api.createTask({
        userId: user.id,
        topicId: selectedTopic,
        title: newTaskData.title.trim(),
        description: newTaskData.description.trim() || undefined,
        deadline: newTaskData.deadline || undefined,
      });
      setTasks((current) => [newTask, ...current]);
      setNewTaskData({ title: '', description: '', deadline: '' });
      setShowNewTaskForm(false);
    } catch (error) {
      console.error('Error adding task:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTaskStatus = async (taskId: string, currentStatus: ApiTask['status']) => {
    try {
      const newStatus: ApiTask['status'] = currentStatus === 'completed' ? 'not_completed' : 'completed';
      await api.updateTask({ id: taskId, status: newStatus });
      setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status: newStatus } : task)));
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.deleteTask(taskId);
      setTasks((current) => current.filter((task) => task.id !== taskId));
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleAddSession = async (taskId: string) => {
    if (!newSessionData.sessionDate || !newSessionData.startTime || !newSessionData.endTime) return;
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const newSession = await api.createSession({
        userId: user.id,
        taskId: taskId,
        startTime: `${newSessionData.sessionDate}T${newSessionData.startTime}:00`,
        endTime: `${newSessionData.sessionDate}T${newSessionData.endTime}:00`,
        sessionDate: newSessionData.sessionDate,
      });
      setSessions((current) => [newSession, ...current]);
      setNewSessionData({ sessionDate: '', startTime: '', endTime: '' });
      setShowNewSessionForm(false);
    } catch (error) {
      console.error('Error adding session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSession = async (sessionId: string) => {
    try {
      setIsLoading(true);
      const updatedSession = await api.updateSession({
        id: sessionId,
        startTime: `${editSessionData.sessionDate}T${editSessionData.startTime}:00`,
        endTime: `${editSessionData.sessionDate}T${editSessionData.endTime}:00`,
        sessionDate: editSessionData.sessionDate,
        inTimeStatus: editSessionData.inTimeStatus,
      });
      setSessions((current) => current.map((s) => (s.id === sessionId ? updatedSession : s)));
      setEditingSessionId(null);
    } catch (error) {
      console.error('Error updating session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Xóa session này?')) return;
    try {
      setIsLoading(true);
      await api.deleteSession(sessionId);
      setSessions((current) => current.filter((s) => s.id !== sessionId));
    } catch (error) {
      console.error('Error deleting session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startEditingSession = (session: ApiSession) => {
    setEditingSessionId(session.id);
    const start = new Date(session.start_time);
    const end = new Date(session.end_time);
    setEditSessionData({
      sessionDate: session.session_date,
      startTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
      inTimeStatus: session.in_time_status,
    });
  };

  const getTaskSessions = (taskId: string) => {
    return sessions.filter((s) => s.task_id === taskId);
  };

  const getInTimeSessionsCount = (taskId: string) => {
    return sessions.filter((s) => s.task_id === taskId && s.in_time_status === 'in_time').length;
  };

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Topics Sidebar */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="lg:col-span-1"
      >
        <BentoCard3D
          className="h-full flex flex-col p-6"
          icon={<BookOpen size={24} />}
          title="Topics"
          description={`${topics.length} topics`}
        >
          {/* New Topic Form */}
          {showNewTopicForm && (
            <div className="mb-4 space-y-3 mt-4">
              <input
                type="text"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                placeholder="Topic name"
                className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-sm placeholder-white/40 focus:outline-none focus:border-white/30"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddTopic}
                  disabled={isLoading}
                  className="flex-1 px-3 py-2 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowNewTopicForm(false);
                    setNewTopicName('');
                  }}
                  className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/15 text-white text-sm rounded-lg transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Topics List */}
          <div className="space-y-2 flex-1 mt-4">
            {topics.map((topic) => (
              <div key={topic.id} className="relative group">
                {editingTopicId === topic.id ? (
                  <div className="flex gap-2 p-2 bg-white/5 rounded-lg border border-white/20">
                    <input
                      type="text"
                      value={editTopicName}
                      onChange={(e) => setEditTopicName(e.target.value)}
                      className="flex-1 bg-transparent border-none outline-none text-sm text-white px-2"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdateTopic(topic.id)}
                    />
                    <button onClick={() => handleUpdateTopic(topic.id)} className="p-1.5 bg-green-500/20 text-green-400 rounded-md hover:bg-green-500/30">
                      <CheckCircle size={14} />
                    </button>
                    <button onClick={() => setEditingTopicId(null)} className="p-1.5 bg-white/10 text-white/50 rounded-md hover:bg-white/20">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setSelectedTopic(topic.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-all pr-16 ${
                        selectedTopic === topic.id
                          ? 'bg-gradient-to-r from-purple-600/60 to-purple-500/60 text-white border border-purple-500/30'
                          : 'bg-white/5 text-white/70 hover:bg-white/10 border border-transparent'
                      }`}
                    >
                      <span className="text-sm font-medium">{topic.name}</span>
                    </button>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTopicId(topic.id);
                          setEditTopicName(topic.name);
                        }}
                        className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-md transition"
                        title="Edit Topic"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTopic(topic.id);
                        }}
                        className="p-1.5 text-red-400/50 hover:text-red-400 hover:bg-red-500/10 rounded-md transition"
                        title="Delete Topic"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {topics.length === 0 && !showNewTopicForm && (
            <p className="text-white/50 text-xs text-center py-4 mt-4">
              No topics yet
            </p>
          )}

          {!showNewTopicForm && (
            <button
              onClick={() => setShowNewTopicForm(true)}
              className="w-full mt-4 px-3 py-2 bg-white/10 hover:bg-white/15 text-white text-sm rounded-lg flex items-center justify-center gap-2 transition-all border border-white/10"
            >
              <Plus size={16} />
              New Topic
            </button>
          )}
        </BentoCard3D>
      </motion.div>

      {/* Tasks List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="lg:col-span-3"
      >
        <BentoCard3D
          hover={false}
          className="h-full flex flex-col p-6"
          glowing
          icon={<ListTodo size={24} />}
          title={topics.find((t) => t.id === selectedTopic)?.name || 'Tasks'}
          description={`${tasks.filter((t) => t.topic_id === selectedTopic).length} tasks`}
        >
          {/* New Task Form */}
          {showNewTaskForm && selectedTopic && (
            <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-lg space-y-3 mt-4">
              <input
                type="text"
                value={newTaskData.title}
                onChange={(e) => setNewTaskData({ ...newTaskData, title: e.target.value })}
                placeholder="Task title"
                className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-sm placeholder-white/40 focus:outline-none focus:border-white/30"
              />
              <textarea
                value={newTaskData.description}
                onChange={(e) => setNewTaskData({ ...newTaskData, description: e.target.value })}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-sm placeholder-white/40 focus:outline-none focus:border-white/30 resize-none h-20"
              />
              <input
                type="datetime-local"
                value={newTaskData.deadline}
                onChange={(e) => setNewTaskData({ ...newTaskData, deadline: e.target.value })}
                className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-white/30"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddTask}
                  disabled={isLoading}
                  className="flex-1 px-3 py-2 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                >
                  Create Task
                </button>
                <button
                  onClick={() => {
                    setShowNewTaskForm(false);
                    setNewTaskData({ title: '', description: '', deadline: '' });
                  }}
                  className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/15 text-white text-sm rounded-lg transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Tasks List */}
          {selectedTopic && (
            <div className="space-y-3 max-h-[600px] overflow-y-auto flex-1 mt-4">
              {tasks.filter((t) => t.topic_id === selectedTopic).length === 0 ? (
                <p className="text-white/50 text-center py-8 text-sm">
                  No tasks yet. Create one to get started!
                </p>
              ) : (
                tasks
                  .filter((t) => t.topic_id === selectedTopic)
                  .map((task) => (
                  <div key={task.id} className="flex flex-col">
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-4 bg-white/5 border rounded-xl flex items-start justify-between group hover:bg-white/10 hover:border-white/20 cursor-pointer transition-all ${
                        expandedTaskId === task.id ? 'border-purple-500/50 bg-white/10' : 'border-white/10'
                      }`}
                      onClick={() => {
                        setExpandedTaskId(expandedTaskId === task.id ? null : task.id);
                        setShowNewSessionForm(false);
                        setEditingSessionId(null);
                      }}
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleTaskStatus(task.id, task.status);
                          }}
                          className="mt-1 text-white transition"
                        >
                          {task.status === 'completed' ? (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          ) : (
                            <Circle className="w-5 h-5 text-white/40" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <h4
                            className={`font-medium text-sm ${
                              task.status === 'completed'
                                ? 'text-white/50 line-through'
                                : 'text-white'
                            }`}
                          >
                            {task.title}
                          </h4>
                          {task.description && (
                            <p className="text-white/60 text-xs mt-1">{task.description}</p>
                          )}
                          {task.deadline && (
                            <p className="text-white/50 text-xs mt-2">
                              Due: {new Date(task.deadline).toLocaleDateString()}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2">
                            <p className="text-blue-400 text-xs flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {getTaskSessions(task.id).length} sessions
                            </p>
                            <p className="text-green-400 text-xs flex items-center gap-1 font-medium">
                              <CheckCircle className="w-3 h-3" />
                              {getInTimeSessionsCount(task.id)} in-time
                            </p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTask(task.id);
                        }}
                        className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </motion.div>

                    {/* Sessions Accordion */}
                    {expandedTaskId === task.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-white/5 border-x border-b border-white/10 rounded-b-xl -mt-2 mx-1 px-4 pb-4 pt-4 space-y-3"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <h5 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Sessions List</h5>
                          {!showNewSessionForm && (
                            <button
                              onClick={() => setShowNewSessionForm(true)}
                              className="text-xs py-1 px-2 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30 transition flex items-center gap-1"
                            >
                              <Plus size={12} /> Add Session
                            </button>
                          )}
                        </div>

                        {showNewSessionForm && (
                          <div className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-2">
                            <div className="grid grid-cols-3 gap-2">
                              <input
                                type="date"
                                value={newSessionData.sessionDate}
                                onChange={(e) => setNewSessionData({ ...newSessionData, sessionDate: e.target.value })}
                                className="px-2 py-1 bg-white/10 border border-white/10 rounded text-white text-xs focus:outline-none"
                              />
                              <input
                                type="time"
                                value={newSessionData.startTime}
                                onChange={(e) => setNewSessionData({ ...newSessionData, startTime: e.target.value })}
                                className="px-2 py-1 bg-white/10 border border-white/10 rounded text-white text-xs focus:outline-none"
                              />
                              <input
                                type="time"
                                value={newSessionData.endTime}
                                onChange={(e) => setNewSessionData({ ...newSessionData, endTime: e.target.value })}
                                className="px-2 py-1 bg-white/10 border border-white/10 rounded text-white text-xs focus:outline-none"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAddSession(task.id)}
                                className="flex-1 py-1 bg-green-500/20 text-green-300 text-xs rounded hover:bg-green-500/30"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setShowNewSessionForm(false)}
                                className="flex-1 py-1 bg-white/10 text-white text-xs rounded hover:bg-white/15"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {getTaskSessions(task.id).length === 0 && !showNewSessionForm ? (
                          <p className="text-white/30 text-center py-2 text-xs">No sessions yet</p>
                        ) : (
                          <div className="space-y-2">
                            {getTaskSessions(task.id).map((session) => (
                              <div key={session.id} className="bg-white/5 border border-white/5 rounded-lg p-3 group/session">
                                {editingSessionId === session.id ? (
                                  <div className="space-y-2">
                                    <div className="grid grid-cols-3 gap-2">
                                      <input
                                        type="date"
                                        value={editSessionData.sessionDate}
                                        onChange={(e) => setEditSessionData({ ...editSessionData, sessionDate: e.target.value })}
                                        className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs"
                                      />
                                      <input
                                        type="time"
                                        value={editSessionData.startTime}
                                        onChange={(e) => setEditSessionData({ ...editSessionData, startTime: e.target.value })}
                                        className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs"
                                      />
                                      <input
                                        type="time"
                                        value={editSessionData.endTime}
                                        onChange={(e) => setEditSessionData({ ...editSessionData, endTime: e.target.value })}
                                        className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <select
                                        value={editSessionData.inTimeStatus}
                                        onChange={(e) => setEditSessionData({ ...editSessionData, inTimeStatus: e.target.value as any })}
                                        className="flex-1 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs focus:outline-none"
                                      >
                                        <option value="in_time" className="bg-gray-900">In Time</option>
                                        <option value="out_time" className="bg-gray-900">Out Time</option>
                                      </select>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => handleUpdateSession(session.id)}
                                          className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded hover:bg-green-500/30 transition-all border border-green-500/30"
                                        >
                                          Lưu
                                        </button>
                                        <button
                                          onClick={() => setEditingSessionId(null)}
                                          className="px-3 py-1 bg-white/10 text-white/50 text-xs font-medium rounded hover:bg-white/20 transition-all border border-white/10"
                                        >
                                          Hủy
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex justify-between items-center">
                                    <div className="flex flex-col">
                                      <span className="text-white text-xs font-medium">
                                        {formatTime(session.start_time)} - {formatTime(session.end_time)}
                                      </span>
                                      <span className="text-white/40 text-[10px]">{session.session_date}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                                        session.in_time_status === 'in_time' 
                                          ? 'bg-green-500/20 text-green-400 border border-green-500/20' 
                                          : 'bg-orange-500/20 text-orange-400 border border-orange-500/20'
                                      }`}>
                                        {session.in_time_status === 'in_time' ? 'In Time' : 'Out Time'}
                                      </span>
                                      <div className="flex gap-1 opacity-0 group-hover/session:opacity-100 transition-opacity">
                                        <button
                                          onClick={() => startEditingSession(session)}
                                          className="p-1 text-white/40 hover:text-white hover:bg-white/10 rounded"
                                        >
                                          <Pencil size={12} />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteSession(session.id)}
                                          className="p-1 text-red-400/40 hover:text-red-400 hover:bg-red-500/10 rounded"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {selectedTopic && !showNewTaskForm && (
            <button
              onClick={() => setShowNewTaskForm(true)}
              className="w-full mt-4 px-3 py-2 bg-white/10 hover:bg-white/15 text-white text-sm rounded-lg flex items-center justify-center gap-2 transition-all border border-white/10"
            >
              <Plus size={16} />
              New Task
            </button>
          )}
        </BentoCard3D>
      </motion.div>

    </div>
  );
}
