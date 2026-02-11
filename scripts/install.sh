#!/bin/bash

# NetGuard Dashboard - Installasjonsskript for Ubuntu 24.04 LTS (også kompatibel med 22.04)
# Kjør med: sudo ./scripts/install.sh
# 
# Opsjoner:
#   --with-security    Installer Docker, Nmap og OpenVAS
#   --skip-security    Hopp over sikkerhetsverktøy
#   --help             Vis hjelp

set -e

# Farger for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Variabler
INSTALL_DIR="/opt/netguard"
API_DIR="/opt/netguard-api"
CURRENT_DIR=$(pwd)
INSTALL_SECURITY=false
SKIP_SECURITY=false

# Parse argumenter
for arg in "$@"; do
    case $arg in
        --with-security)
            INSTALL_SECURITY=true
            ;;
        --skip-security)
            SKIP_SECURITY=true
            ;;
        --help)
            echo "NetGuard Dashboard Installasjon"
            echo ""
            echo "Bruk: sudo ./scripts/install.sh [opsjoner]"
            echo ""
            echo "Opsjoner:"
            echo "  --with-security    Installer Docker, Nmap og OpenVAS automatisk"
            echo "  --skip-security    Hopp over sikkerhetsverktøy (standard)"
            echo "  --help             Vis denne hjelpen"
            exit 0
            ;;
    esac
done

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

info() {
    echo -e "${CYAN}[i]${NC} $1"
}

# Spør om sikkerhetsverktøy hvis ikke spesifisert
if [ "$SKIP_SECURITY" = false ] && [ "$INSTALL_SECURITY" = false ]; then
    echo -e "${YELLOW}Vil du installere sikkerhetsverktøy (Docker, Nmap, OpenVAS)?${NC}"
    echo -e "Dette krever ca. 2GB diskplass og tar 5-10 minutter ekstra."
    read -p "Installer sikkerhetsverktøy? (j/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Jj]$ ]]; then
        INSTALL_SECURITY=true
    fi
fi

# Beregn antall steg
if [ "$INSTALL_SECURITY" = true ]; then
    TOTAL_STEPS=10
else
    TOTAL_STEPS=7
fi

# 1. Oppdater system
echo -e "\n${YELLOW}Steg 1/$TOTAL_STEPS: Oppdaterer system...${NC}"
apt update && apt upgrade -y
status "System oppdatert"

# 2. Installer Node.js
echo -e "\n${YELLOW}Steg 2/$TOTAL_STEPS: Installerer Node.js 20 LTS...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
    status "Node.js installert: $(node --version)"
else
    status "Node.js allerede installert: $(node --version)"
fi

# 3. Installer Nginx
echo -e "\n${YELLOW}Steg 3/$TOTAL_STEPS: Installerer Nginx...${NC}"
apt install -y nginx
status "Nginx installert"

