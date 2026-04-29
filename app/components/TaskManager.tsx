'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api, ApiSession, ApiTask, ApiTopic } from '@/app/lib/api';
import { useAppStore } from '@/app/lib/store';
import { Plus, Trash2, CheckCircle, Circle, Clock, X, ListTodo, BookOpen } from 'lucide-react';
import { BentoCard3D } from './BentoCard';

export default function TaskManager() {
  const { user } = useAppStore();
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [showNewTopicForm, setShowNewTopicForm] = useState(false);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTaskData, setNewTaskData] = useState({
    title: '',
    description: '',
    deadline: '',
  });
  const [newSessionData, setNewSessionData] = useState({
    sessionDate: '',
    startTime: '',
    endTime: '',
    focusedMinutes: 0,
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

  const handleAddSession = async () => {
    if (!selectedTask || !newSessionData.sessionDate || !newSessionData.startTime || !newSessionData.endTime) return;
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const newSession = await api.createSession({
        userId: user.id,
        taskId: selectedTask,
        startTime: `${newSessionData.sessionDate}T${newSessionData.startTime}:00`,
        endTime: `${newSessionData.sessionDate}T${newSessionData.endTime}:00`,
        sessionDate: newSessionData.sessionDate,
        focusedMinutes: newSessionData.focusedMinutes,
        inTimeStatus: 'in_time',
      });
      setSessions((current) => [newSession, ...current]);
      setNewSessionData({ sessionDate: '', startTime: '', endTime: '', focusedMinutes: 0 });
      setShowNewSessionForm(false);
    } catch (error) {
      console.error('Error adding session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTaskSessions = (taskId: string) => {
    return sessions.filter((s) => s.task_id === taskId);
  };

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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
          enablePerspectiveTilt
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
              <button
                key={topic.id}
                onClick={() => setSelectedTopic(topic.id)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                  selectedTopic === topic.id
                    ? 'bg-gradient-to-r from-purple-600/60 to-purple-500/60 text-white border border-purple-500/30'
                    : 'bg-white/5 text-white/70 hover:bg-white/10 border border-transparent'
                }`}
              >
                <span className="text-sm font-medium">{topic.name}</span>
              </button>
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
          className="h-full flex flex-col p-6"
          glowing
          icon={<ListTodo size={24} />}
          title={topics.find((t) => t.id === selectedTopic)?.name || 'Tasks'}
          description={`${tasks.filter((t) => t.topic_id === selectedTopic).length} tasks`}
          enablePerspectiveTilt
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
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-start justify-between group hover:bg-white/10 hover:border-white/20 cursor-pointer transition-all"
                    onClick={() => {
                      setSelectedTask(task.id);
                      setShowSessionModal(true);
                    }}
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTaskStatus(task.id, task.status);
                        }}
                        className="mt-1 text-white hover:scale-110 transition"
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
                        <p className="text-blue-400 text-xs mt-2 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {getTaskSessions(task.id).length} sessions
                        </p>
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

      {/* Session Modal */}
      {showSessionModal && selectedTask && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setShowSessionModal(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-black border border-white/10 rounded-[32px] p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            style={{
              background: 'linear-gradient(135deg, rgba(10, 10, 10, 0.95) 0%, rgba(10, 10, 10, 0.98) 100%)',
            }}
          >
            <div className="flex justify-between items-center mb-6 pb-6 border-b border-white/10">
              <h3 className="text-2xl font-bold text-white">
                {tasks.find((t) => t.id === selectedTask)?.title}
              </h3>
              <button
                onClick={() => setShowSessionModal(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            {/* Sessions List */}
            {getTaskSessions(selectedTask).length > 0 && (
              <div className="mb-8">
                <h4 className="text-white font-semibold mb-4 text-sm">Sessions ({getTaskSessions(selectedTask).length})</h4>
                <div className="space-y-2">
                  {getTaskSessions(selectedTask).map((session) => (
                    <div key={session.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-white font-medium text-sm">
                            {formatTime(session.start_time)} - {formatTime(session.end_time)}
                          </p>
                          <p className="text-white/60 text-xs mt-1">{session.session_date}</p>
                          <p className="text-white/70 text-xs mt-1 flex items-center gap-1">
                            <Clock size={12} />
                            {session.focused_minutes} min
                          </p>
                        </div>
                        <span className={`text-xs px-3 py-1 rounded-lg font-medium ${session.in_time_status === 'in_time' ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'}`}>
                          {session.in_time_status === 'in_time' ? 'On Time' : 'Late'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New Session Form */}
            {!showNewSessionForm ? (
              <button
                onClick={() => setShowNewSessionForm(true)}
                className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white font-semibold transition flex items-center justify-center gap-2 border border-purple-500/30"
              >
                <Plus className="w-5 h-5" />
                Add New Session
              </button>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
                <input
                  type="date"
                  value={newSessionData.sessionDate}
                  onChange={(e) => setNewSessionData({ ...newSessionData, sessionDate: e.target.value })}
                  className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-white/30"
                />
                <input
                  type="time"
                  value={newSessionData.startTime}
                  onChange={(e) => setNewSessionData({ ...newSessionData, startTime: e.target.value })}
                  className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-white/30"
                  placeholder="Start Time"
                />
                <input
                  type="time"
                  value={newSessionData.endTime}
                  onChange={(e) => setNewSessionData({ ...newSessionData, endTime: e.target.value })}
                  className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-white/30"
                  placeholder="End Time"
                />
                <input
                  type="number"
                  value={newSessionData.focusedMinutes}
                  onChange={(e) => setNewSessionData({ ...newSessionData, focusedMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-white/30"
                  placeholder="Focused Minutes"
                />
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleAddSession}
                    disabled={isLoading}
                    className="flex-1 py-2 rounded-lg bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-semibold transition disabled:opacity-50 border border-green-500/30"
                  >
                    Create Session
                  </button>
                  <button
                    onClick={() => {
                      setShowNewSessionForm(false);
                      setNewSessionData({ sessionDate: '', startTime: '', endTime: '', focusedMinutes: 0 });
                    }}
                    className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold transition border border-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
