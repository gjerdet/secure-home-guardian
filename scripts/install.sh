#!/bin/bash

# NetGuard Dashboard - Installasjonsskript for Ubuntu 24.04 LTS (også kompatibel med 22.04)
# Kjør med: sudo ./scripts/install.sh
# 
# Opsjoner:
#   --with-security    Installer Docker, Nmap og OpenVAS
#   --skip-security    Hopp over sikkerhetsverktøy
#   --help             Vis hjelp

set -eo pipefail

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

# Sjekk Ubuntu-versjon
check_ubuntu_version() {
    if [ ! -f /etc/os-release ]; then
        warn "Kunne ikke finne /etc/os-release – kan ikke verifisere OS-versjon"
        return
    fi

    . /etc/os-release

    if [ "$ID" != "ubuntu" ]; then
        warn "Dette skriptet er laget for Ubuntu, men fant: $PRETTY_NAME"
        warn "Installasjonen kan fungere, men er ikke testet for $ID"
        read -p "Vil du fortsette likevel? (j/n): " -n 1 -r
        echo
        [[ ! $REPLY =~ ^[Jj]$ ]] && exit 1
        return
    fi

    MAJOR_VER=$(echo "$VERSION_ID" | cut -d. -f1)
    MINOR_VER=$(echo "$VERSION_ID" | cut -d. -f2)

    if [ "$MAJOR_VER" -lt 22 ] || { [ "$MAJOR_VER" -eq 22 ] && [ "$MINOR_VER" -lt 4 ]; }; then
        error "Ubuntu $VERSION_ID er for gammel. Minimum versjon er 22.04 LTS."
        error "Anbefalt: Ubuntu 24.04 LTS"
        exit 1
    elif [ "$MAJOR_VER" -eq 22 ]; then
        warn "Ubuntu 22.04 er støttet, men 24.04 LTS er anbefalt for nye installasjoner."
    else
        status "Ubuntu $VERSION_ID – OK"
    fi
}

check_ubuntu_version

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
    TOTAL_STEPS=8
else
    TOTAL_STEPS=5
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
cp -r $CURRENT_DIR/. $INSTALL_DIR/

cd $INSTALL_DIR
info "Installerer npm-pakker (dette kan ta litt tid)..."
npm install
if [ ! -d "$INSTALL_DIR/node_modules/.bin" ]; then
    error "npm install feilet – node_modules/.bin mangler"
    exit 1
fi

info "Bygger frontend..."
$INSTALL_DIR/node_modules/.bin/vite build
if [ ! -f "$INSTALL_DIR/dist/index.html" ]; then
    error "Frontend-bygg feilet! dist/index.html ble ikke generert."
    exit 1
fi
status "Frontend bygget"

# 5. Sett opp backend
echo -e "\n${YELLOW}Steg 5/$TOTAL_STEPS: Setter opp backend API...${NC}"
mkdir -p $API_DIR
cp -r $INSTALL_DIR/backend/* $API_DIR/
cd $API_DIR
npm install
cp .env.example .env 2>/dev/null || true

# Generer JWT_SECRET hvis ikke satt
if ! grep -q "^JWT_SECRET=" $API_DIR/.env 2>/dev/null || grep -q "^JWT_SECRET=$" $API_DIR/.env 2>/dev/null; then
    JWT_SECRET=$(openssl rand -hex 32)
    echo "JWT_SECRET=$JWT_SECRET" >> $API_DIR/.env
fi
status "Backend satt opp"

# Opprett data-mappe for backend
mkdir -p $API_DIR/data
status "Backend satt opp"

# 4. Konfigurer Nginx
echo -e "\n${YELLOW}Steg 4/$TOTAL_STEPS: Konfigurerer Nginx...${NC}"
rm -f /etc/nginx/sites-enabled/default
cp $INSTALL_DIR/scripts/nginx.conf /etc/nginx/sites-available/netguard
ln -sf /etc/nginx/sites-available/netguard /etc/nginx/sites-enabled/netguard

if [ -f /etc/nginx/sites-enabled/default ]; then
    error "Kunne ikke fjerne default Nginx-konfig!"
    exit 1
fi

nginx -t 2>&1
if [ $? -ne 0 ]; then
    error "Nginx-konfigurasjon er ugyldig!"
    exit 1
fi
systemctl restart nginx
systemctl enable nginx
status "Nginx konfigurert (default fjernet, netguard aktiv)"

# 5. Sett opp systemd service
echo -e "\n${YELLOW}Steg 5/$TOTAL_STEPS: Setter opp systemd service...${NC}"
cp $INSTALL_DIR/scripts/netguard-api.service /etc/systemd/system/netguard-api.service

if [ ! -f /etc/systemd/system/netguard-api.service ]; then
    error "Kunne ikke kopiere service-fil!"
    exit 1
fi

systemctl daemon-reload
systemctl enable netguard-api
systemctl start netguard-api

# Vent litt og sjekk at tjenesten kjører
sleep 2
if systemctl is-active --quiet netguard-api; then
    status "Backend-tjeneste kjører"
else
    warn "Backend-tjeneste startet ikke. Sjekk logger: journalctl -u netguard-api -n 20"
fi

# Sikkerhetsverktøy (valgfritt)
if [ "$INSTALL_SECURITY" = true ]; then
    
    # 6. Installer Nmap
    echo -e "\n${YELLOW}Steg 6/$TOTAL_STEPS: Installerer Nmap...${NC}"
    apt install -y nmap
    status "Nmap installert: $(nmap --version | head -n1)"
    
    # 7. Installer Docker
    echo -e "\n${YELLOW}Steg 7/$TOTAL_STEPS: Installerer Docker...${NC}"
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
    
    # 8. Start OpenVAS container
    echo -e "\n${YELLOW}Steg 8/$TOTAL_STEPS: Starter OpenVAS/Greenbone...${NC}"
    
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
SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Installasjon fullført!                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Åpne nettleseren og gå til:${NC}"
echo -e "  ${GREEN}http://${SERVER_IP}${NC}"
echo ""
echo -e "${CYAN}Første gang vil du bli guidet gjennom oppsett:${NC}"
echo -e "  1. Opprett admin-konto"
echo -e "  2. Koble til tjenester (UniFi, TrueNAS, Proxmox, OpenVAS)"
echo -e "  3. Logg inn og bruk dashboardet"

if [ "$INSTALL_SECURITY" = true ]; then
    echo ""
    echo -e "${CYAN}Sikkerhetsverktøy installert:${NC}"
    echo -e "  • Nmap - Nettverksskanning"
    echo -e "  • Docker - Container runtime"
    echo -e "  • OpenVAS/Greenbone - Sårbarhetsskanning"
    echo ""
    echo -e "${YELLOW}OpenVAS admin-passord:${NC}"
    echo -e "Kjør: ${GREEN}docker logs openvas 2>&1 | grep -i password${NC}"
fi

echo ""
echo -e "${YELLOW}Nyttige kommandoer:${NC}"
echo -e "  Se logger:        ${GREEN}sudo journalctl -u netguard-api -f${NC}"
echo -e "  Restart backend:  ${GREEN}sudo systemctl restart netguard-api${NC}"
echo -e "  Rediger config:   ${GREEN}sudo nano $API_DIR/.env${NC}"
