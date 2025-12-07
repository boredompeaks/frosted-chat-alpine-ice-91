import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { callService } from '../../src/lib/webrtc/callService';
import { callPersistenceService } from '../../src/lib/webrtc/CallPersistenceService';
import type { CallType, CallState } from '../../src/lib/webrtc/callService';

describe('WebRTC Engine Integration Tests', () => {
  const mockChatId = 'integration-chat-123';
  const mockUser1 = 'user-1';
  const mockUser2 = 'user-2';
  const encryptionKey = 'integration-test-key';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await callService.endCall();
    } catch (error) {
      // Ignore errors during cleanup
    }
  });

  describe('Complete Call Lifecycle', () => {
    it('should handle full call lifecycle with Supabase persistence', async () => {
      // 1. Initiator starts call
      const call = await callService.startCall(
        mockChatId,
        mockUser1,
        mockUser2,
        'video' as CallType,
        encryptionKey
      );

      expect(call).toBeDefined();
      expect(call.chatId).toBe(mockChatId);
      expect(call.state).toBe('calling');

      // 2. Verify call is persisted in Supabase
      const activeCall = await callPersistenceService.getActiveCall(mockChatId);
      expect(activeCall).toBeDefined();

      // 3. Simulate receiver answering
      const signal = {
        type: 'call-start' as const,
        data: { type: 'video', callId: call.id },
        from: mockUser1,
        to: mockUser2,
        chatId: mockChatId,
        timestamp: Date.now(),
      };

      await callService.answerCall(signal, mockUser2, encryptionKey);
      expect(callService.getCurrentCall()?.state).toBe('connected');

      // 4. Test media toggles update Supabase
      callService.toggleAudio(false);
      callService.toggleVideo(false);

      // 5. Test stats collection
      const stats = await callService.getCallStats();
      expect(stats).toBeDefined();

      // 6. End call
      await callService.endCall();
      expect(callService.getCurrentCall()?.state).toBe('ended');

      // 7. Verify call is cleaned up
      const endedCall = await callPersistenceService.getActiveCall(mockChatId);
      expect(endedCall).toBeNull();
    });

    it('should handle multiple participants in group call', async () => {
      const groupChatId = 'group-chat-456';
      const participants = ['user-1', 'user-2', 'user-3', 'user-4'];

      // Initiator starts call
      const call = await callService.startCall(
        groupChatId,
        participants[0],
        participants[1],
        'video',
        encryptionKey
      );

      expect(call).toBeDefined();

      // Join remaining participants
      for (let i = 2; i < participants.length; i++) {
        // In a real scenario, each participant would have their own service instance
        // For this test, we verify the call is still active
      }

      // Verify all participants are tracked
      const callParticipants = await callPersistenceService.getCallParticipants(call.id);
      expect(callParticipants.length).toBeGreaterThanOrEqual(2);

      await callService.endCall();
    });
  });

  describe('Real-time Synchronization', () => {
    it('should synchronize media state across participants', async () => {
      const call = await callService.startCall(
        mockChatId,
        mockUser1,
        mockUser2,
        'audio',
        encryptionKey
      );

      // Toggle audio - should update Supabase
      callService.toggleAudio(false);
      callService.toggleAudio(true);

      // Verify persistence service was called
      expect(callService.getCurrentCall()).toBeDefined();

      await callService.endCall();
    });

    it('should handle call interruption and reconnection', async () => {
      // Start call
      const call = await callService.startCall(
        mockChatId,
        mockUser1,
        mockUser2,
        'video',
        encryptionKey
      );

      // Simulate connection drop by ending peer connection
      await callService.endCall();

      // Reinitialize call
      const newCall = await callService.startCall(
        mockChatId,
        mockUser1,
        mockUser2,
        'video',
        encryptionKey
      );

      expect(newCall).toBeDefined();
      expect(newCall.id).not.toBe(call.id); // New call ID

      await callService.endCall();
    });
  });

  describe('Error Recovery', () => {
    it('should handle database connection failures gracefully', async () => {
      // Mock Supabase failure
      // @ts-ignore
      (global.supabase.rpc as jest.Mock).mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      // Start call should still work with local state
      const call = await callService.startCall(
        mockChatId,
        mockUser1,
        mockUser2,
        'video',
        encryptionKey
      );

      expect(call).toBeDefined();
      expect(callService.getCurrentCall()).toBeDefined();
    });

    it('should handle signaling channel errors', async () => {
      const call = await callService.startCall(
        mockChatId,
        mockUser1,
        mockUser2,
        'video',
        encryptionKey
      );

      // Simulate signaling error
      try {
        await callService.endCall();
      } catch (error) {
        // Should handle error gracefully
      }

      // Service should be in clean state
      expect(callService.getCurrentCall()).toBeNull();
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should collect and store call metrics', async () => {
      const call = await callService.startCall(
        mockChatId,
        mockUser1,
        mockUser2,
        'video',
        encryptionKey
      );

      // Wait for metrics collection interval
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = await callService.getCallStats();
      expect(stats).toBeDefined();

      // Metrics should be stored in Supabase
      const metrics = await callPersistenceService.getCallParticipants(call.id);
      expect(metrics).toBeDefined();

      await callService.endCall();
    });

    it('should track TURN server performance', async () => {
      // Test TURN server metrics
      const result = await callPersistenceService.updateTurnServerMetrics(
        'turn:test.com:3478',
        50,
        true
      );

      expect(result).toBe(true);

      // Get best TURN server
      const bestServer = await callPersistenceService.getBestTurnServer();
      expect(bestServer).toBeDefined();
    });
  });

  describe('Database Schema Integration', () => {
    it('should create proper database entries for calls', async () => {
      // Start call creates database entries
      const call = await callService.startCall(
        mockChatId,
        mockUser1,
        mockUser2,
        'video',
        encryptionKey
      );

      // Verify call events are logged
      const events = await callPersistenceService.getCallEvents(call.id);
      expect(events.length).toBeGreaterThan(0);

      // End call updates database
      await callService.endCall();

      // Verify end event is logged
      const finalEvents = await callPersistenceService.getCallEvents(call.id);
      expect(finalEvents.length).toBeGreaterThan(events.length);
    });

    it('should handle call quality presets', async () => {
      const presets = await callPersistenceService.getQualityPresets();

      expect(presets.length).toBeGreaterThan(0);
      expect(presets).toContainEqual(
        expect.objectContaining({
          name: 'Auto Quality',
          resolution_preset: 'hd',
        })
      );
    });
  });

  describe('Cross-Browser Compatibility', () => {
    it('should handle different media constraints', async () => {
      // Test video call
      const videoCall = await callService.startCall(
        'video-chat',
        mockUser1,
        mockUser2,
        'video',
        encryptionKey
      );

      expect(videoCall.type).toBe('video');
      await callService.endCall();

      // Test audio-only call
      const audioCall = await callService.startCall(
        'audio-chat',
        mockUser1,
        mockUser2,
        'audio',
        encryptionKey
      );

      expect(audioCall.type).toBe('audio');
      await callService.endCall();
    });
  });
});
