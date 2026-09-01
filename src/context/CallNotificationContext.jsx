import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Phone, Video, PhoneOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { callApi } from '../api/callApi';
import { supabase } from '../api/supabase';
import notificationService from '../utils/notificationService';
import VideoCallModal from '../components/call/VideoCallModal';

const CallNotificationContext = createContext(null);

export const CallNotificationProvider = ({ children }) => {
  const { user, profile } = useAuth();
  const [activeCallSession, setActiveCallSession] = useState(null); // When user is inside call
  const [incomingCall, setIncomingCall] = useState(null); // When someone else is calling
  const [ongoingCall, setOngoingCall] = useState(null); // General active call in room
  const dismissedCallIdsRef = useRef(new Set());
  const ringTimeoutRef = useRef(null);

  const currentUser = profile || user;

  // Clear incoming ring
  const clearIncomingRing = () => {
    notificationService.stopIncomingCallRingtone();
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    setIncomingCall(null);
  };

  // Check active calls on app load
  useEffect(() => {
    if (!currentUser?.email) return;

    const checkActive = async () => {
      try {
        const active = await callApi.getActiveCall('general');
        if (active) {
          setOngoingCall(active);
        }
      } catch (err) {
        console.warn('Initial call check notice:', err);
      }
    };

    checkActive();

    // Cross-tab broadcast listener
    let callBc = null;
    try {
      callBc = new BroadcastChannel('teamsync_call_status_general');
      callBc.onmessage = (event) => {
        if (event.data?.type === 'CALL_STATUS') {
          handleIncomingCallSignal(event.data.call);
        } else if (event.data?.type === 'CALL_ENDED') {
          const endedCallId = event.data?.callId;
          setOngoingCall(prev => (prev?.id === endedCallId ? null : prev));
          setActiveCallSession(prev => (prev?.id === endedCallId ? null : prev));
          if (incomingCall?.id === endedCallId) {
            clearIncomingRing();
          }
        }
      };
    } catch {}

    // Supabase Realtime listener
    let callSub = null;
    if (supabase) {
      callSub = supabase
        .channel('global-call-notifications')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'call_history' },
          (payload) => {
            if (payload.new?.status === 'ongoing') {
              handleIncomingCallSignal(payload.new);
            } else if (payload.new?.status === 'ended') {
              setOngoingCall(prev => (prev?.id === payload.new.id ? null : prev));
              if (incomingCall?.id === payload.new.id) {
                clearIncomingRing();
              }
              // If call ended by host, terminate call modal for all active participants
              setActiveCallSession(prev => (prev?.id === payload.new.id ? null : prev));
            }
          }
        )
        .subscribe();
    }

    return () => {
      if (callBc) callBc.close();
      if (callSub && supabase) supabase.removeChannel(callSub);
      clearIncomingRing();
    };
  }, [currentUser?.email]);

  const handleIncomingCallSignal = (call) => {
    if (!call || call.status !== 'ongoing') return;

    setOngoingCall(call);

    // If current user is already in this call, do nothing
    if (activeCallSession?.id === call.id) return;

    // If current user was the caller, do not ring themselves
    const myEmail = currentUser?.email?.toLowerCase();
    if (call.caller_email && myEmail && call.caller_email.toLowerCase() === myEmail) {
      return;
    }

    // If already dismissed, skip ring
    if (dismissedCallIdsRef.current.has(call.id)) return;

    // Trigger incoming ringing notification
    setIncomingCall(call);
    notificationService.notifyIncomingCall({
      callerName: call.caller_name,
      callType: call.call_type,
      onAccept: () => acceptCall(call)
    });

    // 45s Ring Timeout (auto-missed call)
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = setTimeout(() => {
      clearIncomingRing();
    }, 45000);
  };

  const acceptCall = (call) => {
    clearIncomingRing();
    const targetCall = call || incomingCall || ongoingCall;
    if (targetCall) {
      // Tell SW to close the incoming-call push notification if showing
      notificationService.notifyCallAnswered(targetCall.id);
      setActiveCallSession(targetCall);
    }
  };

  const declineCall = () => {
    if (incomingCall) {
      dismissedCallIdsRef.current.add(incomingCall.id);
      // Tell SW to close the ringing notification
      notificationService.notifyCallCancelled(incomingCall.id);
    }
    clearIncomingRing();
  };

  const startCall = async (callType = 'video') => {
    try {
      const session = await callApi.createCallSession({
        roomId: 'general',
        roomTitle: 'TeamSync Company HQ',
        caller: currentUser,
        callType
      });

      setActiveCallSession(session);
      setOngoingCall(session);

      try {
        const bc = new BroadcastChannel('teamsync_call_status_general');
        bc.postMessage({ type: 'CALL_STATUS', call: session });
        bc.close();
      } catch {}

      return session;
    } catch (err) {
      console.error('Failed to start call session:', err);
      throw err;
    }
  };

  const leaveCall = () => {
    // Participant leaving only their local view
    setActiveCallSession(null);
    clearIncomingRing();
  };

  // Host ends the call for everyone
  const endCall = async (callId, { duration = 0, participants = [] } = {}) => {
    const targetCallId = callId || activeCallSession?.id || ongoingCall?.id;
    if (targetCallId) {
      try {
        await callApi.endCallSession(targetCallId, { duration, participants });
      } catch (err) {
        console.warn('Error ending call session:', err);
      }

      try {
        const bc = new BroadcastChannel('teamsync_call_status_general');
        bc.postMessage({ type: 'CALL_ENDED', callId: targetCallId });
        bc.close();
      } catch {}

      notificationService.notifyCallCancelled(targetCallId);
    }
    setActiveCallSession(null);
    setOngoingCall(null);
    clearIncomingRing();
  };

  return (
    <CallNotificationContext.Provider
      value={{
        activeCallSession,
        incomingCall,
        ongoingCall,
        startCall,
        acceptCall,
        declineCall,
        leaveCall,
        endCall
      }}
    >
      {children}

      {/* Global Incoming Call Ringing Modal (Renders on any route) */}
      {incomingCall && !activeCallSession && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-sm bg-neutral-950 border border-emerald-500/50 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            {/* Background glowing aura */}
            <div className="absolute -top-16 -left-16 w-36 h-36 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -right-16 w-36 h-36 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />

            {/* Pulsing Avatar */}
            <div className="relative mb-4">
              <div className="w-20 h-20 rounded-full bg-neutral-900 border-2 border-emerald-400 flex items-center justify-center font-bold text-2xl text-white shadow-xl">
                {incomingCall.caller_name?.charAt(0) || 'T'}
              </div>
              <span className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-75" />
            </div>

            <div className="space-y-1 mb-6">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 uppercase tracking-wider">
                Incoming {incomingCall.call_type === 'voice' ? 'Voice' : 'Video'} Call
              </span>
              <h3 className="text-base font-bold text-white tracking-tight mt-1 truncate max-w-[240px]">
                {incomingCall.caller_name}
              </h3>
              <p className="text-xs text-neutral-400">TeamSync Company Channel (#general)</p>
            </div>

            {/* Actions: Decline / Join */}
            <div className="flex items-center gap-4 w-full">
              <button
                type="button"
                onClick={declineCall}
                className="flex-1 py-3 rounded-2xl bg-neutral-900 hover:bg-neutral-850 text-neutral-300 hover:text-white border border-neutral-800 transition flex items-center justify-center gap-2 text-xs font-bold cursor-pointer"
              >
                <PhoneOff className="w-4 h-4 text-red-400" />
                <span>Decline</span>
              </button>

              <button
                type="button"
                onClick={() => acceptCall(incomingCall)}
                className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition flex items-center justify-center gap-2 text-xs cursor-pointer shadow-lg shadow-emerald-950/60"
              >
                {incomingCall.call_type === 'voice' ? <Phone className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                <span>Join</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Video Call Modal (Visible across entire application) */}
      {activeCallSession && (
        <VideoCallModal
          callSession={activeCallSession}
          currentUser={currentUser}
          roomId={activeCallSession.room_id || 'general'}
          roomTitle={activeCallSession.room_title || 'TeamSync Company HQ'}
          isAudioOnly={activeCallSession.call_type === 'voice'}
          onLeaveCall={leaveCall}
          onEndCall={endCall}
        />
      )}
    </CallNotificationContext.Provider>
  );
};

export const useCallNotification = () => {
  const ctx = useContext(CallNotificationContext);
  if (!ctx) {
    throw new Error('useCallNotification must be used within CallNotificationProvider');
  }
  return ctx;
};

export default CallNotificationContext;
