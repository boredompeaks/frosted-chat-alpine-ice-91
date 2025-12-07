/**
 * CalcIta Service Worker
 * Provides offline support, caching, and background sync for secure messaging
 */

const CACHE_NAME = 'calcita-v1.0.0';
const STATIC_CACHE = 'calcita-static-v1.0.0';
const DYNAMIC_CACHE = 'calcita-dynamic-v1.0.0';
const API_CACHE = 'calcita-api-v1.0.0';
const MEDIA_CACHE = 'calcita-media-v1.0.0';

// Cache duration (in milliseconds)
const STATIC_CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days
const DYNAMIC_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const API_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MEDIA_CACHE_DURATION = 14 * 24 * 60 * 60 * 1000; // 14 days

// Files to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  // Add your static assets here
];

// Network timeout for requests
const NETWORK_TIMEOUT = 5000;

/**
 * Service Worker Install Event
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Initialize other caches
      caches.open(DYNAMIC_CACHE).then((cache) => {
        console.log('[SW] Dynamic cache initialized');
        return Promise.resolve();
      }),
      caches.open(API_CACHE).then((cache) => {
        console.log('[SW] API cache initialized');
        return Promise.resolve();
      }),
      caches.open(MEDIA_CACHE).then((cache) => {
        console.log('[SW] Media cache initialized');
        return Promise.resolve();
      })
    ]).then(() => {
      console.log('[SW] Service worker installed successfully');
      // Force the waiting service worker to become the active service worker
      return self.skipWaiting();
    })
  );
});

/**
 * Service Worker Activate Event
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      cleanupOldCaches(),
      // Claim all clients immediately
      self.clients.claim()
    ]).then(() => {
      console.log('[SW] Service worker activated');
    })
  );
});

/**
 * Clean up old cache versions
 */
async function cleanupOldCaches() {
  const cacheNames = await caches.keys();
  const validCaches = [
    CACHE_NAME,
    STATIC_CACHE,
    DYNAMIC_CACHE,
    API_CACHE,
    MEDIA_CACHE
  ];

  const oldCaches = cacheNames.filter(name => !validCaches.includes(name));

  return Promise.all(
    oldCaches.map(cacheName => {
      console.log('[SW] Deleting old cache:', cacheName);
      return caches.delete(cacheName);
    })
  );
}

/**
 * Service Worker Fetch Event
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle different types of requests with appropriate strategies
  if (isStaticAsset(request)) {
    // Cache-first strategy for static assets
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE, STATIC_CACHE_DURATION));
  } else if (isAPIRequest(request)) {
    // Network-first strategy for API calls
    event.respondWith(networkFirstStrategy(request, API_CACHE, API_CACHE_DURATION));
  } else if (isMediaRequest(request)) {
    // Cache-first strategy for media files
    event.respondWith(cacheFirstStrategy(request, MEDIA_CACHE, MEDIA_CACHE_DURATION));
  } else {
    // Network-first strategy for other requests
    event.respondWith(networkFirstStrategy(request, DYNAMIC_CACHE, DYNAMIC_CACHE_DURATION));
  }
});

/**
 * Cache-first strategy: Serve from cache, fallback to network, update cache
 */
