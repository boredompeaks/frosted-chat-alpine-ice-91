# Frosted Chat - Development Context & Architecture

## 📋 Project Overview

**Project Name**: frosted-chat-alpine-ice-91  
**Type**: End-to-End Encrypted Chat Application  
**Tech Stack**: 
- Frontend: React 18 + TypeScript + Vite
- UI: TailwindCSS + Radix UI + Shadcn/ui + Framer Motion
- Backend: Supabase (PostgreSQL + Auth + Realtime)
- Encryption: Hybrid RSA-2048 + AES-256-GCM using CryptoJS & Web Crypto API
- WebRTC: simple-peer for voice/video calls

## ⚠️ Working Rules & Constraints

### Critical Rules for All Developers

1. **SCOPE LIMITATION**: 
   - ✅ ONLY work on `frosted-chat-alpine-ice-91` directory
   - ❌ DO NOT touch `video_chat_app` directory
   - ❌ DO NOT make changes to `supabase/migrations` without explicit approval

2. **BEFORE MAJOR OPERATIONS**:
   - Always ask permission before editing files that may alter working functionality
   - Get approval before modifying:
     - Encryption logic (`/src/lib/encryption/*`)
     - Database schema or migrations
     - Auth or security-related code
     - WebRTC call service
     - Main chat components (Conversation, Message, MessageInput)

3. **DATABASE CONSTRAINTS**:
   - Reference `supabase/sql/schema.sql` for existing schema
   - DO NOT break existing backend features
   - If creating new tables:
     - Follow existing naming conventions
     - Add proper indexes and constraints
     - Add RLS (Row Level Security) policies
     - Update `supabase_realtime` publication if needed

4. **ENCRYPTION ARCHITECTURE**:
   - **NEVER** hardcode encryption keys
   - **NEVER** log decrypted messages or keys
   - **ALWAYS** validate encrypted data before decryption
   - **MAINTAIN** backward compatibility with existing encrypted messages

5. **FILE EDITING**:
   - Prefer editing existing files over creating new ones
   - If creating new files:
     - Follow existing naming conventions
     - Use TypeScript strict mode
     - Add proper type definitions
     - Document complex functions

6. **TESTING**:
   - Test encryption/decryption on all code paths
   - Verify WebRTC calls work across different network conditions
   - Check for memory leaks in crypto operations
   - Validate key rotation doesn't break existing chats

## 🔐 Encryption Architecture

### Hybrid Encryption System

Frosted Chat uses a **hybrid encryption scheme** combining RSA-2048 and AES-256-GCM:

1. **RSA-2048** (Public Key Cryptography):
   - Used for **key exchange only**
   - Each user has RSA key pair
   - Public key stored in `profiles.public_key`
   - Private key stored client-side (encrypted)
   - **Algorithm**: RSA-OAEP with SHA-256

2. **AES-256-GCM** (Symmetric Encryption):
   - Used for **message encryption**
   - New key per chat (can rotate)
   - Stored client-side in localStorage
   - **Algorithm**: AES-256-GCM with random IV

### Key Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ INITIAL SETUP                                                │
└─────────────────────────────────────────────────────────────┘
  1. User registers → Generate RSA-2048 key pair
  2. Store public key in profiles table
  3. Encrypt private key with user password
  4. Store encrypted private key locally

┌─────────────────────────────────────────────────────────────┐
│ FIRST MESSAGE (Key Exchange)                                │
└─────────────────────────────────────────────────────────────┘
  Initiator (User A)                    Recipient (User B)
       │                                      │
       │ ───────── sends message ──────────> │
       │     (no encryption yet)              │
       │                                      │
       │ <───── initiates key exchange ────── │
       │     (sends encrypted AES key)        │
       │                                      │
       │ ──────── acknowledges ─────────────> │
       │      (key now active)                │
       │                                      │
       │   Both users now share same          │
       │   AES-256 key for this chat          │
       │                                      │
       └────────── CHAT SECURED ──────────────┘

