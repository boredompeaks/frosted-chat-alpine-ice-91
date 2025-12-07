# Simple E2EE Implementation Plan

## Architecture Decision

**Password-Based E2EE with Session Management**

### Security Level
- **PBKDF2**: 150,000 iterations (good balance - fast on modern devices, secure against brute force)
- **Key Derivation**: SHA-256 with unique salt (chatId)
- **Encryption**: AES-256-CBC
- **Session**: Password stored in sessionStorage, auto-lock after 15min inactivity

### Session Management
```typescript
// Session behavior:
// 1. User enters password → stored in sessionStorage
// 2. Tab active/changed in <15min → session stays active
// 3. Tab hidden for >15min → session expires, password cleared
// 4. Tab closed → session ends immediately
// 5. On new chat or expired session → prompt for password

// Same timeout as current presence system (away after 5min, offline after 15min)
```

## Implementation Plan

### Phase 1: Create SimpleE2EE Module

**File**: `src/lib/simpleE2EE.ts`

```typescript
// Core functions:
- deriveChatKey(password, chatId) → 256-bit key
- encryptMessage(message, key) → {ciphertext, iv}
- decryptMessage(ciphertext, iv, key) → plaintext
- setSessionPassword(password) → sessionStorage
- getSessionPassword() → password | null
- clearSessionPassword() → remove
- isSessionActive() → check 15min timeout
- getOrPromptPassword() → get or prompt
```

### Phase 2: Simplify useChatData Hook

**Current**: 300+ lines with complex key management
**New**: ~150 lines with simple password flow

```typescript
// Simplified flow:
1. On component mount:
   - Check session password
   - If not present → prompt user
   - Derive chat key
   - Load messages

2. On send message:
   - Get password from session
   - Derive key
   - Encrypt
   - Send to Supabase

3. On receive message:
   - Decrypt with derived key
   - Update UI
```

### Phase 3: Update AuthContext (Minor Changes)

**Current**: ~120 lines with RSA key handling
**New**: ~80 lines (remove RSA complexity)

```typescript
// Remove:
- Private key storage
- RSA key generation
- Key backup logic

// Keep:
- User auth (email/password)
- Profile management
- Session management
```

### Phase 4: UI - Password Prompt Flow

**Component**: `src/components/auth/ChatPasswordPrompt.tsx`

```tsx
// Beautiful glassmorphism dialog
<Dialog>
  <DialogContent className="glass">
    <DialogHeader>
      <DialogTitle>🔐 Enter Chat Password</DialogTitle>
      <DialogDescription>
        Enter the password shared with you for this chat
      </DialogDescription>
    </DialogHeader>
    
    <div className="space-y-4">
      <Input 
        type="password"
        placeholder="Enter password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="glass-input"
      />
      
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Lock className="w-3 h-3" />
        <span>Password is required for E2EE</span>
      </div>
      
      <Button 
        onClick={handleSubmit}
        className="w-full glass-button"
        disabled={!password}
      >
        Unlock Chat
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

**When to Show**:
- Opening new chat (if no session password)
- Entering existing chat (if no session password or expired)
- Session expired after 15min inactivity

### Phase 5: Session Timeout Management

```typescript
// Track activity
useEffect(() => {
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll'];
  const resetTimer = () => {
    setLastActivity(Date.now());
    extendSession();
  };
  
  events.forEach(event => {
    document.addEventListener(event, resetTimer);
  });
  
  // Check every minute
  const interval = setInterval(() => {
    const inactiveFor = Date.now() - lastActivity;
    if (inactiveFor > 15 * 60 * 1000) { // 15 minutes
      clearSessionPassword();
      setSessionExpired(true);
    }
  }, 60000);
  
  return () => {
    events.forEach(event => {
      document.removeEventListener(event, resetTimer);
    });
    clearInterval(interval);
  };
}, []);
```

### Phase 6: Update Chat Components

**Files to Modify**:
- `src/components/chat/Conversation.tsx` - Main chat view
- `src/components/chat/MessageInput.tsx` - Send message
- `src/components/chat/NewChat.tsx` - Create new chat

**Changes**:
```typescript
// Before: Complex key management
const { getOrCreateChatKey, manageChatEncryption } = keyManagement;

// After: Simple password
import { deriveChatKey, getOrPromptPassword } from '@/lib/simpleE2EE';

