import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// Layout
import DashboardLayout from '../components/layout/DashboardLayout';
import ProtectedRoute from '../components/common/ProtectedRoute';
import LoadingSpinner from '../components/common/LoadingSpinner';

// Pages
import Login from '../pages/auth/Login';
import FounderDashboard from '../pages/founder/FounderDashboard';
import Users from '../pages/founder/Users';
import Departments from '../pages/founder/Departments';
import Reports from '../pages/founder/Reports';

import AdminDashboard from '../pages/admin/AdminDashboard';
import Tasks from '../pages/admin/Tasks';
import AssignTask from '../pages/admin/AssignTask';
import DailyPlanning from '../pages/admin/DailyPlanning';

import MemberDashboard from '../pages/member/MemberDashboard';
import MyTasks from '../pages/member/MyTasks';
import MyDailyPlan from '../pages/member/MyDailyPlan';
import TeamChat from '../pages/chat/TeamChat';
import LeadershipChat from '../pages/chat/LeadershipChat';
import AdvisorDashboard from '../pages/advisor/AdvisorDashboard';
import AdvisorTasks from '../pages/advisor/AdvisorTasks';

export const AppRoutes = () => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <LoadingSpinner text="Starting TeamSync..." size="large" />
      </div>
    );
  }

  const getDefaultRedirect = () => {
    if (!user || !profile) return <Navigate to="/login" replace />;
    if (profile.role === 'FOUNDER') return <Navigate to="/founder/dashboard" replace />;
    if (profile.role === 'ADMIN') return <Navigate to="/admin/dashboard" replace />;
    if (profile.role === 'FOUNDING_ADVISOR') return <Navigate to="/founding-advisor/dashboard" replace />;
    return <Navigate to="/member/dashboard" replace />;
  };

  return (
    <Routes>
      {/* Public Route */}
      <Route
        path="/login"
        element={user ? getDefaultRedirect() : <Login />}
      />

      {/* Founder Protected Routes */}
      <Route
        path="/founder"
        element={
          <ProtectedRoute allowedRoles={['FOUNDER']}>
            <DashboardLayout title="Founder Portal" />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<FounderDashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="departments" element={<Departments />} />
        <Route path="reports" element={<Reports />} />
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>

      {/* Admin / Task Manager Protected Routes (Accessible by Admin and Founder) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['ADMIN', 'FOUNDER']}>
            <DashboardLayout title="Management Operations" />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="assign-task" element={<AssignTask />} />
        <Route path="daily-planning" element={<DailyPlanning />} />
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>

      {/* Founding Advisor Protected Routes (Oversight Portal) */}
      <Route
        path="/founding-advisor"
        element={
          <ProtectedRoute allowedRoles={['FOUNDING_ADVISOR']}>
            <DashboardLayout title="Founding Advisor Portal" />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<AdvisorDashboard />} />
        <Route path="tasks" element={<AdvisorTasks />} />
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>

      {/* Member Protected Routes */}
      <Route
        path="/member"
        element={
          <ProtectedRoute allowedRoles={['MEMBER']}>
            <DashboardLayout title="Team Workspace" />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<MemberDashboard />} />
        <Route path="tasks" element={<MyTasks />} />
        <Route path="daily-plan" element={<MyDailyPlan />} />
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>

      {/* Restricted Leadership Chat Route (Founder, Admin, Founding Advisor ONLY) */}
      <Route
        path="/leadership-chat"
        element={
          <ProtectedRoute allowedRoles={['FOUNDER', 'ADMIN', 'FOUNDING_ADVISOR']}>
            <DashboardLayout title="Leadership Council">
              <LeadershipChat />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Universal Company Team Chat Route (Founder, Admin, Member — Excludes Founding Advisor) */}
      <Route
        path="/chat"
        element={
          <ProtectedRoute allowedRoles={['FOUNDER', 'ADMIN', 'MEMBER']}>
            <DashboardLayout title="Company Chat">
              <TeamChat />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Root and Fallback */}
      <Route path="/" element={getDefaultRedirect()} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
