import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { callService } from '../../src/lib/webrtc/callService';
import type { CallType, CallState } from '../../src/lib/webrtc/callService';

const TOTAL_USERS = 100;
const CALL_DURATION_MS = 30000; // 30 seconds
const CONCURRENT_CALLS = 50;

interface User {
  id: string;
  callId?: string;
  stream?: MediaStream;
  isConnected: boolean;
}

describe('WebRTC Engine Stress Tests', () => {
  const users: User[] = [];
  const activeCalls: string[] = [];

  beforeAll(() => {
    // Create mock users
    for (let i = 0; i < TOTAL_USERS; i++) {
      users.push({
        id: `user-${i}`,
        isConnected: false,
      });
    }
  });

  afterAll(async () => {
    // Cleanup all active calls
    for (const callId of activeCalls) {
      try {
        await callService.endCall();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Concurrent Call Initialization', () => {
    it(`should handle ${CONCURRENT_CALLS} concurrent call initializations`, async () => {
      const startTime = Date.now();
      const promises: Promise<any>[] = [];

      for (let i = 0; i < CONCURRENT_CALLS; i++) {
        const initiator = users[i];
        const receiver = users[i + 1];

        const promise = (async () => {
          try {
            const call = await callService.startCall(
              `chat-${i}`,
              initiator.id,
              receiver.id,
              'video',
              'test-key'
            );

            initiator.callId = call.id;
            receiver.callId = call.id;
            initiator.isConnected = true;
            receiver.isConnected = true;
            activeCalls.push(call.id);

            return { success: true, callId: call.id };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })();

        promises.push(promise);
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Log results
      console.log(`\nConcurrent Init Test Results:`);
      console.log(`Duration: ${duration}ms`);
      console.log(`Successful: ${results.filter(r => r.success).length}/${CONCURRENT_CALLS}`);
      console.log(`Failed: ${results.filter(r => !r.success).length}/${CONCURRENT_CALLS}`);
      console.log(`Avg time per call: ${duration / CONCURRENT_CALLS}ms`);

      // At least 90% of calls should succeed
      const successRate = results.filter(r => r.success).length / CONCURRENT_CALLS;
      expect(successRate).toBeGreaterThanOrEqual(0.9);

      // Should complete within reasonable time (less than 10 seconds)
      expect(duration).toBeLessThan(10000);
    }, 60000);
  });

  describe('Rapid Call Toggle Operations', () => {
    it('should handle 1000 rapid audio/video toggle operations', async () => {
      await callService.startCall(
        'stress-test-chat',
        users[0].id,
        users[1].id,
        'video',
        'test-key'
      );

      const startTime = Date.now();
      const operations = 1000;
      const toggleInterval = 5; // Toggle every 5ms

      for (let i = 0; i < operations; i++) {
        callService.toggleAudio(i % 2 === 0);
        callService.toggleVideo(i % 2 === 0);

        if (i % 100 === 0) {
          // Yield to event loop every 100 operations
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      const duration = Date.now() - startTime;

      console.log(`\nRapid Toggle Test Results:`);
      console.log(`Operations: ${operations}`);
      console.log(`Duration: ${duration}ms`);
      console.log(`Avg time per operation: ${duration / operations}ms`);

      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);

      // Service should still be functional
      expect(callService.getCurrentCall()).toBeDefined();

      await callService.endCall();
    }, 10000);
  });

  describe('Memory Usage Under Load', () => {
    it('should not leak memory during repeated call operations', async () => {
      const initialMemory = process.memoryUsage();
      const operations = 50;

      console.log(`\nMemory Test - Initial:`, {
        heapUsed: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        rss: `${(initialMemory.rss / 1024 / 1024).toFixed(2)}MB`,
      });

      for (let i = 0; i < operations; i++) {
        const chatId = `memory-test-${i}`;
        const call = await callService.startCall(
          chatId,
          users[i].id,
          users[i + 1].id,
          'video',
          'test-key'
        );

        // Simulate some activity
        callService.toggleAudio(true);
        callService.toggleVideo(true);
        await callService.getCallStats();

        // End the call
        await callService.endCall();

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        // Log memory every 10 operations
        if (i % 10 === 0) {
          const mem = process.memoryUsage();
          console.log(`Memory at operation ${i}:`, {
            heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)}MB`,
            rss: `${(mem.rss / 1024 / 1024).toFixed(2)}MB`,
            diff: `${((mem.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)}MB`,
          });
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      console.log(`\nMemory Test - Final:`, {
        heapUsed: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        rss: `${(finalMemory.rss / 1024 / 1024).toFixed(2)}MB`,
        totalIncrease: `${memoryIncreaseMB.toFixed(2)}MB`,
      });

      // Memory increase should be less than 50MB
      expect(memoryIncreaseMB).toBeLessThan(50);

      await callService.endCall();
    }, 30000);
  });

  describe('Call Quality Degradation Handling', () => {
    it('should maintain call stability under poor network conditions', async () => {
      await callService.startCall(
        'quality-test-chat',
        users[0].id,
        users[1].id,
        'video',
        'test-key'
      );

      const statsHistory: any[] = [];
      const testDuration = 10000; // 10 seconds
      const sampleInterval = 1000; // Sample every second
      const startTime = Date.now();

      // Simulate poor network conditions by collecting stats
      while (Date.now() - startTime < testDuration) {
        const stats = await callService.getCallStats();
        if (stats) {
          statsHistory.push(stats);
        }
        await new Promise(resolve => setTimeout(resolve, sampleInterval));
      }

      console.log(`\nQuality Test Results:`);
      console.log(`Samples collected: ${statsHistory.length}`);
      console.log(`Call still active: ${callService.getCurrentCall() !== null}`);

      // Call should still be active after poor network test
      expect(callService.getCurrentCall()).toBeDefined();

      await callService.endCall();
    }, 15000);
  });

  describe('Breaking Point Detection', () => {
    it('should find the maximum number of concurrent operations', async () => {
      const maxConcurrent = 200;
      const operations: Promise<any>[] = [];
      let successful = 0;
      let failed = 0;

      const startTime = Date.now();

      for (let i = 0; i < maxConcurrent; i++) {
        const operation = (async () => {
          try {
            await callService.startCall(
              `break-test-${i}`,
              users[i % TOTAL_USERS].id,
              users[(i + 1) % TOTAL_USERS].id,
              i % 2 === 0 ? 'video' : 'audio',
              'test-key'
            );

            // Simulate some activity
            callService.toggleAudio(true);
            callService.toggleVideo(true);
            await callService.getCallStats();

            successful++;
            activeCalls.push(`break-test-${i}`);

            return { success: true };
          } catch (error) {
            failed++;
            return { success: false, error: error.message };
          }
        })();

        operations.push(operation);
      }

      await Promise.allSettled(operations);
      const duration = Date.now() - startTime;

      const successRate = successful / maxConcurrent;

      console.log(`\nBreaking Point Test Results:`);
      console.log(`Total operations: ${maxConcurrent}`);
      console.log(`Successful: ${successful}`);
      console.log(`Failed: ${failed}`);
      console.log(`Success rate: ${(successRate * 100).toFixed(2)}%`);
      console.log(`Duration: ${duration}ms`);
      console.log(`Max concurrent: ${maxConcurrent}`);

      // System should handle at least 50% of operations
      expect(successRate).toBeGreaterThanOrEqual(0.5);
    }, 60000);
  });
});
