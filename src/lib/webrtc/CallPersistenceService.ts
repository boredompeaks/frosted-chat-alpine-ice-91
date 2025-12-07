import { supabase } from '@/integrations/supabase/client';
import type { CallType, CallState, CallParticipant } from './callService';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface CallMetrics {
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
  latencyMs: number;
  jitterMs: number;
  packetLossPercent: number;
  videoWidth?: number;
  videoHeight?: number;
  videoFrameRate?: number;
  audioBitrateKbps?: number;
  videoBitrateKbps?: number;
  bytesSent?: number;
  bytesReceived?: number;
  packetsSent?: number;
  packetsReceived?: number;
  packetsLost?: number;
  iceConnectionState?: string;
  peerConnectionState?: string;
  signalingState?: string;
  cpuUsagePercent?: number;
  memoryUsageMb?: number;
  turnServerUsed?: string;
  turnLatencyMs?: number;
}

export interface CallParticipantInfo {
  userId: string;
  username: string;
  callStatus: CallState;
  callRole: 'initiator' | 'receiver' | 'participant';
  mediaEnabled: {
    audio: boolean;
    video: boolean;
    screen: boolean;
  };
  joinedAt?: string;
  leftAt?: string;
}

export interface CallEvent {
  callId: string;
  chatId: string;
  eventType: 'call_initiated' | 'call_ringing' | 'call_answered' | 'call_declined' |
             'call_connected' | 'call_disconnected' | 'call_ended' | 'participant_joined' |
             'participant_left' | 'media_toggled' | 'error_occurred';
  userId: string;
  eventData: any;
  timestamp: string;
}

class CallPersistenceService {
  private channel: RealtimeChannel | null = null;
  private chatId: string | null = null;

  // ============================================
  // CALL LIFECYCLE MANAGEMENT
  // ============================================

  /**
   * Get active call for a chat
   */
  async getActiveCall(chatId: string): Promise<any> {
    const { data, error } = await supabase
      .rpc('get_active_call', { p_chat_id: chatId });

    if (error) {
      console.error('Error fetching active call:', error);
      return null;
    }

    return data && data.length > 0 ? data[0] : null;
  }

  /**
   * Initiate a new call
   */
  async initiateCall(chatId: string, callType: CallType, initiatorId: string): Promise<string | null> {
    try {
      // Generate unique call ID
      const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Update chat with active call
      const { error: chatError } = await supabase
        .from('chats')
        .update({
          active_call_id: callId,
          call_type: callType,
          call_status: 'active',
          call_initiator: initiatorId,
          call_started_at: new Date().toISOString()
        })
        .eq('id', chatId);

      if (chatError) {
        console.error('Error updating chat for call initiation:', chatError);
        return null;
      }

      // Log call initiated event
      await this.logCallEvent(callId, chatId, 'call_initiated', initiatorId, {
        callType,
        timestamp: new Date().toISOString()
      });

      return callId;
    } catch (error) {
      console.error('Error initiating call:', error);
      return null;
    }
  }

  /**
   * Join an existing call
   */
  async joinCall(chatId: string, callId: string, userId: string, callRole: 'initiator' | 'receiver' | 'participant'): Promise<boolean> {
    try {
      // Update participant status
      const { error: participantError } = await supabase
        .from('chat_participants')
        .update({
          call_status: 'connected',
          call_role: callRole,
          joined_call_at: new Date().toISOString(),
          media_enabled: { audio: true, video: callRole !== 'initiator', screen: false }
        })
        .eq('chat_id', chatId)
        .eq('user_id', userId);

      if (participantError) {
        console.error('Error updating participant status:', participantError);
        return false;
      }

      // Log participant joined event
      await this.logCallEvent(callId, chatId, 'participant_joined', userId, {
        callRole,
        mediaEnabled: { audio: true, video: callRole !== 'initiator', screen: false }
      });

      return true;
    } catch (error) {
      console.error('Error joining call:', error);
      return false;
    }
  }

