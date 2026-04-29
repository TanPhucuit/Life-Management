'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/app/lib/store';
import Login from '@/app/components/Login';
import Dashboard from '@/app/components/Dashboard';

export default function Home() {
  const { user } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600">
        <div className="text-white text-2xl font-bold">Loading...</div>
      </div>
    );
  }

  return user ? <Dashboard /> : <Login />;
}
