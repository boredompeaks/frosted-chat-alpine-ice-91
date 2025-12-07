# Simple E2EE - Revised Implementation Plan

## Architecture Clarifications

### Session Management
```
Complete Logout (15min):
- Redirect to calculator decoy screen
- Clear Supabase session
- Clear chat password from sessionStorage
- User must login again

Chat Password Timeout (5min):
- Stay logged in at /chats route
- Cannot enter individual chat (/chats/:id)
- sessionStorage password cleared
- Prompt for chat password on entry
- Can see chat list, but can't read messages
```

### Chat Password Design

**Option A: Use Login Password**
- Pros: Simplest, no extra UI
- Cons: Less secure, tied to account password
- **Decision**: Not recommended

**Option B: Separate Chat Password in Settings** ⭐
- Pros: Independent security, user-controlled
- Cons: Slightly more complex
- **Recommended**: This option

**Option C: Unique Password Per Chat**
- Pros: Most secure
- Cons: Complex UI, many passwords to manage
- **Decision**: Too complex for private use

**Selected: Option B**

Implementation:
- User sets "Chat Password" in Settings page
- Stored encrypted in Supabase (user profile)
- Used to derive E2EE keys for all chats
- Independent of login password

### Key Rotation Strategy

**Problem**: 
- localStorage can be cleared
- Old messages encrypted with rotated keys become unreadable

**Solution - Key History**:
```typescript
// Store last 3 keys per chat
interface ChatKeyHistory {
  current: string;      // Active key
  previous: string;     // Last key (for decrypt old messages)
  timestamp: number;    // When current key activated
}

// Derive keys:
// current = derive(password, chatId, "current", timestamp)
// previous = derive(password, chatId, "previous", oldTimestamp)
```

**Rotation Mechanism**:
```
1. Check every 48h if online
2. If both users online → generate new key
3. Encrypt new key with chat password
4. Send to partner via chat
5. Both update key history
6. New messages use new key
7. Old messages decrypt with previous key
8. 3rd rotation drops oldest key
```

**Refresh Keys Button (3-dot menu)**:
- Manually triggers key rotation
- Works even if localStorage cleared
- Syncs key with partner
- Handles race conditions:
  - If partner also rotating → merge logic
  - If offline → queue for later
  - Show status: "Key refreshed" / "Pending sync"

## Implementation Plan

### Phase 1: Create simpleE2EE Module
**File**: `src/lib/simpleE2EE.ts`

```typescript
// Core functions:
export const deriveChatKey = (
  password: string, 
  chatId: string, 
  keyType: "current" | "previous" = "current",
  timestamp?: number
): string

export const encryptMessage = (message: string, key: string)
export const decryptMessage = (ciphertext: string, iv: string, key: string)

// Key history management
export const storeChatKeyHistory = (chatId: string, history: ChatKeyHistory)
export const getChatKeyHistory = (chatId: string): ChatKeyHistory | null
export const getCurrentKey = (chatId: string): string | null
export const getAllKeys = (chatId: string): string[]

// Password management
export const setChatPassword = (password: string)  // sessionStorage
export const getChatPassword = (): string | null
export const clearChatPassword = ()
export const isChatPasswordExpired = (): boolean
```

**Key Derivation**:
```typescript
// Each key derivation includes timestamp to ensure uniqueness
const salt = `${chatId}_${keyType}_${timestamp || 'current'}`;
const key = CryptoJS.PBKDF2(password, salt, {
  keySize: 256/32,
  iterations: 150000,
  hasher: CryptoJS.algo.SHA256
});
```

### Phase 2: Settings - Chat Password
**File**: `src/components/settings/Settings.tsx`

```tsx
// Add to settings:
<div className="space-y-2">
  <Label>Chat Encryption Password</Label>
  <Input 
    type="password"
    value={chatPassword}
    onChange={(e) => setChatPassword(e.target.value)}
    placeholder="Set chat password"
  />
  <p className="text-xs text-gray-400">
    Used for E2EE. Keep this secure and don't share via chat.
  </p>
  <Button onClick={handleSaveChatPassword}>Save Password</Button>
</div>
```

**Storage**:
- Store in sessionStorage (for current session)
- Also store encrypted in Supabase profile (for new devices)

### Phase 3: Session Management
**File**: `src/hooks/useSessionTimeout.ts`

```typescript
export const useSessionTimeout = () => {
  // Existing presence logic (away at 5min, offline at 15min)
  // Add:
  
  // After 5min inactive:
  // - clearChatPassword()
  // - Show "Enter chat password" prompt
  
  // After 15min inactive:
  // - logout()
  // - Redirect to calculator
  // - Clear all sessions
};
```

### Phase 4: Update useChatData Hook
**File**: `src/hooks/useChatData.ts`

```typescript
// Simplified flow:
export const useChatData = (chatId: string, userId: string) => {
  const [password, setPassword] = useState<string | null>(null);
  const [keyHistory, setKeyHistory] = useState<ChatKeyHistory | null>(null);
  
  // On mount:
  useEffect(() => {
    // 1. Get password from session or prompt
    const pwd = getChatPassword() || promptForPassword();
    setPassword(pwd);
    
    // 2. Load key history
    const history = getChatKeyHistory(chatId);
    setKeyHistory(history);
    
    // 3. Derive current key
    const currentKey = deriveChatKey(pwd, chatId, "current");
    // 4. Check rotation needed
    checkAndRotateKey(chatId, pwd, currentKey);
  }, [chatId]);
  
  // Try multiple keys for decryption:
  const decryptWithHistory = (ciphertext: string, iv: string): string | null => {
    if (!keyHistory) return null;
    
    // Try current key first
    let decrypted = decryptMessage(ciphertext, iv, keyHistory.current);
    if (decrypted) return decrypted;
    
    // Try previous key (for old messages)
    if (keyHistory.previous) {
      decrypted = decryptMessage(ciphertext, iv, keyHistory.previous);
      if (decrypted) return decrypted;
    }
    
    return null; // Failed to decrypt
  };
};
```

