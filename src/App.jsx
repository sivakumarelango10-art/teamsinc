import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PresenceProvider } from './context/PresenceContext';
import { CallNotificationProvider } from './context/CallNotificationContext';
import AppRoutes from './routes/AppRoutes';
import PushPermissionPrompt from './components/notifications/PushPermissionPrompt';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PresenceProvider>
          <CallNotificationProvider>
            <AppRoutes />
            <PushPermissionPrompt />
          </CallNotificationProvider>
        </PresenceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
