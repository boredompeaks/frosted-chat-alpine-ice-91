import SimplePeer from "simple-peer";
import { supabase } from "@/integrations/supabase/client";
import { TURN_SERVERS } from "../encryption/keyManagement";
import { encryptMessage, decryptMessage } from "../encryption/crypto";

export type CallType = "audio" | "video";
export type CallState = "idle" | "calling" | "ringing" | "connected" | "ended" | "failed";

export interface CallParticipant {
  id: string;
  username: string;
  stream?: MediaStream;
}

export interface CallSession {
  id: string;
  chatId: string;
  initiator: CallParticipant;
  receiver: CallParticipant;
  type: CallType;
  state: CallState;
  startTime?: number;
  endTime?: number;
}

export interface SignalData {
  type: "offer" | "answer" | "ice-candidate" | "call-start" | "call-end" | "call-reject";
  data: any;
  from: string;
  to: string;
  chatId: string;
  timestamp: number;
}

class CallService {
  private peer: SimplePeer.Instance | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentCall: CallSession | null = null;
  private signalingChannel: any = null;
  private encryptionKey: string | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor() {
    this.setupEventHandlers();
  }

  /**
   * Setup event handler system
   */
  private setupEventHandlers() {
    this.eventHandlers.set("state-change", []);
    this.eventHandlers.set("stream", []);
    this.eventHandlers.set("error", []);
    this.eventHandlers.set("signal", []);
    this.eventHandlers.set("ice-candidate", []);
  }

