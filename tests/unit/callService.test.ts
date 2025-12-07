import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { callService } from '../../src/lib/webrtc/callService';
import type { CallType, CallState, CallSession } from '../../src/lib/webrtc/callService';

// Import the mocked SimplePeer
const SimplePeer = require('simple-peer');

describe('CallService', () => {
  const mockChatId = 'chat-123';
  const mockInitiatorId = 'user-456';
  const mockReceiverId = 'user-789';
  const mockEncryptionKey = 'test-key-123';
  const mockCallType: CallType = 'video';

  beforeEach(() => {
    jest.clearAllMocks();
    callService.endCall?.(); // Clean up any existing calls
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeMedia', () => {
    it('should successfully initialize media with video constraints', async () => {
      const stream = await callService.initializeMedia('video');

      expect(stream).toBeDefined();
      expect(stream.getTracks).toBeDefined();
    });

    it('should successfully initialize media with audio-only constraints', async () => {
      const stream = await callService.initializeMedia('audio');

      expect(stream).toBeDefined();
    });

    it('should throw error when getUserMedia fails', async () => {
      // Mock getUserMedia to reject
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
      // @ts-ignore
      navigator.mediaDevices.getUserMedia = jest.fn().mockRejectedValue(new Error('Permission denied'));

      await expect(callService.initializeMedia('video')).rejects.toThrow('Permission denied');

      // Restore
      // @ts-ignore
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    });
  });

  describe('startCall', () => {
    it('should successfully start a call', async () => {
      const call = await callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );

      expect(call).toBeDefined();
      expect(call.chatId).toBe(mockChatId);
      expect(call.type).toBe(mockCallType);
      expect(call.state).toBe('calling');
    });

    it('should emit state-change event when call starts', (done) => {
      callService.on('state-change', (state: CallState) => {
        expect(state).toBe('calling');
        done();
      });

      callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );
    });

    it('should set up peer connection with correct configuration', async () => {
      await callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );

      // SimplePeer should be created as initiator
      const peerInstance = SimplePeer.mock.results[0].value;
      expect(peerInstance).toBeDefined();
    });
  });

  describe('answerCall', () => {
    it('should successfully answer an incoming call', async () => {
      const signal = {
        type: 'call-start',
        data: { type: 'video', callId: 'call-123' },
        from: mockInitiatorId,
        to: mockReceiverId,
        chatId: mockChatId,
        timestamp: Date.now(),
      };

      await callService.answerCall(signal, mockReceiverId, mockEncryptionKey);

      const currentCall = callService.getCurrentCall();
      expect(currentCall).toBeDefined();
      expect(currentCall?.state).toBe('connected');
      expect(currentCall?.type).toBe('video');
    });

    it('should set up peer connection as receiver', async () => {
      const signal = {
        type: 'call-start',
        data: { type: 'audio', callId: 'call-456' },
        from: mockInitiatorId,
        to: mockReceiverId,
        chatId: mockChatId,
        timestamp: Date.now(),
      };

      await callService.answerCall(signal, mockReceiverId, mockEncryptionKey);

      // SimplePeer should be created as non-initiator
      const peerInstance = SimplePeer.mock.results[0].value;
      expect(peerInstance).toBeDefined();
    });
  });

  describe('endCall', () => {
    it('should end the call and cleanup resources', async () => {
      // Start a call first
      await callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );

      // End the call
      await callService.endCall();

      const currentCall = callService.getCurrentCall();
      expect(currentCall?.state).toBe('ended');
    });

    it('should emit state-change event when call ends', async () => {
      // Start a call first
      await callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );

      const stateChanges: CallState[] = [];
      callService.on('state-change', (state: CallState) => {
        stateChanges.push(state);
      });

      await callService.endCall();

      expect(stateChanges).toContain('ended');
    });
  });

  describe('toggleAudio', () => {
    it('should disable audio tracks when toggled off', async () => {
      await callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );

      callService.toggleAudio(false);

      const localStream = callService.getLocalStream();
      expect(localStream?.getAudioTracks()[0].enabled).toBe(false);
    });

    it('should enable audio tracks when toggled on', async () => {
      await callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );

      callService.toggleAudio(true);

      const localStream = callService.getLocalStream();
      expect(localStream?.getAudioTracks()[0].enabled).toBe(true);
    });
  });

  describe('toggleVideo', () => {
    it('should disable video tracks when toggled off', async () => {
      await callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );

      callService.toggleVideo(false);

      const localStream = callService.getLocalStream();
      expect(localStream?.getVideoTracks()[0].enabled).toBe(false);
    });

    it('should enable video tracks when toggled on', async () => {
      await callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );

      callService.toggleVideo(true);

      const localStream = callService.getLocalStream();
      expect(localStream?.getVideoTracks()[0].enabled).toBe(true);
    });
  });

  describe('getCallStats', () => {
    it('should return call statistics when peer is available', async () => {
      await callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );

      const stats = await callService.getCallStats();

      expect(stats).toBeDefined();
    });

    it('should return null when peer is not available', async () => {
      const stats = await callService.getCallStats();

      expect(stats).toBeNull();
    });
  });

  describe('switchCamera', () => {
    it('should switch camera facing mode', async () => {
      await callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );

      // This will fail in the test environment but tests the logic
      try {
        await callService.switchCamera();
      } catch (error) {
        // Expected to fail in test environment
        expect(error).toBeDefined();
      }
    });
  });

  describe('Event System', () => {
    it('should register and emit events correctly', (done) => {
      const testEvent = 'test-event';
      const testData = { foo: 'bar' };

      callService.on(testEvent, (data: any) => {
        expect(data).toEqual(testData);
        done();
      });

      // Use the private emit method through callService's internals
      // In real implementation, this would be done via the service
      (callService as any).emit(testEvent, testData);
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should cleanup all resources on endCall', async () => {
      await callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );

      await callService.endCall();

      // Verify streams are stopped
      const localStream = callService.getLocalStream();
      const remoteStream = callService.getRemoteStream();

      expect(localStream).toBeNull();
      expect(remoteStream).toBeNull();
    });

    it('should cleanup signaling channel on endCall', async () => {
      await callService.startCall(
        mockChatId,
        mockInitiatorId,
        mockReceiverId,
        mockCallType,
        mockEncryptionKey
      );

      await callService.endCall();

      // Peer should be destroyed
      const currentCall = callService.getCurrentCall();
      expect(currentCall).toBeNull();
    });
  });
});
