/**
 * CalcIta Performance Monitoring System
 * Comprehensive performance tracking for secure messaging application
 * Tracks Core Web Vitals, custom metrics, memory usage, and system health
 */

interface PerformanceMetrics {
  // Core Web Vitals
  fcp?: number; // First Contentful Paint (ms)
  lcp?: number; // Largest Contentful Paint (ms)
  fid?: number; // First Input Delay (ms)
  cls?: number; // Cumulative Layout Shift

  // Navigation Timing
  domContentLoaded?: number;
  loadComplete?: number;
  timeToInteractive?: number;
  firstByte?: number;

  // Application specific metrics
  appStartTime?: number;
  encryptionTime?: number;
  callConnectionTime?: number;
  messageSendTime?: number;
  dbQueryTime?: number;
  fileUploadTime?: number;

  // Resource timing
  resourceLoadTimes: Record<string, number>;
  largestResources: Array<{name: string, size: number, time: number}>;

  // Memory and performance
  memoryUsage?: {
    used: number; // MB
    total: number; // MB
    percentage: number;
   jsHeapSizeLimit?: number;
  };

  // Connection quality
  connectionType?: string;
  downlink?: number; // Mbps
  rtt?: number; // ms
  saveData?: boolean;

  // User experience
  longTasks: Array<{duration: number, startTime: number}>;
  frameDrops: number;
  paintTiming: Record<string, number>;
}

interface PerformanceThresholds {
  fcp: number; // 1800ms (good)
  lcp: number; // 2500ms (good)
  fid: number; // 100ms (good)
  cls: number; // 0.1 (good)
  tti: number; // 3800ms (good)
  memory: number; // 100MB warning threshold
  longTask: number; // 50ms threshold for long tasks
  slowResource: number; // 3000ms for slow resources
  encryption: number; // 1000ms for encryption operations
  callConnection: number; // 10000ms for call connection
}

interface PerformanceEvent {
  name: string;
  value: number;
  timestamp: number;
  category: 'navigation' | 'interaction' | 'custom' | 'resource' | 'error' | 'memory';
  metadata?: Record<string, any>;
  url?: string;
  userAgent?: string;
}

