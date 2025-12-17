#!/bin/bash

# NetGuard Dashboard - Installasjonsskript for Ubuntu
# Kjør med: sudo ./scripts/install.sh

set -e

# Farger for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variabler
INSTALL_DIR="/opt/netguard"
API_DIR="/opt/netguard-api"
CURRENT_DIR=$(pwd)

echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   NetGuard Dashboard - Installasjon        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""

# Sjekk at script kjøres som root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Feil: Dette scriptet må kjøres som root (sudo)${NC}"
    exit 1
fi

# Funksjon for å vise status
status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
}

# 1. Oppdater system
echo -e "\n${YELLOW}Steg 1/7: Oppdaterer system...${NC}"
apt update && apt upgrade -y
status "System oppdatert"

# 2. Installer Node.js
echo -e "\n${YELLOW}Steg 2/7: Installerer Node.js 20 LTS...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
    status "Node.js installert: $(node --version)"
else
    status "Node.js allerede installert: $(node --version)"
fi

# 3. Installer Nginx
echo -e "\n${YELLOW}Steg 3/7: Installerer Nginx...${NC}"
apt install -y nginx
status "Nginx installert"

# 4. Kopier frontend filer
echo -e "\n${YELLOW}Steg 4/7: Setter opp frontend...${NC}"
mkdir -p $INSTALL_DIR
cp -r $CURRENT_DIR/* $INSTALL_DIR/
cd $INSTALL_DIR
npm install
npm run build
status "Frontend bygget"

# 5. Sett opp backend
echo -e "\n${YELLOW}Steg 5/7: Setter opp backend API...${NC}"
mkdir -p $API_DIR
cp -r $INSTALL_DIR/backend/* $API_DIR/
cd $API_DIR
npm install
cp .env.example .env 2>/dev/null || true
status "Backend satt opp"

# 6. Konfigurer Nginx
echo -e "\n${YELLOW}Steg 6/7: Konfigurerer Nginx...${NC}"
cp $INSTALL_DIR/scripts/nginx.conf /etc/nginx/sites-available/netguard
ln -sf /etc/nginx/sites-available/netguard /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx
status "Nginx konfigurert"

# 7. Sett opp systemd service
echo -e "\n${YELLOW}Steg 7/7: Setter opp systemd service...${NC}"
cp $INSTALL_DIR/scripts/netguard-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable netguard-api
systemctl start netguard-api
status "Systemd service aktivert"

# Fullført
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Installasjon fullført!                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Frontend:    ${GREEN}http://$(hostname -I | awk '{print $1}')${NC}"
echo -e "Backend API: ${GREEN}http://localhost:3001${NC}"
echo ""
echo -e "${YELLOW}Neste steg:${NC}"
echo -e "1. Rediger backend konfigurasjon: ${GREEN}sudo nano $API_DIR/.env${NC}"
echo -e "2. Restart backend: ${GREEN}sudo systemctl restart netguard-api${NC}"
echo -e "3. Konfigurer API-endepunkter i dashboardet under Innstillinger"
echo ""
echo -e "For å se logger: ${GREEN}sudo journalctl -u netguard-api -f${NC}"
