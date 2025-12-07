# Frosted Chat - Minimal Context & Simple E2EE Architecture Proposal

## Project
- **Directory**: frosted-chat-alpine-ice-91
- **Tech Stack**: React + TypeScript + Vite + Supabase
- **Working Rules**: See DEVELOPMENT_CONTEXT.md rules section
- **Database Schema**: supabase/sql/schema.sql
- **Current Architecture**: src/lib/encryption/ (crypto.ts, keyManagement.ts, cryptoService.ts)
- **Hooks**: src/hooks/ (useKeyRotation.ts, useChatData.ts, usePresence.ts)

## Current Complex E2EE Architecture Analysis

**Complexity Issues**:
1. Dual crypto (RSA-2048 + AES-256-GCM)
2. Key rotation every 48 hours
3. Complex key exchange lifecycle
4. Multiple state management hooks
5. localStorage + DB sync
6. Edge cases: new device, recovery, rotation timing

**Security**: High, but maintenance overhead is significant

## Proposed Simple E2EE Architecture (KISS Approach)

### Option 1: Password-Based Key Derivation ⭐ (RECOMMENDED)

**Concept**: One strong key derived from shared password, used for all encryption

**How It Works**:
```
1. User A & User B agree on a chat password (shared via secure channel)
2. Both derive same AES-256 key using PBKDF2(password, chat_id, 100k iterations)
3. All messages encrypted with this key
4. No key exchange, no rotation, no storage needed
```

**Implementation**:
```typescript
// Simple key derivation
const deriveChatKey = (password: string, chatId: string): string => {
  return CryptoJS.PBKDF2(password, chatId, {
    keySize: 256/32,
    iterations: 100000,
  }).toString();
};
```

**Pros**:
- ✅ No key management needed
- ✅ No storage (key derived on demand)
- ✅ No complex exchange flow
- ✅ Works on new devices (just re-enter password)
- ✅ Same security level
- ✅ Simpler code (remove useKeyRotation, keyManagement complexity)

**Cons**:
- ⚠️ Both users need to remember/enter password each session
- ⚠️ Password weaker than RSA key (mitigated with PBKDF2)
- ⚠️ Password-based attack vector (use strong passwords)

**Security**: 256-bit key via PBKDF2, resists brute force, suitable for private use

### Option 2: Single RSA Key (Simplified)

**Concept**: Each user has one RSA-2048 key pair, encrypt messages directly

**How It Works**:
```
1. User generates RSA-2048 key pair on registration
2. Public key in profiles.public_key
3. Encrypt messages with recipient's public key
4. Decrypt with user's private key
5. Private key stored encrypted with user password
```

**Implementation**:
```typescript
// Direct message encryption
const encryptMessage = async (message: string, recipientPublicKey: string) => {
  // Use RSA-OAEP to encrypt entire message (for small messages)
  // For larger messages, still use AES-128 with RSA key wrapping
};
```

**Pros**:
- ✅ No key exchange needed
- ✅ No rotation needed
- ✅ Works seamlessly on new devices (cloud backup private key)
- ✅ Standard public key crypto
- ✅ Simpler than hybrid approach

**Cons**:
- ⚠️ RSA-2048 can only encrypt ~190 bytes directly
- ⚠️ Still need AES for long messages
- ⚠️ Private key backup needed

### Option 3: Master Key + Local Backup (Best of Both)

**Concept**: Generate one strong AES key per user, encrypt with password, store in Supabase

**How It Works**:
```
1. User sets password → generates AES-256 master key
2. Encrypt master key with password (PBKDF2)
3. Store encrypted master key in Supabase (user's profile)
4. For each chat: generate chat-specific AES key
5. Encrypt chat key with master key
6. Chat key stored in localStorage (optional)
```

**Implementation**:
```typescript
// User master key (one per user)
const userMasterKey = deriveFromPassword(password, userId);

// Chat key (one per chat)
const chatKey = generateAESKey();
const encryptedChatKey = encryptWithMasterKey(chatKey, userMasterKey);
storeEncryptedChatKey(chatId, encryptedChatKey);
```