interface PerformanceConfig {
  enabled: boolean;
  sampleRate: number; // 0.0 to 1.0
  sendToServer: boolean;
  serverEndpoint?: string;
  bufferSize: number;
  flushInterval: number;
  includeStackTrace: boolean;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    resourceLoadTimes: {},
    largestResources: [],
    longTasks: [],
    frameDrops: 0,
    paintTiming: {}
  };

  private thresholds: PerformanceThresholds = {
    fcp: 1800,
    lcp: 2500,
    fid: 100,
    cls: 0.1,
    tti: 3800,
    memory: 100,
    longTask: 50,
    slowResource: 3000,
    encryption: 1000,
    callConnection: 10000
  };

  private events: PerformanceEvent[] = [];
  private config: PerformanceConfig = {
    enabled: true,
    sampleRate: 1.0, // Monitor all users in production
    sendToServer: true,
    bufferSize: 50,
    flushInterval: 30000, // 30 seconds
    includeStackTrace: false
  };

  private sessionId: string;
  private startTime: number;
  private observers: PerformanceObserver[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isInitialized = false;
  private isOnline = navigator.onLine;

  constructor(config?: Partial<PerformanceConfig>) {
    this.sessionId = this.generateSessionId();
    this.startTime = performance.now();

    // Merge provided config
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.initialize();
  }

  private generateSessionId(): string {
    return `calcita_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initialize() {
    if (!this.config.enabled || !this.shouldSample()) {
      console.log('[Performance] Monitoring disabled or not sampled');
      return;
    }

    this.isInitialized = true;
    console.log('[Performance] Initializing performance monitoring...');

    // Mark app start
    this.markEvent('app_initialization_start', performance.now(), 'custom', {
      userAgent: navigator.userAgent,
      url: window.location.href
    });

    // Setup Core Web Vitals
    this.setupCoreWebVitals();

    // Setup Navigation Timing
    this.setupNavigationTiming();

    // Setup Resource Timing
    this.setupResourceTiming();

    // Setup Custom Observers
    this.setupCustomObservers();

    // Monitor memory usage
    this.monitorMemory();

    // Monitor connection quality
    this.monitorConnection();

    // Setup page lifecycle monitoring
    this.setupLifecycleMonitoring();

    // Setup error tracking
    this.setupErrorTracking();

    // Start periodic flush
    this.startPeriodicFlush();

    // Report initial metrics
    setTimeout(() => this.reportInitialMetrics(), 100);
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.sampleRate;
  }

  private setupCoreWebVitals() {
    // First Contentful Paint
    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.fcp = entry.startTime;
            this.markEvent('fcp', entry.startTime, 'navigation');

            if (entry.startTime > this.thresholds.fcp) {
              this.reportPerformanceIssue('fcp_slow', {
                value: entry.startTime,
                threshold: this.thresholds.fcp,
                severity: 'warning'
              });
            }
          }
        }
      }).observe({ entryTypes: ['paint'] });
      this.observers.push({} as PerformanceObserver); // Track for cleanup
    } catch (error) {
      console.warn('[Performance] Paint observer not supported');
    }

    // Largest Contentful Paint
    try {
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];

        if (lastEntry) {
          this.metrics.lcp = lastEntry.startTime;
          this.markEvent('lcp', lastEntry.startTime, 'navigation');

          if (lastEntry.startTime > this.thresholds.lcp) {
            this.reportPerformanceIssue('lcp_slow', {
              value: lastEntry.startTime,
              threshold: this.thresholds.lcp,
              severity: 'warning'
            });
          }
        }
      }).observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push({} as PerformanceObserver);
    } catch (error) {
      console.warn('[Performance] LCP observer not supported');
    }

    // First Input Delay
    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          this.metrics.fid = entry.processingStart - entry.startTime;
          this.markEvent('fid', this.metrics.fid, 'interaction');

          if (this.metrics.fid > this.thresholds.fid) {
            this.reportPerformanceIssue('fid_high', {
              value: this.metrics.fid,
              threshold: this.thresholds.fid,
              severity: 'warning'
            });
          }
        }
      }).observe({ entryTypes: ['first-input'] });
      this.observers.push({} as PerformanceObserver);
    } catch (error) {
      console.warn('[Performance] First input observer not supported');
    }

    // Cumulative Layout Shift
    this.measureCLS();
  }

  private measureCLS() {
    let clsValue = 0;
    let clsEntries: Array<{value: number, sources: any[]}> = [];

    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            clsEntries.push({
              value: entry.value,
              sources: entry.sources || []
            });
          }
        }

        this.metrics.cls = clsValue;
        this.markEvent('cls', clsValue, 'navigation');

        if (clsValue > this.thresholds.cls) {
          this.reportPerformanceIssue('cls_high', {
            value: clsValue,
            threshold: this.thresholds.cls,
            entries: clsEntries,
            severity: 'warning'
          });
        }
      }).observe({ entryTypes: ['layout-shift'] });
      this.observers.push({} as PerformanceObserver);
    } catch (error) {
      console.warn('[Performance] Layout shift observer not supported');
    }
  }

  private setupNavigationTiming() {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

        if (navTiming) {
          this.metrics.domContentLoaded = navTiming.domContentLoadedEventEnd - navTiming.fetchStart;
          this.metrics.loadComplete = navTiming.loadEventEnd - navTiming.fetchStart;
          this.metrics.firstByte = navTiming.responseStart - navTiming.fetchStart;

          // Calculate Time to Interactive
          this.metrics.timeToInteractive = navTiming.domInteractive - navTiming.fetchStart;

          this.markEvent('dom_content_loaded', this.metrics.domContentLoaded, 'navigation');
          this.markEvent('load_complete', this.metrics.loadComplete, 'navigation');
          this.markEvent('first_byte', this.metrics.firstByte, 'navigation');
          this.markEvent('tti', this.metrics.timeToInteractive, 'navigation');

          if (this.metrics.timeToInteractive > this.thresholds.tti) {
            this.reportPerformanceIssue('tti_slow', {
              value: this.metrics.timeToInteractive,
              threshold: this.thresholds.tti,
              severity: 'warning'
            });
          }
        }
      }, 0);
    });
  }

  private setupResourceTiming() {
    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          const loadTime = entry.responseEnd - entry.startTime;
          const size = (entry as any).transferSize || 0;

          this.metrics.resourceLoadTimes[entry.name] = loadTime;

          // Track largest resources
          if (size > 0) {
            this.metrics.largestResources.push({
              name: this.getResourceType(entry.name),
              size: size / 1024, // KB
              time: loadTime
            });

            // Keep only top 10 largest
            this.metrics.largestResources.sort((a, b) => b.size - a.size);
            this.metrics.largestResources = this.metrics.largestResources.slice(0, 10);
          }

          this.markEvent(`resource_${this.getResourceType(entry.name)}`, loadTime, 'resource', {
            url: entry.name,
            size: size,
            type: this.getResourceType(entry.name)
          });

          // Report slow resources
          if (loadTime > this.thresholds.slowResource) {
            this.reportPerformanceIssue('slow_resource', {
              url: entry.name,
              loadTime,
              resourceType: this.getResourceType(entry.name),
              size,
              severity: 'info'
            });
          }
        }
      }).observe({ entryTypes: ['resource'] });
      this.observers.push({} as PerformanceObserver);
    } catch (error) {
      console.warn('[Performance] Resource observer not supported');
    }
  }

  private setupCustomObservers() {
    // Monitor long tasks
    if ('PerformanceObserver' in window) {
      try {
        const longTaskObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            this.metrics.longTasks.push({
              duration: entry.duration,
              startTime: entry.startTime
            });

            this.markEvent('long_task', entry.duration, 'interaction', {
              startTime: entry.startTime,
              attribution: (entry as any).attribution || []
            });

            if (entry.duration > this.thresholds.longTask) {
              this.reportPerformanceIssue('long_task', {
                duration: entry.duration,
                startTime: entry.startTime,
                severity: 'warning'
              });
            }
          }
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        this.observers.push(longTaskObserver);
      } catch (error) {
        console.warn('[Performance] Long task observer not supported');
      }
    }

    // Monitor frame drops (if available)
    this.monitorFrameDrops();
  }

  private monitorFrameDrops() {
    let lastFrameTime = performance.now();
    let frameDrops = 0;
    let checkInterval: number;

    const checkFrameRate = () => {
      const now = performance.now();
      const delta = now - lastFrameTime;

      // If frame time > 16.67ms (60fps), potential frame drop
      if (delta > 20) { // Allow some buffer
        frameDrops++;
      }

      lastFrameTime = now;
    };

    // Use requestAnimationFrame to monitor frame rate
    const animate = () => {
      checkFrameRate();
      checkInterval = requestAnimationFrame(animate);
    };

    checkInterval = requestAnimationFrame(animate);

    // Stop monitoring after 10 seconds (sampling)
    setTimeout(() => {
      if (checkInterval) {
        cancelAnimationFrame(checkInterval);
      }
      this.metrics.frameDrops = frameDrops;
      this.markEvent('frame_drops', frameDrops, 'custom', {
        duration: 10000
      });
    }, 10000);
  }

  private monitorMemory() {
    if ('memory' in performance) {
      const updateMemoryInfo = () => {
        const memory = (performance as any).memory;
        const used = memory.usedJSHeapSize / 1024 / 1024; // MB
        const total = memory.totalJSHeapSize / 1024 / 1024; // MB
        const percentage = (used / total) * 100;

        this.metrics.memoryUsage = {
          used,
          total,
          percentage,
          jsHeapSizeLimit: memory.jsHeapSizeLimit / 1024 / 1024
        };

        this.markEvent('memory_usage', used, 'memory', {
          total,
          percentage,
          limit: memory.jsHeapSizeLimit
        });

        if (used > this.thresholds.memory) {
          this.reportPerformanceIssue('high_memory_usage', {
            used,
            total,
            percentage,
            severity: 'warning'
          });
        }
      };

      updateMemoryInfo();

      // Monitor memory periodically
      setInterval(updateMemoryInfo, 30000); // Every 30 seconds
    }
  }

  private monitorConnection() {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;

      const updateConnectionInfo = () => {
        this.metrics.connectionType = connection.effectiveType;
        this.metrics.downlink = connection.downlink;
        this.metrics.rtt = connection.rtt;
        this.metrics.saveData = connection.saveData;

        this.markEvent('connection_quality', this.getConnectionScore(), 'custom', {
          type: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData
        });
      };

      updateConnectionInfo();
      connection.addEventListener('change', updateConnectionInfo);
    }
  }

  private getConnectionScore(): number {
    if (!this.metrics.connectionType) return 0;

    const scores: Record<string, number> = {
      '4g': 100,
      '3g': 60,
      '2g': 20,
      'slow-2g': 10
    };

    return scores[this.metrics.connectionType] || 0;
  }

  private setupLifecycleMonitoring() {
    let pageVisibleStart: number | null = null;
    let backgroundTime = 0;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        pageVisibleStart = performance.now();
        this.markEvent('page_hidden', performance.now(), 'custom');
      } else if (pageVisibleStart) {
        const timeHidden = performance.now() - pageVisibleStart;
        backgroundTime += timeHidden;

        this.markEvent('page_hidden_duration', timeHidden, 'custom', {
          hiddenAt: pageVisibleStart
        });

        pageVisibleStart = null;
      }
    });

    // Monitor page focus/blur
    window.addEventListener('focus', () => {
      this.markEvent('page_focus', performance.now(), 'custom');
    });

    window.addEventListener('blur', () => {
      this.markEvent('page_blur', performance.now(), 'custom');
    });
  }

  private setupErrorTracking() {
    // Track JavaScript errors
    window.addEventListener('error', (event) => {
      this.markEvent('javascript_error', 0, 'error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        severity: 'error'
      });
    });

    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.markEvent('promise_rejection', 0, 'error', {
        reason: event.reason,
        stack: event.reason?.stack,
        severity: 'error'
      });
    });

    // Monitor online/offline status
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.markEvent('connection_restored', performance.now(), 'custom');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.markEvent('connection_lost', performance.now(), 'custom');
    });
  }

  private reportInitialMetrics() {
    const startupTime = performance.now() - this.startTime;
    this.metrics.appStartTime = startupTime;

    this.markEvent('app_startup_complete', startupTime, 'custom', {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId
    });
  }

  private getResourceType(url: string): string {
    const path = new URL(url, window.location.origin).pathname;

    if (path.includes('.js')) return 'script';
    if (path.includes('.css')) return 'stylesheet';
    if (path.match(/\.(png|jpg|jpeg|webp|gif|svg|ico)$/)) return 'image';
    if (path.includes('.woff') || path.includes('.woff2') || path.includes('.ttf')) return 'font';
    if (path.includes('.mp4') || path.includes('.webm') || path.includes('.ogg')) return 'video';
    if (path.includes('.mp3') || path.includes('.wav') || path.includes('.ogg')) return 'audio';
    if (path.includes('supabase.co')) return 'api';

    return 'other';
  }

  private reportPerformanceIssue(type: string, data: Record<string, any>) {
    this.markEvent(`performance_issue_${type}`, 0, 'error', {
      ...data,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString()
    });

    // Log to console in development
    if (import.meta.env.DEV) {
      console.warn(`[Performance Issue] ${type}:`, data);
    }

    // Send to monitoring service in production
    if (this.config.sendToServer && import.meta.env.PROD) {
      this.sendToMonitoringService({
        type: 'performance_issue',
        issue: type,
        data,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString()
      });
    }
  }

  private async sendToMonitoringService(data: any) {
    if (!this.config.serverEndpoint || !this.isOnline) {
      return;
    }

    try {
      const response = await fetch(this.config.serverEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.warn('[Performance] Failed to send monitoring data:', error);
    }
  }

  private startPeriodicFlush() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private flush() {
    if (this.events.length === 0 || !this.isOnline) {
      return;
    }

    const eventsToSend = [...this.events];
    this.events = [];

    if (this.config.sendToServer) {
      this.sendToMonitoringService({
        type: 'performance_events',
        sessionId: this.sessionId,
        events: eventsToSend,
        metrics: this.metrics,
        timestamp: new Date().toISOString()
      });
    }

    // Log in development
    if (import.meta.env.DEV) {
      console.log('[Performance] Flushed events:', eventsToSend.length);
    }
  }

  // Public API methods
  public markEvent(name: string, value: number, category: PerformanceEvent['category'] = 'custom', metadata?: Record<string, any>) {
    if (!this.isInitialized) return;

    const event: PerformanceEvent = {
      name,
      value,
      timestamp: performance.now(),
      category,
      metadata,
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    this.events.push(event);

    // Keep buffer size manageable
    if (this.events.length > this.config.bufferSize) {
      this.events = this.events.slice(-this.config.bufferSize);
    }

    // Log in development
    if (import.meta.env.DEV) {
      console.log(`[Performance] ${name}: ${value}${metadata ? ' | ' + JSON.stringify(metadata) : ''}`);
    }
  }

  public startTimer(name: string): () => number {
    const startTime = performance.now();

    return () => {
      const duration = performance.now() - startTime;
      this.markEvent(name, duration, 'custom');
      return duration;
    };
  }

  // Application-specific measurement methods
  public measureEncryptionTime<T>(operation: () => Promise<T>, algorithm: string): Promise<T> {
    const timer = this.startTimer(`encryption_${algorithm}`);

    return operation().then(result => {
      const duration = timer();
      this.metrics.encryptionTime = duration;

      if (duration > this.thresholds.encryption) {
        this.reportPerformanceIssue('slow_encryption', {
          algorithm,
          duration,
          threshold: this.thresholds.encryption,
          severity: 'warning'
        });
      }

      return result;
    }).catch(error => {
      timer();
      this.markEvent('encryption_error', 0, 'error', {
        algorithm,
        error: error.message,
        stack: error.stack
      });
      throw error;
    });
  }

  public measureCallConnection(startTime: number, success: boolean, error?: string) {
    const duration = performance.now() - startTime;
    this.metrics.callConnectionTime = duration;

    this.markEvent('call_connection_time', duration, 'custom', {
      success,
      error,
      sessionId: this.sessionId
    });

    if (!success || duration > this.thresholds.callConnection) {
      this.reportPerformanceIssue(success ? 'slow_call_connection' : 'call_connection_failed', {
        duration,
        threshold: this.thresholds.callConnection,
        error,
        severity: success ? 'warning' : 'error'
      });
    }
  }

  public measureMessageSendTime<T>(operation: () => Promise<T>, messageType: string): Promise<T> {
    const timer = this.startTimer(`message_send_${messageType}`);

    return operation().then(result => {
      const duration = timer();
      this.metrics.messageSendTime = duration;
      return result;
    }).catch(error => {
      timer();
      this.markEvent('message_send_error', 0, 'error', {
        messageType,
        error: error.message
      });
      throw error;
    });
  }

  public measureDBQueryTime<T>(operation: () => Promise<T>, queryType: string): Promise<T> {
    const timer = this.startTimer(`db_query_${queryType}`);

    return operation().then(result => {
      const duration = timer();
      this.metrics.dbQueryTime = duration;
      return result;
    }).catch(error => {
      timer();
      this.markEvent('db_query_error', 0, 'error', {
        queryType,
        error: error.message
      });
      throw error;
    });
  }

  public measureFileUploadTime<T>(operation: () => Promise<T>, fileType: string, fileSize: number): Promise<T> {
    const timer = this.startTimer(`file_upload_${fileType}`);

    return operation().then(result => {
      const duration = timer();
      this.metrics.fileUploadTime = duration;

      this.markEvent('file_upload_complete', duration, 'custom', {
        fileType,
        fileSize,
        speed: fileSize / (duration / 1000) // bytes per second
      });

      return result;
    }).catch(error => {
      timer();
      this.markEvent('file_upload_error', 0, 'error', {
        fileType,
        fileSize,
        error: error.message
      });
      throw error;
    });
  }

  public recordUserAction(action: string, metadata?: Record<string, any>) {
    this.markEvent(`user_action_${action}`, 0, 'interaction', {
      ...metadata,
      sessionId: this.sessionId
    });
  }

  public recordError(error: Error, context?: string, severity: 'error' | 'warning' | 'info' = 'error') {
    this.markEvent('application_error', 0, 'error', {
      message: error.message,
      stack: error.stack,
      context,
      severity,
      url: window.location.href
    });
  }

  // Getters
  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public getEvents(): PerformanceEvent[] {
    return [...this.events];
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getSessionDuration(): number {
    return performance.now() - this.startTime;
  }

  public isHealthy(): boolean {
    // Check for critical performance issues
    if (this.metrics.fcp && this.metrics.fcp > this.thresholds.fcp * 2) return false;
    if (this.metrics.lcp && this.metrics.lcp > this.thresholds.lcp * 2) return false;
    if (this.metrics.fid && this.metrics.fid > this.thresholds.fid * 2) return false;
    if (this.metrics.cls && this.metrics.cls > this.thresholds.cls * 2) return false;
    if (this.metrics.memoryUsage && this.metrics.memoryUsage.used > this.thresholds.memory * 2) return false;

    return true;
  }

  public generateReport(): string {
    const duration = this.getSessionDuration();
    const issues = this.events.filter(e => e.category === 'error');
    const slowEvents = this.events.filter(e => {
      const threshold = this.getThresholdForEvent(e.name);
      return threshold && e.value > threshold;
    });

    const report = `
CalcIta Performance Report
==========================

Session: ${this.sessionId}
Duration: ${Math.round(duration)}ms
Status: ${this.isHealthy() ? 'Healthy' : 'Issues Detected'}

Core Web Vitals:
├── FCP: ${this.metrics.fcp ? Math.round(this.metrics.fcp) + 'ms' : 'N/A'} ${this.metrics.fcp && this.metrics.fcp <= this.thresholds.fcp ? '✅' : '⚠️'}
├── LCP: ${this.metrics.lcp ? Math.round(this.metrics.lcp) + 'ms' : 'N/A'} ${this.metrics.lcp && this.metrics.lcp <= this.thresholds.lcp ? '✅' : '⚠️'}
├── FID: ${this.metrics.fid ? Math.round(this.metrics.fid) + 'ms' : 'N/A'} ${this.metrics.fid && this.metrics.fid <= this.thresholds.fid ? '✅' : '⚠️'}
└── CLS: ${this.metrics.cls ? this.metrics.cls.toFixed(3) : 'N/A'} ${this.metrics.cls && this.metrics.cls <= this.thresholds.cls ? '✅' : '⚠️'}

Navigation:
├── First Byte: ${this.metrics.firstByte ? Math.round(this.metrics.firstByte) + 'ms' : 'N/A'}
├── DOM Content Loaded: ${this.metrics.domContentLoaded ? Math.round(this.metrics.domContentLoaded) + 'ms' : 'N/A'}
├── Load Complete: ${this.metrics.loadComplete ? Math.round(this.metrics.loadComplete) + 'ms' : 'N/A'}
└── Time to Interactive: ${this.metrics.timeToInteractive ? Math.round(this.metrics.timeToInteractive) + 'ms' : 'N/A'}

Application Metrics:
├── App Startup: ${this.metrics.appStartTime ? Math.round(this.metrics.appStartTime) + 'ms' : 'N/A'}
├── Encryption Time: ${this.metrics.encryptionTime ? Math.round(this.metrics.encryptionTime) + 'ms' : 'N/A'}
├── Call Connection: ${this.metrics.callConnectionTime ? Math.round(this.metrics.callConnectionTime) + 'ms' : 'N/A'}
├── Message Send: ${this.metrics.messageSendTime ? Math.round(this.metrics.messageSendTime) + 'ms' : 'N/A'}
└── DB Query: ${this.metrics.dbQueryTime ? Math.round(this.metrics.dbQueryTime) + 'ms' : 'N/A'}

Resources:
├── Total Resources: ${Object.keys(this.metrics.resourceLoadTimes).length}
├── Slow Resources: ${Object.values(this.metrics.resourceLoadTimes).filter(t => t > this.thresholds.slowResource).length}
└── Frame Drops: ${this.metrics.frameDrops}

Memory Usage: ${this.metrics.memoryUsage ?
  `${Math.round(this.metrics.memoryUsage.used)}MB / ${Math.round(this.metrics.memoryUsage.total)}MB (${this.metrics.memoryUsage.percentage.toFixed(1)}%)` :
  'N/A'}

Connection: ${this.metrics.connectionType || 'N/A'} ${this.metrics.downlink ? `(${this.metrics.downlink}Mbps)` : ''}

Issues Detected: ${issues.length}
${issues.map(e => `├── ${e.name}: ${e.metadata?.severity || 'error'}`).join('\n')}

Performance Warnings: ${slowEvents.length}
${slowEvents.map(e => `├── ${e.name}: ${Math.round(e.value)}ms`).join('\n')}

Total Events: ${this.events.length}
Last Updated: ${new Date().toISOString()}
    `.trim();

    return report;
  }

  private getThresholdForEvent(eventName: string): number | null {
    const thresholds: Record<string, number> = {
      'fcp': this.thresholds.fcp,
      'lcp': this.thresholds.lcp,
      'fid': this.thresholds.fid,
      'cls': this.thresholds.cls,
      'tti': this.thresholds.tti,
      'long_task': this.thresholds.longTask,
      'encryption_aes': this.thresholds.encryption,
      'encryption_rsa': this.thresholds.encryption,
      'call_connection_time': this.thresholds.callConnection,
      'message_send_text': 500,
      'message_send_media': 2000,
    };

    return thresholds[eventName] || null;
  }

  // Configuration methods
  public updateConfig(config: Partial<PerformanceConfig>) {
    this.config = { ...this.config, ...config };
  }

  public setEnabled(enabled: boolean) {
    this.config.enabled = enabled;
    if (!enabled) {
      this.cleanup();
    }
  }

  public setSampleRate(rate: number) {
    this.config.sampleRate = Math.max(0, Math.min(1, rate));
  }

  // Cleanup
  public cleanup() {
    console.log('[Performance] Cleaning up performance monitoring');

    // Clear timers
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Disconnect observers
    this.observers.forEach(observer => {
      try {
        observer.disconnect();
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    // Flush remaining events
    this.flush();

    this.isInitialized = false;
  }
}

// Create singleton instance with production config
const productionConfig: Partial<PerformanceConfig> = {
  enabled: import.meta.env.PROD,
  sampleRate: 1.0, // Monitor all users in production
  sendToServer: import.meta.env.PROD && import.meta.env.VITE_ENABLE_PERFORMANCE_MONITORING,
  serverEndpoint: import.meta.env.VITE_MONITORING_ENDPOINT,
  bufferSize: 100,
  flushInterval: 30000,
  includeStackTrace: import.meta.env.DEV
};

export const performanceMonitor = new PerformanceMonitor(productionConfig);

// Utility functions for easy measurement
export const measureAsync = async <T>(
  name: string,
  operation: () => Promise<T>,
  category: PerformanceEvent['category'] = 'custom'
): Promise<T> => {
  const timer = performanceMonitor.startTimer(name);
  try {
    const result = await operation();
    timer();
    return result;
  } catch (error) {
    timer();
    performanceMonitor.recordError(error as Error, name);
    throw error;
  }
};

export const measureSync = <T>(
  name: string,
  operation: () => T,
  category: PerformanceEvent['category'] = 'custom'
): T => {
  const timer = performanceMonitor.startTimer(name);
  try {
    const result = operation();
    timer();
    return result;
  } catch (error) {
    timer();
    performanceMonitor.recordError(error as Error, name);
    throw error;
  }
};

// Performance analysis utilities
export const analyzePerformance = () => {
  const metrics = performanceMonitor.getMetrics();
  const events = performanceMonitor.getEvents();
  const report = performanceMonitor.generateReport();

  return {
    metrics,
    events,
    report,
    health: performanceMonitor.isHealthy(),
    sessionId: performanceMonitor.getSessionId(),
    duration: performanceMonitor.getSessionDuration()
  };
};

// Auto-export for easy importing
export default performanceMonitor;