async function cacheFirstStrategy(request, cacheName, cacheDuration) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      // Check if cache is still valid
      const cacheDate = new Date(cachedResponse.headers.get('date'));
      const now = new Date();

      if (now.getTime() - cacheDate.getTime() < cacheDuration) {
        // Serve from cache
        return cachedResponse;
      }
    }

    // Fetch from network
    const networkResponse = await fetchWithTimeout(request);

    if (networkResponse && networkResponse.ok) {
      // Cache the response
      const responseToCache = networkResponse.clone();
      cache.put(request, responseToCache);
    }

    return networkResponse;

  } catch (error) {
    console.error('[SW] Cache-first strategy failed:', error);

    // Try to serve from cache as fallback
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline fallback if available
    return new Response('Offline - Content not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Network-first strategy: Try network first, fallback to cache
 */
async function networkFirstStrategy(request, cacheName, cacheDuration) {
  try {
    // Try network first
    const networkResponse = await fetchWithTimeout(request);

    if (networkResponse && networkResponse.ok) {
      // Cache successful responses
      const cache = await caches.open(cacheName);
      const responseToCache = networkResponse.clone();

      // Add timestamp to response
      const headers = new Headers(responseToCache.headers);
      headers.set('date', new Date().toISOString());
      headers.set('sw-cache-date', new Date().toISOString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      cache.put(request, cachedResponse);
      return networkResponse;
    }

    throw new Error('Network response not ok');

  } catch (error) {
    console.log('[SW] Network failed, trying cache for:', request.url);

    // Fallback to cache
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      // Check if cache is still valid
      const cacheDate = new Date(cachedResponse.headers.get('date'));
      const now = new Date();

      if (now.getTime() - cacheDate.getTime() < cacheDuration) {
        return cachedResponse;
      }
    }

    // Return offline fallback
    return new Response('Offline - Network request failed', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Stale-while-revalidate strategy
 */
async function staleWhileRevalidateStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  // Start network request in background
  const networkResponsePromise = fetchWithTimeout(request).then((response) => {
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  });

  // Return cached response immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }

  // Otherwise wait for network
  return networkResponsePromise;
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(request, timeout = NETWORK_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(request, {
      signal: controller.signal,
      cache: 'no-cache'
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Check if request is for static assets
 */
function isStaticAsset(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  return (
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname === '/manifest.json' ||
    pathname.includes('/assets/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.ttf') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.webp')
  );
}

/**
 * Check if request is for API
 */
function isAPIRequest(request) {
  const url = new URL(request.url);
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('supabase.co') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/')
  );
}

/**
 * Check if request is for media files
 */
function isMediaRequest(request) {
  const url = new URL(request.url);
  return (
    url.pathname.includes('/storage/v1/') ||
    request.destination === 'image' ||
    request.destination === 'video' ||
    request.destination === 'audio' ||
    url.pathname.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg|mp3|wav|flac|aac)$/i)
  );
}

/**
 * Background Sync for offline message sending
 */
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === 'background-sync-messages') {
    event.waitUntil(syncOfflineMessages());
  }
});

/**
 * Sync offline messages when back online
 */
async function syncOfflineMessages() {
  try {
    console.log('[SW] Syncing offline messages...');

    // Get offline messages from IndexedDB or localStorage
    const offlineMessages = await getOfflineMessages();

    for (const message of offlineMessages) {
      try {
        const response = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message)
        });

        if (response.ok) {
          // Remove from offline storage
          await removeOfflineMessage(message.id);
          console.log('[SW] Synced message:', message.id);
        }
      } catch (error) {
        console.error('[SW] Failed to sync message:', message.id, error);
      }
    }
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

/**
 * Get offline messages from storage
 */
async function getOfflineMessages() {
  // This would integrate with your app's offline message storage
  // For now, return empty array
  return [];
}

/**
 * Remove offline message after successful sync
 */
async function removeOfflineMessage(messageId) {
  // Remove from offline storage
  console.log('[SW] Removing offline message:', messageId);
}

/**
 * Push Notification Event
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  let notificationData = {
    title: 'CalcIta',
    body: 'New message received',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: {},
    actions: [
      {
        action: 'open',
        title: 'Open App',
        icon: '/icon-192.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = { ...notificationData, ...pushData };
    } catch (error) {
      console.error('[SW] Failed to parse push data:', error);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      data: notificationData.data,
      actions: notificationData.actions,
      requireInteraction: true,
      tag: 'calcita-message',
      renotify: true
    })
  );
});

/**
 * Notification Click Event
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Open the app
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }

      // Open new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

/**
 * Notification Close Event
 */
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed');

  // Track notification dismissal if needed
  if (event.notification.data && event.notification.data.messageId) {
    // Mark message as read or handle other logic
    console.log('[SW] Notification dismissed for message:', event.notification.data.messageId);
  }
});

/**
 * Message event for communication with main thread
 */
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data && event.data.type) {
    switch (event.data.type) {
      case 'SKIP_WAITING':
        self.skipWaiting();
        break;

      case 'GET_VERSION':
        event.ports[0].postMessage({ version: CACHE_NAME });
        break;

      case 'CACHE_URLS':
        const urls = event.data.payload;
        if (Array.isArray(urls)) {
          event.waitUntil(
            Promise.all(
              urls.map(url =>
                caches.open(DYNAMIC_CACHE).then(cache =>
                  cache.add(url).catch(err => console.warn('Failed to cache:', url, err))
                )
              )
            )
          );
        }
        break;

      case 'CLEAR_CACHE':
        const cacheName = event.data.payload;
        event.waitUntil(
          caches.delete(cacheName).then(deleted => {
            console.log('[SW] Cache deleted:', cacheName, deleted);
            event.ports[0].postMessage({ success: deleted });
          })
        );
        break;

      default:
        console.log('[SW] Unknown message type:', event.data.type);
    }
  }
});

/**
 * Error event handler
 */
self.addEventListener('error', (event) => {
  console.error('[SW] Global error:', event.error);
});

/**
 * Unhandled rejection handler
 */
self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
});

/**
 * Periodic background sync (if supported)
 */
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync triggered:', event.tag);

  if (event.tag === 'message-sync') {
    event.waitUntil(syncOfflineMessages());
  }
});

// Log service worker loading
console.log('[SW] CalcIta Service Worker loaded successfully');
console.log('[SW] Cache versions:', {
  static: STATIC_CACHE,
  dynamic: DYNAMIC_CACHE,
  api: API_CACHE,
  media: MEDIA_CACHE
});