┌─────────────────────────────────────────────────────────────┐
│ MESSAGE FLOW (Post-Exchange)                                │
└─────────────────────────────────────────────────────────────┘
  User A                           Server                       User B
    │                              │                            │
    │ 1. Encrypt with AES-256      │                            │
    │ 2. Send encrypted payload    │                            │
    │ ───────────────────────────> │                            │
    │                              │ 3. Store encrypted only    │
    │                              │ ──────────────────────────>│
    │                              │                            │ 4. Decrypt with AES-256
    │                              │                            │
    │    5. Both sides decrypt    │                            │
    │    with same AES key         │                            │
    │                              │                            │

┌─────────────────────────────────────────────────────────────┐
│ KEY ROTATION (Every 48 hours)                               │
└─────────────────────────────────────────────────────────────┘
  1. Auto-rotation timer expires
  2. Generate new AES-256 key
  3. Encrypt new key with recipient's RSA public key
  4. Send encrypted key via chat
  5. Recipient decrypts with private RSA key
  6. Both switch to new key
  7. Old key marked as expired
```

### File Structure - Encryption

```
/src/lib/encryption/
├── crypto.ts                  # Core crypto functions (CryptoJS)
│   ├── generateAESKey()       # Generate 256-bit random key
│   ├── generateRSAKeyPair()   # Generate RSA-2048 key pair
│   ├── encryptKeyWithRSA()    # Encrypt AES key with RSA public key
│   ├── decryptKeyWithRSA()    # Decrypt AES key with RSA private key
│   ├── encryptMessage()       # AES-256-GCM encryption
│   ├── decryptMessage()       # AES-256-GCM decryption
│   ├── encryptWithRawKey()    # Direct AES encryption (no derivation)
│   ├── decryptWithRawKey()    # Direct AES decryption
│   └── [utility functions]    # Hash, PBKDF2, validation, etc.
│
├── keyManagement.ts           # Key lifecycle management
│   ├── getOrCreateChatKey()   # Get or initiate key exchange
│   ├── manageChatEncryption() # Main encryption lifecycle manager
│   ├── initiateKeyExchange()  # Create & send encrypted key
│   ├── receiveKey()           # Receive & install key
│   ├── checkKeyRotation()     # Check if rotation needed
│   └── rotateKey()            # Perform key rotation
│
└── [other crypto files]

/src/lib/
└── cryptoService.ts          # Client-side crypto operations
    ├── createNewAESKey()     # Generate & store new key
    ├── getCurrentAESKey()    # Retrieve active key
    ├── prepareAESKeyForTransfer()  # Prepare for sending
    ├── receiveAESKeyFromTransfer() # Install received key
    ├── encryptMessageWithAES()     # Encrypt message
    ├── decryptMessageWithAES()     # Decrypt message
    ├── shouldAutoExchangeKey()     # Check if rotation needed
    ├── getTimeUntilNextAutoExchange()
    └── [status utilities]
```

### Key Storage

**Client-Side (localStorage)**:
```
Key: frostedchat_aes_key
Value: <base64-encoded AES-256 key>
```

**Database (Supabase)**:
```sql
-- encryption_keys table
{
  id: uuid,
  chat_id: uuid, -- references chats.id
  key_value: text, -- RSA-encrypted AES key
  status: 'pending' | 'active' | 'expired',
  initiator_id: uuid, -- who created this key
  last_rotation: timestamp,
  expires_at: timestamp
}

-- profiles table (public keys)
{
  id: uuid,
  username: text,
  public_key: text, -- RSA public key
  -- ...
}
```

### Message Structure

**Encrypted Message** (stored in `messages.content`):
```json
{
  "ciphertext": "<base64-encoded>",
  "iv": "<base64-encoded>",
  "tag": "<base64-encoded>"
}
```

**Metadata** (wrapped with message):
```json
{
  "content": "actual message text",
  "senderId": "user-uuid",
  "timestamp": 1234567890
}
```

### Security Features

1. **Forward Secrecy**: New AES key per rotation (48 hours)
2. **Authentication**: GCM tag provides message authentication
3. **Key Derivation**: Private keys encrypted with PBKDF2
4. **Input Sanitization**: XSS protection on all user input
5. **Secure Random**: CryptoJS random bytes for all nonces/IVs
6. **No Plaintext Storage**: Messages never stored unencrypted on server

## 🗄️ Database Schema

### Core Tables

**Chats & Messages**:
```sql
chats                    -- Chat rooms
messages                 -- All messages (encrypted)
chat_participants        -- Chat membership
message_status          -- Delivery/read receipts
reactions               -- Message reactions
hidden_messages         -- User-hidden messages
starred_messages        -- User-starred messages
```

**Encryption**:
```sql
encryption_keys         -- RSA-encrypted AES keys per chat
                         -- Links to chats, tracks rotation