  /**
   * Leave a call
   */
  async leaveCall(chatId: string, callId: string, userId: string): Promise<boolean> {
    try {
      // Update participant status
      const { error: participantError } = await supabase
        .from('chat_participants')
        .update({
          call_status: 'ended',
          left_call_at: new Date().toISOString()
        })
        .eq('chat_id', chatId)
        .eq('user_id', userId);

      if (participantError) {
        console.error('Error updating participant status:', participantError);
        return false;
      }

      // Log participant left event
      await this.logCallEvent(callId, chatId, 'participant_left', userId, {});

      // Check if all participants have left
      const { data: participants } = await supabase
        .from('chat_participants')
        .select('call_status')
        .eq('chat_id', chatId);

      const allEnded = participants?.every(p => p.call_status === 'ended' || p.call_status === 'idle');

      if (allEnded) {
        await this.endCall(chatId, callId);
      }

      return true;
    } catch (error) {
      console.error('Error leaving call:', error);
      return false;
    }
  }

  /**
   * End a call for all participants
   */
  async endCall(chatId: string, callId: string): Promise<boolean> {
    try {
      // Update chat status
      const { error: chatError } = await supabase
        .from('chats')
        .update({
          call_status: 'ended',
          call_ended_at: new Date().toISOString(),
          active_call_id: null
        })
        .eq('id', chatId);

      if (chatError) {
        console.error('Error updating chat for call end:', chatError);
        return false;
      }

      // Update all participants
      const { error: participantError } = await supabase
        .from('chat_participants')
        .update({
          call_status: 'ended',
          left_call_at: new Date().toISOString()
        })
        .eq('chat_id', chatId)
        .in('call_status', ['connected', 'ringing', 'calling']);

      if (participantError) {
        console.error('Error updating participants for call end:', participantError);
      }

      // Log call ended event
      await this.logCallEvent(callId, chatId, 'call_ended', 'system', {});

      return true;
    } catch (error) {
      console.error('Error ending call:', error);
      return false;
    }
  }