# 4. Kopier frontend filer
echo -e "\n${YELLOW}Steg 4/$TOTAL_STEPS: Setter opp frontend...${NC}"
mkdir -p $INSTALL_DIR
cp -r $CURRENT_DIR/* $INSTALL_DIR/
cd $INSTALL_DIR
npm install
npm run build
status "Frontend bygget"

# 5. Sett opp backend
echo -e "\n${YELLOW}Steg 5/$TOTAL_STEPS: Setter opp backend API...${NC}"
mkdir -p $API_DIR
cp -r $INSTALL_DIR/backend/* $API_DIR/
cd $API_DIR
npm install
cp .env.example .env 2>/dev/null || true
status "Backend satt opp"

# 6. Konfigurer Nginx
echo -e "\n${YELLOW}Steg 6/$TOTAL_STEPS: Konfigurerer Nginx...${NC}"
cp $INSTALL_DIR/scripts/nginx.conf /etc/nginx/sites-available/netguard
ln -sf /etc/nginx/sites-available/netguard /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx
status "Nginx konfigurert"

# 7. Sett opp systemd service
echo -e "\n${YELLOW}Steg 7/$TOTAL_STEPS: Setter opp systemd service...${NC}"
cp $INSTALL_DIR/scripts/netguard-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable netguard-api
systemctl start netguard-api
status "Systemd service aktivert"

# Sikkerhetsverktøy (valgfritt)
if [ "$INSTALL_SECURITY" = true ]; then
    
    # 8. Installer Nmap
    echo -e "\n${YELLOW}Steg 8/$TOTAL_STEPS: Installerer Nmap...${NC}"
    apt install -y nmap
    status "Nmap installert: $(nmap --version | head -n1)"
    
    # 9. Installer Docker
    echo -e "\n${YELLOW}Steg 9/$TOTAL_STEPS: Installerer Docker...${NC}"
    if ! command -v docker &> /dev/null; then
        # Installer Docker avhengigheter
        apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
        
        # Legg til Docker GPG nøkkel
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
        
        # Legg til Docker repository
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        # Installer Docker
        apt update
        apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        
        # Start Docker
        systemctl enable docker
        systemctl start docker
        
        status "Docker installert: $(docker --version)"
    else
        status "Docker allerede installert: $(docker --version)"
    fi
    
    # 10. Start OpenVAS container
    echo -e "\n${YELLOW}Steg 10/$TOTAL_STEPS: Starter OpenVAS/Greenbone...${NC}"
    
    # Stopp eksisterende container hvis den finnes
    docker stop openvas 2>/dev/null || true
    docker rm openvas 2>/dev/null || true
    
    # Opprett volum for persistens
    docker volume create openvas-data 2>/dev/null || true
    
    # Start OpenVAS container
    info "Laster ned og starter OpenVAS container (dette kan ta 5-10 minutter)..."
    docker run -d \
        --name openvas \
        --restart unless-stopped \
        -p 9392:9392 \
        -v openvas-data:/var/lib/openvas \
        greenbone/gsm-community:stable
    
    status "OpenVAS container startet"
    
    # Generer tilfeldig passord for OpenVAS
    OPENVAS_PASSWORD=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9' | head -c 16)
    
    # Oppdater .env med OpenVAS konfigurasjon
    if [ -f "$API_DIR/.env" ]; then
        sed -i "s|OPENVAS_URL=.*|OPENVAS_URL=http://localhost:9392|g" $API_DIR/.env
        sed -i "s|OPENVAS_USERNAME=.*|OPENVAS_USERNAME=admin|g" $API_DIR/.env
        sed -i "s|OPENVAS_PASSWORD=.*|OPENVAS_PASSWORD=$OPENVAS_PASSWORD|g" $API_DIR/.env
    fi
    
    info "OpenVAS initialiseres i bakgrunnen (tar 5-10 min første gang)"
    info "Standard admin-passord genereres automatisk av containeren"
    
    # Restart backend for å ta i bruk nye konfigurasjon
    systemctl restart netguard-api
fi

# Fullført
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Installasjon fullført!                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Frontend:    ${GREEN}http://$(hostname -I | awk '{print $1}')${NC}"
echo -e "Backend API: ${GREEN}http://localhost:3001${NC}"

if [ "$INSTALL_SECURITY" = true ]; then
    echo -e "OpenVAS:     ${GREEN}http://localhost:9392${NC}"
    echo ""
    echo -e "${CYAN}Sikkerhetsverktøy installert:${NC}"
    echo -e "  • Nmap - Nettverksskanning"
    echo -e "  • Docker - Container runtime"
    echo -e "  • OpenVAS/Greenbone - Sårbarhetsskanning"
    echo ""
    echo -e "${YELLOW}OpenVAS admin-passord:${NC}"
    echo -e "Kjør følgende kommando for å se passordet:"
    echo -e "${GREEN}docker logs openvas 2>&1 | grep -i password${NC}"
fi

echo ""
echo -e "${YELLOW}Neste steg:${NC}"
echo -e "1. Rediger backend konfigurasjon: ${GREEN}sudo nano $API_DIR/.env${NC}"
echo -e "2. Restart backend: ${GREEN}sudo systemctl restart netguard-api${NC}"
echo -e "3. Konfigurer API-endepunkter i dashboardet under Innstillinger"
echo ""
echo -e "For å se logger: ${GREEN}sudo journalctl -u netguard-api -f${NC}"

if [ "$INSTALL_SECURITY" = true ]; then
    echo -e "OpenVAS logger: ${GREEN}docker logs -f openvas${NC}"
fi