```

**User System**:
```sql
profiles               -- User profiles (public keys, status)
presence_updates       -- Online/offline status
typing_indicators      -- Typing status
read_receipts          -- Read confirmations
```

**Authentication**:
```sql
auth.users (Supabase)  -- Auth handled by Supabase
```

### Key Relationships

```
chats (1) ──< (n) chat_participants
chats (1) ──< (n) messages
chats (1) ──< (n) encryption_keys
messages (1) ──< (n) reactions
messages (1) ──< (n) message_status
messages (1) ──< (n) read_receipts
users (1) ──< (n) profiles
users (1) ──< (n) presence_updates
```

### RLS (Row Level Security)

Enabled on:
- conversation_members
- conversation_participants
- conversations
- hidden_messages
- message_status
- presence_updates
- read_receipts
- starred_messages
- typing_indicators

**Realtime Publication**: `supabase_realtime`
Tables included: presence_updates, conversations, messages, read_receipts, typing_indicators, starred_messages, hidden_messages, conversation_participants

## 🏗️ Code Architecture

### Component Structure

```
/src/components/
├── auth/
│   ├── LoginForm.tsx
│   └── RegisterForm.tsx
├── chat/
│   ├── ChatList.tsx          # Chat list with previews
│   ├── Conversation.tsx      # Main chat view
│   ├── Message.tsx           # Individual message
│   ├── MessageInput.tsx      # Message composer
│   ├── NewChat.tsx           # Create new chat
│   ├── NewChatButton.tsx
│   ├── SearchBar.tsx         # Message search
│   └── UserSearch.tsx        # Find users
├── common/
│   ├── ErrorBoundary.tsx
│   ├── LoadingState.tsx
│   └── NetworkStatus.tsx
├── settings/
│   └── Settings.tsx
└── ui/
    └── [shadcn components]    # Reusable UI components