  /**
   * Update participant media state (mic, camera, screen)
   */
  async updateParticipantMedia(
    chatId: string,
    userId: string,
    mediaEnabled: { audio?: boolean; video?: boolean; screen?: boolean }
  ): Promise<boolean> {
    try {
      // Get current media state
      const { data: participant } = await supabase
        .from('chat_participants')
        .select('media_enabled')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .single();

      if (!participant) {
        console.error('Participant not found');
        return false;
      }

      const updatedMedia = { ...participant.media_enabled, ...mediaEnabled };

      const { error } = await supabase
        .from('chat_participants')
        .update({ media_enabled: updatedMedia })
        .eq('chat_id', chatId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error updating participant media:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating participant media:', error);
      return false;
    }
  }

  // ============================================
  // CALL PARTICIPANTS
  // ============================================

  /**
   * Get all participants in a call
   */
  async getCallParticipants(callId: string): Promise<CallParticipantInfo[]> {
    const { data, error } = await supabase
      .rpc('get_call_participants', { p_call_id: callId });

    if (error) {
      console.error('Error fetching call participants:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Set call status for a participant (ringing, calling, etc.)
   */
  async setParticipantCallStatus(
    chatId: string,
    userId: string,
    status: CallState
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('chat_participants')
        .update({ call_status: status })
        .eq('chat_id', chatId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error setting participant call status:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error setting participant call status:', error);
      return false;
    }
  }

  // ============================================
  // METRICS AND QUALITY
  // ============================================

  /**
   * Store call quality metrics
   */
  async insertCallMetrics(
    callId: string,
    chatId: string,
    userId: string,
    metrics: CallMetrics
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('call_metrics')
        .insert({
          call_id: callId,
          chat_id: chatId,
          user_id: userId,
          connection_quality: metrics.connectionQuality,
          latency_ms: metrics.latencyMs,
          jitter_ms: metrics.jitterMs,
          packet_loss_percent: metrics.packetLossPercent,
          video_width: metrics.videoWidth,
          video_height: metrics.videoHeight,
          video_frame_rate: metrics.videoFrameRate,
          audio_bitrate_kbps: metrics.audioBitrateKbps,
          video_bitrate_kbps: metrics.videoBitrateKbps,
          bytes_sent: metrics.bytesSent,
          bytes_received: metrics.bytesReceived,
          packets_sent: metrics.packetsSent,
          packets_received: metrics.packetsReceived,
          packets_lost: metrics.packetsLost,
          ice_connection_state: metrics.iceConnectionState,
          peer_connection_state: metrics.peerConnectionState,
          signaling_state: metrics.signalingState,
          cpu_usage_percent: metrics.cpuUsagePercent,
          memory_usage_mb: metrics.memoryUsageMb,
          turn_server_used: metrics.turnServerUsed,
          turn_latency_ms: metrics.turnLatencyMs,
          measured_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error inserting call metrics:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error inserting call metrics:', error);
      return false;
    }
  }

  /**
   * Get quality presets
   */
  async getQualityPresets(): Promise<any[]> {
    const { data, error } = await supabase
      .from('call_quality_presets')
      .select('*')
      .order('is_default', { ascending: false });

    if (error) {
      console.error('Error fetching quality presets:', error);
      return [];
    }

    return data || [];
  }

  // ============================================
  // TURN SERVER TRACKING
  // ============================================

  /**
   * Update TURN server performance metrics
   */
  async updateTurnServerMetrics(
    serverUrl: string,
    latencyMs: number,
    success: boolean
  ): Promise<boolean> {
    try {
      // Get current metrics
      const { data: existing } = await supabase
        .from('turn_server_metrics')
        .select('total_connections, active_connections')
        .eq('server_url', serverUrl)
        .order('measured_at', { ascending: false })
        .limit(1)
        .single();

      const totalConnections = (existing?.total_connections || 0) + 1;
      const activeConnections = success ? (existing?.active_connections || 0) + 1 : (existing?.active_connections || 0);
      const successRate = (activeConnections / totalConnections) * 100;

      const { error } = await supabase
        .from('turn_server_metrics')
        .insert({
          server_url: serverUrl,
          latency_ms: latencyMs,
          success_rate: successRate,
          active_connections: activeConnections,
          total_connections: totalConnections
        });

      if (error) {
        console.error('Error updating TURN server metrics:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating TURN server metrics:', error);
      return false;
    }
  }

  /**
   * Get best TURN server based on latency and success rate
   */
  async getBestTurnServer(preferredRegion?: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('turn_server_metrics')
      .select('server_url, latency_ms, success_rate')
      .gte('measured_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
      .order('success_rate', { ascending: false })
      .order('latency_ms', { ascending: true })
      .limit(5);

    if (error || !data || data.length === 0) {
      return null;
    }

    // Return the best TURN server
    return data[0].server_url;
  }

  // ============================================
  // EVENT LOGGING
  // ============================================

  /**
   * Log a call event
   */
  async logCallEvent(
    callId: string,
    chatId: string,
    eventType: string,
    userId: string,
    eventData: any
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .rpc('log_call_event', {
          p_call_id: callId,
          p_chat_id: chatId,
          p_event_type: eventType,
          p_user_id: userId,
          p_event_data: eventData
        });

      if (error) {
        console.error('Error logging call event:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error logging call event:', error);
      return null;
    }
  }

  /**
   * Get call events for a specific call
   */
  async getCallEvents(callId: string): Promise<CallEvent[]> {
    const { data, error } = await supabase
      .from('call_events')
      .select('*')
      .eq('call_id', callId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error fetching call events:', error);
      return [];
    }

    return data || [];
  }

  // ============================================
  // REAL-TIME SUBSCRIPTIONS
  // ============================================

  /**
   * Subscribe to call updates for a chat
   */
  subscribeToCall(chatId: string, callbacks: {
    onParticipantUpdate?: (participant: CallParticipantInfo) => void;
    onCallEnded?: () => void;
    onMetricsUpdate?: (metrics: any) => void;
  }) {
    this.chatId = chatId;

    this.channel = supabase.channel(`call-updates-${chatId}`);

    // Subscribe to participant updates
    this.channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_participants',
        filter: `chat_id=eq.${chatId}`
      },
      async (payload) => {
        if (callbacks.onParticipantUpdate) {
          const participantData = payload.new as any;
          callbacks.onParticipantUpdate({
            userId: participantData.user_id,
            username: '', // Would need to join with profiles table
            callStatus: participantData.call_status,
            callRole: participantData.call_role,
            mediaEnabled: participantData.media_enabled,
            joinedAt: participantData.joined_call_at,
            leftAt: participantData.left_call_at
          });
        }
      }
    );

    // Subscribe to call events
    this.channel.on(
      'broadcast',
      { event: 'call-event' },
      (payload) => {
        console.log('Call event received:', payload);
      }
    );

    this.channel.subscribe();

    return this.channel;
  }

  /**
   * Unsubscribe from call updates
   */
  unsubscribeFromCall() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Cleanup resources
   */
  cleanup() {
    this.unsubscribeFromCall();
  }
}

// Export singleton instance
export const callPersistenceService = new CallPersistenceService();

export default CallPersistenceService;
