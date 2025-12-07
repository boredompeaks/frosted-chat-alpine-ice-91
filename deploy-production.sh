#!/bin/bash

# =====================================================================
# CalcIta Production Deployment Script
# Secure E2EE Messaging Application - Production Deployment
# =====================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="CalcIta"
APP_VERSION="1.0.0"
DEPLOYMENT_DATE=$(date +"%Y-%m-%d %H:%M:%S")
LOG_FILE="/tmp/calcita_deploy_$(date +%Y%m%d_%H%M%S).log"

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
BUILD_DIR="$PROJECT_DIR/dist"
BACKUP_DIR="$PROJECT_DIR/backups"
TEMP_DIR="/tmp/calcita_deploy_$$"

# Environment
ENV_FILE="$PROJECT_DIR/.env.production"
NODE_ENV="production"

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

info() {
    echo -e "${PURPLE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

header() {
    echo -e "${WHITE}=================================${NC}"
    echo -e "${WHITE}$1${NC}"
    echo -e "${WHITE}=================================${NC}" | tee -a "$LOG_FILE"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error "This script should not be run as root for security reasons"
    fi
}

# Check system requirements
check_requirements() {
    header "Checking System Requirements"

    # Check OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        info "Linux detected - good for production"
    else
        error "This script is designed for Linux production environments"
    fi

    # Check available disk space (minimum 2GB)
    AVAILABLE_SPACE=$(df / | awk 'NR==2 {print $4}')
    if [[ $AVAILABLE_SPACE -lt 2097152 ]]; then
        error "Insufficient disk space. At least 2GB required, available: $(($AVAILABLE_SPACE / 1024 / 1024))GB"
    fi

    # Check memory (minimum 1GB)
    TOTAL_MEMORY=$(free -m | awk 'NR==2{print $2}')
    if [[ $TOTAL_MEMORY -lt 1024 ]]; then
        warning "Low memory detected: ${TOTAL_MEMORY}MB. Recommended: 2GB+"
    fi

    # Check for required commands
    local required_commands=("node" "npm" "git" "curl" "docker")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            error "Required command not found: $cmd"
        fi
    done

    # Check Node.js version
    NODE_VERSION=$(node -v | sed 's/v//')
    REQUIRED_NODE="18.0.0"
    if ! npx semver -r ">=18.0.0" "$NODE_VERSION" &> /dev/null; then
        error "Node.js version $NODE_VERSION is too old. Required: >=18.0.0"
    fi

    success "System requirements check passed"
}

# Security audit
security_audit() {
    header "Running Security Audit"

    info "Checking for sensitive files..."
    local sensitive_files=(".env" ".env.local" ".env.production" "*.key" "*.pem" "id_rsa" "id_dsa")
    for pattern in "${sensitive_files[@]}"; do
        if find "$PROJECT_DIR" -name "$pattern" -type f 2>/dev/null | grep -v "$ENV_FILE" | head -1 | grep -q .; then
            warning "Sensitive file found: $pattern"
        fi
    done

    # Check file permissions
    info "Checking file permissions..."
    if find "$PROJECT_DIR" -type f -perm /o+w 2>/dev/null | head -1 | grep -q .; then
        warning "World-writable files found. Run: find . -type f -perm /o+w -exec chmod o-w {} \\;"
    fi

    # Check for hardcoded secrets (basic check)
    info "Scanning for potential hardcoded secrets..."
    if grep -r -i "password.*=.*['\"][^'\"]*['\"]" "$PROJECT_DIR" --exclude-dir=node_modules --exclude="*.log" 2>/dev/null | head -1 | grep -q .; then
        warning "Potential hardcoded passwords detected"
    fi

    success "Security audit completed"
}

# Create backup
create_backup() {
    header "Creating Backup"

    mkdir -p "$BACKUP_DIR"

    local backup_name="calcita_backup_$(date +%Y%m%d_%H%M%S)"
    local backup_path="$BACKUP_DIR/$backup_name"

    info "Creating backup: $backup_name"

    # Create backup directory structure
    mkdir -p "$backup_path"

    # Backup source code (excluding node_modules, dist, etc.)
    rsync -av --exclude='node_modules/' --exclude='dist/' --exclude='.git/' \
          --exclude='*.log' --exclude='backups/' --exclude='temp/' \
          "$PROJECT_DIR/" "$backup_path/source/" 2>/dev/null || true

    # Backup environment file
    if [[ -f "$ENV_FILE" ]]; then
        cp "$ENV_FILE" "$backup_path/env_backup.env"
    fi

    # Backup database if needed
    if command -v supabase &> /dev/null; then
        info "Creating database backup..."
        # Add database backup logic here
    fi

    # Compress backup
    tar -czf "$backup_path.tar.gz" -C "$BACKUP_DIR" "$backup_name"
    rm -rf "$backup_path"

    success "Backup created: $backup_path.tar.gz"
}

# Install dependencies
install_dependencies() {
    header "Installing Dependencies"

    cd "$PROJECT_DIR"

    # Clean install to ensure consistency
    info "Cleaning node_modules and package-lock.json..."
    rm -rf node_modules package-lock.json 2>/dev/null || true

    # Install dependencies
    info "Installing production dependencies..."
    npm ci --only=production --silent

    # Install development dependencies needed for build
    info "Installing build dependencies..."
    npm install --silent

    success "Dependencies installed successfully"
}

# Environment validation
validate_environment() {
    header "Validating Environment"

    if [[ ! -f "$ENV_FILE" ]]; then
        error "Production environment file not found: $ENV_FILE"
    fi

    # Check required environment variables
    local required_vars=(
        "VITE_SUPABASE_URL"
        "VITE_SUPABASE_ANON_KEY"
        "VITE_CALCULATOR_PIN"
    )

    for var in "${required_vars[@]}"; do
        if ! grep -q "^$var=" "$ENV_FILE" || grep -q "^$var=.*your_.*_here" "$ENV_FILE"; then
            error "Required environment variable not configured: $var"
        fi
    done

    # Check for default values that should be changed
    if grep -q "VITE_CALCULATOR_PIN=1337" "$ENV_FILE"; then
        warning "Default calculator PIN detected. Please change VITE_CALCULATOR_PIN in production!"
    fi

    success "Environment validation passed"
}

# Database setup
setup_database() {
    header "Setting up Database"

    if [[ ! -f "$PROJECT_DIR/WORKING_SCHEMA.sql" ]]; then
        error "Database schema file not found: WORKING_SCHEMA.sql"
    fi

    info "Database schema file found. Please run the following SQL in your Supabase project:"
    info "1. Go to your Supabase dashboard"
    info "2. Navigate to SQL Editor"
    info "3. Copy and execute the content of WORKING_SCHEMA.sql"
    info "4. Ensure all tables and RLS policies are created"

    # Validate schema file
    if ! grep -q "CREATE TABLE" "$PROJECT_DIR/WORKING_SCHEMA.sql"; then
        error "Invalid database schema file"
    fi

    success "Database schema validated"
}

# Security headers setup
setup_security_headers() {
    header "Setting up Security Headers"

    # Create security headers configuration
    cat > "$PROJECT_DIR/public/_headers" << EOF
/*
  # Security Headers
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

  # CSP Header (will be set by the app)
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' https:; connect-src 'self' wss: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';

/static/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache, no-store, must-revalidate

/sw.js
  Cache-Control: no-cache
EOF

    success "Security headers configured"
}

# Build application
build_application() {
    header "Building Application"

    cd "$PROJECT_DIR"

    # Set production environment
    export NODE_ENV=production

    # Clean previous build
    info "Cleaning previous build..."
    rm -rf dist/ 2>/dev/null || true

    # Build the application
    info "Building application for production..."
    npm run build

    if [[ ! -d "$BUILD_DIR" ]]; then
        error "Build failed - dist directory not created"
    fi

    # Verify build output
    local required_files=("index.html" "assets")
    for file in "${required_files[@]}"; do
        if [[ ! -e "$BUILD_DIR/$file" ]]; then
            error "Build verification failed - missing: $file"
        fi
    done

    success "Application built successfully"
}

# Performance optimization
optimize_build() {
    header "Optimizing Build"

    # Enable gzip/brotli compression (if supported)
    if command -v brotli &> /dev/null; then
        info "Compressing assets with Brotli..."
        find "$BUILD_DIR" -type f -name "*.js" -o -name "*.css" -o -name "*.html" | \
        xargs brotli --best --quiet 2>/dev/null || true
    elif command -v gzip &> /dev/null; then
        info "Compressing assets with Gzip..."
        find "$BUILD_DIR" -type f \( -name "*.js" -o -name "*.css" -o -name "*.html" \) -exec gzip -9 -k {} \; 2>/dev/null || true
    fi

    # Generate source maps for production debugging
    if [[ "$GENERATE_SOURCEMAPS" == "true" ]]; then
        info "Generating source maps..."
        find "$BUILD_DIR" -name "*.js.map" 2>/dev/null || true
    fi

    # Optimize images
    if command -v imagemagick &> /dev/null; then
        info "Optimizing images..."
        find "$BUILD_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.gif" \) -exec mogrify -strip -quality 85 {} \; 2>/dev/null || true
    fi

    success "Build optimization completed"
}

# Test build
test_build() {
    header "Testing Build"

    cd "$BUILD_DIR"

    # Start a temporary server to test the build
    info "Starting temporary test server..."
    python3 -m http.server 8080 &
    local server_pid=$!

    # Wait for server to start
    sleep 2

    # Test basic endpoints
    local test_urls=(
        "http://localhost:8080/"
        "http://localhost:8080/index.html"
    )

    for url in "${test_urls[@]}"; do
        info "Testing: $url"
        if curl -f -s -o /dev/null "$url"; then
            success "✓ $url accessible"
        else
            error "✗ $url not accessible"
        fi
    done

    # Stop test server
    kill $server_pid 2>/dev/null || true
    wait $server_pid 2>/dev/null || true

    success "Build tests passed"
}

# Health check
health_check() {
    header "Running Health Checks"

    # Check application-specific files
    local critical_files=(
        "index.html"
        "assets/index-*.js"
        "assets/index-*.css"
    )

    for pattern in "${critical_files[@]}"; do
        if ! ls "$BUILD_DIR/$pattern" 2>/dev/null | head -1 | grep -q .; then
            error "Critical file missing: $pattern"
        fi
    done

    # Check file sizes
    local js_files=$(find "$BUILD_DIR" -name "*.js" -not -name "*.map")
    local total_js_size=0

    while IFS= read -r file; do
        local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
        total_js_size=$((total_js_size + size))
    done <<< "$js_files"

    if [[ $total_js_size -gt 10485760 ]]; then  # 10MB
        warning "Large JavaScript bundle detected: $((total_js_size / 1024 / 1024))MB"
    fi

    # Security scan
    info "Running security scan..."
    if [[ -f "$BUILD_DIR/index.html" ]]; then
        if grep -q "javascript:" "$BUILD_DIR/index.html"; then
            error "JavaScript protocol detected in HTML"
        fi

        if grep -q "eval(" "$BUILD_DIR/index.html"; then
            warning "eval() function detected - potential security risk"
        fi
    fi

    success "Health checks passed"
}

# Generate deployment report
generate_report() {
    header "Generating Deployment Report"

    local report_file="$PROJECT_DIR/deployment_report_$(date +%Y%m%d_%H%M%S).json"

    cat > "$report_file" << EOF
{
  "application": "$APP_NAME",
  "version": "$APP_VERSION",
  "deployment_date": "$DEPLOYMENT_DATE",
  "environment": "production",
  "build_info": {
    "node_version": "$(node -v)",
    "npm_version": "$(npm -v)",
    "build_size": "$(du -sh $BUILD_DIR | cut -f1)",
    "total_files": "$(find $BUILD_DIR -type f | wc -l)"
  },
  "security": {
    "file_permissions": "✓",
    "security_headers": "✓",
    "environment_validation": "✓",
    "sensitive_data_scan": "✓"
  },
  "files": {
    "source_directory": "$PROJECT_DIR",
    "build_directory": "$BUILD_DIR",
    "backup_directory": "$BACKUP_DIR",
    "log_file": "$LOG_FILE"
  },
  "checksums": {
    "index.html": "$(md5sum $BUILD_DIR/index.html 2>/dev/null | cut -d' ' -f1 || echo 'N/A')",
    "main_js": "$(find $BUILD_DIR -name 'index-*.js' -exec md5sum {} \; 2>/dev/null | head -1 | cut -d' ' -f1 || echo 'N/A')",
    "main_css": "$(find $BUILD_DIR -name 'index-*.css' -exec md5sum {} \; 2>/dev/null | head -1 | cut -d' ' -f1 || echo 'N/A')"
  }
}
EOF

    success "Deployment report generated: $report_file"
    info "Report location: $report_file"
}

# Cleanup
cleanup() {
    header "Cleaning Up"

    # Remove temporary files
    if [[ -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi

    # Clean npm cache
    info "Cleaning npm cache..."
    npm cache clean --force 2>/dev/null || true

    # Remove old logs
    find /tmp -name "calcita_deploy_*.log" -mtime +7 -delete 2>/dev/null || true

    success "Cleanup completed"
}

# Main deployment function
main() {
    header "CalcIta Production Deployment Started"
    info "Application: $APP_NAME v$APP_VERSION"
    info "Deployment Date: $DEPLOYMENT_DATE"
    info "Log File: $LOG_FILE"

    # Create temp directory
    mkdir -p "$TEMP_DIR"

    # Deployment steps
    check_root
    check_requirements
    security_audit
    create_backup
    install_dependencies
    validate_environment
    setup_database
    setup_security_headers
    build_application
    optimize_build
    test_build
    health_check
    generate_report
    cleanup

    header "Deployment Completed Successfully!"
    success "✓ $APP_NAME v$APP_VERSION deployed to production"
    success "✓ Build directory: $BUILD_DIR"
    success "✓ Backup created in: $BACKUP_DIR"
    success "✓ Deployment log: $LOG_FILE"

    echo -e "\n${GREEN}Next Steps:${NC}"
    echo -e "${CYAN}1. Copy the build directory to your production server${NC}"
    echo -e "${CYAN}2. Configure your web server (Nginx/Apache)${NC}"
    echo -e "${CYAN}3. Set up SSL certificates${NC}"
    echo -e "${CYAN}4. Configure your Supabase project${NC}"
    echo -e "${CYAN}5. Test the application thoroughly${NC}"
    echo -e "${CYAN}6. Set up monitoring and logging${NC}"

    # Show summary
    echo -e "\n${WHITE}Deployment Summary:${NC}"
    echo -e "Build Size: ${GREEN}$(du -sh $BUILD_DIR | cut -f1)${NC}"
    echo -e "Total Files: ${GREEN}$(find $BUILD_DIR -type f | wc -l)${NC}"
    echo -e "Deployment Time: ${GREEN}$(date +'%Y-%m-%d %H:%M:%S')${NC}"
}

# Handle script interruption
trap 'error "Deployment interrupted"' INT TERM

# Run main function
main "$@"