```

### Hooks

```
/src/hooks/
├── useAuthRedirect.ts         # Auth state management
├── useChatData.ts             # Chat operations & message CRUD
├── useChatPreviews.ts         # Chat list data
├── useKeyRotation.ts          # Automatic key rotation
├── usePresence.ts             # Online/offline status
├── useProfileData.ts          # User profile data
├── useRealtimeSubscription.ts # Supabase realtime
├── use-toast.ts              # Toast notifications
└── [mobile detection hooks]
```

### Services

```
/src/lib/
├── cryptoService.ts          # Client crypto operations
├── encryption/
│   ├── crypto.ts             # Core crypto (CryptoJS)
│   ├── keyManagement.ts      # Key lifecycle
│   └── [other crypto files]
├── webrtc/
│   ├── callService.ts        # WebRTC calls (simple-peer)
│   ├── CallPersistenceService.ts
│   └── [other WebRTC files]
├── supabase/
│   └── client.ts             # Supabase client config
└── [other utilities]
```

### Real-Time Features

**Supabase Realtime Channels**:
1. **presence**: Track online users per chat
2. **messages**: Live message updates
3. **typing_indicators**: Show "user is typing"
4. **read_receipts**: Real-time read confirmations
5. **reaction updates**: Live emoji reactions

**WebRTC** (for voice/video calls):
- Signaling via Supabase Realtime
- ICE candidates via STUN/TURN servers
- Encrypted media streams (DTLS-SRTP)
- Call persistence & metrics

## 📊 Current State (2025-11-10)

### ✅ Completed Features

1. **Authentication**
   - ✅ Supabase Auth integration
   - ✅ User registration/login
   - ✅ Profile creation with auto-username
   - ✅ Protected routes

2. **Chat System**
   - ✅ 1-on-1 and group chats
   - ✅ Real-time messaging
   - ✅ Message history with pagination
   - ✅ Message reactions
   - ✅ Read receipts
   - ✅ Message search
   - ✅ Starred messages
   - ✅ Hidden messages

3. **End-to-End Encryption**
   - ✅ Hybrid RSA + AES encryption
   - ✅ Automatic key exchange
   - ✅ Key rotation (48h interval)
   - ✅ Manual key refresh
   - ✅ Encryption status indicators
   - ✅ Countdown to next rotation

4. **Presence System**
   - ✅ Online/offline status
   - ✅ Typing indicators
   - ✅ Last seen timestamps
   - ✅ Auto-away (5 min idle)
   - ✅ Tab visibility detection

5. **UI/UX**
   - ✅ Glassmorphism design
   - ✅ Responsive (mobile + desktop)
   - ✅ Dark/light theme
   - ✅ Toast notifications
   - ✅ Loading states
   - ✅ Error boundaries

6. **WebRTC Calls** (Basic)
   - ✅ Audio/video calls
   - ✅ TURN/STUN server config
   - ✅ Call persistence
   - ✅ Call metrics

### ⚠️ Known Issues

1. **CRITICAL: White Screen Error**
   - Error: `Uncaught ReferenceError: global is not defined`
   - Location: `simple-peer.js` (WebRTC library)
   - Status: **PARTIALLY FIXED** - Polyfill added to index.html
   - Testing: Need to verify fix in browser

2. **Key Management**
   - Edge case: User logs in on new device (no localStorage)
   - Need: Cloud backup of encrypted private keys
   - Need: Key recovery mechanism

3. **Message Synchronization**
   - Rare: Messages appear out of order after reconnect
   - Need: Better reconnection logic
   - Need: Message deduplication

4. **Performance**
   - Large chat histories cause slowdowns
   - Need: Virtual scrolling for messages
   - Need: Message virtualization

### 🔄 In Progress / Pending

1. **Enhanced Encryption**
   - [ ] Group chat key management (per-participant keys)
   - [ ] Message self-destruct timer
   - [ ] Encrypted file attachments
   - [ ] Perfect Forward Secrecy (ephemeral keys)

2. **WebRTC Improvements**
   - [ ] Screen sharing
   - [ ] Call recording
   - [ ] Group video calls
   - [ ] Network quality indicators
   - [ ] Push-to-talk

3. **Features**
   - [ ] Message drafts
   - [ ] Reply threading
   - [ ] Message editing
   - [ ] Delete for everyone
   - [ ] Typing in group chats

4. **Performance & Scalability**
   - [ ] Virtual message list
   - [ ] Image lazy loading
   - [ ] Connection pooling
   - [ ] Caching strategy
   - [ ] Bundle optimization

5. **Testing**
   - [ ] Unit tests for crypto functions
   - [ ] Integration tests for key exchange
   - [ ] E2E tests with Playwright
   - [ ] Performance tests
   - [ ] Security audit

## 🗺️ Development Roadmap

### Phase 1: Stability (Current Priority)
- [ ] Fix white screen issue (simple-peer global polyfill)
- [ ] Test encryption/decryption on all paths
- [ ] Fix key management edge cases
- [ ] Add error handling for crypto failures
- [ ] Performance optimization

### Phase 2: Core Features
- [ ] Message editing & deletion
- [ ] File attachments (encrypted)
- [ ] Message drafts
- [ ] Better search (full-text)
- [ ] Group chat key management

### Phase 3: Advanced Features
- [ ] Screen sharing
- [ ] Message scheduling
- [ ] Custom themes
- [ ] Chat backups
- [ ] Mobile apps (React Native)

### Phase 4: Enterprise
- [ ] Multi-device sync
- [ ] Message retention policies
- [ ] Admin controls
- [ ] Compliance features
- [ ] API for third-party integrations

## 🔍 Key Files Reference

### Critical Files (DO NOT BREAK)

1. **Encryption Core**:
   - `src/lib/encryption/crypto.ts` - All crypto primitives
   - `src/lib/encryption/keyManagement.ts` - Key lifecycle
   - `src/lib/cryptoService.ts` - Client crypto operations

2. **Main Chat**:
   - `src/components/chat/Conversation.tsx` - Main chat view
   - `src/components/chat/Message.tsx` - Message rendering
   - `src/hooks/useChatData.ts` - Message CRUD

3. **WebRTC**:
   - `src/lib/webrtc/callService.ts` - Call logic
   - `src/lib/webrtc/CallPersistenceService.ts` - Call storage

4. **Database**:
   - `supabase/sql/schema.sql` - Complete schema
   - `supabase/migrations/` - All migrations

5. **Config**:
   - `vite.config.ts` - Vite configuration
   - `tailwind.config.ts` - Tailwind config
   - `src/integrations/supabase/client.ts` - Supabase client

## 🧪 Testing Checklist

Before submitting changes:

- [ ] App loads without white screen
- [ ] Can register/login
- [ ] Can send/receive messages
- [ ] Messages are encrypted
- [ ] Key rotation works
- [ ] Typing indicators work
- [ ] Online status updates
- [ ] Can make voice/video calls
- [ ] Responsive on mobile
- [ ] No console errors
- [ ] Build succeeds (`npm run build`)
- [ ] TypeScript types valid

## 📝 Maintenance Notes

### Regular Tasks

1. **Key Rotation Monitoring**:
   - Check logs for failed rotations
   - Monitor database for stale keys
   - Verify old keys are properly expired

2. **Performance Monitoring**:
   - Check message loading times
   - Monitor localStorage usage
   - Watch for memory leaks in crypto

3. **Security Audits**:
   - Review encryption key storage
   - Check for plaintext in logs
   - Verify RLS policies
   - Test key recovery

### Dependencies

**Major Dependencies**:
- `react` & `react-dom` - UI framework
- `vite` - Build tool
- `typescript` - Type safety
- `@supabase/supabase-js` - Backend
- `crypto-js` - Client-side crypto
- `simple-peer` - WebRTC (KNOWN ISSUE: needs global polyfill)
- `framer-motion` - Animations
- `tailwindcss` - Styling
- `@radix-ui/*` - UI primitives

**Peer Dependencies**:
- Node.js >= 18
- Modern browser with Web Crypto API support

## 🆘 Troubleshooting

### Common Issues

1. **"global is not defined" Error**:
   ```html
   <!-- Fix: Add to index.html before any modules -->
   <script>
     var global = globalThis;
   </script>
   ```

2. **Encryption Failures**:
   - Check localStorage for key
   - Verify RSA keys are valid
   - Check browser console for errors
   - Try hard refresh (Ctrl+Shift+R)

3. **Messages Not Decrypting**:
   - Verify AES key exists
   - Check key matches sender's key
   - Try manual key exchange
   - Check for corrupted data

4. **WebRTC Call Fails**:
   - Check TURN server config
   - Verify network allows WebRTC
   - Check browser permissions
   - Try different network

5. **Build Errors**:
   ```bash
   # Clear cache and reinstall
   rm -rf node_modules
   rm package-lock.json
   npm install
   npm run build
   ```

## 📚 Resources

- **CryptoJS Docs**: https://cryptojs.gitbook.io/docs/
- **Web Crypto API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- **Supabase Realtime**: https://supabase.com/docs/guides/realtime
- **simple-peer**: https://github.com/feross/simple-peer
- **RSA-OAEP**: https://en.wikipedia.org/wiki/Optimal_asymmetric_encryption_padding
- **AES-GCM**: https://en.wikipedia.org/wiki/Galois/Counter_Mode

---

**Last Updated**: 2025-11-10  
**Version**: 1.0.0  
**Maintainer**: Development Team  
**Review Before**: Any encryption or security changes  
**Approved For**: Production use with monitoring
