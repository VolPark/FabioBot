#!/bin/bash
set -euo pipefail

# ============================================
# FabioBot - OpenClaw Deployment Script
# For Oracle Cloud Free Tier (ARM A1)
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  FabioBot - OpenClaw Deployment"
echo "=========================================="

# Check prerequisites
check_prerequisites() {
    echo ""
    echo "[1/5] Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        echo "  Docker not found. Installing..."
        curl -fsSL https://get.docker.com | sh
        sudo usermod -aG docker "$USER"
        echo "  Docker installed. You may need to log out and back in."
    else
        echo "  Docker: OK"
    fi

    if ! docker compose version &> /dev/null; then
        echo "  ERROR: Docker Compose V2 not found."
        echo "  Install with: sudo apt install docker-compose-plugin"
        exit 1
    else
        echo "  Docker Compose: OK"
    fi
}

# Check environment file
check_env() {
    echo ""
    echo "[2/5] Checking environment configuration..."

    if [ ! -f .env ]; then
        echo "  .env file not found. Creating from template..."
        cp .env.example .env
        echo ""
        echo "  !! IMPORTANT: Edit .env with your credentials !!"
        echo "  Required:"
        echo "    - ANTHROPIC_API_KEY (or other LLM provider)"
        echo "    - AZURE_TENANT_ID"
        echo "    - AZURE_CLIENT_ID"
        echo "    - AZURE_CLIENT_SECRET"
        echo "    - POWERBI_WORKSPACE_ID"
        echo ""
        echo "  Run: nano .env"
        echo "  Then re-run: ./deploy.sh"
        exit 0
    fi

    # Validate required vars
    source .env
    local missing=0

    for var in AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET POWERBI_WORKSPACE_ID; do
        val="${!var:-}"
        if [ -z "$val" ] || [[ "$val" == your-* ]]; then
            echo "  WARNING: $var not configured"
            missing=1
        fi
    done

    if [ "$missing" -eq 1 ]; then
        echo ""
        echo "  Some variables need configuration. Edit .env and re-run."
        echo "  Continuing anyway for initial setup..."
    else
        echo "  Environment: OK"
    fi
}

# Create required directories
setup_directories() {
    echo ""
    echo "[3/5] Setting up directories..."

    mkdir -p workspace
    mkdir -p skills

    # Ensure correct permissions for OpenClaw (runs as uid 1000)
    if [ "$(id -u)" -eq 0 ]; then
        chown -R 1000:1000 workspace skills
    fi

    echo "  Directories: OK"
}

# Pull and start containers
start_services() {
    echo ""
    echo "[4/5] Starting services..."

    docker compose pull
    docker compose up -d

    echo "  Services started."
}

# Show status
show_status() {
    echo ""
    echo "[5/5] Deployment complete!"
    echo ""
    echo "=========================================="
    echo "  Status"
    echo "=========================================="
    docker compose ps
    echo ""
    echo "=========================================="
    echo "  Access"
    echo "=========================================="
    echo "  Dashboard: http://$(hostname -I | awk '{print $1}'):18789"
    echo ""
    echo "  To get the dashboard URL with auth token:"
    echo "    docker compose exec openclaw-gateway openclaw dashboard --no-open"
    echo ""
    echo "  To view logs:"
    echo "    docker compose logs -f openclaw-gateway"
    echo ""
    echo "=========================================="
    echo "  Next Steps"
    echo "=========================================="
    echo "  1. Configure .env with your API keys"
    echo "  2. Access the dashboard and complete onboarding"
    echo "  3. Install skills: powerbi-report-builder, powerbi-workspace-manager"
    echo "  4. Configure messaging channel (Teams, Slack, Telegram)"
    echo "  5. Test: 'List semantic models in my workspace'"
    echo ""
    echo "  For SSL setup with your domain:"
    echo "    ./scripts/setup-ssl.sh your-domain.com your-email@example.com"
    echo "=========================================="
}

# Run
check_prerequisites
check_env
setup_directories
start_services
show_status
