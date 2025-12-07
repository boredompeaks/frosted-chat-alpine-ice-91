import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { callPersistenceService } from '../../src/lib/webrtc/CallPersistenceService';
import type { CallMetrics } from '../../src/lib/webrtc/CallPersistenceService';

describe('CallPersistenceService', () => {
  const mockChatId = 'chat-123';
  const mockCallId = 'call-456';
  const mockUserId = 'user-789';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getActiveCall', () => {
    it('should return active call for a chat', async () => {
      const mockActiveCall = {
        call_id: mockCallId,
        call_type: 'video',
        call_status: 'active',
        initiator: mockUserId,
        started_at: new Date().toISOString(),
      };

      // @ts-ignore
      (global.supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [mockActiveCall],
        error: null,
      });

      const result = await callPersistenceService.getActiveCall(mockChatId);

      expect(result).toEqual(mockActiveCall);
      expect(global.supabase.rpc).toHaveBeenCalledWith('get_active_call', {
        p_chat_id: mockChatId,
      });
    });

    it('should return null when no active call exists', async () => {
      // @ts-ignore
      (global.supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await callPersistenceService.getActiveCall(mockChatId);

      expect(result).toBeNull();
    });
  });

  describe('initiateCall', () => {
    it('should create a new call and return callId', async () => {
      // Mock chat update
      // @ts-ignore
      (global.supabase.from as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      // @ts-ignore
      (global.supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: 'call-event-id',
        error: null,
      });

      const result = await callPersistenceService.initiateCall(
        mockChatId,
        'video',
        mockUserId
      );

      expect(result).toBeTruthy();
      expect(result).toContain('call-');
      expect(global.supabase.from).toHaveBeenCalledWith('chats');
    });

    it('should return null when database update fails', async () => {
      // @ts-ignore
      (global.supabase.from as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: new Error('DB Error') }),
        }),
      });

      const result = await callPersistenceService.initiateCall(
        mockChatId,
        'audio',
        mockUserId
      );

      expect(result).toBeNull();
    });
  });

  describe('joinCall', () => {
    it('should successfully join a call', async () => {
      // @ts-ignore
      (global.supabase.from as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      // @ts-ignore
      (global.supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: 'event-id',
        error: null,
      });

      const result = await callPersistenceService.joinCall(
        mockChatId,
        mockCallId,
        mockUserId,
        'receiver'
      );

      expect(result).toBe(true);
      expect(global.supabase.from).toHaveBeenCalledWith('chat_participants');
    });
  });

  describe('leaveCall', () => {
    it('should leave call and end if all participants have left', async () => {
      // Mock participant update
      // @ts-ignore
      (global.supabase.from as jest.Mock)
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ call_status: 'ended' }, { call_status: 'ended' }],
              error: null,
            }),
          }),
        })
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        });

      // Mock call end
      // @ts-ignore
      (global.supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: 'event-id',
        error: null,
      });

      const result = await callPersistenceService.leaveCall(
        mockChatId,
        mockCallId,
        mockUserId
      );

      expect(result).toBe(true);
    });
  });

  describe('endCall', () => {
    it('should end call for all participants', async () => {
      // Mock chat update
      // @ts-ignore
      (global.supabase.from as jest.Mock)
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        })
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        });

      // @ts-ignore
      (global.supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: 'event-id',
        error: null,
      });

      const result = await callPersistenceService.endCall(mockChatId, mockCallId);

      expect(result).toBe(true);
    });
  });

  describe('updateParticipantMedia', () => {
    it('should update participant media state', async () => {
      // @ts-ignore
      (global.supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { media_enabled: { audio: true, video: false, screen: false } },
              error: null,
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const result = await callPersistenceService.updateParticipantMedia(
        mockChatId,
        mockUserId,
        { video: true }
      );

      expect(result).toBe(true);
    });
  });

  describe('getCallParticipants', () => {
    it('should return list of call participants', async () => {
      const mockParticipants = [
        {
          user_id: mockUserId,
          username: 'testuser',
          call_status: 'connected',
          call_role: 'receiver',
          media_enabled: { audio: true, video: true, screen: false },
          joined_at: new Date().toISOString(),
          left_at: null,
        },
      ];

      // @ts-ignore
      (global.supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: mockParticipants,
        error: null,
      });

      const result = await callPersistenceService.getCallParticipants(mockCallId);

      expect(result).toEqual(mockParticipants);
      expect(result.length).toBe(1);
    });
  });

  describe('insertCallMetrics', () => {
    it('should successfully insert call metrics', async () => {
      const mockMetrics: CallMetrics = {
        connectionQuality: 'good',
        latencyMs: 50,
        jitterMs: 5,
        packetLossPercent: 0.5,
        videoWidth: 1280,
        videoHeight: 720,
        videoFrameRate: 30,
        audioBitrateKbps: 64,
        videoBitrateKbps: 1000,
        bytesReceived: 1024000,
        bytesSent: 512000,
        packetsReceived: 1000,
        packetsSent: 500,
        packetsLost: 5,
        iceConnectionState: 'connected',
        peerConnectionState: 'connected',
        signalingState: 'stable',
        cpuUsagePercent: 15,
        memoryUsageMb: 50,
        turnServerUsed: 'turn:example.com:3478',
        turnLatencyMs: 30,
      };

      // @ts-ignore
      (global.supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const result = await callPersistenceService.insertCallMetrics(
        mockCallId,
        mockChatId,
        mockUserId,
        mockMetrics
      );

      expect(result).toBe(true);
      expect(global.supabase.from).toHaveBeenCalledWith('call_metrics');
    });
  });

  describe('updateTurnServerMetrics', () => {
    it('should update TURN server metrics', async () => {
      // @ts-ignore
      (global.supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { total_connections: 10, active_connections: 9 },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const result = await callPersistenceService.updateTurnServerMetrics(
        'turn:example.com:3478',
        30,
        true
      );

      expect(result).toBe(true);
    });
  });

  describe('getBestTurnServer', () => {
    it('should return best TURN server based on metrics', async () => {
      const mockMetrics = [
        { server_url: 'turn:server1.com:3478', latency_ms: 20, success_rate: 95 },
        { server_url: 'turn:server2.com:3478', latency_ms: 30, success_rate: 90 },
      ];

      // @ts-ignore
      (global.supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: mockMetrics, error: null }),
            }),
          }),
        }),
      });

      const result = await callPersistenceService.getBestTurnServer();

      expect(result).toBe('turn:server1.com:3478');
    });
  });

  describe('logCallEvent', () => {
    it('should log call event successfully', async () => {
      // @ts-ignore
      (global.supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: 'event-id',
        error: null,
      });

      const result = await callPersistenceService.logCallEvent(
        mockCallId,
        mockChatId,
        'call_connected',
        mockUserId,
        { duration: 100 }
      );

      expect(result).toBe('event-id');
      expect(global.supabase.rpc).toHaveBeenCalledWith('log_call_event', {
        p_call_id: mockCallId,
        p_chat_id: mockChatId,
        p_event_type: 'call_connected',
        p_user_id: mockUserId,
        p_event_data: { duration: 100 },
      });
    });
  });

  describe('subscribeToCall', () => {
    it('should subscribe to call updates', () => {
      const mockChannel = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn().mockResolvedValue(undefined),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      // @ts-ignore
      (global.supabase.channel as jest.Mock).mockReturnValue(mockChannel);

      const callbacks = {
        onParticipantUpdate: jest.fn(),
        onCallEnded: jest.fn(),
        onMetricsUpdate: jest.fn(),
      };

      const result = callPersistenceService.subscribeToCall(mockChatId, callbacks);

      expect(result).toBe(mockChannel);
      expect(global.supabase.channel).toHaveBeenCalledWith(`call-updates-${mockChatId}`);
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe from all channels', () => {
      const mockChannel = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      // @ts-ignore
      callPersistenceService.channel = mockChannel as any;

      callPersistenceService.cleanup();

      expect(mockChannel.unsubscribe).toHaveBeenCalled();
    });
  });
});
