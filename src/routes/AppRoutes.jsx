import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

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

// Route-level code-splitting (cuts initial bundle size & defers recharts/chat/reports)
const Login = lazy(() => import('../pages/auth/Login'));
const FounderDashboard = lazy(() => import('../pages/founder/FounderDashboard'));
const Users = lazy(() => import('../pages/founder/Users'));
const Departments = lazy(() => import('../pages/founder/Departments'));
const Reports = lazy(() => import('../pages/founder/Reports'));

const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'));
const Tasks = lazy(() => import('../pages/admin/Tasks'));
const AssignTask = lazy(() => import('../pages/admin/AssignTask'));
const DailyPlanning = lazy(() => import('../pages/admin/DailyPlanning'));

const MemberDashboard = lazy(() => import('../pages/member/MemberDashboard'));
const MyTasks = lazy(() => import('../pages/member/MyTasks'));
const MyDailyPlan = lazy(() => import('../pages/member/MyDailyPlan'));
const TeamChat = lazy(() => import('../pages/chat/TeamChat'));
const LeadershipChat = lazy(() => import('../pages/chat/LeadershipChat'));
const AdvisorDashboard = lazy(() => import('../pages/advisor/AdvisorDashboard'));
const AdvisorTasks = lazy(() => import('../pages/advisor/AdvisorTasks'));

const BugManagement = lazy(() => import('../pages/bugs/BugManagement'));
const MyReportedBugs = lazy(() => import('../pages/bugs/MyReportedBugs'));
const KalviLearnHub = lazy(() => import('../pages/integrations/KalviLearnHub'));
const Profile = lazy(() => import('../pages/profile/Profile'));
const NotFound = lazy(() => import('../pages/common/NotFound'));

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
              <TeamChat />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* KalviLearn Integration Hub (All Authenticated Roles) */}
      <Route
        path="/integrations/kalvilearn"
        element={
          <ProtectedRoute allowedRoles={['FOUNDER', 'ADMIN', 'MEMBER', 'FOUNDING_ADVISOR']}>
            <DashboardLayout title="KalviLearn Hub">
              <KalviLearnHub />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

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
