import { jest } from "@jest/globals";

// Setup global objects for jsdom
(global as any).navigator = {
  mediaDevices: {
    getUserMedia: jest.fn().mockImplementation(() => {
      return Promise.resolve(new (global as any).MediaStream());
    }),
  },
};

// Mock WebRTC and Media APIs
global.MediaStream = class MediaStream {
  private tracks: any[] = [];

  addTrack(track: any) {
    this.tracks.push(track);
  }

  removeTrack(track: any) {
    this.tracks = this.tracks.filter((t) => t !== track);
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }

  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
} as any;

global.MediaStreamTrack = class MediaStreamTrack {
  kind: "audio" | "video" = "video";
  enabled: boolean = true;
  id: string = Math.random().toString(36);
  label: string = "Mock Track";
  muted: boolean = false;
  readyState: "live" | "ended" = "live";

  stop() {
    this.readyState = "ended";
  }
} as any;

// Mock SimplePeer
jest.mock("simple-peer", () => {
  return jest.fn().mockImplementation(() => {
    return {
      on: jest.fn(),
      signal: jest.fn(),
      connect: jest.fn(),
      destroy: jest.fn(),
      replaceTrack: jest.fn(),
      _pc: {
        // @ts-ignore
        getStats: jest.fn().mockResolvedValue(new Map<any, any>()),
        connectionState: "connected",
        iceConnectionState: "connected",
        signalingState: "stable",
      },
    };
  });
});

// Mock Supabase
(global as any).supabase = {
  channel: jest.fn().mockReturnValue({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn(),
    send: jest.fn(),
    unsubscribe: jest.fn(),
  }),
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  }),
  rpc: jest.fn(),
  removeChannel: jest.fn(),
  getChannels: jest.fn().mockReturnValue([]),
};

// Global test utilities
(global as any).testUtils = {
  createMockMediaStream: () => {
    const stream = new (global as any).MediaStream();
    const audioTrack = new (global as any).MediaStreamTrack();
    audioTrack.kind = "audio";
    audioTrack.enabled = true;
    audioTrack.id = "audio-1";
    const videoTrack = new (global as any).MediaStreamTrack();
    videoTrack.kind = "video";
    videoTrack.enabled = true;
    videoTrack.id = "video-1";
    stream.addTrack(audioTrack);
    stream.addTrack(videoTrack);
    return stream;
  },
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});
