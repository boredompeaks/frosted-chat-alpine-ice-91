# CalcIta - Integration Guide

Complete guide for integrating CalcIta features into your application or extending the platform.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication Integration](#authentication-integration)
3. [Chat System Integration](#chat-system-integration)
4. [Encryption Integration](#encryption-integration)
5. [WebRTC Calling Integration](#webrtc-calling-integration)
6. [Real-time Features](#real-time-features)
7. [UI Components](#ui-components)
8. [Custom Hooks](#custom-hooks)
9. [Advanced Features](#advanced-features)
10. [Testing](#testing)
11. [Examples](#examples)

---

## Getting Started

### Prerequisites

```bash
npm install @supabase/supabase-js
npm install crypto-js
npm install simple-peer
npm install framer-motion
npm install react-router-dom
```

### Basic Setup

```typescript
// 1. Initialize Supabase client
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL!,
  process.env.REACT_APP_SUPABASE_ANON_KEY!
);

// 2. Wrap app with providers
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/providers/ThemeProvider';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        {/* Your app */}
      </AuthProvider>
    </ThemeProvider>
  );
}
```

---

## Authentication Integration

### Using Auth Context

```typescript
import { useAuth } from '@/contexts/AuthContext';

function MyComponent() {
  const { user, session, signIn, signUp, signOut } = useAuth();

  const handleLogin = async () => {
    try {
      await signIn('user@example.com', 'password123');
      // User is now authenticated
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div>
      {user ? (
        <p>Welcome, {user.email}</p>
      ) : (
        <button onClick={handleLogin}>Sign In</button>
      )}
    </div>
  );
}
```

### Custom Authentication Flow

```typescript
import { supabase } from '@/integrations/supabase/client';

// Sign up with additional metadata
async function signUpWithProfile(
  email: string,
  password: string,
  username: string
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        display_name: username,
      },
    },
  });

  if (error) throw error;
  return data;
}

// Password reset flow
async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (error) throw error;
}

// Update password
async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) throw error;
}
```

### Protected Routes

```typescript
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Usage
<Route path="/chats" element={
  <ProtectedRoute>
    <ChatListPage />
  </ProtectedRoute>
} />
```

---

## Chat System Integration

### Creating a New Chat

```typescript
import { supabase } from '@/integrations/supabase/client';
import { initializeChatKey } from '@/lib/encryption/keyManagement';

async function createChat(userId: string, recipientId: string) {
  // 1. Create chat
  const { data: chat, error: chatError } = await supabase
    .from('chats')
    .insert({
      is_group: false,
      created_by: userId,
    })
    .select()
    .single();

  if (chatError) throw chatError;

  // 2. Add participants
  const { error: participantsError } = await supabase
    .from('chat_participants')
    .insert([
      { chat_id: chat.id, user_id: userId, role: 'admin' },
      { chat_id: chat.id, user_id: recipientId, role: 'member' },
    ]);

  if (participantsError) throw participantsError;

  // 3. Initialize encryption key
  await initializeChatKey(chat.id, userId);

  return chat;
}
```

### Using the Chat Hook

```typescript
import { useChatData } from '@/hooks/useChatData';

function ChatComponent({ chatId, userId }: Props) {
  const {
    messages,
    loading,
    error,
    sendMessage,
    deleteMessage,
    markAsRead,
    loadMoreMessages,
    hasMore,
  } = useChatData(chatId, userId);

  const handleSend = async (content: string) => {
    await sendMessage(content, {
      disappearAfter: 300, // 5 minutes
      isOneTimeView: false,
    });
  };

  const handleSendWithMedia = async (content: string, mediaUrl: string) => {
    await sendMessage(content, {
      mediaUrl,
      isOneTimeView: true,
    });
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <MessageList 
        messages={messages}
        onLoadMore={hasMore ? loadMoreMessages : undefined}
      />
      <MessageInput onSend={handleSend} />
    </div>
  );
}
```

### Message Formatting

```typescript
import { formatDistanceToNow } from 'date-fns';

function MessageItem({ message }: { message: Message }) {
  const isOwn = message.sender_id === currentUserId;
  const timeAgo = formatDistanceToNow(new Date(message.created_at), {
    addSuffix: true,
  });

  return (
    <div className={`message ${isOwn ? 'own' : 'other'}`}>
      <div className="message-content">
        {message.content}
      </div>
      <div className="message-meta">
        <span className="timestamp">{timeAgo}</span>
        {message.read_at && <span className="read-indicator">✓✓</span>}
      </div>
      {message.disappear_after && (
        <CountdownTimer duration={message.disappear_after} />
      )}
    </div>
  );
}
```

---

## Encryption Integration

### Basic Message Encryption

```typescript
import {
  encryptMessage,
  decryptMessage,
  sanitizeInput,
} from '@/lib/encryption/crypto';
import { getChatKey } from '@/lib/encryption/keyManagement';

// Encrypt a message
async function encryptAndSend(
  chatId: string,
  content: string,
  userId: string
) {
  // 1. Sanitize input
  const sanitized = sanitizeInput(content);

  // 2. Get encryption key
  const key = await getChatKey(chatId);
  if (!key) throw new Error('No encryption key available');

  // 3. Encrypt
  const encrypted = encryptMessage(sanitized, key);

  // 4. Store
  const { error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      sender_id: userId,
      content: JSON.stringify(encrypted),
    });

  if (error) throw error;
}

// Decrypt a message
async function decryptMessageContent(
  encryptedContent: string,
  chatId: string
) {
  try {
    const key = await getChatKey(chatId);
    if (!key) return '[Encrypted - Key not available]';

    const parsed = JSON.parse(encryptedContent);
    const decrypted = decryptMessage(
      parsed.ciphertext,
      parsed.iv,
      parsed.tag,
      key
    );

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '[Encrypted - Unable to decrypt]';
  }
}
```

### Key Management

```typescript
import {
  generateRSAKeyPair,
  rotateKey,
  checkKeyRotation,
} from '@/lib/encryption/keyManagement';

// Generate user key pair on signup
async function setupUserEncryption(userId: string) {
  // Generate RSA key pair
  const { publicKey, privateKey } = await generateRSAKeyPair();

  // Store public key in database
  await supabase
    .from('profiles')
    .update({ public_key: publicKey })
    .eq('id', userId);

  // Store encrypted private key locally
  const masterKey = deriveKeyFromPassword(userPassword, userId);
  const encryptedPrivateKey = encryptMessage(privateKey, masterKey);
  localStorage.setItem(
    `private_key_${userId}`,
    JSON.stringify(encryptedPrivateKey)
  );

  return { publicKey, privateKey };
}

// Manual key rotation
async function manualRotateKey(
  chatId: string,
  userId: string,
  recipientId: string
) {
  // Get recipient's public key
  const { data: recipient } = await supabase
    .from('profiles')
    .select('public_key')
    .eq('id', recipientId)
    .single();

  if (!recipient?.public_key) {
    throw new Error('Recipient public key not found');
  }

  // Rotate key
  const newKey = await rotateKey(
    chatId,
    userId,
    recipientId,
    recipient.public_key
  );

  console.log('Key rotated successfully');
  return newKey;
}
```

### Using Key Rotation Hook

```typescript
import { useKeyRotation } from '@/hooks/useKeyRotation';

function ChatContainer({ chatId, userId, recipientId }: Props) {
  const [recipientPublicKey, setRecipientPublicKey] = useState<string>('');

  // Fetch recipient's public key
  useEffect(() => {
    async function fetchPublicKey() {
      const { data } = await supabase
        .from('profiles')
        .select('public_key')
        .eq('id', recipientId)
        .single();

      if (data?.public_key) {
        setRecipientPublicKey(data.public_key);
      }
    }
    fetchPublicKey();
  }, [recipientId]);

  // Setup automatic key rotation
  const {
    isRotating,
    lastRotation,
    nextRotation,
    currentKey,
    manualRotate,
  } = useKeyRotation({
    chatId,
    userId,
    recipientId,
    recipientPublicKey,
    enabled: true,
    onRotationComplete: (newKey) => {
      console.log('Key rotated:', newKey);
      toast.success('Encryption key updated');
    },
    onRotationError: (error) => {
      console.error('Rotation failed:', error);
      toast.error('Key rotation failed');
    },
  });

  return (
    <div>
      <div className="key-status">
        {isRotating && <span>Rotating key...</span>}
        {lastRotation && (
          <span>Last rotation: {lastRotation.toLocaleString()}</span>
        )}
        {nextRotation && (
          <span>Next rotation: {nextRotation.toLocaleString()}</span>
        )}
      </div>
      <button onClick={manualRotate} disabled={isRotating}>
        Rotate Key Now
      </button>
    </div>
  );
}
```

---

## WebRTC Calling Integration

### Initiating a Call

```typescript
import { callService } from '@/lib/webrtc/callService';

function CallButton({ chatId, userId, recipientId }: Props) {
  const [calling, setCalling] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const startVideoCall = async () => {
    try {
      setCalling(true);

      // Get encryption key
      const key = await getChatKey(chatId);
      if (!key) throw new Error('No encryption key');

      // Start call
      const session = await callService.startCall(
        chatId,
        userId,
        recipientId,
        'video',
        key
      );

      // Get streams
      setLocalStream(callService.getLocalStream());

      // Listen for remote stream
      callService.on('stream', ({ type, stream }) => {
        if (type === 'remote') {
          setRemoteStream(stream);
        }
      });

      // Listen for state changes
      callService.on('state-change', (state) => {
        console.log('Call state:', state);
        if (state === 'ended') {
          setCalling(false);
        }
      });

    } catch (error) {
      console.error('Failed to start call:', error);
      setCalling(false);
    }
  };

  const endCall = async () => {
    await callService.endCall();
    setCalling(false);
    setLocalStream(null);
    setRemoteStream(null);
  };

  return (
    <div>
      {!calling ? (
        <button onClick={startVideoCall}>
          📹 Video Call
        </button>
      ) : (
        <div className="call-interface">
          <video
            ref={(ref) => {
              if (ref && localStream) {
                ref.srcObject = localStream;
              }
            }}
            autoPlay
            muted
            playsInline
          />
          <video
            ref={(ref) => {
              if (ref && remoteStream) {
                ref.srcObject = remoteStream;
              }
            }}
            autoPlay
            playsInline
          />
          <button onClick={endCall}>End Call</button>
        </div>
      )}
    </div>
  );
}
```

### Answering a Call

```typescript
import { callService, SignalData } from '@/lib/webrtc/callService';

function IncomingCallModal({ signal, onAnswer, onReject }: Props) {
  const answerCall = async () => {
    try {
      const key = await getChatKey(signal.chatId);
      if (!key) throw new Error('No encryption key');

      await callService.answerCall(signal, currentUserId, key);
      
      onAnswer();
    } catch (error) {
      console.error('Failed to answer call:', error);
    }
  };

  const rejectCall = async () => {
    await callService.rejectCall(signal, currentUserId);
    onReject();
  };

  return (
    <div className="incoming-call-modal">
      <h3>Incoming {signal.data.type} call</h3>
      <button onClick={answerCall}>Answer</button>
      <button onClick={rejectCall}>Decline</button>
    </div>
  );
}

// Listen for incoming calls
useEffect(() => {
  callService.on('incoming-call', (signal: SignalData) => {
    setIncomingCall(signal);
    setShowCallModal(true);
  });
}, []);
```

### Call Controls

```typescript
function CallControls({ callService }: Props) {
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const toggleAudio = () => {
    const newState = !audioEnabled;
    callService.toggleAudio(newState);
    setAudioEnabled(newState);
  };

  const toggleVideo = () => {
    const newState = !videoEnabled;
    callService.toggleVideo(newState);
    setVideoEnabled(newState);
  };

  const switchCamera = async () => {
    await callService.switchCamera();
  };

  return (
    <div className="call-controls">
      <button onClick={toggleAudio}>
        {audioEnabled ? '🎤' : '🔇'}
      </button>
      <button onClick={toggleVideo}>
        {videoEnabled ? '📹' : '📷'}
      </button>
      <button onClick={switchCamera}>
        🔄
      </button>
    </div>
  );
}
```

---

## Real-time Features

### Presence Tracking

```typescript
import { usePresence } from '@/hooks/usePresence';

function ChatHeader({ recipientId, chatId }: Props) {
  const {
    presence,
    isUserOnline,
    isUserTyping,
    startTyping,
    stopTyping,
  } = usePresence({
    userId: currentUserId,
    chatId,
  });

  const recipientPresence = presence.get(recipientId);
  const online = isUserOnline(recipientId);
  const typing = isUserTyping(recipientId, chatId);

  return (
    <div className="chat-header">
      <div className="user-info">
        <span className={`status-indicator ${online ? 'online' : 'offline'}`} />
        <span className="username">{recipientName}</span>
        {typing && <span className="typing-indicator">typing...</span>}
      </div>
    </div>
  );
}
```

### Typing Indicators

```typescript
function MessageInput({ chatId, onSend }: Props) {
  const { startTyping, stopTyping } = usePresence({
    userId: currentUserId,
    chatId,
  });

  const [message, setMessage] = useState('');
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Start typing indicator
    startTyping(chatId);

    // Reset timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(chatId);
    }, 3000);
  };

  const handleSend = () => {
    stopTyping(chatId);
    onSend(message);
    setMessage('');
  };

  return (
    <div>
      <textarea
        value={message}
        onChange={handleChange}
        placeholder="Type a message..."
      />
      <button onClick={handleSend}>Send</button>
    </div>
  );
}
```

### Real-time Subscriptions

```typescript
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

function ChatRealtime({ chatId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);

  // Subscribe to new messages
  useRealtimeSubscription(
    'messages',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `chat_id=eq.${chatId}`,
    },
    (payload) => {
      const newMessage = payload.new as Message;
      setMessages((prev) => [newMessage, ...prev]);
    }
  );

  // Subscribe to message updates (read receipts)
  useRealtimeSubscription(
    'message-updates',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter: `chat_id=eq.${chatId}`,
    },
    (payload) => {
      const updatedMessage = payload.new as Message;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === updatedMessage.id ? updatedMessage : msg
        )
      );
    }
  );

  return <MessageList messages={messages} />;
}
```

---

## UI Components

### Using Glassmorphism Components

```typescript
import {
  GlassContainer,
  GlassButton,
  GlassInput,
  GlassBadge,
} from '@/components/ui/glassmorphism';

function LoginForm() {
  return (
    <GlassContainer className="w-full max-w-md p-8">
      <h2 className="text-2xl font-bold text-white mb-6">
        Sign In
      </h2>
      
      <div className="space-y-4">
        <GlassInput
          type="email"
          placeholder="Email"
          className="w-full"
        />
        
        <GlassInput
          type="password"
          placeholder="Password"
          className="w-full"
        />
        
        <GlassButton
          className="w-full bg-ice-accent/20"
          size="lg"
        >
          Sign In
        </GlassButton>
      </div>
      
      <GlassBadge variant="success" className="mt-4">
        Secure Login
      </GlassBadge>
    </GlassContainer>
  );
}
```

### Animated Components

```typescript
import { motion, AnimatePresence } from 'framer-motion';

function MessageList({ messages }: Props) {
  return (
    <AnimatePresence>
      {messages.map((message) => (
        <motion.div
          key={message.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: -100 }}
          transition={{ duration: 0.3 }}
        >
          <MessageItem message={message} />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
```

### Disappearing Message Component

```typescript
import { DisappearingMessage } from '@/components/ui/glassmorphism';

function TimedMessage({ message, onDisappear }: Props) {
  return (
    <DisappearingMessage
      duration={message.disappear_after!}
      onDisappear={() => onDisappear(message.id)}
    >
      <div className="message-content">
        {message.content}
      </div>
      <div className="timer">
        ⏱️ {message.disappear_after}s
      </div>
    </DisappearingMessage>
  );
}
```

---

## Custom Hooks

### Creating a Custom Chat Hook

```typescript
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useChats(userId: string) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchChats() {
      const { data, error } = await supabase
        .from('chat_participants')
        .select(`
          chat_id,
          chats (
            id,
            created_at,
            chat_participants!inner (
              user_id,
              profiles (username, avatar_url)
            )
          )
        `)
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching chats:', error);
      } else {
        setChats(data || []);
      }

      setLoading(false);
    }

    fetchChats();
  }, [userId]);

  return { chats, loading };
}
```

### Using the Hook

```typescript
function ChatList() {
  const { user } = useAuth();
  const { chats, loading } = useChats(user?.id || '');

  if (loading) return <LoadingSpinner />;

  return (
    <div className="chat-list">
      {chats.map((chat) => (
        <ChatPreview key={chat.id} chat={chat} />
      ))}
    </div>
  );
}
```

---

## Advanced Features

### File Upload with Encryption

```typescript
async function uploadEncryptedFile(
  file: File,
  chatId: string
): Promise<string> {
  // 1. Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const fileData = new Uint8Array(arrayBuffer);

  // 2. Convert to base64
  const base64 = btoa(String.fromCharCode(...fileData));

  // 3. Encrypt
  const key = await getChatKey(chatId);
  if (!key) throw new Error('No encryption key');

  const encrypted = encryptMessage(base64, key);

  // 4. Upload to Supabase Storage
  const fileName = `${chatId}/${Date.now()}-${file.name}`;
  const { data, error } = await supabase.storage
    .from('chat-media')
    .upload(fileName, JSON.stringify(encrypted), {
      contentType: 'application/json',
    });

  if (error) throw error;

  // 5. Get public URL
  const { data: urlData } = supabase.storage
    .from('chat-media')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

async function downloadAndDecryptFile(
  url: string,
  chatId: string
): Promise<Blob> {
  // 1. Download encrypted file
  const response = await fetch(url);
  const encryptedData = await response.json();

  // 2. Decrypt
  const key = await getChatKey(chatId);
  if (!key) throw new Error('No encryption key');

  const decrypted = decryptMessage(
    encryptedData.ciphertext,
    encryptedData.iv,
    encryptedData.tag,
    key
  );

  // 3. Convert back to blob
  const binary = atob(decrypted);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes]);
}
```

### Message Search (Client-Side)

```typescript
function useMessageSearch(messages: Message[], query: string) {
  const [results, setResults] = useState<Message[]>([]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const filtered = messages.filter((msg) =>
      msg.content.toLowerCase().includes(query.toLowerCase())
    );

    setResults(filtered);
  }, [messages, query]);

  return results;
}

// Usage
function ChatSearch({ messages }: Props) {
  const [query, setQuery] = useState('');
  const results = useMessageSearch(messages, query);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search messages..."
      />
      <div className="search-results">
        {results.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
      </div>
    </div>
  );
}
```

### Notifications

```typescript
async function sendNotification(
  userId: string,
  type: string,
  title: string,
  body: string
) {
  // 1. Create notification record
  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      body,
      data: { timestamp: Date.now() },
    });

  if (error) throw error;

  // 2. Send push notification (if supported)
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/icon.png',
      badge: '/badge.png',
    });
  }
}

// Request notification permission
async function requestNotificationPermission() {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
}
```

---

## Testing

### Unit Testing Encryption

```typescript
import { describe, it, expect } from 'vitest';
import { encryptMessage, decryptMessage } from '@/lib/encryption/crypto';

describe('Encryption', () => {
  it('should encrypt and decrypt message correctly', () => {
    const message = 'Hello, World!';
    const key = 'test-key-12345';

    const encrypted = encryptMessage(message, key);
    const decrypted = decryptMessage(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      key
    );

    expect(decrypted).toBe(message);
  });

  it('should fail with wrong key', () => {
    const message = 'Secret message';
    const key1 = 'correct-key';
    const key2 = 'wrong-key';

    const encrypted = encryptMessage(message, key1);

    expect(() => {
      decryptMessage(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        key2
      );
    }).toThrow();
  });
});
```

### Integration Testing

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatComponent } from '@/components/chat/ChatComponent';

describe('Chat Integration', () => {
  it('should send and display message', async () => {
    render(<ChatComponent chatId="test-chat" userId="test-user" />);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByText('Send');

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Test message')).toBeInTheDocument();
    });
  });
});
```

---

## Examples

### Complete Chat Component

```typescript
import { useState } from 'react';
import { useChatData } from '@/hooks/useChatData';
import { usePresence } from '@/hooks/usePresence';
import { useKeyRotation } from '@/hooks/useKeyRotation';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { ChatHeader } from '@/components/chat/ChatHeader';

export function CompleteChat({ chatId, userId, recipientId }: Props) {
  // Chat data
  const {
    messages,
    loading,
    sendMessage,
    deleteMessage,
    markAsRead,
  } = useChatData(chatId, userId);

  // Presence
  const {
    isUserOnline,
    isUserTyping,
    startTyping,
    stopTyping,
  } = usePresence({ userId, chatId });

  // Key rotation
  const { isRotating, lastRotation } = useKeyRotation({
    chatId,
    userId,
    recipientId,
    recipientPublicKey: '', // Fetch this separately
    enable