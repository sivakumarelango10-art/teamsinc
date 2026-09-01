import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * LeadershipChat redirect
 * Chats are now unified into the single WhatsApp-style /chat route.
 */
export const LeadershipChat = () => {
  return <Navigate to="/chat" replace />;
};

export default LeadershipChat;
