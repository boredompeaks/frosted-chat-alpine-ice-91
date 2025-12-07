# CalcIta Production Deployment Guide

## 🚀 Complete Production Deployment Guide

This guide provides step-by-step instructions for deploying CalcIta (secure E2EE messaging app) to production environments with enterprise-grade security, performance, and reliability.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [System Requirements](#system-requirements)
3. [Environment Setup](#environment-setup)
4. [Database Configuration](#database-configuration)
5. [Security Configuration](#security-configuration)
6. [Application Deployment](#application-deployment)
7. [Monitoring & Observability](#monitoring--observability)
8. [Performance Optimization](#performance-optimization)
9. [Backup & Recovery](#backup--recovery)
10. [Maintenance & Updates](#maintenance--updates)
11. [Troubleshooting](#troubleshooting)
12. [Security Best Practices](#security-best-practices)

---

## 🔧 Prerequisites

### Required Accounts & Services

- **Supabase Account** (Database & Authentication)
  - [Create account](https://supabase.com)
  - Create new project
  - Note project URL and API keys

- **Domain & SSL Certificate**
  - Purchase domain name
  - Obtain SSL certificate (Let's Encrypt recommended)
  - Configure DNS records

- **Hosting Platform** (Choose one)
  - **Vercel** (Recommended - Easy deployment)
  - **Netlify** (Alternative)
  - **Cloudflare Pages**
  - **Self-hosted VPS** (Advanced)

- **Monitoring Service** (Optional but recommended)
  - Sentry (Error tracking)
  - Google Analytics (User analytics)
  - DataDog (APM monitoring)

### Required Software

- Node.js 18+ and npm
- Git
- OpenSSL (for certificate generation)
- PostgreSQL client (for database access)

---

## 💻 System Requirements

### Minimum Requirements

- **CPU:** 2 cores
- **RAM:** 4GB
- **Storage:** 20GB SSD
- **Network:** 100Mbps

### Recommended Production Requirements

- **CPU:** 4+ cores
- **RAM:** 8GB+
- **Storage:** 50GB+ NVMe SSD
- **Network:** 1Gbps
- **Backup:** Automated daily backups

### Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## ⚙️ Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/calcita.git
cd calcita
```

### 2. Install Dependencies

```bash
npm ci --only=production
```

### 3. Environment Configuration

Create `.env.production` from the template:

```bash
cp .env.production.template .env.production
```

**Critical Environment Variables:**

```bash
# Application
NODE_ENV=production
REACT_APP_APP_NAME=CalcIta
REACT_APP_APP_VERSION=1.0.0

# Supabase Configuration (CRITICAL)
REACT_APP_SUPABASE_URL=https://your-project-ref.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key_here
VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Security (CHANGE THESE!)
VITE_CALCULATOR_PIN=your_secure_pin_here
VITE_DEFAULT_SESSION_KEY=your_unique_session_key_here

# TURN Servers for WebRTC
VITE_TURN_SERVER_1=turn:your-turn-server.com:3478
VITE_TURN_USERNAME_1=your_turn_username
VITE_TURN_CREDENTIAL_1=your_turn_password
VITE_TURN_SERVER_2=turn:backup-server.com:3478
VITE_TURN_USERNAME_2=backup_username
VITE_TURN_CREDENTIAL_2=backup_password

# Feature Flags
VITE_ENABLE_ENCRYPTION=true
VITE_ENABLE_VIDEO_CALLS=true
VITE_ENABLE_FILE_SHARING=true
VITE_ENABLE_DISAPPEARING_MESSAGES=true

# Monitoring
VITE_SENTRY_DSN=your_sentry_dsn_here
VITE_ENABLE_PERFORMANCE_MONITORING=true
VITE_MONITORING_ENDPOINT=https://your-monitoring-endpoint.com

# Security Headers
VITE_ENABLE_SECURITY_HEADERS=true
VITE_CONTENT_SECURITY_POLICY="default-src 'self'; script-src 'self' 'unsafe-inline' https://trusted-cdn.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:;"

# CORS
VITE_CORS_ORIGINS=https://calcita.yourdomain.com,https://www.calcita.yourdomain.com
```

### 4. Security Validation

Run the security check script:

```bash
chmod +x deploy-production.sh
./deploy-production.sh --skip-checks
```

---

## 🗄️ Database Configuration

### 1. Supabase Setup

1. **Create Database Schema**

```sql
-- Run this in Supabase SQL Editor
\i WORKING_SCHEMA.sql
```

2. **Configure Row Level Security (RLS)**

All tables have RLS enabled. Verify policies:

```sql
-- Check enabled policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public';
```

3. **Create Storage Buckets**

```sql
-- Create chat media bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-media', 'chat-media', true);

-- Configure storage policies
CREATE POLICY "Chat media upload policy" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Chat media view policy" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media' AND
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.chat_participants cp ON cp.chat_id = m.chat_id
      WHERE m.media_url IS NOT NULL
      AND m.media_url LIKE '%' || storage.get_object_public_url('chat-media', name)
      AND cp.user_id = auth.uid()
    )
  );
```

4. **Setup Database Triggers**

```sql
-- Create maintenance function
CREATE OR REPLACE FUNCTION public.maintenance_cleanup()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
  deleted_keys INTEGER;
  deleted_transfers INTEGER;
BEGIN
  -- Clean up expired encryption keys
  SELECT public.cleanup_expired_keys() INTO deleted_keys;

  -- Clean up expired key transfers
  SELECT public.cleanup_expired_key_transfers() INTO deleted_transfers;

  result := jsonb_build_object(
    'deleted_keys', deleted_keys,
    'deleted_transfers', deleted_transfers,
    'cleaned_at', NOW()
  );

  RETURN result;
END;
$$;

-- Schedule automatic cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-expired-data', '0 2 * * *', 'SELECT public.maintenance_cleanup();');
```

### 2. Database Monitoring

Setup database monitoring:

```sql
-- Enable query statistics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Monitor slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

---

## 🔒 Security Configuration

### 1. SSL/TLS Configuration

**Using Let's Encrypt (certbot):**

```bash
# Install certbot
sudo apt install certbot

# Generate certificate
sudo certbot certonly --standalone -d calcita.yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

**Nginx Configuration:**

```nginx
server {
    listen 443 ssl http2;
    server_name calcita.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/calcita.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/calcita.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://trusted-cdn.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:;" always;
    
    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
    
    location / {
        root /var/www/calcita/dist;
        try_files $uri $uri/ /index.html;
        
        # Enable gzip compression
        gzip on;
        gzip_vary on;
        gzip_min_length 1024;
        gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    }
    
    # API Rate Limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Login Rate Limiting
    location /auth/login {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://localhost:3000;
    }
    
    # WebSocket Support for real-time features
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name calcita.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### 2. Firewall Configuration

```bash
# UFW (Ubuntu Firewall)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# iptables (Alternative)
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -A INPUT -j DROP
```

### 3. Application Security

**Security Headers in Production Build:**

Create `_headers` file for Cloudflare Pages/Netlify:

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' https:; connect-src 'self' wss: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';

/static/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache, no-store, must-revalidate

/sw.js
  Cache-Control: no-cache
```

**Rate Limiting Implementation:**

```javascript
// Add to your API routes
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
```

---

## 🚀 Application Deployment

### Option 1: Vercel Deployment (Recommended)

1. **Install Vercel CLI:**

```bash
npm i -g vercel
```

2. **Configure Vercel:**

```bash
vercel login
vercel --prod
```

3. **Environment Variables:**

```bash
# Set production environment variables
vercel env add REACT_APP_SUPABASE_URL
vercel env add REACT_APP_SUPABASE_ANON_KEY
vercel env add VITE_CALCULATOR_PIN
# ... add all other environment variables
```

4. **Deploy:**

```bash
vercel --prod
```

### Option 2: Self-Hosted Deployment

1. **Build Application:**

```bash
npm run build
```

2. **Setup Server:**

```bash
# Install Nginx
sudo apt install nginx

# Copy build files
sudo cp -r dist/* /var/www/calcita/

# Setup SSL
sudo certbot --nginx -d calcita.yourdomain.com

# Start services
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Option 3: Docker Deployment

**Dockerfile:**

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
```

**Docker Compose:**

```yaml
version: '3.8'

services:
  calcita:
    build: .
    ports:
      - "80:80"
      - "443:443"
    environment:
      - NODE_ENV=production
    volumes:
      - ./ssl:/etc/ssl/certs
    restart: unless-stopped
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl/certs
      - ./logs:/var/log/nginx
    restart: unless-stopped
```

---

## 📊 Monitoring & Observability

### 1. Application Monitoring

**Setup Sentry:**

```bash
npm install @sentry/react @sentry/tracing
```

```javascript
// src/index.tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

**Performance Monitoring:**

```javascript
// Automatic performance monitoring
import { performanceMonitor } from "./lib/monitoring/performance";

// Track custom events
performanceMonitor.recordUserAction('message_sent', {
  messageType: 'text',
  chatId: 'chat_123'
});

// Monitor encryption performance
await performanceMonitor.measureEncryptionTime(
  () => encryptMessage(data),
  'AES-256-GCM'
);
```

### 2. Infrastructure Monitoring

**Setup Node Exporter + Prometheus + Grafana:**

```bash
# Install monitoring stack
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v /path/to/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus

docker run -d \
  --name grafana \
  -p 3000:3000 \
  grafana/grafana
```

### 3. Database Monitoring

**Supabase Dashboard:**
- Monitor database performance
- Query performance
- Connection limits
- Storage usage

**Custom Alerts:**

```sql
-- Create alert function
CREATE OR REPLACE FUNCTION check_database_health()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  active_connections INTEGER;
  slow_queries INTEGER;
  deadlocks INTEGER;
BEGIN
  -- Check active connections
  SELECT count(*) INTO active_connections
  FROM pg_stat_activity
  WHERE state = 'active';
  
  -- Check slow queries
  SELECT count(*) INTO slow_queries
  FROM pg_stat_statements
  WHERE mean_time > 1000;
  
  result := jsonb_build_object(
    'active_connections', active_connections,
    'slow_queries', slow_queries,
    'checked_at', NOW()
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

### 4. Log Management

**Centralized Logging:**

```javascript
// Structured logging
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

---

## ⚡ Performance Optimization

### 1. Frontend Optimization

**Build Optimization:**

```bash
# Analyze bundle size
npm run build
npx webpack-bundle-analyzer dist/static/js/*.js

# Enable tree shaking
npm run build -- --mode production
```

**Code Splitting:**

```javascript
// Lazy load routes
const ChatListPage = React.lazy(() => import('./pages/ChatListPage'));
const ConversationPage = React.lazy(() => import('./pages/ConversationPage'));

// Lazy load components
const HeavyComponent = React.lazy(() => import('./components/HeavyComponent'));
```

**Image Optimization:**

```javascript
// Responsive images
<img
  srcSet="/image-320w.jpg 320w, /image-640w.jpg 640w, /image-1024w.jpg 1024w"
  sizes="(max-width: 320px) 280px, (max-width: 640px) 600px, 1024px"
  src="/image-640w.jpg"
  alt="Description"
/>
```

### 2. Database Optimization

**Index Optimization:**

```sql
-- Create missing indexes
CREATE INDEX CONCURRENTLY idx_messages_chat_created 
ON messages (chat_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_messages_sender_created 
ON messages (sender_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_encryption_keys_chat_status 
ON encryption_keys (chat_id, status) WHERE status = 'active';

-- Analyze table statistics
ANALYZE;
```

**Query Optimization:**

```sql
-- Use prepared statements for frequently executed queries
PREPARE get_messages AS
SELECT id, content, sender_id, created_at, read_at
FROM messages
WHERE chat_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

### 3. Caching Strategy

**Redis Caching:**

```javascript
const redis = require('redis');
const client = redis.createClient({
  host: 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD
});

// Cache user sessions
async function getUserSession(userId) {
  const cached = await client.get(`session:${userId}`);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Fetch from database
  const session = await fetchFromDatabase(userId);
  
  // Cache for 1 hour
  await client.setex(`session:${userId}`, 3600, JSON.stringify(session));
  
  return session;
}
```

**Application-Level Caching:**

```javascript
// Cache frequently accessed data
class CacheManager {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map();
  }
  
  set(key, value, ttlMs = 300000) { // 5 min default
    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + ttlMs);
  }
  
  get(key) {
    const expiry = this.ttl.get(key);
    if (expiry && Date.now() > expiry) {
      this.cache.delete(key);
      this.ttl.delete(key);
      return null;
    }
    return this.cache.get(key);
  }
}
```

### 4. CDN Configuration

**Cloudflare Setup:**

1. Add your domain to Cloudflare
2. Update DNS records to point to Cloudflare
3. Enable caching rules:

```
/static/* - Cache Level: Cache Everything, TTL: 1 month
/api/* - Cache Level: Bypass
/*.js - Cache Level: Cache Everything, TTL: 1 month
/*.css - Cache Level: Cache Everything, TTL: 1 month
```

---

## 💾 Backup & Recovery

### 1. Database Backup

**Automated Daily Backups:**

```bash
#!/bin/bash
# backup-database.sh

BACKUP_DIR="/backups/calcita"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="calcita_backup_$DATE.sql"

# Create backup
pg_dump $DATABASE_URL > $BACKUP_DIR/$BACKUP_FILE

# Compress backup
gzip $BACKUP_DIR/$BACKUP_FILE

# Keep only last 30 days of backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

# Upload to S3 (optional)
aws s3 cp $BACKUP_DIR/$BACKUP_FILE.gz s3://your-backup-bucket/database/
```

**Crontab Entry:**

```bash
# Add to crontab
0 2 * * * /path/to/backup-database.sh
```

### 2. File System Backup

**Application Files:**

```bash
#!/bin/bash
# backup-app.sh

APP_DIR="/var/www/calcita"
BACKUP_DIR="/backups/app"
DATE=$(date +%Y%m%d)

# Backup application files
tar -czf $BACKUP_DIR/calcita_app_$DATE.tar.gz $APP_DIR

# Backup Nginx configuration
cp /etc/nginx/sites-available/calcita $BACKUP_DIR/nginx_calcita_$DATE.conf
```

### 3. SSL Certificate Backup

```bash
# Backup SSL certificates
sudo cp -r /etc/letsencrypt /backups/ssl/letsencrypt_$(date +%Y%m%d)
```

### 4. Recovery Procedures

**Database Recovery:**

```bash
# Restore from backup
gunzip -c /backups/calcita_backup_20240115_020000.sql.gz | psql $DATABASE_URL
```

**Application Recovery:**

```bash
# Restore application files
cd /var/www
sudo tar -xzf /backups/app/calcita_app_20240115.tar.gz
sudo chown -R www-data:www-data calcita
sudo systemctl reload nginx
```

### 5. Disaster Recovery Plan

**Recovery Time Objectives (RTO):**
- Database: < 1 hour
- Application: < 30 minutes
- SSL Certificate: < 15 minutes

**Recovery Point Objectives (RPO):**
- Database: < 24 hours
- Application: < 1 hour
- User Data: < 1 hour

**Backup Verification:**

```bash
#!/bin/bash
# verify-backup.sh

BACKUP_FILE=$1

echo "Verifying backup: $BACKUP_FILE"

# Check backup file exists and is readable
if [ ! -r "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file is not readable"
    exit 1
fi

# Test database backup
if [[ $BACKUP_FILE == *.sql.gz ]]; then
    echo "Testing database backup..."
    gunzip -t "$BACKUP_FILE"
    if [ $? -eq 0 ]; then
        echo "Database backup is valid"
    else
        echo "ERROR: Database backup is corrupted"
        exit 1
    fi
fi

echo "Backup verification completed successfully"
```

---

## 🔧 Maintenance & Updates

### 1. Regular Maintenance Tasks

**Weekly Tasks:**

```bash
#!/bin/bash
# weekly-maintenance.sh

echo "Starting weekly maintenance..."

# Update system packages
sudo apt update && sudo apt upgrade -y

# Clean package cache
sudo apt autoremove -y
sudo apt autoclean

# Rotate logs
sudo logrotate /etc/logrotate.conf

# Check disk space
df -h

# Check memory usage
free -h

# Restart services if needed
sudo systemctl restart nginx

echo "Weekly maintenance completed"
```

**Monthly Tasks:**

```bash
#!/bin/bash
# monthly-maintenance.sh

echo "Starting monthly maintenance..."

# Update Node.js packages
npm audit fix
npm update

# Database maintenance
sudo -u postgres psql -c "VACUUM ANALYZE;"

# Check SSL certificate expiry
sudo certbot certificates

# Backup verification
./verify-backup.sh /backups/calcita_latest.sql.gz

# Security scan
npm audit

echo "Monthly maintenance completed"
```

### 2. Application Updates

**Zero-Downtime Deployment:**

```bash
#!/bin/bash
# zero-downtime-deploy.sh

set -e

NEW_VERSION=$1
BACKUP_VERSION=$(date +%Y%m%d_%H%M%S)

echo "Starting deployment of version $NEW_VERSION"

# Create backup
npm run build
cp -r dist dist_backup_$BACKUP_VERSION

# Update application
git fetch origin
git checkout $NEW_VERSION
npm ci
npm run build

# Health check
npm run health-check

# Deploy with rollback capability
if npm run health-check; then
    echo "Deployment successful"
else
    echo "Deployment failed, rolling back..."
    rm -rf dist
    mv dist_backup_$BACKUP_VERSION dist
    exit 1
fi

echo "Deployment completed successfully"
```

**Health Check Script:**

```javascript
// health-check.js
const fetch = require('node-fetch');

async function healthCheck() {
  const endpoints = [
    'https://calcita.yourdomain.com/api/health',
    'https://calcita.yourdomain.com',
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Health check failed: ${endpoint}`);
      }
      console.log(`✓ ${endpoint} is healthy`);
    } catch (error) {
      console.error(`✗ ${endpoint} is unhealthy:`, error.message);
      process.exit(1);
    }
  }
  
  console.log('All health checks passed');
}

healthCheck();
```

### 3. Security Updates

**Automated Security Updates:**

```bash
# Enable unattended upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades

# Configure auto-updates
echo 'Unattended-Upgrade::Automatic-Reboot "true";' | sudo tee -a /etc/apt/apt.conf.d/50unattended-upgrades
```

**Security Monitoring:**

```bash
#!/bin/bash
# security-check.sh

echo "Running security checks..."

# Check for failed login attempts
sudo grep "Failed password" /var/log/auth.log | tail -10

# Check for suspicious processes
ps aux | grep -E "(nc|netcat|nmap|telnet)"

# Check firewall status
sudo ufw status

# Check SSL certificate status
openssl x509 -in /etc/ssl/certs/calcita.crt -text -noout | grep "Not After"

# Check for available security updates
sudo apt list --upgradable | grep -i security

echo "Security check completed"
```

---

## 🐛 Troubleshooting

### 1. Common Issues

**Application Won't Start:**

```bash
# Check logs
sudo journalctl -u calcita -f
sudo tail -f /var/log/nginx/error.log

# Check permissions
sudo chown -R www-data:www-data /var/www/calcita
sudo chmod -R 755 /var/www/calcita

# Check environment variables
cat /var/www/calcita/.env.production
```

**Database Connection Issues:**

```sql
-- Check connection limits
SELECT count(*) FROM pg_stat_activity;

-- Check active connections
SELECT pid, usename, application_name, client_addr, state 
FROM pg_stat_activity 
WHERE state = 'active';

-- Kill long-running queries
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'active' AND query_start < now() - interval '5 minutes';
```

**High Memory Usage:**

```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head -10

# Check for memory leaks
node --inspect app.js
# Use Chrome DevTools to profile memory

# Restart services if needed
sudo systemctl restart nginx
sudo systemctl restart calcita
```

**SSL Certificate Issues:**

```bash
# Check certificate validity
openssl x509 -in /etc/ssl/certs/calcita.crt -text -noout | grep "Not After"

# Renew Let's Encrypt certificate
sudo certbot renew

# Test SSL configuration
sslscan calcita.yourdomain.com
```

### 2. Performance Issues

**Slow Database Queries:**

```sql
-- Identify slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Check for missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
AND tablename = 'messages'
ORDER BY n_distinct DESC;
```

**High CPU Usage:**

```bash
# Check CPU usage
top
htop

# Check for CPU-intensive processes
ps aux --sort=-%cpu | head -10

# Monitor application performance
node --prof app.js
node --prof-process isolate-*.log > profile.txt
```

**Network Issues:**

```bash
# Test connectivity
ping calcita.yourdomain.com
curl -I https://calcita.yourdomain.com

# Check DNS resolution
nslookup calcita.yourdomain.com
dig calcita.yourdomain.com

# Monitor network traffic
sudo iftop
sudo netstat -tulpn
```

### 3. Log Analysis

**Error Log Analysis:**

```bash
# Check application errors
sudo tail -f /var/log/calcita/error.log

# Check Nginx errors
sudo tail -f /var/log/nginx/error.log

# Check system logs
sudo journalctl -u calcita -f

# Analyze log patterns
grep "ERROR" /var/log/calcita/app.log | awk '{print $1}' | sort | uniq -c
```

**Performance Log Analysis:**

```bash
# Check response times
awk '{print $NF}' /var/log/nginx/access.log | sort -n | tail -10

# Check top IP addresses
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -nr | head -10

# Check HTTP status codes
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c
```

---

## 🛡️ Security Best Practices

### 1. Application Security

**Input Validation:**

```javascript
// Sanitize user input
const DOMPurify = require('dompurify');

function sanitizeInput(input) {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong'],
    ALLOWED_ATTR: []
  });
}

// Validate file uploads
const validateFileUpload = (file) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5MB
  
  if (!allowedTypes.includes(file.type)) {
    throw new Error('File type not allowed');
  }
  
  if (file.size > maxSize) {
    throw new Error('File too large');
  }
  
  return true;
};
```

**Authentication & Authorization:**

```javascript
// JWT token validation
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.sendStatus(401);
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.sendStatus(403);
    }
    
    req.user = user;
    next();
  });
}

// Role-based access control
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user.roles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
```

### 2. Database Security

**SQL Injection Prevention:**

```javascript
// Use parameterized queries
const query = 'SELECT * FROM messages WHERE chat_id = $1 AND user_id = $2';
const values = [chatId, userId];
const result = await pool.query(query, values);

// Never concatenate user input into SQL
// BAD: const query = `SELECT * FROM messages WHERE content LIKE '%${userInput}%'`;
// GOOD: const query = 'SELECT * FROM messages WHERE content LIKE $1';
```

**Data Encryption:**

```javascript
// Encrypt sensitive data at rest
const crypto = require('crypto');

function encrypt(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher('aes-256-cbc', key);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedData, key) {
  const textParts = encryptedData.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = textParts.join(':');
  const decipher = crypto.createDecipher('aes-256-cbc', key);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### 3. Infrastructure Security

**Regular Security Audits:**

```bash
#!/bin/bash
# security-audit.sh

echo "Running security audit..."

# Check for outdated packages
npm audit
apt list --upgradable | grep -i security

# Check file permissions
find /var/www/calcita -type f -perm /o+w
find /var/www/calcita -type d -perm /o+w

# Check for weak passwords
sudo grep -E 'password|passwd' /etc/shadow

# Check for unnecessary services
sudo systemctl list-units --type=service --state=running

# Check firewall rules
sudo iptables -L -n

# Check SSH configuration
grep -E "^(Protocol|PermitRootLogin|PasswordAuthentication)" /etc/ssh/sshd_config

echo "Security audit completed"
```

**Vulnerability Scanning:**

```bash
# Install and run security scanner
npm install -g @owasp/watson
node_modules/.bin/watson

# Check SSL configuration
nmap --script ssl-enum-ciphers -p 443 calcita.yourdomain.com

# Check for common vulnerabilities
nikto -h https://calcita.yourdomain.com
```

### 4. Compliance & Privacy

**GDPR Compliance:**

```javascript
// Data export functionality
async function exportUserData(userId) {
  const userData = await User.findById(userId);
  const messages = await Message.find({ userId });
  const chats = await Chat.find({ participants: userId });
  
  const exportData = {
    user: userData,
    messages: messages.map(m => ({...m.toObject(), encrypted: true})),
    chats: chats,
    exported_at: new Date().toISOString()
  };
  
  return exportData;
}

// Data deletion functionality
async function deleteUserData(userId) {
  await Promise.all([
    User.findByIdAndDelete(userId),
    Message.deleteMany({ userId }),
    Chat.updateMany(
      { participants: userId },
      { $pull: { participants: userId } }
    )
  ]);
}
```

**Data Retention Policy:**

```sql
-- Create data retention policy
CREATE OR REPLACE FUNCTION implement_data_retention()
RETURNS void AS $$
BEGIN
  -- Delete messages older than 2 years
  DELETE FROM messages 
  WHERE created_at < NOW() - INTERVAL '2 years';
  
  -- Delete old session data
  DELETE FROM user_sessions 
  WHERE last_activity < NOW() - INTERVAL '1 month';
  
  -- Archive old logs
  DELETE FROM application_logs 
  WHERE created_at < NOW() - INTERVAL '6 months';
END;
$$ LANGUAGE plpgsql;

-- Schedule retention policy
-- SELECT cron.schedule('data-retention', '0 3 * * 0', 'SELECT implement_data_retention();');
```

---

## 📞 Support & Resources

### 1. Documentation Links

- **Application Documentation:** `/docs`
- **API Documentation:** `/api/docs`
- **Database Schema:** `WORKING_SCHEMA.sql`
- **Security Guide:** `SECURITY.md`
- **Troubleshooting Guide:** `TROUBLESHOOTING.md`

### 2. Monitoring Dashboards

- **Application Metrics:** `https://metrics.calcita.yourdomain.com`
- **Database Monitoring:** Supabase Dashboard
- **Infrastructure Monitoring:** `https://monitoring.calcita.yourdomain.com`
- **Log Analysis:** `https://logs.calcita.yourdomain.com`

### 3. Emergency Contacts

- **Technical Support:** support@calcita.yourdomain.com
- **Security Issues:** security@calcita.yourdomain.com
- **24/7 Emergency:** +1-xxx-xxx-xxxx

### 4. Useful Commands

```bash
# Quick health check
curl -f https://calcita.yourdomain.com/api/health

# Check application status
sudo systemctl status calcita
sudo systemctl status nginx

# View recent logs
sudo journalctl -u calcita --since "1 hour ago"

# Check disk usage
df -h
du -sh /var/www/calcita

# Check memory usage
free -h
ps aux --sort=-%mem | head -5

# Test database connection
psql $DATABASE_URL -c "SELECT version();"

# Check SSL certificate
echo | openssl s_client -servername calcita.yourdomain.com -connect calcita.yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

### 5. Recovery Procedures

**Database Recovery:**
1. Stop application: `sudo systemctl stop calcita`
2. Restore from backup: `gunzip -c /backups/latest.sql.gz | psql $DATABASE_URL`
3. Verify integrity: `psql $DATABASE_URL -c "SELECT count(*) FROM messages;"`
4. Start application: `sudo systemctl start calcita`

**Application Recovery:**
1. Check last known good version: `git log --oneline -10`
2. Checkout previous version: `git checkout <commit-hash>`
3. Rebuild application: `npm run build`
4. Test functionality: `npm run health-check`
5. If successful, investigate what caused the issue

---

## ✅ Deployment Checklist

### Pre-Deployment
- [ ] All environment variables configured
- [ ] SSL certificates installed and valid
- [ ] Database schema applied and tested
- [ ] Security headers configured
- [ ] Rate limiting implemented
- [ ] Monitoring and logging setup
- [ ] Backup procedures tested
- [ ] Health check endpoints working
- [ ] CDN configuration optimized
- [ ] Security audit completed

### Deployment
- [ ] Build process completed without errors
- [ ] Application deployed to production
- [ ] Database migrations applied
- [ ] SSL configuration verified
- [ ] All endpoints responding correctly
- [ ] Real-time features working (WebSocket)
- [ ] File upload functionality tested
- [ ] Call features operational
- [ ] Encryption/decryption working
- [ ] Performance benchmarks met

### Post-Deployment
- [ ] Monitoring alerts configured
- [ ] Log aggregation working
- [ ] Backup schedule activated
- [ ] Security scanning completed
- [ ] Performance monitoring active
- [ ] User acceptance testing passed
- [ ] Documentation updated
- [ ] Team trained on procedures
- [ ] Incident response plan tested
- [ ] Recovery procedures validated

---

## 🎉 Conclusion

This production deployment guide provides a comprehensive roadmap for deploying CalcIta with enterprise-grade security, performance, and reliability. Follow this guide step-by-step to ensure a successful production deployment.

**Key Takeaways:**
- Security is paramount - never compromise on encryption or access controls
- Monitoring and observability are essential for maintaining reliability
- Automated backups and recovery procedures are critical
- Regular maintenance and updates prevent security vulnerabilities
- Performance optimization improves user experience

**Next Steps:**
1. Set up monitoring and alerting
2. Implement automated testing
3. Configure disaster recovery procedures
4. Establish incident response protocols
5. Schedule regular security audits

For additional support, refer to the troubleshooting section or contact the development team.

---

**Version:** 1.0.0  
**Last Updated:** January 2024  
**Document Owner:** DevOps Team  
**Review Schedule:** Monthly
```
