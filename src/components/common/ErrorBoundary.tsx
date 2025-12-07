import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, Mail, Bug } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  enableReporting?: boolean;
  enableRetry?: boolean;
  showDetails?: boolean;
  level?: "page" | "component" | "modal";
  className?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
  retryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: "",
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log error to console in development
    if (import.meta.env.DEV) {
      console.group("🚨 Error Boundary Caught an Error");
      console.error("Error:", error);
      console.error("Error Info:", errorInfo);
      console.error("Component Stack:", errorInfo.componentStack);
      console.groupEnd();
    }

    // Report error if enabled
    if (this.props.enableReporting) {
      this.reportError(error, errorInfo);
    }

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Auto-retry for non-critical errors (max 3 attempts)
    if (this.state.retryCount < 3) {
      this.scheduleRetry();
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private scheduleRetry = () => {
    // Exponential backoff for retries
    const delay = Math.min(1000 * Math.pow(2, this.state.retryCount), 10000);

    this.retryTimeoutId = setTimeout(() => {
      this.setState((prevState) => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1,
      }));
    }, delay);
  };

  private reportError = async (error: Error, errorInfo: ErrorInfo) => {
    try {
      const errorReport = {
        errorId: this.state.errorId,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        userId: this.getCurrentUserId(),
        sessionId: this.getSessionId(),
        level: this.props.level || "component",
        retryCount: this.state.retryCount,
        environment: import.meta.env.MODE,
        version: this.getAppVersion(),
      };

      // Send to error reporting service
      await this.sendToErrorService(errorReport);

      // Also log to console in development
      if (import.meta.env.DEV) {
        console.log("📊 Error reported:", errorReport);
      }
    } catch (reportingError) {
      console.error("Failed to report error:", reportingError);
    }
  };

  private sendToErrorService = async (errorReport: any) => {
    // Sentry integration
    if (import.meta.env.VITE_SENTRY_DSN && (window as any).Sentry) {
      (window as any).Sentry.captureException(errorReport.error, {
        extra: errorReport,
        tags: {
          errorBoundary: true,
          level: this.props.level,
        },
      });
    }

    // Custom error endpoint
    if (import.meta.env.VITE_ERROR_REPORTING_URL) {
      try {
        await fetch(import.meta.env.VITE_ERROR_REPORTING_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(errorReport),
        });
      } catch (error) {
        // Fail silently if endpoint is unavailable
        console.warn("Error reporting endpoint unavailable");
      }
    }

    // Console fallback
    if (import.meta.env.DEV) {
      console.group("📊 Error Report");
      console.table(errorReport);
      console.groupEnd();
    }
  };

  private getCurrentUserId = (): string | null => {
    try {
      // Try to get user ID from localStorage
      const user = localStorage.getItem("calcita_user");
      if (user) {
        const parsed = JSON.parse(user);
        return parsed.id || null;
      }
    } catch (error) {
      // Ignore parsing errors
    }
    return null;
  };

  private getSessionId = (): string => {
    let sessionId = sessionStorage.getItem("session_id");
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem("session_id", sessionId);
    }
    return sessionId;
  };

  private getAppVersion = (): string => {
    return import.meta.env.VITE_APP_VERSION || "1.0.0";
  };

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: this.state.retryCount + 1,
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  private handleReportBug = () => {
    const { error, errorId } = this.state;
    const subject = `Bug Report: ${error?.message || "Unknown Error"}`;
    const body = `
Error ID: ${errorId}
Message: ${error?.message}
URL: ${window.location.href}
Timestamp: ${new Date().toISOString()}

Please describe what you were doing when this error occurred:
`;

    const mailtoLink = `mailto:support@calcita.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, "_blank");
  };

  private getErrorMessage = (error: Error | null): string => {
    if (!error) return "An unexpected error occurred";

    // User-friendly error messages
    const userFriendlyMessages: { [key: string]: string } = {
      ChunkLoadError: "Failed to load application. Please refresh the page.",
      "Network Error":
        "Network connection issue. Please check your internet connection.",
      "Failed to fetch": "Server is unreachable. Please try again later.",
      "Cannot read properties of undefined":
        "Application encountered an unexpected state.",
      "ResizeObserver loop limit exceeded":
        "Display size issue detected. Try resizing your window.",
    };

    for (const [key, message] of Object.entries(userFriendlyMessages)) {
      if (error.message.includes(key)) {
        return message;
      }
    }

    // Generic error message
    return "Something went wrong. Our team has been notified and is working on a fix.";
  };

  private renderErrorContent = () => {
    const { error, errorId, retryCount } = this.state;
    const {
      level = "component",
      showDetails = false,
      enableRetry = true,
    } = this.props;
    const isDev = import.meta.env.DEV;
    const maxRetries = 3;
    const canRetry = enableRetry && retryCount < maxRetries;
    const errorMessage = this.getErrorMessage(error);

    if (level === "page") {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <div className="glass max-w-2xl w-full p-8 text-center">
            <div className="mb-6">
              <AlertTriangle className="h-16 w-16 text-red-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-white mb-2">
                Oops! Something went wrong
              </h1>
              <p className="text-white/70 text-lg">{errorMessage}</p>
            </div>

            <div className="space-y-4">
              {canRetry && (
                <button
                  onClick={this.handleRetry}
                  className="w-full call-button p-3 text-lg font-medium"
                >
                  <RefreshCw className="h-5 w-5 mr-2" />
                  Try Again ({maxRetries - retryCount} attempts left)
                </button>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={this.handleReload}
                  className="glass-button p-3 text-sm"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reload Page
                </button>
                <button
                  onClick={this.handleGoHome}
                  className="glass-button p-3 text-sm"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </button>
                <button
                  onClick={this.handleReportBug}
                  className="glass-button p-3 text-sm"
                >
                  <Bug className="h-4 w-4 mr-2" />
                  Report Bug
                </button>
              </div>
            </div>

            {showDetails && isDev && error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-white/70 hover:text-white">
                  Technical Details (Development)
                </summary>
                <div className="mt-4 p-4 bg-black/20 rounded-lg text-sm">
                  <div className="mb-4">
                    <strong className="text-red-400">Error ID:</strong>
                    <code className="ml-2 text-white/90">{errorId}</code>
                  </div>
                  <div className="mb-4">
                    <strong className="text-red-400">Message:</strong>
                    <pre className="mt-1 text-white/90 whitespace-pre-wrap">
                      {error.message}
                    </pre>
                  </div>
                  {error.stack && (
                    <div>
                      <strong className="text-red-400">Stack Trace:</strong>
                      <pre className="mt-1 text-white/90 text-xs overflow-auto max-h-40 whitespace-pre-wrap">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="mt-6 pt-4 border-t border-white/10">
              <p className="text-white/50 text-sm">
                If this problem persists, please contact our support team with
                the error ID above.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (level === "modal") {
      return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass max-w-md w-full p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">
              Component Error
            </h3>
            <p className="text-white/70 mb-4">{errorMessage}</p>

            <div className="flex gap-2 justify-center">
              {canRetry && (
                <button
                  onClick={this.handleRetry}
                  className="glass-button px-4 py-2 text-sm"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Retry
                </button>
              )}
              <button
                onClick={this.handleReportBug}
                className="glass-button px-4 py-2 text-sm"
              >
                <Mail className="h-4 w-4 mr-1" />
                Report
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Component level error
    return (
      <div className="glass-card p-4 text-center">
        <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
        <p className="text-white/70 text-sm mb-3">{errorMessage}</p>

        <div className="flex gap-2 justify-center">
          {canRetry && (
            <button
              onClick={this.handleRetry}
              className="glass-button px-3 py-1 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </button>
          )}
          <button
            onClick={this.handleReportBug}
            className="glass-button px-3 py-1 text-xs"
          >
            <Bug className="h-3 w-3 mr-1" />
            Report
          </button>
        </div>
      </div>
    );
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return this.renderErrorContent();
    }

    return this.props.children;
  }
}

// Higher-order component for easier usage
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, "children">,
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}

// Hook for error reporting
export function useErrorReporter() {
  return {
    reportError: (error: Error, context?: string) => {
      if (import.meta.env.DEV) {
        console.error(`[Error Reporter] ${context}:`, error);
      }

      // In production, you could send to error reporting service
      if (import.meta.env.PROD && import.meta.env.VITE_ENABLE_ERROR_REPORTING) {
        // Implementation would go here
      }
    },
    reportInfo: (message: string, context?: string) => {
      if (import.meta.env.DEV) {
        console.info(`[Error Reporter] ${context}:`, message);
      }
    },
  };
}

export default ErrorBoundary;
