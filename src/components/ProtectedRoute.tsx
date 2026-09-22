import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export default function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center text-gray-500">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
