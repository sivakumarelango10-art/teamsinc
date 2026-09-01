import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../api/supabase';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export const useWebRTC = ({ roomId = 'general', currentUser, isAudioOnlyInitial = false, onCallEndedByHost }) => {
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [peers, setPeers] = useState({}); // { [peerId]: { id, name, email, role, stream, isAudioMuted, isVideoOff, isScreenSharing, isSpeaking } }
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(isAudioOnlyInitial);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeakingLocal, setIsSpeakingLocal] = useState(false);
  const [activeFilter, setActiveFilter] = useState('none');
  const [backgroundEffect, setBackgroundEffect] = useState('none');
  const [reactions, setReactions] = useState([]);
  const [inCallMessages, setInCallMessages] = useState([]);
  const [inCallFiles, setInCallFiles] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'connected' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  // Refs to avoid stale closures in event listeners
  const peerConnectionsRef = useRef({}); // { [peerId]: RTCPeerConnection }
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const myPeerIdRef = useRef(`peer_${currentUser?.id || 'usr'}_${Math.random().toString(36).substring(2, 7)}`);
  const channelRef = useRef(null);
  const broadcastChannelRef = useRef(null);
  const audioContextRef = useRef(null);
  const localAnalyserRef = useRef(null);
  const isAudioMutedRef = useRef(false);
  const isVideoOffRef = useRef(isAudioOnlyInitial);
  const isScreenSharingRef = useRef(false);
  const animFrameRef = useRef(null);
  const speakingIntervalRef = useRef(null);
  const iceCandidatesQueueRef = useRef({}); // { [peerId]: RTCIceCandidate[] }

  isAudioMutedRef.current = isAudioMuted;
  isVideoOffRef.current = isVideoOff;
  isScreenSharingRef.current = isScreenSharing;

  // Broadcast signaling message via Supabase Realtime and BroadcastChannel
  const sendSignal = useCallback((payload) => {
    const fullPayload = {
      ...payload,
      senderId: myPeerIdRef.current,
      senderUser: {
        id: currentUser?.id,
        name: currentUser?.full_name || currentUser?.email?.split('@')[0] || 'Team Member',
        email: currentUser?.email || '',
        role: currentUser?.role || 'MEMBER'
      }
    };

    // 1. Supabase Realtime channel
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'signal',
        payload: fullPayload
      }).catch(err => console.warn('Supabase signal error:', err));
    }

    // 2. BroadcastChannel for same-browser cross-tab
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage(fullPayload);
      } catch {}
    }
  }, [currentUser]);

  // Create an RTCPeerConnection for a remote peer
  const createPeerConnection = useCallback((remotePeerId, remoteUser) => {
    if (peerConnectionsRef.current[remotePeerId]) {
      return peerConnectionsRef.current[remotePeerId];
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionsRef.current[remotePeerId] = pc;

    // Add local tracks to peer connection with optimized bitrate limits
    const streamToSend = screenStreamRef.current || localStreamRef.current;
    if (streamToSend) {
      streamToSend.getTracks().forEach(track => {
        const sender = pc.addTrack(track, streamToSend);
        if (track.kind === 'audio' && sender) {
          try {
            const params = sender.getParameters();
            if (params && params.encodings && params.encodings.length > 0) {
              params.encodings[0].maxBitrate = 40000; // 40kbps crystal clear mono Opus
              params.encodings[0].priority = 'high';
              params.encodings[0].networkPriority = 'high';
              sender.setParameters(params).catch(() => {});
            }
          } catch {}
        } else if (track.kind === 'video' && sender) {
          try {
            const params = sender.getParameters();
            if (params && params.encodings && params.encodings.length > 0) {
              params.encodings[0].maxBitrate = 750000; // 750kbps prevents video packet queuing
              params.encodings[0].maxFramerate = 24;
              sender.setParameters(params).catch(() => {});
            }
          } catch {}
        }
      });
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setPeers(prev => ({
        ...prev,
        [remotePeerId]: {
          ...(prev[remotePeerId] || {}),
          id: remotePeerId,
          name: remoteUser?.name || 'Participant',
          email: remoteUser?.email || '',
          role: remoteUser?.role || 'MEMBER',
          stream: remoteStream,
          isAudioMuted: prev[remotePeerId]?.isAudioMuted || false,
          isVideoOff: prev[remotePeerId]?.isVideoOff || false,
          isScreenSharing: prev[remotePeerId]?.isScreenSharing || false,
          isSpeaking: false
        }
      }));
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type: 'ICE_CANDIDATE',
          targetId: remotePeerId,
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Retry connection or wait
      }
    };

    return pc;
  }, [sendSignal]);

  // Handle incoming signaling messages
  const handleSignal = useCallback(async (data) => {
    if (!data || data.senderId === myPeerIdRef.current) return;
    const { type, senderId, targetId, senderUser } = data;

    // Ignore if targeted to another peer specifically
    if (targetId && targetId !== myPeerIdRef.current) return;

    try {
      if (type === 'USER_JOINED') {
        // Someone joined! Add to peers state and initiate an offer as existing participant
        const pc = createPeerConnection(senderId, senderUser);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        sendSignal({
          type: 'OFFER',
          targetId: senderId,
          offer,
          mediaState: {
            isAudioMuted: isAudioMutedRef.current,
            isVideoOff: isVideoOffRef.current,
            isScreenSharing: isScreenSharingRef.current
          }
        });

      } else if (type === 'OFFER') {
        const pc = createPeerConnection(senderId, senderUser);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Drain any buffered ICE candidates for this peer
        const queuedOffer = iceCandidatesQueueRef.current[senderId] || [];
        for (const cand of queuedOffer) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.warn('Drain ICE error:', e);
          }
        }
        iceCandidatesQueueRef.current[senderId] = [];

        // Update peer media state from offer metadata
        if (data.mediaState) {
          setPeers(prev => ({
            ...prev,
            [senderId]: {
              ...(prev[senderId] || {}),
              id: senderId,
              name: senderUser?.name || 'Participant',
              email: senderUser?.email || '',
              role: senderUser?.role || 'MEMBER',
              ...data.mediaState
            }
          }));
        }

        sendSignal({
          type: 'ANSWER',
          targetId: senderId,
          answer,
          mediaState: {
            isAudioMuted: isAudioMutedRef.current,
            isVideoOff: isVideoOffRef.current,
            isScreenSharing: isScreenSharingRef.current
          }
        });

      } else if (type === 'ANSWER') {
        const pc = peerConnectionsRef.current[senderId];
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));

          // Drain buffered candidates
          const queuedAnswer = iceCandidatesQueueRef.current[senderId] || [];
          for (const cand of queuedAnswer) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {
              console.warn('Drain ICE error on answer:', e);
            }
          }
          iceCandidatesQueueRef.current[senderId] = [];
        }
        if (data.mediaState) {
          setPeers(prev => ({
            ...prev,
            [senderId]: {
              ...(prev[senderId] || {}),
              ...data.mediaState
            }
          }));
        }

      } else if (type === 'ICE_CANDIDATE') {
        const pc = peerConnectionsRef.current[senderId];
        if (pc && data.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.warn('Error adding ICE candidate:', e);
            }
          } else {
            // Buffer candidate until remote description is set
            if (!iceCandidatesQueueRef.current[senderId]) {
              iceCandidatesQueueRef.current[senderId] = [];
            }
            iceCandidatesQueueRef.current[senderId].push(data.candidate);
          }
        }

      } else if (type === 'MEDIA_STATE_CHANGE') {
        setPeers(prev => ({
          ...prev,
          [senderId]: {
            ...(prev[senderId] || {}),
            ...data.state
          }
        }));

      } else if (type === 'USER_LEFT') {
        if (peerConnectionsRef.current[senderId]) {
          try {
            peerConnectionsRef.current[senderId].close();
          } catch {}
          delete peerConnectionsRef.current[senderId];
        }
        setPeers(prev => {
          const next = { ...prev };
          delete next[senderId];
          return next;
        });

      } else if (type === 'REACTION') {
        const newReaction = {
          id: 'rx-' + Date.now() + '-' + Math.random(),
          emoji: data.emoji,
          senderName: senderUser?.name || 'Someone',
          createdAt: Date.now()
        };
        setReactions(prev => [...prev.slice(-15), newReaction]);

      } else if (type === 'IN_CALL_CHAT') {
        setInCallMessages(prev => [...prev, data.message]);

      } else if (type === 'IN_CALL_FILE') {
        setInCallFiles(prev => [...prev, data.file]);

      } else if (type === 'CALL_ENDED_BY_HOST') {
        if (onCallEndedByHost) {
          onCallEndedByHost();
        }
      }
    } catch (err) {
      console.error('Signal handling error:', type, err);
    }
  }, [createPeerConnection, sendSignal, onCallEndedByHost]);

  // Initialize media devices and signaling channel
  useEffect(() => {
    let isCancelled = false;

    const init = async () => {
      setConnectionStatus('connecting');
      setErrorMessage('');

      try {
        // Request camera & microphone with optimized constraints
        const constraints = {
          audio: {
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            channelCount: 1, // Mono audio saves 50% network bandwidth and removes audio packet lag
            sampleRate: 48000,
            latency: 0.01
          },
          video: isAudioOnlyInitial ? false : {
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: 'user'
          }
        };

        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (mediaErr) {
          console.warn('Full media request failed, attempting audio-only:', mediaErr);
          // Fallback to audio-only if video failed (e.g. no camera attached)
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1
            },
            video: false
          });
          setIsVideoOff(true);
        }

        if (isCancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        // Setup local audio analyser for speaking detection (throttled to 120ms to prevent React re-render lag)
        let speakingInterval = null;
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            const audioCtx = new AudioContextClass();
            audioContextRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            localAnalyserRef.current = analyser;

            const buffer = new Uint8Array(analyser.frequencyBinCount);
            let prevSpeaking = false;
            speakingIntervalRef.current = setInterval(() => {
              if (!localAnalyserRef.current || isCancelled) return;
              localAnalyserRef.current.getByteFrequencyData(buffer);
              let sum = 0;
              for (let i = 0; i < buffer.length; i++) sum += buffer[i];
              const avg = sum / buffer.length;
              const isSpeaking = avg > 25 && !isAudioMutedRef.current;
              if (isSpeaking !== prevSpeaking) {
                prevSpeaking = isSpeaking;
                setIsSpeakingLocal(isSpeaking);
              }
            }, 120);
          }
        } catch (err) {
          console.warn('Local speaking detection notice:', err);
        }

        // Setup BroadcastChannel for cross-tab signaling
        try {
          const bc = new BroadcastChannel(`teamsync_call_signals_${roomId}`);
          broadcastChannelRef.current = bc;
          bc.onmessage = (e) => {
            if (e.data) handleSignal(e.data);
          };
        } catch {}

        // Setup Supabase Realtime channel
        if (supabase) {
          const channel = supabase.channel(`call:signaling:${roomId}`, {
            config: { broadcast: { self: false } }
          });
          channelRef.current = channel;

          channel
            .on('broadcast', { event: 'signal' }, ({ payload }) => {
              if (payload) handleSignal(payload);
            })
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                setConnectionStatus('connected');
                // Broadcast that we have joined
                sendSignal({
                  type: 'USER_JOINED',
                  mediaState: {
                    isAudioMuted: false,
                    isVideoOff: isAudioOnlyInitial,
                    isScreenSharing: false
                  }
                });
              }
            });
        } else {
          setConnectionStatus('connected');
        }

      } catch (err) {
        console.error('Call initialization failed:', err);
        setErrorMessage(
          err.name === 'NotAllowedError'
            ? 'Camera or microphone access denied. Please grant permissions in your browser.'
            : (err.message || 'Failed to start call devices.')
        );
        setConnectionStatus('error');
      }
    };

    init();

    return () => {
      isCancelled = true;

      if (speakingIntervalRef.current) {
        clearInterval(speakingIntervalRef.current);
        speakingIntervalRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
        } catch {}
      }

      // Stop all tracks cleanly
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => {
          try {
            t.stop();
          } catch {}
        });
        localStreamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => {
          try {
            t.stop();
          } catch {}
        });
        screenStreamRef.current = null;
      }

      // Close all peer connections
      Object.values(peerConnectionsRef.current).forEach(pc => {
        try {
          pc.close();
        } catch {}
      });
      peerConnectionsRef.current = {};

      // Send USER_LEFT signal before leaving
      try {
        sendSignal({ type: 'USER_LEFT' });
      } catch {}

      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [roomId, isAudioOnlyInitial, handleSignal, sendSignal]);

  // Toggle Microphone (Mute/Unmute)
  const toggleAudio = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const newMuted = !audioTrack.enabled;
      setIsAudioMuted(newMuted);
      sendSignal({
        type: 'MEDIA_STATE_CHANGE',
        state: { isAudioMuted: newMuted }
      });
    }
  }, [sendSignal]);

  // Toggle Camera (Video On/Off)
  const toggleVideo = useCallback(async () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];

    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const newVideoOff = !videoTrack.enabled;
      setIsVideoOff(newVideoOff);
      sendSignal({
        type: 'MEDIA_STATE_CHANGE',
        state: { isVideoOff: newVideoOff }
      });
    } else {
      // If camera wasn't acquired initially (e.g. joined in audio-only mode)
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(newVideoTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

        // Add to peer connections
        Object.values(peerConnectionsRef.current).forEach(pc => {
          pc.addTrack(newVideoTrack, localStreamRef.current);
        });

        setIsVideoOff(false);
        sendSignal({
          type: 'MEDIA_STATE_CHANGE',
          state: { isVideoOff: false }
        });
      } catch (err) {
        console.warn('Failed to enable camera track:', err);
      }
    }
  }, [sendSignal]);

  // Toggle Screen Sharing
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen share
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      setScreenStream(null);
      setIsScreenSharing(false);

      // Revert video track on all peer connections back to camera
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(cameraTrack).catch(console.warn);
          }
        });
      }

      sendSignal({
        type: 'MEDIA_STATE_CHANGE',
        state: { isScreenSharing: false }
      });

    } else {
      // Start screen share
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        screenStreamRef.current = displayStream;
        setScreenStream(displayStream);
        setIsScreenSharing(true);

        const screenTrack = displayStream.getVideoTracks()[0];

        // When user stops screen sharing via browser native bar
        screenTrack.onended = () => {
          toggleScreenShare();
        };

        // Replace video track on all peer connections
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack).catch(console.warn);
          }
        });

        sendSignal({
          type: 'MEDIA_STATE_CHANGE',
          state: { isScreenSharing: true }
        });

      } catch (err) {
        console.warn('Screen sharing cancelled or denied:', err);
      }
    }
  }, [isScreenSharing, sendSignal]);

  // Send emoji reaction
  const sendReaction = useCallback((emoji) => {
    const newReaction = {
      id: 'rx-' + Date.now() + '-' + Math.random(),
      emoji,
      senderName: currentUser?.full_name || 'You',
      createdAt: Date.now()
    };
    setReactions(prev => [...prev.slice(-15), newReaction]);
    sendSignal({
      type: 'REACTION',
      emoji
    });
  }, [currentUser, sendSignal]);

  // Send in-call chat message
  const sendInCallMessage = useCallback((text) => {
    if (!text || !text.trim()) return;
    const msg = {
      id: 'icm-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      text: text.trim(),
      senderId: myPeerIdRef.current,
      senderName: currentUser?.full_name || currentUser?.email?.split('@')[0] || 'Team Member',
      senderRole: currentUser?.role || 'MEMBER',
      createdAt: new Date().toISOString()
    };

    setInCallMessages(prev => [...prev, msg]);
    sendSignal({
      type: 'IN_CALL_CHAT',
      message: msg
    });
  }, [currentUser, sendSignal]);

  // Share in-call file
  const sendInCallFile = useCallback((fileData) => {
    if (!fileData) return;
    const fileEntry = {
      id: 'icf-' + Date.now(),
      name: fileData.name,
      url: fileData.url,
      size: fileData.size,
      type: fileData.type,
      senderName: currentUser?.full_name || currentUser?.email?.split('@')[0] || 'Team Member',
      createdAt: new Date().toISOString()
    };

    setInCallFiles(prev => [...prev, fileEntry]);
    sendSignal({
      type: 'IN_CALL_FILE',
      file: fileEntry
    });
  }, [currentUser, sendSignal]);

  // Broadcast call ended by host to all peers
  const sendCallEnded = useCallback(() => {
    sendSignal({
      type: 'CALL_ENDED_BY_HOST'
    });
  }, [sendSignal]);

  return {
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
  };
};

export default useWebRTC;
