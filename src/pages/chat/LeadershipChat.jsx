import React from 'react';
import TeamChat from './TeamChat';

/**
 * LeadershipChat — Restricted Communication Area
 * Access: FOUNDER, ADMIN, FOUNDING_ADVISOR only.
 * Database RLS enforces SELECT / INSERT / DELETE access strictly to these 3 roles.
 */
export const LeadershipChat = () => {
  return (
    <TeamChat
      channel="leadership"
      title="Leadership Council"
      subtitle="Founder, Admin & Founding Advisor only"
      isLeadershipMode={true}
    />
  );
};

export default LeadershipChat;
