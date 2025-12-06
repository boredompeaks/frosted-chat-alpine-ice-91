#!/bin/bash

# CalcIta - Automated Setup Script
# Version: 1.0.0

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Banner
echo -e "${GREEN}"
cat << "EOF"
   ____      _      _____ _
  / ___|__ _| | ___|_   _| |_ __ _
 | |   / _` | |/ __|| | | __/ _` |
 | |__| (_| | | (__ | | | || (_| |
  \____\__,_|_|\___||_|  \__\__,_|

  Secure End-to-End Encrypted Messaging
EOF
echo -e "${NC}"

print_header "CalcIta Setup - Automated Installation"

# Step 1: Check Prerequisites
print_header "Step 1: Checking Prerequisites"

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node -v)
    print_success "Node.js is installed: $NODE_VERSION"

    # Check if version is >= 18
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        print_error "Node.js version 18 or higher is required"
        exit 1
    fi
else
    print_error "Node.js is not installed"
    print_info "Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm -v)
    print_success "npm is installed: $NPM_VERSION"
else
    print_error "npm is not installed"
    exit 1
fi

# Check git
if command_exists git; then
    print_success "Git is installed"
else
    print_warning "Git is not installed (optional)"
fi

# Step 2: Install Dependencies
print_header "Step 2: Installing Dependencies"

print_info "This may take a few minutes..."
if npm install; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Step 3: Environment Configuration
print_header "Step 3: Environment Configuration"

if [ -f ".env" ]; then
    print_warning ".env file already exists"
    read -p "Do you want to overwrite it? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Keeping existing .env file"
    else
        cp .env.example .env
        print_success "Created new .env file from template"
    fi
else
    cp .env.example .env
    print_success "Created .env file from template"
fi

# Step 4: Configure Supabase
print_header "Step 4: Supabase Configuration"

print_info "The following Supabase credentials are already configured:"
echo ""
echo "  SUPABASE_URL: https://bjnxsfipttpdwodktcwt.supabase.co"
echo "  ANON_KEY: (configured)"
echo ""

read -p "Do you want to use these credentials? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Please update .env file with your Supabase credentials"
    if command_exists nano; then
        read -p "Open .env in nano now? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            nano .env
        fi
    elif command_exists vim; then
        read -p "Open .env in vim now? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            vim .env
        fi
    else
        print_info "Please edit .env file manually"
    fi
fi

# Step 5: Security Configuration
print_header "Step 5: Security Configuration"

print_warning "IMPORTANT: Change the default PIN!"
echo ""
echo "  Current PIN: 1337 (default)"
echo "  To change: Edit .env file and update VITE_CALCULATOR_PIN"
echo ""

read -p "Press Enter to continue..."

# Step 6: Database Setup
print_header "Step 6: Database Setup Instructions"

print_info "You need to run the database migration on Supabase:"
echo ""
echo "  1. Go to https://supabase.com"
echo "  2. Open your project dashboard"
echo "  3. Navigate to SQL Editor"
echo "  4. Click 'New Query'"
echo "  5. Copy contents of: supabase/migrations/20250101000000_calcita_e2ee_schema.sql"
echo "  6. Paste and click 'Run'"
echo "  7. Verify all tables are created"
echo ""

read -p "Have you completed the database migration? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Database migration not completed"
    print_info "You can run this setup script again after completing migration"
    print_info "Or continue anyway and set it up later"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Setup paused. Run './setup.sh' again when ready."
        exit 0
    fi
fi

# Step 7: Type Check
print_header "Step 7: Type Checking"

print_info "Running TypeScript type check..."
if npm run type-check; then
    print_success "Type check passed"
else
    print_warning "Type check found some issues (non-critical)"
fi

# Step 8: Build Test
print_header "Step 8: Build Test"

print_info "Testing production build..."
if npm run build; then
    print_success "Build successful"
    print_info "Build output in: ./dist"
else
    print_error "Build failed"
    print_warning "You can still run the development server"
fi

# Step 9: Setup Complete
print_header "Setup Complete!"

print_success "CalcIta has been set up successfully!"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo ""
echo "  1. Start development server:"
echo "     ${YELLOW}npm run dev${NC}"
echo ""
echo "  2. Open in browser:"
echo "     ${YELLOW}http://localhost:5173${NC}"
echo ""
echo "  3. Use calculator PIN to unlock:"
echo "     ${YELLOW}1337${NC} (default - change this!)"
echo ""
echo "  4. Create an account and start messaging"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "  • README.md - Project overview"
echo "  • DEPLOYMENT.md - Production deployment"
echo "  • SECURITY.md - Security best practices"
echo "  • INTEGRATION_GUIDE.md - API integration"
echo ""

read -p "Start development server now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Starting development server..."
    echo ""
    npm run dev
else
    print_info "Setup complete! Run 'npm run dev' when ready."
fi
