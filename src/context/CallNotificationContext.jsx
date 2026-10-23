import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Phone, Video, PhoneOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { callApi, generateCallId, isValidUuid } from '../api/callApi';
import { supabase } from '../api/supabase';
import notificationService from '../utils/notificationService';

const VideoCallModal = React.lazy(() => import('../components/call/VideoCallModal'));

const CallNotificationContext = createContext(null);

export const CallNotificationProvider = ({ children }) => {
  const { user, profile } = useAuth();
  const [activeCallSession, setActiveCallSession] = useState(null); // When user is inside call
  const [incomingCall, setIncomingCall] = useState(null); // When someone else is calling
  const [ongoingCall, setOngoingCall] = useState(null); // General active call in room
  const dismissedCallIdsRef = useRef(new Set());
  const incomingCallRef = useRef(null);
  const activeCallSessionRef = useRef(null);
  const ringTimeoutRef = useRef(null);
  const globalChannelRef = useRef(null);
  const isChannelSubscribedRef = useRef(false);
  const pendingBroadcastsRef = useRef([]);

  const currentUser = {
    id: profile?.id || user?.id || 'local-user',
    email: (profile?.email || user?.email || '').toLowerCase().trim(),
    full_name: profile?.full_name || user?.user_metadata?.full_name || profile?.email?.split('@')[0] || user?.email?.split('@')[0] || 'Team Member',
    role: profile?.role || 'MEMBER'
  };
  incomingCallRef.current = incomingCall;
  activeCallSessionRef.current = activeCallSession;

  // Clear incoming ring
  const clearIncomingRing = () => {
    notificationService.stopIncomingCallRingtone();
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    setIncomingCall(null);
  };

  // Safe Realtime broadcaster with queuing if channel is connecting
  const broadcastGlobal = (event, payload) => {
    if (globalChannelRef.current && isChannelSubscribedRef.current) {
      globalChannelRef.current.send({
        type: 'broadcast',
        event,
        payload
      }).catch(err => console.warn('[Call] Broadcast error:', err));
    } else {
      pendingBroadcastsRef.current.push({ event, payload });
    }
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
      callBc = new BroadcastChannel('teamsync_global_call_status');
      callBc.onmessage = (event) => {
        if (event.data?.type === 'CALL_STATUS') {
          handleIncomingCallSignal(event.data.call);
        } else if (event.data?.type === 'CALL_ENDED') {
          const endedCallId = event.data?.callId;
          const endedRoomId = event.data?.roomId;
          setOngoingCall(prev => (prev?.id === endedCallId || prev?.room_id === endedRoomId ? null : prev));
          setActiveCallSession(prev => (prev?.id === endedCallId || prev?.room_id === endedRoomId ? null : prev));
          if (incomingCallRef.current?.id === endedCallId || incomingCallRef.current?.room_id === endedRoomId) {
            clearIncomingRing();
          }
        }
      };
    } catch {}

    // Supabase Realtime global call notification channel
    let callSub = null;
    if (supabase) {
      callSub = supabase
        .channel('global-call-notifications', {
          config: { broadcast: { self: false } }
        })
        .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
          if (payload) handleIncomingCallSignal(payload);
        })
        .on('broadcast', { event: 'call_ended' }, ({ payload }) => {
          const endedCallId = payload?.callId;
          const endedRoomId = payload?.roomId;
          setOngoingCall(prev => (prev?.id === endedCallId || prev?.room_id === endedRoomId ? null : prev));
          setActiveCallSession(prev => (prev?.id === endedCallId || prev?.room_id === endedRoomId ? null : prev));
          if (incomingCallRef.current?.id === endedCallId || incomingCallRef.current?.room_id === endedRoomId) {
            clearIncomingRing();
          }
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'call_history' },
          (payload) => {
            if (payload.new?.status === 'ongoing') {
              handleIncomingCallSignal(payload.new);
            } else if (payload.new?.status === 'ended') {
              const endedId = payload.new.id;
              const endedRoom = payload.new.room_id;
              setOngoingCall(prev => (prev?.id === endedId || prev?.room_id === endedRoom ? null : prev));
              if (incomingCallRef.current?.id === endedId || incomingCallRef.current?.room_id === endedRoom) {
                clearIncomingRing();
              }
              // If call ended by host, terminate call modal for all active participants
              setActiveCallSession(prev => (prev?.id === endedId || prev?.room_id === endedRoom ? null : prev));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            isChannelSubscribedRef.current = true;
            // Drain any pending broadcasts queued while connecting
            while (pendingBroadcastsRef.current.length > 0) {
              const item = pendingBroadcastsRef.current.shift();
              if (item) {
                callSub.send({
                  type: 'broadcast',
                  event: item.event,
                  payload: item.payload
                }).catch(() => {});
              }
            }
          } else {
            isChannelSubscribedRef.current = false;
          }
        });
      
      globalChannelRef.current = callSub;
    }

    return () => {
      if (callBc) callBc.close();
      if (callSub && supabase) supabase.removeChannel(callSub);
      globalChannelRef.current = null;
      isChannelSubscribedRef.current = false;
    };
  }, [currentUser?.email]);

  const handleIncomingCallSignal = (call) => {
    if (!call || call.status !== 'ongoing') return;

    // Role-based room access guard
    const userRole = profile?.role || user?.role || user?.user_metadata?.role;
    if (call.room_id === 'leadership' && userRole !== 'FOUNDER' && userRole !== 'ADMIN' && userRole !== 'FOUNDING_ADVISOR') {
      return;
    }
    if (call.room_id === 'general' && userRole === 'FOUNDING_ADVISOR') {
      return;
    }

    setOngoingCall(call);

    // If current user is already in this call, do not ring
    if (activeCallSessionRef.current?.id === call.id || activeCallSessionRef.current?.room_id === call.room_id) return;

    // If current user was the caller, do not ring themselves
    const myEmail = (currentUser?.email || profile?.email || user?.email)?.toLowerCase();
    if (call.caller_email && myEmail && call.caller_email.toLowerCase() === myEmail) {
      return;
    }

    // If already dismissed, skip ring
    if (dismissedCallIdsRef.current.has(call.id)) return;

    // If already ringing for this call/room, merge metadata seamlessly without restarting ringtone
    if (incomingCallRef.current && (incomingCallRef.current.id === call.id || incomingCallRef.current.room_id === call.room_id)) {
      setIncomingCall(prev => ({ ...prev, ...call }));
      return;
    }

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

  const acceptCall = useCallback((call) => {
    clearIncomingRing();
    const targetCall = call || incomingCall || ongoingCall;
    if (targetCall) {
      // Tell SW to close the incoming-call push notification if showing
      notificationService.notifyCallAnswered(targetCall.id);
      setActiveCallSession(targetCall);
    }
  }, [incomingCall, ongoingCall]);

  const declineCall = useCallback(() => {
    if (incomingCall) {
      dismissedCallIdsRef.current.add(incomingCall.id);
      // Tell SW to close the ringing notification
      notificationService.notifyCallCancelled(incomingCall.id);
    }
    clearIncomingRing();
  }, [incomingCall]);

  const startCall = useCallback(async (callType = 'video', roomId = 'general', roomTitle = 'TeamSinc Company HQ') => {
    // Generate canonical UUID for call session
    const callId = generateCallId();
    const callerId = currentUser.id;
    const callerEmail = currentUser.email;
    const callerName = currentUser.full_name;

    const sessionData = {
      id: callId,
      room_id: roomId,
      room_title: roomTitle,
      call_type: callType,
      caller_id: callerId,
      caller_name: callerName,
      caller_email: callerEmail,
      started_at: new Date().toISOString(),
      status: 'ongoing',
      participants: [{
        id: callerId,
        name: callerName,
        email: callerEmail,
        role: currentUser.role,
        joined_at: new Date().toISOString()
      }]
    };

    setActiveCallSession(sessionData);
    setOngoingCall(sessionData);

    // Cross-tab broadcast
    try {
      const bc = new BroadcastChannel('teamsync_global_call_status');
      bc.postMessage({ type: 'CALL_STATUS', call: sessionData });
      bc.close();
    } catch {}

    // Supabase Realtime broadcast to all online team members
    broadcastGlobal('incoming_call', sessionData);

    // Background DB synchronization with the same canonical UUID
    callApi.createCallSession({
      id: callId,
      roomId,
      roomTitle,
      caller: currentUser,
      callType
    }).catch(err => {
      console.warn('Call background sync notice:', err);
    });

    return sessionData;
  }, [currentUser.id, currentUser.email, currentUser.full_name, currentUser.role]);

  const leaveCall = useCallback(() => {
    // Participant leaving only their local view
    setActiveCallSession(null);
    clearIncomingRing();
  }, []);

  const handleHostEndedCall = useCallback(() => {
    // When the host ends the call, terminate session and clear ongoing state for all participants
    setActiveCallSession(null);
    setOngoingCall(null);
    clearIncomingRing();
  }, []);

  // Host ends the call for everyone
  const endCall = useCallback(async (callId, { duration = 0, participants = [] } = {}) => {
    const targetCallId = callId || activeCallSession?.id || ongoingCall?.id;
    const currentRoomId = activeCallSession?.room_id || ongoingCall?.room_id || 'general';

    if (targetCallId) {
      try {
        await callApi.endCallSession(targetCallId, { duration, participants, roomId: currentRoomId });
      } catch (err) {
        console.warn('Error ending call session:', err);
      }

      // Supabase Realtime broadcast to close call for all participants
      broadcastGlobal('call_ended', { callId: targetCallId, roomId: currentRoomId });

      try {
        const bc = new BroadcastChannel('teamsync_global_call_status');
        bc.postMessage({ type: 'CALL_ENDED', callId: targetCallId, roomId: currentRoomId });
        bc.close();
      } catch {}
    }

    setOngoingCall(null);
    setActiveCallSession(null);
    clearIncomingRing();
  }, [activeCallSession?.id, activeCallSession?.room_id, ongoingCall?.id, ongoingCall?.room_id]);

  const contextValue = useMemo(() => ({
    activeCallSession,
    incomingCall,
    ongoingCall,
    startCall,
    acceptCall,
    declineCall,
    leaveCall,
    endCall
  }), [
    activeCallSession,
    incomingCall,
    ongoingCall,
    startCall,
    acceptCall,
    declineCall,
    leaveCall,
    endCall
  ]);

  return (
    <CallNotificationContext.Provider value={contextValue}>
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
              <p className="text-xs text-neutral-400">TeamSinc Company Channel (#general)</p>
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
        <React.Suspense fallback={null}>
          <VideoCallModal
            callSession={activeCallSession}
            currentUser={currentUser}
            roomId={activeCallSession.room_id || 'general'}
            roomTitle={activeCallSession.room_title || 'TeamSinc Company HQ'}
            isAudioOnly={activeCallSession.call_type === 'voice'}
            onLeaveCall={leaveCall}
            onEndCall={endCall}
            onHostEndedCall={handleHostEndedCall}
          />
        </React.Suspense>
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
