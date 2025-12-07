# CalcIta - Quick Start Guide

Get CalcIta up and running in **5 minutes**.

---

## ⚡ Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org)
- **Supabase Account** - [Sign up free](https://supabase.com)
- **Text Editor** - VS Code, Sublime, etc.

---

## 🚀 Installation (5 Steps)

### Step 1: Install Dependencies

```bash
npm install
```

⏱️ Takes ~2 minutes

---

### Step 2: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your editor
code .env  # or nano .env, vim .env, etc.
```

**Update these values:**
```env
REACT_APP_SUPABASE_URL=https://bjnxsfipttpdwodktcwt.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqbnhzZmlwdHRwZHdvZGt0Y3d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcxMTcsImV4cCI6MjA3NzE1MzExN30.Ak84d2rGq9PBom-sXLfhsaWPT8JOktU01kwJN1BGdjI
VITE_CALCULATOR_PIN=1337
```

⚠️ **Change the PIN** from 1337 to your own secure PIN!

---

### Step 3: Setup Database

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Open **SQL Editor**
3. Click **New Query**
4. Copy contents of `supabase/migrations/20250101000000_calcita_e2ee_schema.sql`
5. Paste and click **Run**
6. Wait for "Success" message

✅ Your database is ready!

---

### Step 4: Start Development Server

```bash
npm run dev
```

You should see:
```
  VITE v5.4.1  ready in 123 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

### Step 5: Open & Test

1. **Open browser:** http://localhost:5173
2. **You'll see:** Calculator interface
3. **Enter PIN:** `1337` (or your custom PIN)
4. **Unlock:** Calculator transitions to chat interface
5. **Create account:** Click "Create Account"
6. **Start chatting!** 🎉

---

## 🎯 First Use Walkthrough

### 1. Create Your Account

- Click **"Create Account"**
- Enter email, password, username
- Click **"Sign Up"**
- ✅ You're registered!

### 2. Create a Chat

- Click **"New Chat"** button (+ icon)
- Search for a user by username
- Click their name to start chat
- ✅ Chat created with E2EE!

### 3. Send First Message

- Type your message
- Press **Enter** or click **Send**
- 🔐 Message is automatically encrypted
- ✅ Recipient receives encrypted message!

### 4. Try Voice/Video Call

- Open a chat
- Click **phone icon** for audio call
- Click **video icon** for video call
- Accept permissions when prompted
- ✅ Encrypted call connected!

### 5. Enable Disappearing Messages

- Click **chat settings** (⋮ menu)
- Enable **"Disappearing Messages"**
- Set timer (e.g., 5 minutes)
- ✅ Messages auto-delete after timer!

---

## 🔐 Understanding the Calculator Shell

### What is it?

The calculator shell is a **stealth mode** feature that disguises CalcIta as a regular calculator app.

### How it works:

1. **App opens** → Looks like normal calculator
2. **Enter PIN** → Type `1337` (or your PIN) using number buttons
3. **Unlocks** → Calculator smoothly transitions to secure chat
4. **Session persists** → Stays unlocked until you close browser

### Changing the PIN:

```env
# In .env file:
VITE_CALCULATOR_PIN=your_secure_pin
```

Then restart the dev server.

---

## 🛠️ Common Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run type checking
npm run type-check

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix
```

---

## 📱 Using the Interface

### Calculator Mode

- **Numbers (0-9):** Enter PIN or do calculations
- **Operators (+, -, ×, ÷):** Basic math operations
- **Lock icon:** Shows unlock status
- **C button:** Clear calculation
- **⌫ button:** Delete last digit

### Chat Mode (After Unlock)

- **Chat list:** All your conversations
- **+ button:** Create new chat
- **Search:** Find users or messages
- **Settings:** User profile and preferences

### Chat Screen

- **Message list:** All messages (newest at top)
- **Input box:** Type messages here
- **📎 icon:** Attach media
- **⏱️ icon:** Enable disappearing messages
- **📞 icon:** Start voice call
- **📹 icon:** Start video call

---

## 🔒 Security Features Enabled

✅ **End-to-End Encryption (E2EE)**
- All messages encrypted with AES-256-GCM
- Only you and recipient can read messages

✅ **Automatic Key Rotation**
- Keys rotate every 24 hours
- Old messages remain accessible

✅ **Disappearing Messages**
- Auto-delete after specified time
- Timer starts after message is read

✅ **One-Time View Media**
- Photos/videos delete after first view
- Cannot be saved or screenshot-protected

✅ **Encrypted Calls**
- Voice and video calls fully encrypted
- Uses WebRTC with TURN relay

---

## ⚙️ Configuration Options

### Essential Settings (.env)

```env
# Change default PIN (REQUIRED for production!)
VITE_CALCULATOR_PIN=1337

# Key rotation interval (default: 24 hours in ms)
VITE_KEY_ROTATION_INTERVAL=86400000

# Max file upload size (default: 50MB)
VITE_MAX_FILE_SIZE=52428800

# Enable/disable features
VITE_ENABLE_VIDEO_CALLS=true
VITE_ENABLE_DISAPPEARING_MESSAGES=true
VITE_ENABLE_ONE_TIME_VIEW=true
```

### Optional Settings

```env
# Debug mode (development only!)
VITE_DEBUG_MODE=false

# Custom TURN servers for better call quality
VITE_TURN_SERVER_1=turn:your-server.com:3478
VITE_TURN_USERNAME_1=username
VITE_TURN_CREDENTIAL_1=password
```

---

## 🐛 Troubleshooting

### Calculator won't unlock

**Problem:** Entering PIN doesn't work

**Solutions:**
- Check PIN in `.env` file matches what you're typing
- Default PIN is `1337`
- Try clearing browser cache
- Restart dev server after changing `.env`

---

### Messages not sending

**Problem:** Messages stuck or not appearing

**Solutions:**
- Check internet connection
- Verify Supabase credentials in `.env`
- Check browser console for errors (F12)
- Ensure database migration was run successfully

---

### Calls not connecting

**Problem:** Voice/video calls fail to connect

**Solutions:**
- Allow camera/microphone permissions
- Check TURN server configuration
- Try different browser (Chrome/Firefox recommended)
- Check firewall isn't blocking WebRTC

---

### Build errors

**Problem:** `npm run build` fails

**Solutions:**
```bash
# Clear cache and reinstall
rm