const chatKey = deriveChatKey(await getOrPromptPassword(chatId), chatId);
```

### Phase 7: Keep WebRTC Separate

**Action**: No changes to WebRTC code
**Reason**: WebRTC is already encrypted (DTLS-SRTP)
**Maintain**: Current simple-peer setup

### Phase 8: Testing

**Unit Tests**: 
- Key derivation
- Encryption/decryption
- Session management

**Integration Tests**:
- Create chat with password
- Send/receive messages
- Session timeout after 15min
- Password prompt on new/expired session

**Security Tests**:
- Verify password not in localStorage
- Verify messages encrypted in DB
- Verify no plaintext in network

### Phase 9: Remove Old Complexity

**Delete Files**:
- `src/lib/encryption/keyManagement.ts` (360 lines)
- `src/lib/cryptoService.ts` (190 lines)
- `src/hooks/useKeyRotation.ts` (120 lines)

**Result**: Remove ~670 lines, add ~350 lines = **320 lines saved**

### Phase 10: UI Polish

**Keep**: Glassmorphism design
**Add**:
- Password strength indicator (optional)
- "Change password" button in chat header
- Session status indicator (locked/unlocked)
- Security badge in chat

## Code Structure (New)

```
src/lib/
├── simpleE2EE.ts                 # Password-based E2EE (200 lines)
│   ├── deriveChatKey()
│   ├── encryptMessage()
│   ├── decryptMessage()
│   ├── session management
│   └── password prompts
│
└── encryption/
    └── crypto.ts                 # Keep basic functions only (100 lines)
        ├── generateRandom()
        ├── hashData()
        └── [utilities]

src/components/
├── auth/
│   ├── ChatPasswordPrompt.tsx    # Password dialog (80 lines)
│   ├── LoginForm.tsx             # Keep as is
│   └── RegisterForm.tsx          # Keep as is
│
└── chat/
    ├── Conversation.tsx          # Simplify key mgmt
    ├── MessageInput.tsx          # Simplify send
    └── NewChat.tsx               # Add password prompt

src/hooks/
├── useChatData.ts                # Simplify (150 lines)
└── [other hooks - keep as is]
```

## Security Features

✅ **Password never in localStorage** (only sessionStorage)  
✅ **Keys never stored** (derived on demand)  
✅ **No key exchange** (password-based)  
✅ **PBKDF2 150k iterations** (strong against brute force)  
✅ **Session auto-lock** after 15min inactivity  
✅ **Messages encrypted in DB** (ciphertext only)  
✅ **No plaintext in network** (except auth)  

## User Experience

✅ **Enter password once** per session  
✅ **Auto-lock after 15min** (secure)  
✅ **Prompt on new/expired** (clear UI)  
✅ **Glassmorphism UI** (beautiful)  
✅ **Session persists** if tab active  
✅ **Manual lock** available (settings)  

## Effort vs Security Balance

**Security Level**: High (PBKDF2 150k = good protection)  
**Implementation Effort**: Low (simple password flow)  
**Maintenance**: Very Low (no edge cases)  
**User Friction**: Medium (enter password, but only once per 15min)  

**This is the sweet spot**: Strong security with minimal complexity

## Timeline

**Day 1**: Create simpleE2EE.ts + basic tests
**Day 2**: Update useChatData + Conversation component
**Day 3**: Create password prompt UI + session management
**Day 4**: Delete old files + update imports
**Day 5**: Testing + polish

**Total**: 5 days, but not urgent - work at comfortable pace

## Success Criteria

**Must Work**:
- [ ] Enter password → can send/receive encrypted messages
- [ ] Password not stored in localStorage
- [ ] Session auto-expires after 15min
- [ ] No white screen (verify)
- [ ] Old complexity removed

**Should Work**:
- [ ] Beautiful UI for password prompt
- [ ] Session persists during active use
- [ ] Proper error messages
- [ ] Tests pass

## Files Summary

**Create**: 3 new files (~430 lines total)
**Delete**: 3 old files (~670 lines total)
**Modify**: 4 existing files (~200 lines each)
**Net**: **-240 lines** (simpler codebase)

---

## Ready to Proceed?

This plan gives you:
✅ Simple, maintainable E2EE  
✅ Balanced security (PBKDF2 150k)  
✅ Good UX (15min session)  
✅ Low effort (5 days)  
✅ Rock-solid foundation  

**Please review and confirm to begin implementation.**
