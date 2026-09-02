import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../api/supabase';

// Multi-provider STUN/TURN configuration with dynamic environment support & candidate pooling
const getIceServers = () => {
  const customIce = typeof import.meta !== 'undefined' && import.meta.env?.VITE_ICE_SERVERS_JSON;
  if (customIce) {
    try {
      const parsed = JSON.parse(customIce);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn('[WebRTC] Failed to parse VITE_ICE_SERVERS_JSON:', e);
    }
  }

  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ];

  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURN_URL) {
    servers.push({
      urls: import.meta.env.VITE_TURN_URL,
      username: import.meta.env.VITE_TURN_USERNAME || '',
      credential: import.meta.env.VITE_TURN_PASSWORD || ''
    });
  }

  return servers;
};

const RTC_CONFIG = {
  iceServers: getIceServers(),
  iceCandidatePoolSize: 10
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

  // Refs for WebRTC Perfect Negotiation & Audio Analysis
  const peerConnectionsRef = useRef({}); // { [peerId]: RTCPeerConnection }
  const makingOfferRef = useRef({}); // { [peerId]: boolean }
  const ignoreOfferRef = useRef({}); // { [peerId]: boolean }
  const remoteStreamsRef = useRef({}); // { [peerId]: MediaStream }
  const remoteAnalysersRef = useRef({}); // { [peerId]: { analyser, interval } }
  const iceCandidatesQueueRef = useRef({}); // { [peerId]: RTCIceCandidate[] }

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
  const speakingIntervalRef = useRef(null);

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
      }).catch(err => console.warn('[WebRTC] Supabase signal error:', err));
    }

    // 2. BroadcastChannel for same-browser cross-tab synchronization
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage(fullPayload);
      } catch {}
    }
  }, [currentUser]);

  // Synchronize remote peer state with active MediaStream tracks
  const updatePeerState = useCallback((remotePeerId, extra = {}) => {
    const stream = remoteStreamsRef.current[remotePeerId] || null;
    const videoTracks = stream ? stream.getVideoTracks() : [];
    const hasLiveVideo = videoTracks.some(t => t.readyState === 'live' && t.enabled);

    setPeers(prev => {
      const existing = prev[remotePeerId] || {};
      return {
        ...prev,
        [remotePeerId]: {
          ...existing,
          id: remotePeerId,
          stream: stream ? new MediaStream(stream.getTracks()) : null,
          isVideoOff: extra.isVideoOff !== undefined ? extra.isVideoOff : (!hasLiveVideo),
          isAudioMuted: extra.isAudioMuted !== undefined ? extra.isAudioMuted : (existing.isAudioMuted || false),
          isScreenSharing: extra.isScreenSharing !== undefined ? extra.isScreenSharing : (existing.isScreenSharing || false),
          ...extra
        }
      };
    });
  }, []);

  // Setup speaking detection for a remote peer's audio stream
  const attachRemoteAudioAnalyser = useCallback((remotePeerId, stream) => {
    if (!stream) return;
    try {
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) return;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContextClass();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      // Cleanup existing analyser if any
      if (remoteAnalysersRef.current[remotePeerId]?.interval) {
        clearInterval(remoteAnalysersRef.current[remotePeerId].interval);
      }

      const audioCtx = audioContextRef.current;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let wasSpeaking = false;

      const interval = setInterval(() => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        const isSpeaking = avg > 28;

        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          setPeers(prev => {
            if (!prev[remotePeerId]) return prev;
            return {
              ...prev,
              [remotePeerId]: {
                ...prev[remotePeerId],
                isSpeaking
              }
            };
          });
        }
      }, 100);

      remoteAnalysersRef.current[remotePeerId] = { analyser, interval };
    } catch (err) {
      console.warn('[WebRTC] Remote audio analyser notice:', err);
    }
  }, []);

  // Create an RTCPeerConnection with W3C Perfect Negotiation
  const createPeerConnection = useCallback((remotePeerId, remoteUser) => {
    if (peerConnectionsRef.current[remotePeerId]) {
      return peerConnectionsRef.current[remotePeerId];
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionsRef.current[remotePeerId] = pc;
    makingOfferRef.current[remotePeerId] = false;
    ignoreOfferRef.current[remotePeerId] = false;

    // Initialize remote MediaStream container for this peer
    if (!remoteStreamsRef.current[remotePeerId]) {
      remoteStreamsRef.current[remotePeerId] = new MediaStream();
    }

    // Add local tracks (camera/mic or screen share) to peer connection
    const streamToSend = screenStreamRef.current || localStreamRef.current;
    if (streamToSend) {
      streamToSend.getTracks().forEach(track => {
        try {
          pc.addTrack(track, streamToSend);
        } catch (e) {
          console.warn('[WebRTC] Track add notice:', e);
        }
      });
    }

    // W3C Perfect Negotiation: onnegotiationneeded handler
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current[remotePeerId] = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);

        sendSignal({
          type: 'OFFER',
          targetId: remotePeerId,
          description: pc.localDescription,
          mediaState: {
            isAudioMuted: isAudioMutedRef.current,
            isVideoOff: isVideoOffRef.current,
            isScreenSharing: isScreenSharingRef.current
          }
        });
      } catch (err) {
        console.error('[WebRTC] Negotiation error:', err);
      } finally {
        makingOfferRef.current[remotePeerId] = false;
      }
    };

    // Handle ICE candidates generated locally
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal({
          type: 'ICE_CANDIDATE',
          targetId: remotePeerId,
          candidate
        });
      }
    };

    // Handle remote tracks arriving
    pc.ontrack = (event) => {
      const remoteStream = remoteStreamsRef.current[remotePeerId];
      if (remoteStream && event.track) {
        const existingTracks = remoteStream.getTracks();
        if (!existingTracks.some(t => t.id === event.track.id)) {
          remoteStream.addTrack(event.track);
        }

        event.track.onunmute = () => {
          updatePeerState(remotePeerId);
        };
        event.track.onended = () => {
          updatePeerState(remotePeerId);
        };

        if (event.track.kind === 'audio') {
          attachRemoteAudioAnalyser(remotePeerId, remoteStream);
        }

        updatePeerState(remotePeerId, {
          name: remoteUser?.name || 'Participant',
          email: remoteUser?.email || '',
          role: remoteUser?.role || 'MEMBER'
        });
      }
    };

    // Handle connection state changes and auto-reconnection
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        setConnectionStatus('connected');
      } else if (state === 'failed') {
        console.warn('[WebRTC] PeerConnection failed for', remotePeerId);
        const isPolite = myPeerIdRef.current > remotePeerId;
        if (isPolite && pc.restartIce) {
          pc.restartIce();
        }
      }
    };

    return pc;
  }, [sendSignal, updatePeerState, attachRemoteAudioAnalyser]);

  // Handle incoming signaling messages with Perfect Negotiation glare resolution
  const handleSignal = useCallback(async (data) => {
    if (!data || data.senderId === myPeerIdRef.current) return;
    const { type, senderId, targetId, senderUser, description, candidate, state } = data;

    // Ignore if targeted to another peer specifically
    if (targetId && targetId !== myPeerIdRef.current) return;

    try {
      if (type === 'USER_JOINED') {
        // Peer joined: create peer connection & send presence ack
        createPeerConnection(senderId, senderUser);
        sendSignal({
          type: 'PEER_PRESENCE',
          targetId: senderId,
          mediaState: {
            isAudioMuted: isAudioMutedRef.current,
            isVideoOff: isVideoOffRef.current,
            isScreenSharing: isScreenSharingRef.current
          }
        });

      } else if (type === 'PEER_PRESENCE') {
        createPeerConnection(senderId, senderUser);
        if (data.mediaState) {
          updatePeerState(senderId, {
            name: senderUser?.name || 'Participant',
            email: senderUser?.email || '',
            role: senderUser?.role || 'MEMBER',
            ...data.mediaState
          });
        }

      } else if (type === 'OFFER') {
        const pc = createPeerConnection(senderId, senderUser);
        const offerDesc = description || data.offer;
        if (!offerDesc) return;

        const isPolite = myPeerIdRef.current > senderId;
        const offerCollision = (offerDesc.type === 'offer') &&
          (makingOfferRef.current[senderId] || pc.signalingState !== 'stable');

        ignoreOfferRef.current[senderId] = !isPolite && offerCollision;
        if (ignoreOfferRef.current[senderId]) {
          console.warn('[WebRTC] Glare collision: Impolite peer ignoring offer from', senderId);
          return;
        }

        if (offerCollision && isPolite) {
          console.warn('[WebRTC] Glare collision: Polite peer rolling back for offer from', senderId);
          await pc.setLocalDescription({ type: 'rollback' });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));

        // Drain queued ICE candidates
        const queued = iceCandidatesQueueRef.current[senderId] || [];
        for (const c of queued) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          } catch (e) {
            if (!ignoreOfferRef.current[senderId]) console.warn('[WebRTC] Candidate drain error:', e);
          }
        }
        iceCandidatesQueueRef.current[senderId] = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        sendSignal({
          type: 'ANSWER',
          targetId: senderId,
          description: pc.localDescription,
          mediaState: {
            isAudioMuted: isAudioMutedRef.current,
            isVideoOff: isVideoOffRef.current,
            isScreenSharing: isScreenSharingRef.current
          }
        });

        if (data.mediaState) {
          updatePeerState(senderId, {
            name: senderUser?.name || 'Participant',
            email: senderUser?.email || '',
            role: senderUser?.role || 'MEMBER',
            ...data.mediaState
          });
        }

      } else if (type === 'ANSWER') {
        const pc = peerConnectionsRef.current[senderId];
        const answerDesc = description || data.answer;
        if (pc && answerDesc && pc.signalingState !== 'stable' && pc.signalingState !== 'closed') {
          await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));

          // Drain queued ICE candidates
          const queued = iceCandidatesQueueRef.current[senderId] || [];
          for (const c of queued) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (e) {
              if (!ignoreOfferRef.current[senderId]) console.warn('[WebRTC] Candidate drain error:', e);
            }
          }
          iceCandidatesQueueRef.current[senderId] = [];
        }

        if (data.mediaState) {
          updatePeerState(senderId, data.mediaState);
        }

      } else if (type === 'ICE_CANDIDATE') {
        const pc = peerConnectionsRef.current[senderId];
        if (pc && pc.signalingState !== 'closed' && candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
              if (!ignoreOfferRef.current[senderId]) {
                console.warn('[WebRTC] Error adding ICE candidate:', err);
              }
            }
          } else {
            if (!iceCandidatesQueueRef.current[senderId]) {
              iceCandidatesQueueRef.current[senderId] = [];
            }
            iceCandidatesQueueRef.current[senderId].push(candidate);
          }
        }

      } else if (type === 'MEDIA_STATE_CHANGE') {
        if (state) {
          updatePeerState(senderId, state);
        }

      } else if (type === 'USER_LEFT') {
        if (remoteAnalysersRef.current[senderId]?.interval) {
          clearInterval(remoteAnalysersRef.current[senderId].interval);
          delete remoteAnalysersRef.current[senderId];
        }
        if (peerConnectionsRef.current[senderId]) {
          try {
            peerConnectionsRef.current[senderId].close();
          } catch {}
          delete peerConnectionsRef.current[senderId];
        }
        delete remoteStreamsRef.current[senderId];
        delete iceCandidatesQueueRef.current[senderId];
        delete makingOfferRef.current[senderId];
        delete ignoreOfferRef.current[senderId];

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
      console.error('[WebRTC] Signal handling error:', type, err);
    }
  }, [createPeerConnection, sendSignal, updatePeerState, onCallEndedByHost]);

  // Initialize media devices and signaling channel
  useEffect(() => {
    let isCancelled = false;

    const init = async () => {
      setConnectionStatus('connecting');
      setErrorMessage('');

      try {
        // Request camera & microphone with resilient progressive fallback
        let stream;
        try {
          // 1. Try standard HD video & high-quality audio
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            },
            video: isAudioOnlyInitial ? false : {
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          });
        } catch (mediaErr) {
          console.warn('[WebRTC] Ideal media request failed, attempting basic video+audio:', mediaErr);
          if (!isAudioOnlyInitial) {
            try {
              // 2. Fallback to basic unconstrained video + audio
              stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
              });
            } catch (fallbackVideoErr) {
              console.warn('[WebRTC] Video fallback failed, falling back to audio-only:', fallbackVideoErr);
              // 3. Fallback to audio-only if camera is unavailable/denied
              stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
              });
              setIsVideoOff(true);
            }
          } else {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false
            });
            setIsVideoOff(true);
          }
        }

        if (isCancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        const hasVideoTrack = stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled;
        setIsVideoOff(!hasVideoTrack || isAudioOnlyInitial);

        localStreamRef.current = stream;
        setLocalStream(stream);

        // Ensure any existing peer connections created during async media acquisition receive tracks
        Object.values(peerConnectionsRef.current).forEach(pc => {
          if (pc.signalingState !== 'closed') {
            stream.getTracks().forEach(t => {
              const senders = pc.getSenders();
              const hasTrack = senders.some(s => s.track && s.track.kind === t.kind);
              if (!hasTrack) {
                try {
                  pc.addTrack(t, stream);
                } catch {}
              }
            });
          }
        });

        // Setup local audio analyser for speaking detection (throttled to 90ms for instant green glow)
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            const audioCtx = new AudioContextClass();
            audioContextRef.current = audioCtx;
            if (audioCtx.state === 'suspended') {
              audioCtx.resume().catch(() => {});
            }
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
            }, 90);
          }
        } catch (err) {
          console.warn('[WebRTC] Local speaking detection notice:', err);
        }

        // Setup BroadcastChannel for zero-latency cross-tab signaling
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
            config: { broadcast: { self: false }, presence: { key: myPeerIdRef.current } }
          });
          channelRef.current = channel;

          channel
            .on('broadcast', { event: 'signal' }, ({ payload }) => {
              if (payload) handleSignal(payload);
            })
            .on('presence', { event: 'sync' }, () => {
              // Trigger peer discovery when presence state synchronizes
              const state = channel.presenceState();
              Object.keys(state).forEach(peerId => {
                if (peerId !== myPeerIdRef.current && !peerConnectionsRef.current[peerId]) {
                  const presenceData = state[peerId]?.[0];
                  createPeerConnection(peerId, presenceData?.user);
                }
              });
            })
            .on('presence', { event: 'leave' }, ({ key }) => {
              if (key && key !== myPeerIdRef.current) {
                handleSignal({ type: 'USER_LEFT', senderId: key });
              }
            })
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                setConnectionStatus('connected');
                // Track own presence in call room
                channel.track({
                  peerId: myPeerIdRef.current,
                  user: {
                    id: currentUser?.id,
                    name: currentUser?.full_name || currentUser?.email?.split('@')[0] || 'Team Member',
                    email: currentUser?.email || '',
                    role: currentUser?.role || 'MEMBER'
                  },
                  joinedAt: Date.now()
                });

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
        console.error('[WebRTC] Call initialization failed:', err);
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
      Object.values(remoteAnalysersRef.current).forEach(a => {
        if (a.interval) clearInterval(a.interval);
      });
      remoteAnalysersRef.current = {};

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
      remoteStreamsRef.current = {};
      iceCandidatesQueueRef.current = {};
      makingOfferRef.current = {};
      ignoreOfferRef.current = {};

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
  }, [roomId, isAudioOnlyInitial, handleSignal, sendSignal, createPeerConnection, currentUser]);

  // Toggle Microphone (Mute/Unmute)
  const toggleAudio = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const newMuted = !audioTrack.enabled;
      setIsAudioMuted(newMuted);
      if (newMuted) setIsSpeakingLocal(false);
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
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' }
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        if (newVideoTrack) {
          localStreamRef.current.addTrack(newVideoTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

          // Add to all peer connections (fires onnegotiationneeded automatically)
          Object.values(peerConnectionsRef.current).forEach(pc => {
            try {
              pc.addTrack(newVideoTrack, localStreamRef.current);
            } catch {}
          });

          setIsVideoOff(false);
          sendSignal({
            type: 'MEDIA_STATE_CHANGE',
            state: { isVideoOff: false }
          });
        }
      } catch (err) {
        console.warn('[WebRTC] Failed to enable camera track:', err);
      }
    }
  }, [sendSignal]);

  // Toggle Screen Sharing via replaceTrack without tearing down connection
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
          video: { frameRate: { ideal: 30 } },
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
          } else {
            pc.addTrack(screenTrack, displayStream);
          }
        });

        sendSignal({
          type: 'MEDIA_STATE_CHANGE',
          state: { isScreenSharing: true }
        });

      } catch (err) {
        console.warn('[WebRTC] Screen sharing cancelled or denied:', err);
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
