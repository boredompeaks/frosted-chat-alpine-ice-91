# CalcIta - Production Deployment Guide

This comprehensive guide walks you through deploying CalcIta to production with best practices for security, performance, and reliability.

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [Security Hardening](#security-hardening)
5. [Deployment Platforms](#deployment-platforms)
6. [Post-Deployment Steps](#post-deployment-steps)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

Before deploying to production, ensure you have:

### Required Services

- [ ] **Supabase Project** - For database, auth, and realtime
- [ ] **Domain Name** - For your application
- [ ] **SSL Certificate** - Usually provided by hosting platform
- [ ] **TURN Servers** (Optional) - For WebRTC calls (can use public ones)

### Code Preparation

- [ ] All tests passing (`npm test`)
- [ ] No console errors in production build
- [ ] TypeScript types validated (`npm run type-check`)
- [ ] Dependencies audited (`npm audit`)
- [ ] Build succeeds locally (`npm run build`)
- [ ] Environment variables documented

### Security Review

- [ ] Default PIN changed from 1337
- [ ] All secrets using environment variables
- [ ] No hardcoded credentials in code
- [ ] CORS properly configured
- [ ] RLS policies tested
- [ ] Rate limiting enabled
- [ ] CSP headers configured

---

## Environment Configuration

### 1. Copy Environment Template

```bash
cp .env.example .env.production
```

### 2. Configure Required Variables

Edit `.env.production`:

```env
# ============================================
# CRITICAL - MUST CHANGE THESE
# ============================================

# Supabase Configuration
REACT_APP_SUPABASE_URL=https://bjnxsfipttpdwodktcwt.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_actual_anon_key_here

# Security (CHANGE THESE!)
VITE_CALCULATOR_PIN=your_secure_pin_here
VITE_ENCRYPTION_SALT=your_unique_salt_at_least_32_chars_long
VITE_DEFAULT_SESSION_KEY=your_unique_bootstrap_key_minimum_32_chars

# Application
VITE_APP_URL=https://your-domain.com
NODE_ENV=production

# ============================================
# OPTIONAL BUT RECOMMENDED
# ============================================

# WebRTC (Use your own TURN servers for best performance)
VITE_TURN_SERVER_1=turn:your-turn-server.com:3478
VITE_TURN_USERNAME_1=your_username
VITE_TURN_CREDENTIAL_1=your_password

# Feature Flags
VITE_ENABLE_VIDEO_CALLS=true
VITE_ENABLE_DISAPPEARING_MESSAGES=true
VITE_ENABLE_ONE_TIME_VIEW=true
VITE_ENABLE_AUTO_KEY_ROTATION=true

# Performance
VITE_MAX_FILE_SIZE=52428800
VITE_MESSAGE_PAGE_SIZE=50

# Debug (MUST BE FALSE IN PRODUCTION)
VITE_DEBUG_MODE=false
VITE_ENABLE_CONSOLE_LOGS=false
```

### 3. Secure Your Secrets

**NEVER commit `.env.production` to git!**

Add to `.gitignore`:
```
.env
.env.local
.env.production
.env.*.local
```

---

## Database Setup

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose organization and region (select closest to your users)
4. Set strong database password
5. Wait for project to initialize

### Step 2: Run Migrations

**Option A: Using Supabase Dashboard**

1. Open your Supabase project
2. Go to **SQL Editor**
3. Click "New Query"
4. Copy contents of `supabase/migrations/20250101000000_calcita_e2ee_schema.sql`
5. Paste and click "Run"
6. Verify all tables created successfully

**Option B: Using Supabase CLI**

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### Step 3: Verify Database Setup

Run these queries to verify:

```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- Verify RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Test helper function
SELECT public.is_user_in_chat(
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid
);
```

### Step 4: Configure Realtime

1. Go to **Database** → **Replication**
2. Enable replication for these tables:
   - `messages`
   - `reactions`
   - `presence`
   - `chat_participants`

### Step 5: Setup Storage (for media)

1. Go to **Storage**
2. Create bucket: `chat-media`
3. Set policies:

```sql
-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-media' AND
  auth.uid() IS NOT NULL
);

-- Allow users to view media in their chats
CREATE POLICY "Users can view chat media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-media' AND
  auth.uid() IS NOT NULL
);
```

---

## Security Hardening

### 1. Supabase Security Settings

**Authentication:**
- Enable email confirmation
- Set password requirements (min 8 chars)
- Configure JWT expiry (7 days recommended)
- Enable MFA (optional but recommended)

**API Settings:**
- Enable rate limiting (60 requests/min)
- Set CORS allowed origins (your domain only)
- Disable public schema access if not needed

**Database:**
- Verify all RLS policies active
- Test policies with different user roles
- Enable SSL connections only

### 2. Application Security Headers

Add to your hosting platform configuration:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; media-src 'self' https://*.supabase.co; frame-ancestors 'none';

X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### 3. TURN Server Security

**Using Public TURN Servers:**
- Acceptable for MVP/testing
- May have rate limits
- Shared with other users

**Production Recommendations:**
```bash
# Setup your own TURN server (Coturn)
sudo apt-get install coturn

# Configure /etc/turnserver.conf
listening-port=3478
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=your-secret-key
realm=your-domain.com
total-quota=100
stale-nonce=600
cert=/path/to/cert.pem
pkey=/path/to/key.pem
```

---

## Deployment Platforms

Choose your preferred platform:

### Option 1: Vercel (Recommended - Easiest)

**Advantages:**
- Zero configuration
- Automatic HTTPS
- Global CDN
- Great DX

**Steps:**

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/username/calcita.git
   git push -u origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project"
   - Select your repository
   - Framework: Vite
   - Build command: `npm run build`
   - Output directory: `dist`

3. **Configure Environment Variables**
   - Go to Project Settings → Environment Variables
   - Add all variables from `.env.production`
   - Separate Production/Preview/Development as needed

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Get deployment URL

5. **Configure Custom Domain** (Optional)
   - Go to Settings → Domains
   - Add your domain
   - Update DNS records as instructed

**Vercel Configuration File** (`vercel.json`):
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

---

### Option 2: Cloudflare Pages

**Advantages:**
- Free tier very generous
- Great performance
- DDoS protection
- Workers for serverless

**Steps:**

1. **Push to Git**
   ```bash
   git push origin main
   ```

2. **Create Pages Project**
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com)
   - Pages → Create a project
   - Connect to Git repository
   - Build settings:
     - Framework: Vite
     - Build command: `npm run build`
     - Build output: `dist`

3. **Environment Variables**
   - Settings → Environment Variables
   - Add all production variables
   - Save and redeploy

4. **Custom Domain**
   - Custom domains → Add domain
   - Automatic SSL certificate

---

### Option 3: Netlify

**Advantages:**
- Easy deployment
- Good free tier
- Built-in forms
- Edge functions

**Steps:**

1. **Create `netlify.toml`**
   ```toml
   [build]
     command = "npm run build"
     publish = "dist"
   
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   
   [[headers]]
     for = "/*"
     [headers.values]
       X-Frame-Options = "DENY"
       X-Content-Type-Options = "nosniff"
   ```

2. **Deploy**
   ```bash
   npm install -g netlify-cli
   netlify login
   netlify init
   netlify deploy --prod
   ```

---

### Option 4: Self-Hosted (Docker)

**For full control and privacy**

1. **Create `Dockerfile`**
   ```dockerfile
   FROM node:18-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build
   
   FROM nginx:alpine
   COPY --from=builder /app/dist /usr/share/nginx/html
   COPY nginx.conf /etc/nginx/conf.d/default.conf
   EXPOSE 80
   CMD ["nginx", "-g", "daemon off;"]
   ```

2. **Create `nginx.conf`**
   ```nginx
   server {
       listen 80;
       server_name _;
       root /usr/share/nginx/html;
       index index.html;
   
       location / {
           try_files $uri $uri/ /index.html;
       }
   
       # Security headers
       add_header X-Frame-Options "DENY" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header Referrer-Policy "strict-origin-when-cross-origin" always;
   
       # Gzip compression
       gzip on;
       gzip_types text/plain text/css application/json application/javascript;
   }
   ```

3. **Create `docker-compose.yml`**
   ```yaml
   version: '3.8'
   services:
     calcita:
       build: .
       ports:
         - "80:80"
       environment:
         - NODE_ENV=production
       restart: unless-stopped
   ```

4. **Deploy**
   ```bash
   docker-compose up -d
   ```

5. **Setup SSL with Let's Encrypt**
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

---

## Post-Deployment Steps

### 1. Verify Deployment

**Functional Tests:**
- [ ] Site loads without errors
- [ ] Calculator shell displays correctly
- [ ] PIN unlock works
- [ ] Registration flow works
- [ ] Login works
- [ ] Send/receive messages (E2EE)
- [ ] Media upload works
- [ ] Voice call connects
- [ ] Video call connects
- [ ] Presence updates correctly
- [ ] Key rotation works

**Performance Tests:**
```bash
# Lighthouse audit
npm install -g lighthouse
lighthouse https://your-domain.com --view

# Load testing
npm install -g artillery
artillery quick --count 10 --num 100 https://your-domain.com
```

### 2. Configure Supabase for Production

**Update Auth Settings:**
1. Go to Authentication → URL Configuration
2. Site URL: `https://your-domain.com`
3. Redirect URLs: `https://your-domain.com/**`

**Configure Email Templates:**
1. Authentication → Email Templates
2. Customize confirmation and password reset emails
3. Add your branding

### 3. Setup Monitoring

**Vercel Analytics:**
```bash
npm install @vercel/analytics
```

Add to `main.tsx`:
```typescript
import { Analytics } from '@vercel/analytics/react';

<Analytics />
```

**Supabase Monitoring:**
- Database → Usage (monitor query performance)
- API → Logs (check for errors)
- Auth → Users (track signups)

### 4. Configure Backups

**Supabase Automatic Backups:**
- Included in all paid plans
- Daily backups retained 7 days
- Point-in-time recovery available

**Manual Backup:**
```bash
# Using pg_dump
pg_dump -h db.your-project-ref.supabase.co \
  -U postgres \
  -d postgres \
  --no-owner \
  --no-acl \
  > backup_$(date +%Y%m%d).sql
```

### 5. Setup Alerts

**Uptime Monitoring:**
- Use UptimeRobot, Pingdom, or similar
- Monitor: `https://your-domain.com`
- Alert on: Downtime, slow response

**Error Tracking:**
```bash
# Install Sentry (optional)
npm install @sentry/react

# Configure in main.tsx
import * as Sentry from "@sentry/react";

if (import.meta.env.PROD) {
  Sentry.init({
    dsn: "your-sentry-dsn",
    environment: "production",
  });
}
```

---

## Monitoring & Maintenance

### Daily Checks

- [ ] Check Supabase logs for errors
- [ ] Monitor API usage and limits
- [ ] Check uptime monitor alerts
- [ ] Review error tracking reports

### Weekly Tasks

- [ ] Review user feedback
- [ ] Check database size/growth
- [ ] Monitor storage usage
- [ ] Review security logs

### Monthly Tasks

- [ ] Update dependencies (`npm update`)
- [ ] Security audit (`npm audit`)
- [ ] Review and rotate secrets
- [ ] Database performance review
- [ ] Cost optimization review

### Key Metrics to Monitor

**Performance:**
- Page load time (< 2s)
- Time to interactive (< 3s)
- First contentful paint (< 1s)
- Message send latency (< 100ms)

**Usage:**
- Daily active users
- Messages sent per day
- Call duration and quality
- Storage used

**Errors:**
- JavaScript errors
- API errors (5xx)
- Failed authentications
- Failed key rotations

---

## Troubleshooting

### Build Failures

**Issue:** Build fails with TypeScript errors
```bash
# Solution
npm run type-check
# Fix all type errors, then rebuild
npm run build
```

**Issue:** Out of memory during build
```bash
# Solution - Increase Node memory
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### Deployment Issues

**Issue:** Environment variables not working
- Check variable names match exactly (case-sensitive)
- Verify VITE_ prefix for client-side variables
- Redeploy after adding variables

**Issue:** White screen after deployment
- Check browser console for errors
- Verify all assets are loading (check Network tab)
- Check base URL configuration in vite.config.ts

### Runtime Errors

**Issue:** Messages not encrypting
```sql
-- Check encryption keys table
SELECT * FROM public.encryption_keys 
WHERE chat_id = 'your-chat-id' 
ORDER BY created_at DESC LIMIT 5;

-- Verify key status
SELECT status, sender_acknowledged, receiver_acknowledged 
FROM public.encryption_keys 
WHERE chat_id = 'your-chat-id' AND status = 'active';
```

**Issue:** WebRTC calls not connecting
- Verify TURN servers are accessible
- Check WebRTC permissions in browser
- Test ICE connectivity: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

**Issue:** Real-time updates not working
- Check Supabase realtime is enabled
- Verify RLS policies allow SELECT
- Check browser network tab for WebSocket connection

### Database Issues

**Issue:** Slow queries
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_name ON table_name(column_name);
```

**Issue:** Connection limit reached
- Upgrade Supabase plan
- Implement connection pooling
- Review and close unused connections

### Security Issues

**Issue:** CORS errors
```javascript
// Update Supabase allowed origins
// Settings → API → CORS Allowed Origins
https://your-domain.com
```

**Issue:** Unauthorized access
- Verify RLS policies are active
- Test policies with different user roles
- Check JWT token expiry

---

## Rollback Procedure

If deployment fails or issues arise:

### Vercel Rollback
1. Go to Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"

### Database Rollback
```bash
# Restore from backup
psql -h db.your-project-ref.supabase.co \
  -U postgres \
  -d postgres \
  < backup_20250101.sql
```

### Quick Fix Deployment
```bash
# Revert to last commit
git revert HEAD
git push origin main

# Or reset to specific commit
git reset --hard <commit-hash>
git push -f origin main
```

---

## Support Resources

### Documentation
- [CalcIta Docs](https://docs.calcita.app)
- [Supabase Docs](https://supabase.com/docs)
- [Vite Docs](https://vitejs.dev)

### Community
- [GitHub Issues](https://github.com/yourusername/calcita/issues)
- [Discord Server](https://discord.gg/calcita)
- [Stack Overflow Tag](https://stackoverflow.com/questions/tagged/calcita)

### Professional Support
- Email: support@calcita.app
- Priority support available for production deployments

---

## Deployment Checklist

Print this and check off as you complete each step:

### Pre-Deployment
- [ ] Code reviewed and tested
- [ ] Environment variables configured
- [ ] Secrets rotated from defaults
- [ ] Build successful locally
- [ ] Tests passing

### Database
- [ ] Supabase project created
- [ ] Migrations executed
- [ ] RLS policies tested
- [ ] Realtime enabled
- [ ] Storage configured
- [ ] Backup scheduled

### Security
- [ ] HTTPS enabled
- [ ] CORS configured
- [ ] Security headers set
- [ ] Rate limiting enabled
- [ ] Secrets secured

### Deployment
- [ ] Platform selected and configured
- [ ] Environment variables set
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Build and deployment successful

### Post-Deployment
- [ ] Functional tests completed
- [ ] Performance tested
- [ ] Monitoring configured
- [ ] Alerts set up
- [ ] Documentation updated
- [ ] Team notified

---

## Conclusion

Congratulations! Your CalcIta instance should now be running in production. 

Remember:
- Security is ongoing, not one-time
- Monitor your application regularly
- Keep dependencies updated
- Respond quickly to security alerts
- Collect user feedback for improvements

For any issues or questions, refer to the troubleshooting section or contact support.

**Happy secure messaging! 🔐**