**Pros**:
- ✅ Single password to remember
- ✅ Cloud backup of master key
- ✅ Works on new devices
- ✅ Can recover from any device
- ✅ Still good security

**Cons**:
- ⚠️ Slightly more complex than Option 1
- ⚠️ Master key compromise = all chats exposed
- ⚠️ Need secure password

## Recommended Implementation: Option 1 (Password-Based)

**Why This is Best for Private Use**:
1. **Simplest code**: Remove 80% of encryption complexity
2. **No edge cases**: No key exchange, rotation, storage issues
3. **Works everywhere**: New device = re-enter password
4. **Maintains security**: PBKDF2 with 100k iterations = strong key
5. **Easiest to implement**: Days not weeks

**Implementation Plan**:
```typescript
// New simple structure
/lib/simpleE2EE.ts
  ├── deriveChatKey(password, chatId)  // PBKDF2
  ├── encryptMessage(message, key)     // AES-256-CBC
  ├── decryptMessage(ciphertext, key)  // AES-256-CBC
  └── [minimal utilities]

// Remove complexity
✗ useKeyRotation.ts (delete)
✗ keyManagement.ts (delete)
✗ cryptoService.ts (delete complex parts)
✗ Half of crypto.ts (simplify)
```

**User Flow**:
1. Create chat → prompt for password
2. Both users enter same password
3. Key derived automatically
4. Send/receive messages
5. Key never stored (derived each time)

**Security Features**:
- PBKDF2-SHA256, 100k iterations
- Unique salt (chatId)
- 256-bit key
- Input validation
- No plaintext in logs

## Migration from Current Architecture

**Steps to Migrate** (if we choose this):
1. Add simpleE2EE.ts with new functions
2. Update useChatData.ts to use simpleE2EE
3. Remove keyManagement complexity
4. Update UI to prompt for password on new chats
5. Test encryption/decryption
6. Remove old files

**Timeline**: ~3-5 days implementation

## Comparison Matrix

| Feature | Current (Complex) | Option 1 (Password) | Option 2 (RSA Simple) | Option 3 (Master Key) |
|---------|-------------------|---------------------|------------------------|------------------------|
| **Complexity** | High | Very Low | Low | Medium |
| **Code Size** | ~2000 lines | ~200 lines | ~300 lines | ~500 lines |
| **Key Storage** | localStorage + DB | None | Encrypted in DB | Master key in DB |
| **New Device** | Manual recovery | Re-enter password | Auto (cloud backup) | Auto (cloud backup) |
| **Security** | Very High | High | High | High |
| **User Effort** | None | Enter password | None | Enter password |
| **Implementation** | 2+ weeks | 3-5 days | 1 week | 1-2 weeks |
| **Maintenance** | High | Very Low | Low | Low |

## Recommendation

**For Private/Non-Production Use**: **Option 1 (Password-Based)**

**Justification**:
- **Security is still high**: PBKDF2 with 100k iterations = 256-bit key equivalent
- **Dramatically simpler**: Remove 80% of code
- **No edge cases**: No recovery, no rotation, no sync issues
- **User-friendly**: Simple password prompt
- **Quick to implement**: Days not months

**When to use current architecture**:
- If this becomes production
- If you need perfect UX (zero friction)
- If you need complex features (group chats, file sharing, etc.)

## Next Steps

1. Confirm architecture choice (Option 1 recommended)
2. Create implementation plan
3. Build simpleE2EE.ts
4. Update useChatData.ts
5. Test thoroughly
6. Remove old complexity

**Reference Files** (for full details):
- DEVELOPMENT_CONTEXT.md - Complete architecture doc
- .memory - Implementation details and current state
- src/lib/encryption/crypto.ts - Current crypto functions
- src/lib/encryption/keyManagement.ts - Complex key lifecycle
- supabase/sql/schema.sql - Database schema
