import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, MessageSquare, Shield, Sparkles, UserCheck } from 'lucide-react';
import Avatar from '../common/Avatar';
import { usePresence } from '../../context/PresenceContext';

export const NewChatModal = ({
  isOpen,
  onClose,
  onSelectMember,
  members = [],
  currentUserId
}) => {
  const [search, setSearch] = useState('');
  const { isUserOnline } = usePresence();

  // Reset search on open
  useEffect(() => {
    if (isOpen) setSearch('');
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members
      .filter((m) => {
        // Exclude current user and non-active members
        if (m.id === currentUserId) return false;
        if (m.is_active === false) return false;
        return true;
      })
      .filter((m) => {
        if (!query) return true;
        const nameMatch = (m.full_name || '').toLowerCase().includes(query);
        const emailMatch = (m.email || '').toLowerCase().includes(query);
        const roleMatch = (m.role || '').toLowerCase().includes(query);
        return nameMatch || emailMatch || roleMatch;
      });
  }, [members, currentUserId, search]);

  if (!isOpen) return null;

  const getRoleBadge = (role) => {
    switch (role) {
      case 'FOUNDER':
        return 'bg-amber-950/60 text-amber-300 border-amber-800/80';
      case 'ADMIN':
        return 'bg-blue-950/60 text-blue-300 border-blue-800/80';
      case 'FOUNDING_ADVISOR':
        return 'bg-purple-950/60 text-purple-300 border-purple-800/80';
      default:
        return 'bg-neutral-900 text-neutral-300 border-neutral-800';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'FOUNDER':
        return 'Founder';
      case 'ADMIN':
        return 'Admin';
      case 'FOUNDING_ADVISOR':
        return 'Advisor';
      default:
        return 'Member';
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-neutral-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">New Direct Message</h3>
              <p className="text-[11px] text-neutral-400">Select a team member to start chatting privately</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-900 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-neutral-800/80 bg-neutral-900/30">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or role..."
              className="w-full pl-9 pr-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-white placeholder:text-neutral-500 outline-none focus:border-blue-500 transition"
            />
          </div>
        </div>

        {/* Members List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredMembers.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 space-y-2">
              <UserCheck className="w-8 h-8 mx-auto text-neutral-600 opacity-60" />
              <p className="text-xs">No team members match "{search}"</p>
            </div>
          ) : (
            filteredMembers.map((member) => {
              const online = isUserOnline(member.id) || isUserOnline(member.email);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => {
                    onSelectMember(member);
                    onClose();
                  }}
                  className="w-full p-2.5 rounded-xl flex items-center gap-3 hover:bg-neutral-900/80 border border-transparent hover:border-neutral-800 text-left transition group cursor-pointer"
                >
                  <Avatar
                    src={member.avatar_url}
                    name={member.full_name}
                    size="md"
                    rounded="rounded-xl"
                    showStatus={true}
                    status={online ? 'online' : 'offline'}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white group-hover:text-blue-400 transition truncate">
                        {member.full_name}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider shrink-0 ${getRoleBadge(
                          member.role
                        )}`}
                      >
                        {getRoleLabel(member.role)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-400 mt-0.5">
                      <span className="truncate">{member.email}</span>
                      <span className="shrink-0 text-[10px] text-neutral-500">
                        {online ? (
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Online
                          </span>
                        ) : (
                          'Offline'
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NewChatModal;