### Phase 5: Auto Key Rotation
**File**: `src/hooks/useKeyRotation.ts` (simplified)

```typescript
export const useKeyRotation = (chatId: string) => {
  useEffect(() => {
    // Check every hour
    const interval = setInterval(async () => {
      const history = getChatKeyHistory(chatId);
      if (!history) return;
      
      const timeSinceRotation = Date.now() - history.timestamp;
      const fortyEightHours = 48 * 60 * 60 * 1000;
      
      if (timeSinceRotation > fortyEightHours) {
        // Check if both users online
        const { data: presence } = await supabase
          .from('presence_updates')
          .select('status')
          .eq('user_id', otherUserId)
          .single();
          
        if (presence?.status === 'online') {
          await rotateKey(chatId);
        }
      }
    }, 60 * 60 * 1000); // Check every hour
    
    return () => clearInterval(interval);
  }, [chatId]);
};

const rotateKey = async (chatId: string) => {
  // 1. Generate new key
  // 2. Shift history: previous → old, current → previous, new → current
  // 3. Encrypt new key with chat password
  // 4. Send to partner
  // 5. Update local key history
};
```

### Phase 6: Refresh Keys Button
**File**: `src/components/chat/ChatActions.tsx`

```tsx
// In 3-dot menu:
<button 
  onClick={handleRefreshKeys}
  className="flex items-center gap-2 w-full px-2 py-1"
>
  <RefreshCw className="h-4 w-4" />
  <span>Refresh Keys</span>
  {keyRotationStatus && (
    <Badge variant={keyRotationStatus === 'pending' ? 'secondary' : 'success'}>
      {keyRotationStatus}
    </Badge>
  )}
</button>
```

**Race Condition Handling**:
```typescript
const handleRefreshKeys = async () => {
  // 1. Check if rotation already in progress
  if (isRotating) return;
  
  // 2. Lock rotation (prevent concurrent)
  setIsRotating(true);
  
  try {
    // 3. Generate new key
    // 4. Send to partner with timestamp
    // 5. Wait for acknowledgment
    // 6. Update local state
  } catch (error) {
    // 7. Handle error, retry if needed
  } finally {
    setIsRotating(false);
  }
};
```

### Phase 7: Password Prompt UI
**File**: `src/components/auth/ChatPasswordPrompt.tsx`

```tsx
<Dialog open={showPrompt} onOpenChange={setShowPrompt}>
  <DialogContent className="glass">
    <DialogHeader>
      <DialogTitle>🔐 Enter Chat Password</DialogTitle>
      <DialogDescription>
        Enter your chat encryption password
      </DialogDescription>
    </DialogHeader>
    
    <div className="space-y-4">
      <Input 
        type="password"
        placeholder="Chat password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
      />
      
      <div className="text-xs text-amber-400">
        Password expired after 5 minutes of inactivity
      </div>
      
      <Button onClick={handleSubmit} className="w-full">
        Unlock Chat
      </Button>
      
      <Button 
        variant="ghost" 
        onClick={() => setShowPrompt(false)}
        className="w-full"
      >
        Cancel (view chat list only)
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

## Security Features

✅ **Chat password** in settings (separate from login)  
✅ **PBKDF2 150k** iterations  
✅ **Auto key rotation** every 48h when online  
✅ **Key history** (last 2 keys for backward decryption)  
✅ **Session timeout**: 5min for chat, 15min for login  
✅ **Refresh Keys** button for manual rotation  
✅ **Race condition handling** for concurrent rotations  
✅ **Messages encrypted** in database  

## User Experience

1. **Initial Setup**:
   - User sets chat password in Settings
   - Password stored in session + Supabase

2. **Daily Use**:
   - Enter chat password once (stored 5min)
   - Auto-rotate keys every 48h (seamless)
   - Can manually refresh keys anytime

3. **After localStorage Clear**:
   - Enter chat password again
   - Previous messages still decrypt (stored key history)
   - Can refresh keys to sync with partner

4. **Session Timeout**:
   - 5min inactive → password expires, can't enter chats
   - 15min inactive → full logout, back to calculator

## Files Summary

**Create**:
- `src/lib/simpleE2EE.ts` (250 lines)
- `src/hooks/useSessionTimeout.ts` (80 lines)
- `src/components/auth/ChatPasswordPrompt.tsx` (100 lines)

**Modify**:
- `src/hooks/useChatData.ts` (simplify to 200 lines)
- `src/hooks/useKeyRotation.ts` (simplify to 100 lines)
- `src/components/settings/Settings.tsx` (add chat password)
- `src/components/chat/ChatActions.tsx` (add refresh button)

**Delete**:
- `src/lib/encryption/keyManagement.ts`
- `src/lib/cryptoService.ts`
- Old complex crypto files

**Net Result**: ~350 lines added, ~670 deleted = **320 lines saved**

---

## Ready to Implement?

**This plan addresses**:
✅ Separate chat password (in settings)  
✅ 5min chat timeout, 15min full logout  
✅ Auto key rotation every 48h  
✅ Key history to handle localStorage clears  
✅ Manual "Refresh Keys" button  
✅ Race condition handling  

**Please confirm to begin implementation!**
