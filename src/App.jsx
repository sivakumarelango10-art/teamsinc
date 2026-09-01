import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PresenceProvider } from './context/PresenceContext';
import AppRoutes from './routes/AppRoutes';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PresenceProvider>
          <AppRoutes />
        </PresenceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