  /**
   * Register event listener
   */
  on(event: string, handler: Function) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  /**
   * Emit event
   */
  private emit(event: string, data: any) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach((handler) => handler(data));
  }

  /**
   * Initialize local media stream
   */
  async initializeMedia(type: CallType): Promise<MediaStream> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: type === "video" ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
        } : false,
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.localStream;
    } catch (error) {
      console.error("Error initializing media:", error);
      this.emit("error", { type: "media-error", error });
      throw error;
    }
  }

  /**
   * Setup signaling channel via Supabase
   */
  private setupSignalingChannel(chatId: string, userId: string, encryptionKey: string) {
    this.encryptionKey = encryptionKey;
    const channelName = `call-signaling-${chatId}`;

    this.signalingChannel = supabase.channel(channelName);

    this.signalingChannel
      .on("broadcast", { event: "signal" }, async (payload: any) => {
        try {
          const signalData: SignalData = payload.payload;

          // Only process signals meant for this user
          if (signalData.to !== userId) return;

          // Decrypt signal data if it's encrypted
          let decryptedData = signalData.data;
          if (typeof signalData.data === "string" && this.encryptionKey) {
            try {
              const parsed = JSON.parse(signalData.data);
              decryptedData = JSON.parse(
                decryptMessage(parsed.ciphertext, parsed.iv, parsed.tag, this.encryptionKey)
              );
            } catch (e) {
              // Data might not be encrypted
              decryptedData = signalData.data;
            }
          }

          await this.handleSignal({
            ...signalData,
            data: decryptedData,
          });
        } catch (error) {
          console.error("Error handling signal:", error);
        }
      })
      .subscribe();

    return this.signalingChannel;
  }

  /**
   * Send signaling data
   */
  private async sendSignal(signal: SignalData) {
    if (!this.signalingChannel) {
      console.error("Signaling channel not initialized");
      return;
    }

    try {
      // Encrypt sensitive signal data
      let signalData = signal.data;
      if (this.encryptionKey && signal.type !== "call-end" && signal.type !== "call-reject") {
        const encrypted = encryptMessage(JSON.stringify(signal.data), this.encryptionKey);
        signalData = JSON.stringify(encrypted);
      }

      await this.signalingChannel.send({
        type: "broadcast",
        event: "signal",
        payload: {
          ...signal,
          data: signalData,
        },
      });
    } catch (error) {
      console.error("Error sending signal:", error);
      this.emit("error", { type: "signaling-error", error });
    }
  }

  /**
   * Handle incoming signal
   */
  private async handleSignal(signal: SignalData) {
    try {
      switch (signal.type) {
        case "offer":
          await this.handleOffer(signal);
          break;
        case "answer":
          await this.handleAnswer(signal);
          break;
        case "ice-candidate":
          await this.handleIceCandidate(signal);
          break;
        case "call-start":
          this.emit("incoming-call", signal);
          break;
        case "call-end":
          this.endCall();
          break;
        case "call-reject":
          this.handleCallRejected();
          break;
      }
    } catch (error) {
      console.error("Error handling signal:", error);
    }
  }

  /**
   * Start a call (initiator)
   */
  async startCall(
    chatId: string,
    initiatorId: string,
    receiverId: string,
    type: CallType,
    encryptionKey: string
  ): Promise<CallSession> {
    try {
      // Initialize media
      const stream = await this.initializeMedia(type);

      // Setup signaling
      this.setupSignalingChannel(chatId, initiatorId, encryptionKey);

      // Create call session
      this.currentCall = {
        id: `call-${Date.now()}`,
        chatId,
        initiator: { id: initiatorId, username: "", stream },
        receiver: { id: receiverId, username: "" },
        type,
        state: "calling",
        startTime: Date.now(),
      };

      this.emit("state-change", this.currentCall.state);

      // Create peer connection as initiator
      this.peer = new SimplePeer({
        initiator: true,
        stream,
        trickle: true,
        config: {
          iceServers: TURN_SERVERS,
        },
      });

      this.setupPeerListeners();

      // Send call-start signal
      await this.sendSignal({
        type: "call-start",
        data: { type, callId: this.currentCall.id },
        from: initiatorId,
        to: receiverId,
        chatId,
        timestamp: Date.now(),
      });

      return this.currentCall;
    } catch (error) {
      console.error("Error starting call:", error);
      this.emit("error", { type: "call-start-error", error });
      throw error;
    }
  }

  /**
   * Answer a call (receiver)
   */
  async answerCall(
    signal: SignalData,
    userId: string,
    encryptionKey: string
  ): Promise<void> {
    try {
      const { type, callId } = signal.data;

      // Initialize media
      const stream = await this.initializeMedia(type);

      // Setup signaling
      this.setupSignalingChannel(signal.chatId, userId, encryptionKey);

      // Create call session
      this.currentCall = {
        id: callId,
        chatId: signal.chatId,
        initiator: { id: signal.from, username: "" },
        receiver: { id: userId, username: "", stream },
        type,
        state: "connected",
        startTime: Date.now(),
      };

      this.emit("state-change", this.currentCall.state);

      // Create peer connection as receiver
      this.peer = new SimplePeer({
        initiator: false,
        stream,
        trickle: true,
        config: {
          iceServers: TURN_SERVERS,
        },
      });

      this.setupPeerListeners();
    } catch (error) {
      console.error("Error answering call:", error);
      this.emit("error", { type: "answer-error", error });
      throw error;
    }
  }

  /**
   * Reject a call
   */
  async rejectCall(signal: SignalData, userId: string) {
    await this.sendSignal({
      type: "call-reject",
      data: {},
      from: userId,
      to: signal.from,
      chatId: signal.chatId,
      timestamp: Date.now(),
    });
  }

  /**
   * Setup peer event listeners
   */
  private setupPeerListeners() {
    if (!this.peer) return;

    this.peer.on("signal", async (data) => {
      if (!this.currentCall) return;

      const signalType = data.type === "offer" ? "offer" : "answer";
      await this.sendSignal({
        type: signalType,
        data,
        from: this.currentCall.initiator.id,
        to: this.currentCall.receiver.id,
        chatId: this.currentCall.chatId,
        timestamp: Date.now(),
      });
    });

    this.peer.on("stream", (stream) => {
      this.remoteStream = stream;
      this.emit("stream", { type: "remote", stream });

      if (this.currentCall) {
        this.currentCall.state = "connected";
        this.emit("state-change", this.currentCall.state);
      }
    });

    this.peer.on("connect", () => {
      console.log("Peer connected");
      if (this.currentCall) {
        this.currentCall.state = "connected";
        this.emit("state-change", this.currentCall.state);
      }
    });

    this.peer.on("error", (error) => {
      console.error("Peer error:", error);
      this.emit("error", { type: "peer-error", error });
      this.endCall();
    });

    this.peer.on("close", () => {
      console.log("Peer connection closed");
      this.endCall();
    });
  }

  /**
   * Handle offer signal
   */
  private async handleOffer(signal: SignalData) {
    if (this.peer && signal.data) {
      try {
        this.peer.signal(signal.data);
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    }
  }

  /**
   * Handle answer signal
   */
  private async handleAnswer(signal: SignalData) {
    if (this.peer && signal.data) {
      try {
        this.peer.signal(signal.data);
      } catch (error) {
        console.error("Error handling answer:", error);
      }
    }
  }

  /**
   * Handle ICE candidate
   */
  private async handleIceCandidate(signal: SignalData) {
    if (this.peer && signal.data) {
      try {
        this.peer.signal(signal.data);
      } catch (error) {
        console.error("Error handling ICE candidate:", error);
      }
    }
  }

  /**
   * Handle call rejected
   */
  private handleCallRejected() {
    if (this.currentCall) {
      this.currentCall.state = "ended";
      this.emit("state-change", this.currentCall.state);
      this.emit("call-rejected", {});
      this.cleanup();
    }
  }

  /**
   * End current call
   */
  async endCall() {
    if (this.currentCall) {
      this.currentCall.state = "ended";
      this.currentCall.endTime = Date.now();
      this.emit("state-change", this.currentCall.state);

      // Send end signal
      await this.sendSignal({
        type: "call-end",
        data: {},
        from: this.currentCall.initiator.id,
        to: this.currentCall.receiver.id,
        chatId: this.currentCall.chatId,
        timestamp: Date.now(),
      });
    }

    this.cleanup();
  }

  /**
   * Toggle audio
   */
  toggleAudio(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  /**
   * Toggle video
   */
  toggleVideo(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  /**
   * Switch camera (front/back)
   */
  async switchCamera() {
    if (!this.localStream) return;

    try {
      const videoTrack = this.localStream.getVideoTracks()[0];
      const constraints = videoTrack.getConstraints();

      // Toggle facingMode
      const newConstraints = {
        ...constraints,
        facingMode: constraints.facingMode === "user" ? "environment" : "user",
      };

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: newConstraints,
        audio: false,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];

      // Replace track in peer connection
      if (this.peer) {
        this.peer.replaceTrack(videoTrack, newVideoTrack, this.localStream);
      }

      // Stop old track
      videoTrack.stop();

      // Update local stream
      this.localStream.removeTrack(videoTrack);
      this.localStream.addTrack(newVideoTrack);
    } catch (error) {
      console.error("Error switching camera:", error);
    }
  }

  /**
   * Get call statistics
   */
  async getCallStats(): Promise<any> {
    if (!this.peer) return null;

    try {
      // @ts-ignore - SimplePeer doesn't expose _pc directly in types
      const pc = this.peer._pc;
      if (!pc) return null;

      const stats = await pc.getStats();
      const result: any = {};

      stats.forEach((report: any) => {
        if (report.type === "inbound-rtp" && report.mediaType === "video") {
          result.video = {
            bytesReceived: report.bytesReceived,
            packetsLost: report.packetsLost,
            jitter: report.jitter,
            frameRate: report.framesPerSecond,
          };
        }
        if (report.type === "inbound-rtp" && report.mediaType === "audio") {
          result.audio = {
            bytesReceived: report.bytesReceived,
            packetsLost: report.packetsLost,
            jitter: report.jitter,
          };
        }
      });

      return result;
    } catch (error) {
      console.error("Error getting call stats:", error);
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup() {
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Stop remote stream
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => track.stop());
      this.remoteStream = null;
    }

    // Destroy peer connection
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    // Unsubscribe from signaling channel
    if (this.signalingChannel) {
      this.signalingChannel.unsubscribe();
      this.signalingChannel = null;
    }

    this.currentCall = null;
    this.encryptionKey = null;
  }

  /**
   * Get current call
   */
  getCurrentCall(): CallSession | null {
    return this.currentCall;
  }

  /**
   * Get local stream
   */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * Get remote stream
   */
  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }
}

// Export singleton instance
export const callService = new CallService();

export default CallService;
