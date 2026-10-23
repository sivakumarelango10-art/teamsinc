import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  Monitor,
  MessageSquare,
  Paperclip,
  Users,
  Smile,
  Wand2,
  Circle,
  Square,
  Maximize,
  Minimize,
  Volume2,
  Headphones,
  Check
} from 'lucide-react';
import useWebRTC from '../../hooks/useWebRTC';
import ParticipantTile from './ParticipantTile';
import InCallChatDrawer from './InCallChatDrawer';
import InCallFilesDrawer from './InCallFilesDrawer';
import InCallParticipantsDrawer from './InCallParticipantsDrawer';
import { callApi } from '../../api/callApi';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '👏', '😮', '🎉', '🔥', '🚀'];

const FILTERS = [
  { id: 'none', label: 'Normal' },
  { id: 'studio', label: 'Studio' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'vibrant', label: 'Vibrant' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'noir', label: 'B&W Noir' },
  { id: 'neon', label: 'Cyberpunk' }
];

export const VideoCallModal = ({
  callSession,
  currentUser,
  roomId = 'general',
  roomTitle = 'TeamSinc Company HQ',
  isAudioOnly = false,
  onLeaveCall,
  onEndCall,
  onHostEndedCall
}) => {
  const [activeDrawer, setActiveDrawer] = useState(null); // 'chat' | 'files' | 'participants' | 'effects' | null
  const [isEffectsMenuOpen, setIsEffectsMenuOpen] = useState(false);
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);
  const [pinnedPeerId, setPinnedPeerId] = useState(null); // id of pinned tile or screen share
  const [callDuration, setCallDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Call Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const containerRef = useRef(null);

  // Check if current user is the host/caller who started the call session
  const myEmail = (currentUser?.email || '')?.toLowerCase().trim();
  const hostEmail = (callSession?.caller_email || '')?.toLowerCase().trim();
  const myId = currentUser?.id;
  const hostId = callSession?.caller_id;

  const isHost = Boolean(
    (hostEmail && myEmail && hostEmail === myEmail) ||
    (hostId && myId && hostId === myId)
  );

  // WebRTC Engine
  const {
    localStream,
    screenStream,
    peers,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    isSpeakingLocal,
    activeFilter,
    backgroundEffect,
    reactions,
    inCallMessages,
    inCallFiles,
    connectionStatus,
    errorMessage,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    setActiveFilter,
    setBackgroundEffect,
    sendReaction,
    sendInCallMessage,
    sendInCallFile,
    sendCallEnded
  } = useWebRTC({
    roomId,
    currentUser,
    isAudioOnlyInitial: isAudioOnly,
    hostEmail: callSession?.caller_email,
    hostId: callSession?.caller_id,
    onCallEndedByHost: () => {
      if (onHostEndedCall) {
        onHostEndedCall();
      } else if (onLeaveCall) {
        onLeaveCall();
      }
    }
  });

  // Call Duration Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(console.warn);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.warn);
      setIsFullscreen(false);
    }
  };

  // Start Call Recording
  const handleStartRecording = async () => {
    if (isRecording) return;
    try {
      recordedChunksRef.current = [];

      // Combine streams for recording
      let streamToRecord = screenStream || localStream;
      if (!streamToRecord) return;

      const recorder = new MediaRecorder(streamToRecord, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm'
      });

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `teamsinc-call-record-${new Date().toISOString().slice(0, 10)}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      };

      recorder.start(1000);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.warn('Recording initiation failed:', err);
    }
  };

  // Stop Call Recording
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
  };

  // Host ends the call for all participants
  const handleEndCallForEveryone = async () => {
    if (isRecording) {
      handleStopRecording();
    }

    try {
      sendCallEnded();
    } catch {}

    const allParticipants = [
      {
        id: currentUser?.id || 'self',
        name: currentUser?.full_name || 'You',
        email: currentUser?.email || '',
        role: currentUser?.role || 'MEMBER'
      },
      ...Object.values(peers).map(p => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role
      }))
    ];

    // Wait a brief 120ms tick to ensure the WebRTC and BroadcastChannel packets flush out over the network
    await new Promise(r => setTimeout(r, 120));

    if (onEndCall) {
      await onEndCall(callSession?.id, {
        duration: callDuration,
        participants: allParticipants
      });
    } else {
      try {
        await callApi.endCallSession(callSession?.id, {
          duration: callDuration,
          participants: allParticipants,
          roomId
        });
      } catch (e) {
        console.warn('Error ending call session record:', e);
      }
      if (onLeaveCall) onLeaveCall();
    }
  };

  // Regular participant leaves only their own session
  const handleLeaveOnly = () => {
    if (isRecording) {
      handleStopRecording();
    }
    if (onLeaveCall) onLeaveCall();
  };

  // Peer list & Spotlight determination
  const peerList = Object.values(peers);
  const totalInCall = 1 + peerList.length;

  // If someone is sharing screen, default spotlight to screen share
  const screenSharingPeer = peerList.find(p => p.isScreenSharing);
  const spotlightStream = isScreenSharing
    ? screenStream
    : (screenSharingPeer ? screenSharingPeer.stream : null);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black text-white flex flex-col overflow-hidden select-none animate-fadeIn"
    >
      {/* 1. Call Top Navigation Bar */}
      <div className="h-14 px-4 md:px-6 bg-neutral-950/90 border-b border-neutral-800/80 flex items-center justify-between shrink-0 z-20 backdrop-blur-md">
        {/* Left: Call Title & Duration */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white p-0.5 flex items-center justify-center overflow-hidden shadow-sm">
            <img src="/logo.jpg" alt="TeamSinc" className="w-full h-full object-contain" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs md:text-sm font-bold text-white tracking-tight truncate max-w-[180px] md:max-w-xs">
                {roomTitle}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 border border-neutral-800 text-neutral-300">
                #{roomId}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-neutral-400">
              <span className="flex items-center gap-1 font-mono text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {formatTimer(callDuration)}
              </span>
              <span>•</span>
              <span>{totalInCall} participant{totalInCall > 1 ? 's' : ''}</span>
              <span>•</span>
              <span className="text-amber-400/90 font-medium">
                Host: {isHost ? 'You' : (callSession?.caller_name || 'Organizer')}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Live Recording Indicator */}
        {isRecording && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-950/80 border border-red-500/50 rounded-full text-xs text-red-300 font-bold shadow-lg animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span>REC {formatTimer(recordingSeconds)}</span>
          </div>
        )}

        {/* Right: Drawer Actions & Fullscreen */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* In-Call Chat Button */}
          <button
            type="button"
            onClick={() => setActiveDrawer(prev => (prev === 'chat' ? null : 'chat'))}
            className={`p-2 rounded-xl border transition cursor-pointer relative ${
              activeDrawer === 'chat'
                ? 'bg-white text-black border-white'
                : 'bg-neutral-900 text-neutral-300 hover:text-white border-neutral-800 hover:bg-neutral-800'
            }`}
            title="In-call chat"
          >
            <MessageSquare className="w-4 h-4" />
            {inCallMessages.length > 0 && activeDrawer !== 'chat' && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-black text-[9px] font-bold flex items-center justify-center">
                {inCallMessages.length}
              </span>
            )}
          </button>

          {/* In-Call File Sharing Button */}
          <button
            type="button"
            onClick={() => setActiveDrawer(prev => (prev === 'files' ? null : 'files'))}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              activeDrawer === 'files'
                ? 'bg-white text-black border-white'
                : 'bg-neutral-900 text-neutral-300 hover:text-white border-neutral-800 hover:bg-neutral-800'
            }`}
            title="Shared files"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Participants Button */}
          <button
            type="button"
            onClick={() => setActiveDrawer(prev => (prev === 'participants' ? null : 'participants'))}
            className={`p-2 rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
              activeDrawer === 'participants'
                ? 'bg-white text-black border-white'
                : 'bg-neutral-900 text-neutral-300 hover:text-white border-neutral-800 hover:bg-neutral-800'
            }`}
            title="Participants"
          >
            <Users className="w-4 h-4" />
            <span className="text-xs font-bold hidden sm:inline">{totalInCall}</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="p-2 rounded-xl bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800 hover:bg-neutral-800 transition cursor-pointer hidden md:flex"
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. Main Call Body (Video Grid + Optional Side Drawer) */}
      <div className="flex-1 relative flex overflow-hidden bg-black">
        {/* Floating Reactions Layer (Bubbles floating up) */}
        <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
          {reactions.map((rx) => (
            <div
              key={rx.id}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center animate-floatUp"
              style={{
                left: `${35 + (rx.id.charCodeAt(3) % 30)}%`
              }}
            >
              <span className="text-4xl drop-shadow-2xl">{rx.emoji}</span>
              <span className="text-[10px] font-bold bg-black/60 text-white px-2 py-0.5 rounded-full mt-1 border border-neutral-700">
                {rx.senderName}
              </span>
            </div>
          ))}
        </div>

        {/* Video Canvas Area */}
        <div className="flex-1 h-full p-3 md:p-4 flex flex-col overflow-hidden relative">
          {/* Spotlight Mode (Screen Sharing or Pinned Tile) */}
          {spotlightStream ? (
            <div className="flex-1 flex flex-col md:flex-row gap-3 overflow-hidden h-full">
              {/* Primary Spotlight Tile */}
              <div className="flex-1 h-full rounded-2xl md:rounded-3xl overflow-hidden border border-emerald-500/50 relative shadow-2xl bg-neutral-950">
                <ParticipantTile
                  stream={spotlightStream}
                  name={isScreenSharing ? (currentUser?.full_name || 'You') : (screenSharingPeer?.name || 'Presenter')}
                  isLocal={isScreenSharing}
                  isScreenSharing={true}
                  role={isScreenSharing ? currentUser?.role : screenSharingPeer?.role}
                />
              </div>

              {/* Secondary Camera Strip */}
              <div className="w-full md:w-60 h-32 md:h-full flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto shrink-0">
                {/* Local Camera Tile */}
                <div className="w-44 md:w-full h-full md:h-36 shrink-0">
                  <ParticipantTile
                    stream={localStream}
                    name={currentUser?.full_name || 'You'}
                    email={currentUser?.email}
                    role={currentUser?.role}
                    isLocal={true}
                    isAudioMuted={isAudioMuted}
                    isVideoOff={isVideoOff}
                    isSpeaking={isSpeakingLocal}
                    activeFilter={activeFilter}
                    backgroundEffect={backgroundEffect}
                  />
                </div>

                {/* Other Peers Tiles */}
                {peerList.map(peer => {
                  if (peer.isScreenSharing) return null;
                  return (
                    <div key={peer.id} className="w-44 md:w-full h-full md:h-36 shrink-0">
                      <ParticipantTile
                        stream={peer.stream}
                        name={peer.name}
                        email={peer.email}
                        role={peer.role}
                        isLocal={false}
                        isAudioMuted={peer.isAudioMuted}
                        isVideoOff={peer.isVideoOff}
                        isSpeaking={peer.isSpeaking}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Standard Responsive Grid */
            <div
              className={`w-full h-full grid gap-3 md:gap-4 items-center justify-center ${
                totalInCall === 1
                  ? 'grid-cols-1 max-w-3xl mx-auto'
                  : totalInCall === 2
                    ? 'grid-cols-1 sm:grid-cols-2 max-w-5xl mx-auto'
                    : totalInCall <= 4
                      ? 'grid-cols-2 max-w-5xl mx-auto'
                      : 'grid-cols-2 md:grid-cols-3 max-w-6xl mx-auto'
              }`}
            >
              {/* Local Participant Tile */}
              <div className="w-full h-full min-h-[220px]">
                <ParticipantTile
                  stream={localStream}
                  name={currentUser?.full_name || 'You'}
                  email={currentUser?.email}
                  role={currentUser?.role}
                  isLocal={true}
                  isAudioMuted={isAudioMuted}
                  isVideoOff={isVideoOff}
                  isScreenSharing={isScreenSharing}
                  isSpeaking={isSpeakingLocal}
                  activeFilter={activeFilter}
                  backgroundEffect={backgroundEffect}
                />
              </div>

              {/* Remote Participants Tiles */}
              {peerList.map((peer) => (
                <div key={peer.id} className="w-full h-full min-h-[220px]">
                  <ParticipantTile
                    stream={peer.stream}
                    name={peer.name}
                    email={peer.email}
                    role={peer.role}
                    isLocal={false}
                    isAudioMuted={peer.isAudioMuted}
                    isVideoOff={peer.isVideoOff}
                    isScreenSharing={peer.isScreenSharing}
                    isSpeaking={peer.isSpeaking}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. In-Call Side Drawers */}
        {activeDrawer === 'chat' && (
          <InCallChatDrawer
            messages={inCallMessages}
            onSendMessage={sendInCallMessage}
            onClose={() => setActiveDrawer(null)}
            currentUserId={currentUser?.id}
          />
        )}

        {activeDrawer === 'files' && (
          <InCallFilesDrawer
            files={inCallFiles}
            onShareFile={sendInCallFile}
            onClose={() => setActiveDrawer(null)}
          />
        )}

        {activeDrawer === 'participants' && (
          <InCallParticipantsDrawer
            currentUser={currentUser}
            localState={{
              isAudioMuted,
              isVideoOff,
              isScreenSharing,
              isSpeaking: isSpeakingLocal
            }}
            peers={peers}
            onClose={() => setActiveDrawer(null)}
          />
        )}
      </div>

      {/* 4. Bottom Controls Floating Dock */}
      <div className="p-3 sm:p-4 bg-neutral-950/95 border-t border-neutral-800/80 flex items-center justify-center shrink-0 z-30 backdrop-blur-md relative">
        {/* Floating Reactions Bar Popover */}
        {isReactionsOpen && (
          <div className="absolute bottom-20 z-50 bg-neutral-900 border border-neutral-700 rounded-full px-4 py-2 shadow-2xl flex items-center gap-2 animate-fadeIn">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  sendReaction(emoji);
                  setIsReactionsOpen(false);
                }}
                className="text-2xl hover:scale-125 transition cursor-pointer p-1"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Effects / Filters Popover */}
        {isEffectsMenuOpen && (
          <div className="absolute bottom-20 z-50 bg-neutral-900 border border-neutral-700 rounded-2xl p-4 shadow-2xl w-72 text-xs space-y-3 animate-fadeIn">
            <div>
              <h4 className="font-bold text-white mb-2 flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
                Background Effects
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBackgroundEffect('none')}
                  className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                    backgroundEffect === 'none'
                      ? 'bg-white text-black border-white font-bold'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  None
                </button>
                <button
                  type="button"
                  onClick={() => setBackgroundEffect('blur')}
                  className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                    backgroundEffect === 'blur'
                      ? 'bg-white text-black border-white font-bold'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  Blur Background
                </button>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-white mb-2">Video Filters</h4>
              <div className="grid grid-cols-4 gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setActiveFilter(f.id)}
                    className={`py-1.5 px-1 rounded-lg border text-[10px] text-center truncate transition cursor-pointer ${
                      activeFilter === f.id
                        ? 'bg-emerald-500 text-black border-emerald-400 font-bold'
                        : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Controls Pill Bar */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
          {/* 1. Mic Button */}
          <button
            type="button"
            onClick={toggleAudio}
            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md cursor-pointer btn-icon-smooth ${
              isAudioMuted
                ? 'bg-red-500 hover:bg-red-400 text-white'
                : 'bg-neutral-850 hover:bg-neutral-750 text-white border border-neutral-700'
            }`}
            title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* 2. Video Camera Button */}
          <button
            type="button"
            onClick={toggleVideo}
            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md cursor-pointer btn-icon-smooth ${
              isVideoOff
                ? 'bg-red-500 hover:bg-red-400 text-white'
                : 'bg-neutral-850 hover:bg-neutral-750 text-white border border-neutral-700'
            }`}
            title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
          >
            {isVideoOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
          </button>

          {/* 3. Screen Share Button */}
          <button
            type="button"
            onClick={toggleScreenShare}
            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md cursor-pointer btn-icon-smooth ${
              isScreenSharing
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black font-bold'
                : 'bg-neutral-850 hover:bg-neutral-750 text-white border border-neutral-700'
            }`}
            title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
          >
            <Monitor className="w-5 h-5" />
          </button>

          {/* 4. Call Recording Button */}
          <button
            type="button"
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md cursor-pointer btn-icon-smooth ${
              isRecording
                ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse ring-2 ring-red-400'
                : 'bg-neutral-850 hover:bg-neutral-750 text-neutral-300 hover:text-white border border-neutral-700'
            }`}
            title={isRecording ? 'Stop recording call' : 'Start recording call'}
          >
            {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Circle className="w-5 h-5 text-red-400" />}
          </button>

          {/* 5. Reactions Button */}
          <button
            type="button"
            onClick={() => {
              setIsReactionsOpen(prev => !prev);
              setIsEffectsMenuOpen(false);
            }}
            className="w-11 h-11 rounded-full bg-neutral-850 hover:bg-neutral-750 text-neutral-300 hover:text-white border border-neutral-700 flex items-center justify-center shadow-md cursor-pointer btn-icon-smooth"
            title="Send reaction"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* 6. Video Filters & Effects Button */}
          <button
            type="button"
            onClick={() => {
              setIsEffectsMenuOpen(prev => !prev);
              setIsReactionsOpen(false);
            }}
            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md cursor-pointer btn-icon-smooth ${
              isEffectsMenuOpen || activeFilter !== 'none' || backgroundEffect !== 'none'
                ? 'bg-emerald-500 text-black'
                : 'bg-neutral-850 hover:bg-neutral-750 text-neutral-300 hover:text-white border border-neutral-700'
            }`}
            title="Visual filters and background"
          >
            <Wand2 className="w-5 h-5" />
          </button>

          {/* 7. Leave / End Call Button */}
          {isHost ? (
            <button
              type="button"
              onClick={handleEndCallForEveryone}
              className="px-5 h-11 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-2 shadow-xl shadow-red-950/60 cursor-pointer ml-2 btn-danger-smooth"
              title="End call for everyone"
            >
              <PhoneOff className="w-5 h-5" />
              <span className="text-xs font-bold">End Call</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLeaveOnly}
              className="px-5 h-11 rounded-full bg-neutral-800 hover:bg-neutral-750 text-neutral-200 hover:text-white font-medium flex items-center gap-2 shadow-lg border border-neutral-700 cursor-pointer ml-2 btn-icon-smooth"
              title="Leave call"
            >
              <PhoneOff className="w-5 h-5 text-red-400" />
              <span className="text-xs font-semibold">Leave</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoCallModal;
