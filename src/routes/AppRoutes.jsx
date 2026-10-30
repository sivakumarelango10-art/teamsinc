import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import ChunkErrorBoundary from '../components/common/ChunkErrorBoundary';

// Layout
import DashboardLayout from '../components/layout/DashboardLayout';
import ProtectedRoute from '../components/common/ProtectedRoute';
import LoadingSpinner from '../components/common/LoadingSpinner';

// Lightweight fallback for fast page transitions
const PageLoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center min-h-[360px]">
    <LoadingSpinner text="Loading view..." size="medium" />
  </div>
);

// Route-level code-splitting with automated stale-chunk loading recovery
const Login = lazyWithRetry(() => import('../pages/auth/Login'), 'Login');
const FounderDashboard = lazyWithRetry(() => import('../pages/founder/FounderDashboard'), 'FounderDashboard');
const Users = lazyWithRetry(() => import('../pages/founder/Users'), 'Users');
const Departments = lazyWithRetry(() => import('../pages/founder/Departments'), 'Departments');
const Reports = lazyWithRetry(() => import('../pages/founder/Reports'), 'Reports');

const AdminDashboard = lazyWithRetry(() => import('../pages/admin/AdminDashboard'), 'AdminDashboard');
const Tasks = lazyWithRetry(() => import('../pages/admin/Tasks'), 'Tasks');
const AssignTask = lazyWithRetry(() => import('../pages/admin/AssignTask'), 'AssignTask');
const DailyPlanning = lazyWithRetry(() => import('../pages/admin/DailyPlanning'), 'DailyPlanning');

const MemberDashboard = lazyWithRetry(() => import('../pages/member/MemberDashboard'), 'MemberDashboard');
const MyTasks = lazyWithRetry(() => import('../pages/member/MyTasks'), 'MyTasks');
const MyDailyPlan = lazyWithRetry(() => import('../pages/member/MyDailyPlan'), 'MyDailyPlan');
const TeamChat = lazyWithRetry(() => import('../pages/chat/TeamChat'), 'TeamChat');
const LeadershipChat = lazyWithRetry(() => import('../pages/chat/LeadershipChat'), 'LeadershipChat');
const AdvisorDashboard = lazyWithRetry(() => import('../pages/advisor/AdvisorDashboard'), 'AdvisorDashboard');
const AdvisorTasks = lazyWithRetry(() => import('../pages/advisor/AdvisorTasks'), 'AdvisorTasks');

const BugManagement = lazyWithRetry(() => import('../pages/bugs/BugManagement'), 'BugManagement');
const MyReportedBugs = lazyWithRetry(() => import('../pages/bugs/MyReportedBugs'), 'MyReportedBugs');
const MeetingHub = lazyWithRetry(() => import('../pages/meetings/MeetingHub'), 'MeetingHub');
const Profile = lazyWithRetry(() => import('../pages/profile/Profile'), 'Profile');
const NotFound = lazyWithRetry(() => import('../pages/common/NotFound'), 'NotFound');

export const AppRoutes = () => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <LoadingSpinner text="Starting TeamSinc..." size="large" />
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

  const getUserDirectoryRedirect = () => {
    if (!user || !profile) return <Navigate to="/login" replace />;
    if (profile.role === 'FOUNDER') return <Navigate to="/founder/users" replace />;
    if (profile.role === 'ADMIN') return <Navigate to="/admin/users" replace />;
    if (profile.role === 'FOUNDING_ADVISOR') return <Navigate to="/founding-advisor/users" replace />;
    return <Navigate to="/member/users" replace />;
  };

  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
      {/* Root Route Redirect */}
      <Route path="/" element={getDefaultRedirect()} />

      {/* Top-Level User Directory Redirect for all roles */}
      <Route path="/users" element={getUserDirectoryRedirect()} />

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
        <Route path="bugs" element={<BugManagement />} />
        <Route path="users" element={<Users />} />
        <Route path="departments" element={<Departments />} />
        <Route path="reports" element={<Reports />} />
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
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
        <Route path="bugs" element={<BugManagement />} />
        <Route path="users" element={<Users />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="assign-task" element={<AssignTask />} />
        <Route path="daily-planning" element={<DailyPlanning />} />
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
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
        <Route path="users" element={<Users />} />
        <Route path="tasks" element={<AdvisorTasks />} />
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
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
        <Route path="users" element={<Users />} />
        <Route path="tasks" element={<MyTasks />} />
        <Route path="daily-plan" element={<MyDailyPlan />} />
        <Route path="bugs" element={<MyReportedBugs />} />
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Unified WhatsApp-Style Chats Route (All Authenticated Roles) */}
      <Route
        path="/chat"
        element={
          <ProtectedRoute allowedRoles={['FOUNDER', 'ADMIN', 'MEMBER', 'FOUNDING_ADVISOR']}>
            <DashboardLayout title="Chats">
              <ChunkErrorBoundary routeName="Chats">
                <TeamChat />
              </ChunkErrorBoundary>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Meeting Hub (All Authenticated Roles) */}
      <Route
        path="/meetings"
        element={
          <ProtectedRoute allowedRoles={['FOUNDER', 'ADMIN', 'MEMBER', 'FOUNDING_ADVISOR']}>
            <DashboardLayout title="Meeting Hub">
              <MeetingHub />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route path="/founder/meetings" element={<Navigate to="/meetings" replace />} />
      <Route path="/admin/meetings" element={<Navigate to="/meetings" replace />} />
      <Route path="/member/meetings" element={<Navigate to="/meetings" replace />} />
      <Route path="/founding-advisor/meetings" element={<Navigate to="/meetings" replace />} />

      {/* User Profile Management Route (All Authenticated Roles) */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute allowedRoles={['FOUNDER', 'ADMIN', 'MEMBER', 'FOUNDING_ADVISOR']}>
            <DashboardLayout title="My Profile">
              <Profile />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Legacy Redirect for /leadership-chat to unified /chat */}
      <Route path="/leadership-chat" element={<Navigate to="/chat" replace />} />

      {/* Dedicated 404 Route */}
      <Route path="/404" element={<NotFound />} />

      {/* Fallback Catch-all Route for any unmatched URL */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
};

export default AppRoutes;
