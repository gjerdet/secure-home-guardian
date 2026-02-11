# NetGuard Dashboard - Installasjonsveiledning

## Systemkrav

- Ubuntu 24.04 LTS (anbefalt) eller 22.04 LTS
- Node.js 20+ og npm
- Tilgang til UniFi Controller, TrueNAS, Proxmox og OpenVAS (valgfritt)

## Rask installasjon

```bash
# Klon repository
git clone https://github.com/DITT_BRUKERNAVN/DITT_REPO.git
cd DITT_REPO

# Kjør installasjonsskript (med sikkerhetsverktøy)
chmod +x scripts/install.sh
sudo ./scripts/install.sh --with-security
```

### Installasjonsopsjoner

| Opsjon | Beskrivelse |
|--------|-------------|
| `--with-security` | Installer Docker, Nmap og OpenVAS automatisk |
| `--skip-security` | Hopp over sikkerhetsverktøy |
| (ingen) | Scriptet spør interaktivt |

**Hva installeres med `--with-security`:**
- **Nmap** - Nettverksskanning og port-oppdagelse
- **Docker** - Container runtime for OpenVAS
- **OpenVAS/Greenbone** - Fullverdig sårbarhetsskanner

## Manuell installasjon

### 1. Installer avhengigheter

```bash
# Oppdater system
sudo apt update && sudo apt upgrade -y

# Installer Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verifiser installasjon
node --version
npm --version
```

### 2. Installer frontend

```bash
# Naviger til prosjektmappe
cd /opt/netguard

# Installer npm pakker
npm install

# Bygg for produksjon
npm run build
```

### 3. Installer og konfigurer Nginx

```bash
# Installer Nginx
sudo apt install -y nginx

# Kopier Nginx konfigurasjon
sudo cp scripts/nginx.conf /etc/nginx/sites-available/netguard
sudo ln -s /etc/nginx/sites-available/netguard /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Test og restart Nginx
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### 4. Sett opp backend API

```bash
# Opprett backend mappe
sudo mkdir -p /opt/netguard-api
cd /opt/netguard-api

# Kopier backend filer
sudo cp -r /opt/netguard/backend/* .

# Installer backend avhengigheter
sudo npm install

# Opprett konfigurasjonsfil
sudo cp .env.example .env
sudo nano .env  # Rediger med dine API-nøkler
```

### 5. Konfigurer systemd services

```bash
# Kopier service filer
sudo cp /opt/netguard/scripts/netguard-api.service /etc/systemd/system/

# Aktiver og start tjenesten
sudo systemctl daemon-reload
sudo systemctl enable netguard-api
sudo systemctl start netguard-api

# Sjekk status
sudo systemctl status netguard-api
```

## Konfigurasjon

### Backend API (.env)

Rediger `/opt/netguard-api/.env`:

```env
# Server
PORT=3001
NODE_ENV=production

# UniFi Controller
UNIFI_CONTROLLER_URL=https://192.168.1.1:8443
UNIFI_USERNAME=admin
UNIFI_PASSWORD=your_password
UNIFI_SITE=default

# TrueNAS
TRUENAS_URL=http://192.168.1.20
TRUENAS_API_KEY=your_api_key

# Proxmox
PROXMOX_URL=https://192.168.1.30:8006
PROXMOX_USER=root@pam
PROXMOX_TOKEN_ID=your_token_id
PROXMOX_TOKEN_SECRET=your_token_secret

# OpenVAS
OPENVAS_URL=http://192.168.1.40:9392
OPENVAS_USERNAME=admin
OPENVAS_PASSWORD=your_password

# GeoIP (valgfritt - for offline GeoIP)
MAXMIND_LICENSE_KEY=your_license_key
```

## Sikkerhetsskanning (OpenVAS & Nmap)

### Nmap oppsett

Nmap brukes for nettverksskanning og port-oppdagelse. Det kreves ingen spesiell konfigurasjon.

```bash
# Installer nmap
sudo apt install -y nmap

# Verifiser installasjon
nmap --version
```

**Merk:** Backend kjører nmap-kommandoer direkte, så brukeren som kjører backend-tjenesten må ha tilgang til nmap.

### OpenVAS / Greenbone oppsett

OpenVAS er en fullverdig sårbarhetsskanner. Den enkleste måten å installere på er via Docker:

```bash
# Installer Docker først
sudo apt install -y docker.io docker-compose

# Start Greenbone Community Edition
docker run -d \
  --name openvas \
  -p 9392:9392 \
  -v openvas-data:/var/lib/openvas \
  greenbone/gsm-community:stable

# Vent 5-10 minutter for første oppstart
docker logs -f openvas
```

Alternativt, installer direkte:
```bash
# Legg til Greenbone repository
sudo add-apt-repository ppa:mrazavi/gvm

# Installer
sudo apt install -y gvm

# Kjør oppsett
sudo gvm-setup

# Verifiser
sudo gvm-check-setup
```

**Standard pålogging:**
- URL: `http://localhost:9392`
- Bruker: `admin`
- Passord: Genereres under installasjon (sjekk `docker logs openvas`)

Oppdater `backend/.env`:
```env
OPENVAS_URL=http://localhost:9392
OPENVAS_USERNAME=admin
OPENVAS_PASSWORD=ditt_passord
```

### Nginx konfigurasjon

Standard konfigurasjon serverer på port 80. For HTTPS, se `scripts/nginx-ssl.conf`.

## Oppdatering

```bash
cd /opt/netguard
git pull origin main
npm install
npm run build
sudo systemctl restart nginx
```

## Feilsøking

### Sjekk logg

```bash
# Frontend (Nginx)
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Backend API
sudo journalctl -u netguard-api -f
```

### Vanlige problemer

1. **Port 3001 er opptatt**: Endre PORT i .env
2. **CORS feil**: Sjekk at frontend URL er lagt til i backend CORS config
3. **SSL sertifikat feil**: UniFi/Proxmox bruker self-signed certs, se backend config

## Sikkerhet

- Bruk brannmur (ufw) for å begrense tilgang
- Aktiver HTTPS med Let's Encrypt
- Hold systemet oppdatert
- Bruk sterke passord for alle API-tilganger

```bash
# Sett opp brannmur
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Support

For spørsmål eller problemer, opprett en issue i GitHub repository.
