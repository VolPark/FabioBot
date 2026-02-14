#!/bin/bash
set -euo pipefail

# ============================================
# SSL Setup Script (Let's Encrypt + Nginx)
# ============================================

if [ $# -lt 2 ]; then
    echo "Usage: ./scripts/setup-ssl.sh <domain> <email>"
    echo "Example: ./scripts/setup-ssl.sh fabiobot.example.com admin@example.com"
    exit 1
fi

DOMAIN="$1"
EMAIL="$2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "Setting up SSL for: $DOMAIN"

# Step 1: Get initial certificate
echo "[1/3] Obtaining certificate..."
docker compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email

# Step 2: Update nginx config to enable HTTPS
echo "[2/3] Updating Nginx configuration..."
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" nginx/conf.d/default.conf
# Uncomment the HTTPS server block
sed -i 's/^# \(.*\)/\1/' nginx/conf.d/default.conf

# Step 3: Reload nginx
echo "[3/3] Reloading Nginx..."
docker compose exec nginx nginx -s reload

echo ""
echo "SSL setup complete!"
echo "Access your dashboard at: https://$DOMAIN"
