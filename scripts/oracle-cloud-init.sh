#!/bin/bash
set -euo pipefail

# ============================================
# Oracle Cloud Instance Initialization Script
# Run this on a fresh Oracle Cloud ARM A1 instance
# (Ubuntu 22.04 or 24.04)
# ============================================

echo "=========================================="
echo "  Oracle Cloud Instance Setup for FabioBot"
echo "=========================================="

# Update system
echo "[1/6] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Docker
echo "[2/6] Installing Docker..."
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"

# Install Docker Compose plugin
echo "[3/6] Installing Docker Compose..."
sudo apt install -y docker-compose-plugin

# Open firewall ports
echo "[4/6] Configuring firewall (iptables)..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 18789 -j ACCEPT
sudo netfilter-persistent save

# Clone the repository
echo "[5/6] Cloning FabioBot repository..."
cd ~
if [ ! -d "FabioBot" ]; then
    git clone https://github.com/VolPark/FabioBot.git
fi
cd FabioBot

# Make scripts executable
chmod +x deploy.sh scripts/*.sh

# Setup swap (useful for ARM instances under load)
echo "[6/6] Setting up swap space..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo ""
echo "=========================================="
echo "  Instance setup complete!"
echo "=========================================="
echo ""
echo "  IMPORTANT: Log out and back in for Docker group to take effect:"
echo "    exit"
echo "    ssh <your-instance>"
echo ""
echo "  Then deploy FabioBot:"
echo "    cd ~/FabioBot"
echo "    cp .env.example .env"
echo "    nano .env           # Add your credentials"
echo "    ./deploy.sh"
echo ""
echo "  Don't forget to open ports 80, 443 in Oracle Cloud"
echo "  Security List (VCN > Subnet > Security List > Ingress Rules)"
echo "=========================================="
