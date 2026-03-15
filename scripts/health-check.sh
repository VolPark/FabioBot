#!/bin/bash
# FabioBot Health Check
# Usage: bash scripts/health-check.sh

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

OK="${GREEN}[OK]${NC}"
FAIL="${RED}[FAIL]${NC}"
WARN="${YELLOW}[WARN]${NC}"

echo ""
echo "=========================================="
echo "   FabioBot Health Check"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""

ERRORS=0

# 1. Check .env file
echo "1. Configuration"
if [ -f ".env" ]; then
    echo -e "   $OK .env file found"
    for var in AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET POWERBI_WORKSPACE_ID; do
        if grep -q "^${var}=" .env && ! grep -q "^${var}=your-" .env && ! grep -q "^${var}=$" .env; then
            echo -e "   $OK $var is set"
        else
            echo -e "   $FAIL $var is missing or placeholder"
            ERRORS=$((ERRORS + 1))
        fi
    done
else
    echo -e "   $FAIL .env file not found. Copy .env.example to .env and fill in the values."
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 2. Check Docker
echo "2. Docker"
if command -v docker &> /dev/null; then
    echo -e "   $OK Docker installed ($(docker --version | cut -d' ' -f3 | tr -d ','))"
else
    echo -e "   $FAIL Docker not installed"
    ERRORS=$((ERRORS + 1))
fi

if command -v docker &> /dev/null && docker compose version &> /dev/null 2>&1; then
    echo -e "   $OK Docker Compose available"
elif command -v docker-compose &> /dev/null; then
    echo -e "   $OK docker-compose available"
else
    echo -e "   $WARN Docker Compose not found"
fi
echo ""

# 3. Check running containers
echo "3. Containers"
if command -v docker &> /dev/null; then
    if docker ps --format "{{.Names}}" 2>/dev/null | grep -q "openclaw-gateway"; then
        STATUS=$(docker inspect openclaw-gateway --format='{{.State.Health.Status}}' 2>/dev/null || echo "running")
        echo -e "   $OK openclaw-gateway is running (health: $STATUS)"
    else
        echo -e "   $FAIL openclaw-gateway is NOT running. Start with: docker compose up -d"
        ERRORS=$((ERRORS + 1))
    fi

    if docker ps --format "{{.Names}}" 2>/dev/null | grep -q "openclaw-nginx"; then
        echo -e "   $OK openclaw-nginx is running"
    else
        echo -e "   $WARN openclaw-nginx is not running (optional)"
    fi
else
    echo -e "   $WARN Cannot check containers (Docker not available)"
fi
echo ""

# 4. Check OpenClaw HTTP endpoint
echo "4. OpenClaw API"
PORT=${OPENCLAW_PORT:-18789}
if curl -sf "http://localhost:${PORT}/health" -o /dev/null --max-time 5 2>/dev/null; then
    echo -e "   $OK OpenClaw responding on port $PORT"
elif curl -sf "http://localhost:${PORT}" -o /dev/null --max-time 5 2>/dev/null; then
    echo -e "   $OK OpenClaw reachable on port $PORT (no /health endpoint)"
else
    echo -e "   $FAIL OpenClaw not responding on port $PORT"
    echo "        Make sure the container is running: docker compose up -d"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 5. Check skills directory
echo "5. Skills"
EXPECTED_SKILLS=("powerbi-report-builder" "powerbi-workspace-manager" "fabric-api" "powerbi-news-tracker" "bot-status")
for skill in "${EXPECTED_SKILLS[@]}"; do
    if [ -f "skills/${skill}/skill.json" ] && [ -f "skills/${skill}/index.js" ]; then
        echo -e "   $OK $skill"
    else
        echo -e "   $FAIL $skill (missing files in skills/${skill}/)"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# Summary
echo "=========================================="
if [ $ERRORS -eq 0 ]; then
    echo -e "   ${GREEN}All checks passed. FabioBot looks healthy!${NC}"
else
    echo -e "   ${RED}$ERRORS check(s) failed. Review the issues above.${NC}"
fi
echo "=========================================="
echo ""

exit $ERRORS
