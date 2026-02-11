import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ScanReportDialog } from "@/components/security/ScanReportDialog";
import { AttackMap } from "@/components/AttackMap";
import { batchLookupGeoIP } from "@/lib/ids-utils";
import { VlanSubnetManager, type VlanSubnet } from "@/components/security/VlanSubnetManager";
import { SslCheckPanel } from "@/components/security/SslCheckPanel";
import { FirewallAuditPanel } from "@/components/security/FirewallAuditPanel";
import { DnsLeakPanel } from "@/components/security/DnsLeakPanel";
import { SecurityScorePanel } from "@/components/security/SecurityScorePanel";
import { NmapHostDetailDialog, type NmapHostDetail } from "@/components/security/NmapHostDetailDialog";
import { VulnerabilityDetailDialog, type VulnerabilityDetail } from "@/components/security/VulnerabilityDetailDialog";
import { 
  Radar, Shield, Search, Clock, AlertTriangle, CheckCircle,
  Play, Target, Globe, Server, FileText, ChevronRight, Loader2, RefreshCw, Plus, StopCircle, MapPin, Network, Wifi, ExternalLink, Lock, Activity
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface OpenVASScan {
  id: string;
  name: string;
  target: string;
  lastRun: string;
  status: string;
  high: number;
  medium: number;
  low: number;
  info: number;
}

type Vulnerability = VulnerabilityDetail;

// NmapHost kept for compatibility, but we use NmapHostDetail for rich data
type NmapHost = NmapHostDetail;

interface NmapProgress {
  percent: number;
  hostsFound: number;
  status: 'idle' | 'scanning' | 'complete' | 'error';
  message?: string;
}

interface VlanScanResult {
  vlan: VlanSubnet;
  hosts: NmapHost[];
  progress: NmapProgress;
}

const severityColors = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/80 text-destructive-foreground",
  medium: "bg-warning text-warning-foreground",
  low: "bg-primary/80 text-primary-foreground",
  info: "bg-muted text-muted-foreground",
};

// Parse nmap XML output
function parseNmapXML(xmlString: string): NmapHost[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const hosts: NmapHost[] = [];

  const hostNodes = doc.querySelectorAll("host");
  hostNodes.forEach((hostNode) => {
    const status = hostNode.querySelector("status")?.getAttribute("state") || "unknown";
    if (status !== "up") return;

    const address = hostNode.querySelector("address")?.getAttribute("addr") || "";
    const hostname = hostNode.querySelector("hostnames hostname")?.getAttribute("name") || "unknown";
    
    const ports: number[] = [];
    hostNode.querySelectorAll("port").forEach((portNode) => {
      const state = portNode.querySelector("state")?.getAttribute("state");
      if (state === "open") {
        ports.push(parseInt(portNode.getAttribute("portid") || "0"));
      }
    });

    const osMatch = hostNode.querySelector("osmatch")?.getAttribute("name") || "Unknown";

    hosts.push({
      host: address,
      hostname,
      status,
      ports,
      os: osMatch,
    });
  });

  return hosts;
}

export default function Security() {
  const [nmapTarget, setNmapTarget] = useState("192.168.1.0/24");
  const [nmapScanType, setNmapScanType] = useState("quick");
  const [nmapResults, setNmapResults] = useState<NmapHost[]>([
    { host: "192.168.1.1", hostname: "udm-pro.localdomain", status: "up", ports: [22, 443, 8443], os: "Linux 4.15", mac: "24:5A:4C:XX:XX:01", vendor: "Ubiquiti Inc.", connectionType: "Ethernet (1Gbps)", gateway: "—", vlan: "VLAN 1 (Management)", uptime: "47 dager", lastBoot: "2024-12-26 08:14", connection: { type: "ethernet", switchName: "— (Gateway)", switchPort: 0, portSpeed: "1Gbps" }, services: [{ port: 22, protocol: "tcp", service: "ssh", version: "OpenSSH 8.4", state: "open" }, { port: 443, protocol: "tcp", service: "https", version: "nginx 1.25", state: "open" }, { port: 8443, protocol: "tcp", service: "https-alt", version: "UniFi Controller 8.0", state: "open" }], osDetails: { name: "Linux 4.15 (Ubiquiti UDM Pro)", accuracy: 96, family: "Linux", generation: "4.X", cpe: "cpe:/o:linux:linux_kernel:4.15" }, traceroute: [{ hop: 1, ip: "192.168.1.1", rtt: "0.5ms", hostname: "udm-pro.localdomain" }] },
    { host: "192.168.1.10", hostname: "proxmox-01.localdomain", status: "up", ports: [22, 8006, 3128], os: "Debian 11", mac: "BC:24:11:XX:XX:10", vendor: "Dell Inc.", connectionType: "Ethernet (10Gbps)", gateway: "192.168.1.1", vlan: "VLAN 1 (Management)", uptime: "120 dager", lastBoot: "2024-10-14 02:30", connection: { type: "ethernet", switchName: "USW-Pro-48-PoE", switchMac: "74:AC:B9:XX:XX:02", switchPort: 1, portSpeed: "10Gbps", poe: false }, services: [{ port: 22, protocol: "tcp", service: "ssh", version: "OpenSSH 9.2p1", state: "open" }, { port: 8006, protocol: "tcp", service: "https", version: "Proxmox VE 8.1", state: "open" }, { port: 3128, protocol: "tcp", service: "http-proxy", version: "Squid 5.7", state: "open" }], osDetails: { name: "Debian 11 (Bullseye)", accuracy: 98, family: "Linux", generation: "5.X", cpe: "cpe:/o:debian:debian_linux:11" }, traceroute: [{ hop: 1, ip: "192.168.1.1", rtt: "0.3ms", hostname: "udm-pro" }, { hop: 2, ip: "192.168.1.10", rtt: "0.4ms", hostname: "proxmox-01" }], scripts: [{ name: "ssl-cert", output: "Subject: CN=proxmox-01.localdomain\nIssuer: CN=Proxmox Virtual Environment\nValidity: 2024-01-01 - 2026-01-01" }] },
    { host: "192.168.1.20", hostname: "truenas.localdomain", status: "up", ports: [22, 80, 443, 9000], os: "FreeBSD 13", mac: "AC:1F:6B:XX:XX:20", vendor: "Supermicro", connectionType: "Ethernet (10Gbps)", gateway: "192.168.1.1", vlan: "VLAN 1 (Management)", uptime: "95 dager", lastBoot: "2024-11-08 14:00", connection: { type: "ethernet", switchName: "USW-Pro-48-PoE", switchMac: "74:AC:B9:XX:XX:02", switchPort: 2, portSpeed: "10Gbps", poe: false }, services: [{ port: 22, protocol: "tcp", service: "ssh", version: "OpenSSH 9.5", state: "open" }, { port: 80, protocol: "tcp", service: "http", version: "nginx 1.24", state: "open" }, { port: 443, protocol: "tcp", service: "https", version: "TrueNAS SCALE", state: "open" }, { port: 9000, protocol: "tcp", service: "cslistener", version: "MinIO S3", state: "open" }], osDetails: { name: "FreeBSD 13.2-RELEASE", accuracy: 95, family: "FreeBSD", generation: "13.X", cpe: "cpe:/o:freebsd:freebsd:13.2" } },
    { host: "192.168.1.30", hostname: "homeassistant.local", status: "up", ports: [8123], os: "Linux 5.15", mac: "DC:A6:32:XX:XX:30", vendor: "Raspberry Pi Foundation", connectionType: "WiFi (802.11ac)", gateway: "192.168.1.1", vlan: "VLAN 40 (IoT)", uptime: "14 dager", lastBoot: "2025-01-28 10:00", connection: { type: "wifi", ap: "U6-LR Stue", apMac: "24:5A:4C:XX:XX:A1", ssid: "IoT-Nett", channel: 36, band: "5GHz", signal: -52, txRate: "573 Mbps", rxRate: "286 Mbps" }, services: [{ port: 8123, protocol: "tcp", service: "http", version: "Home Assistant 2025.1", state: "open" }], osDetails: { name: "Linux 5.15 (Home Assistant OS)", accuracy: 90, family: "Linux", generation: "5.X", cpe: "cpe:/o:linux:linux_kernel:5.15" } },
    { host: "192.168.1.40", hostname: "pihole.local", status: "up", ports: [53, 80, 443], os: "Raspbian", mac: "B8:27:EB:XX:XX:40", vendor: "Raspberry Pi Foundation", connectionType: "Ethernet (100Mbps)", gateway: "192.168.1.1", vlan: "VLAN 1 (Management)", uptime: "210 dager", lastBoot: "2024-07-16 06:00", connection: { type: "ethernet", switchName: "USW-Lite-8-PoE", switchMac: "74:AC:B9:XX:XX:03", switchPort: 5, portSpeed: "100Mbps", poe: true, poeWatt: 4.2 }, services: [{ port: 53, protocol: "tcp/udp", service: "domain", version: "Pi-hole FTL 5.25", state: "open" }, { port: 80, protocol: "tcp", service: "http", version: "lighttpd 1.4", state: "open" }, { port: 443, protocol: "tcp", service: "https", version: "lighttpd 1.4", state: "open" }], osDetails: { name: "Raspbian GNU/Linux 11", accuracy: 92, family: "Linux", generation: "5.X", cpe: "cpe:/o:raspbian:raspbian:11" } },
    { host: "192.168.1.50", hostname: "plex.localdomain", status: "up", ports: [32400], os: "Ubuntu 22.04", mac: "00:25:90:XX:XX:50", vendor: "Intel Corporate", connectionType: "Ethernet (1Gbps)", gateway: "192.168.1.1", vlan: "VLAN 20 (Media)", uptime: "30 dager", lastBoot: "2025-01-12 22:00", connection: { type: "ethernet", switchName: "USW-Pro-48-PoE", switchMac: "74:AC:B9:XX:XX:02", switchPort: 12, portSpeed: "1Gbps", poe: false }, services: [{ port: 32400, protocol: "tcp", service: "http", version: "Plex Media Server 1.40", state: "open" }], osDetails: { name: "Ubuntu 22.04.3 LTS", accuracy: 97, family: "Linux", generation: "5.X", cpe: "cpe:/o:canonical:ubuntu_linux:22.04" } },
    { host: "192.168.1.100", hostname: "desktop-pc.local", status: "up", ports: [3389, 5900], os: "Windows 11", mac: "70:85:C2:XX:XX:64", vendor: "ASUS", connectionType: "Ethernet (2.5Gbps)", gateway: "192.168.1.1", vlan: "VLAN 1 (Management)", uptime: "3 dager", lastBoot: "2025-02-08 09:15", connection: { type: "ethernet", switchName: "USW-Pro-48-PoE", switchMac: "74:AC:B9:XX:XX:02", switchPort: 24, portSpeed: "2.5Gbps", poe: false }, services: [{ port: 3389, protocol: "tcp", service: "ms-wbt-server", version: "Microsoft Terminal Services", state: "open" }, { port: 5900, protocol: "tcp", service: "vnc", version: "TightVNC 2.8", state: "open" }], osDetails: { name: "Windows 11 Pro 23H2", accuracy: 94, family: "Windows", generation: "11", cpe: "cpe:/o:microsoft:windows_11" } },
    { host: "192.168.1.101", hostname: "macbook.local", status: "up", ports: [], os: "macOS 14", mac: "A4:83:E7:XX:XX:65", vendor: "Apple Inc.", connectionType: "WiFi (802.11ax)", gateway: "192.168.1.1", vlan: "VLAN 1 (Management)", uptime: "1 dag", lastBoot: "2025-02-10 07:30", connection: { type: "wifi", ap: "U6-Pro Kontor", apMac: "24:5A:4C:XX:XX:A2", ssid: "Hjemme-5G", channel: 149, band: "5GHz (WiFi 6)", signal: -38, txRate: "1201 Mbps", rxRate: "573 Mbps" }, services: [], osDetails: { name: "macOS 14.3 Sonoma", accuracy: 88, family: "macOS", generation: "14", cpe: "cpe:/o:apple:macos:14" } },
  ]);
  const [nmapProgress, setNmapProgress] = useState<NmapProgress>({
    percent: 100,
    hostsFound: 8,
    status: 'complete'
  });
  const eventSourceRef = useRef<EventSource | null>(null);
  const vlanEventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  
  // Per-VLAN scan results
  const [vlanScanResults, setVlanScanResults] = useState<Map<string, VlanScanResult>>(new Map());
  const [isParallelScanning, setIsParallelScanning] = useState(false);
  
  const [openvasScans, setOpenvasScans] = useState<OpenVASScan[]>([
    { id: "ov1", name: "Fullt nettverksscan Q1", target: "192.168.1.0/24", lastRun: "2025-01-15 02:00", status: "Done", high: 3, medium: 7, low: 12, info: 24 },
    { id: "ov2", name: "DMZ-segmentet", target: "10.0.50.0/24", lastRun: "2025-01-20 14:30", status: "Done", high: 1, medium: 4, low: 8, info: 15 },
    { id: "ov3", name: "IoT VLAN scan", target: "192.168.40.0/24", lastRun: "2025-01-22 08:00", status: "Done", high: 5, medium: 9, low: 3, info: 11 },
    { id: "ov4", name: "Proxmox cluster", target: "192.168.1.10-15", lastRun: "2025-02-01 22:00", status: "Running", high: 0, medium: 2, low: 1, info: 6 },
  ]);
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([
    { id: "v1", name: "SSL/TLS: Utdatert TLSv1.0 aktivert", severity: "high", host: "192.168.1.10", port: 8006, cvss: 7.5, solution: "Deaktiver TLSv1.0 og TLSv1.1 i Proxmox-konfigurasjon. Rediger /etc/default/pveproxy og sett DENY_OLD_SSL=1.", description: "Serveren aksepterer TLSv1.0-tilkoblinger som er kjent sårbar for POODLE og BEAST-angrep. Dette lar en angriper potensielt dekryptere kryptert trafikk.", family: "SSL/TLS", cve: ["CVE-2014-3566", "CVE-2011-3389"], impact: "En angriper på samme nettverk kan dekryptere sensitiv trafikk inkludert påloggingsdata og API-nøkler.", affectedService: "Proxmox VE Web UI", affectedVersion: "pveproxy 8.1.4", detectedBy: "OpenVAS ssl-test", firstSeen: "2024-12-15", lastSeen: "2025-02-10", tags: ["kryptering", "web"], references: ["https://www.openssl.org/~bodo/ssl-poodle.pdf"] },
    { id: "v2", name: "SNMP Agent: Default community string 'public'", severity: "high", host: "192.168.1.1", port: 161, cvss: 7.2, solution: "Endre SNMP community string til noe unikt, eller deaktiver SNMPv1/v2c og bruk SNMPv3.", description: "SNMP-agenten bruker standard community string 'public', som gir uautentisert lesetilgang til enhetskonfigurasjon og nettverksstatistikk.", family: "SNMP", cve: ["CVE-2002-0012"], impact: "En angriper kan hente ut full enhetskonfigurasjon, ARP-tabeller, rutingtabeller og trafikk-statistikk.", affectedService: "SNMP Agent", affectedVersion: "SNMPv2c", detectedBy: "OpenVAS snmp-check", firstSeen: "2024-11-20", lastSeen: "2025-02-10", tags: ["nettverksovervåking", "autentisering"] },
    { id: "v3", name: "SSH: Svak nøkkelutveksling (diffie-hellman-group1-sha1)", severity: "high", host: "192.168.1.40", port: 22, cvss: 6.8, solution: "Deaktiver svake KEX-algoritmer i sshd_config: KexAlgorithms -diffie-hellman-group1-sha1", description: "SSH-serveren støtter diffie-hellman-group1-sha1 som bruker en 1024-bit DH-gruppe som anses som utilstrekkelig sikker.", family: "SSH", cve: ["CVE-2015-4000"], impact: "Kan muliggjøre Logjam-angrep der en angriper nedgraderer tilkoblingen til svakere kryptering.", affectedService: "OpenSSH", affectedVersion: "OpenSSH 8.2", detectedBy: "Nmap ssh2-enum-algos", firstSeen: "2024-10-05", lastSeen: "2025-02-10", tags: ["kryptering", "ssh"] },
    { id: "v4", name: "HTTP: Missing X-Content-Type-Options header", severity: "medium", host: "192.168.1.30", port: 8123, cvss: 4.3, solution: "Legg til 'X-Content-Type-Options: nosniff' header i webserver-konfigurasjon.", description: "Webserveren sender ikke X-Content-Type-Options header, som kan tillate MIME-type-sniffing i eldre nettlesere.", family: "HTTP", impact: "Nettlesere kan feiltolke filtyper, noe som kan utnyttes til XSS-angrep.", affectedService: "Home Assistant", affectedVersion: "2025.1", detectedBy: "OpenVAS http-headers", firstSeen: "2025-01-10", lastSeen: "2025-02-10", tags: ["web", "headers"] },
    { id: "v5", name: "HTTP: Missing Content-Security-Policy header", severity: "medium", host: "192.168.1.50", port: 32400, cvss: 4.3, solution: "Konfigurer Content-Security-Policy header i Plex-konfigurasjonen.", description: "Manglende CSP-header gjør applikasjonen mer utsatt for cross-site scripting (XSS) angrep.", family: "HTTP", impact: "Uten CSP kan injisert skadelig kode kjøre fritt i brukerens nettleser.", affectedService: "Plex Media Server", affectedVersion: "1.40.0", detectedBy: "OpenVAS http-headers", firstSeen: "2025-01-10", lastSeen: "2025-02-10", tags: ["web", "headers"] },
    { id: "v6", name: "SSL: Selvsignert sertifikat i bruk", severity: "medium", host: "192.168.1.10", port: 8006, cvss: 4.0, solution: "Installer et gyldig SSL-sertifikat fra Let's Encrypt. Bruk Proxmox ACME-integrasjon.", description: "Serveren bruker et selvsignert SSL-sertifikat som ikke kan verifiseres av klienter. Dette gjør brukere vant til å ignorere sertifikatadvarsler.", family: "SSL/TLS", impact: "Brukere som ignorerer advarsler er sårbare for man-in-the-middle angrep.", affectedService: "Proxmox VE", affectedVersion: "pveproxy 8.1", detectedBy: "OpenVAS ssl-cert", firstSeen: "2024-09-01", lastSeen: "2025-02-10", tags: ["kryptering", "sertifikat"] },
    { id: "v7", name: "DNS: Rekursiv DNS åpen for lokalt nettverk", severity: "medium", host: "192.168.1.40", port: 53, cvss: 3.7, solution: "Begrens rekursiv DNS til kun tillatte subnett via Pi-hole konfigurasjon.", description: "DNS-serveren tillater rekursive oppslag fra hele det lokale nettverket, inkludert IoT-enheter som kanskje ikke bør ha denne tilgangen.", family: "DNS", impact: "IoT-enheter kan gjøre vilkårlige DNS-oppslag, potensielt for data-exfiltration.", affectedService: "Pi-hole FTL", affectedVersion: "5.25", detectedBy: "Nmap dns-recursion", firstSeen: "2024-11-01", lastSeen: "2025-02-10", tags: ["dns", "nettverk"] },
    { id: "v8", name: "HTTP: Server header avslører versjon", severity: "low", host: "192.168.1.20", port: 80, cvss: 2.6, solution: "Skjul serverversjon i nginx-konfig: server_tokens off;", description: "HTTP Server-headeren avslører programvareversjon som kan hjelpe angripere å finne kjente sårbarheter.", family: "HTTP", affectedService: "nginx", affectedVersion: "1.24.0", detectedBy: "OpenVAS http-headers", firstSeen: "2024-12-01", lastSeen: "2025-02-10", tags: ["web", "informasjonslekkasje"] },
    { id: "v9", name: "SSH: Root login tillatt", severity: "medium", host: "192.168.1.20", port: 22, cvss: 5.3, solution: "Sett 'PermitRootLogin no' i /etc/ssh/sshd_config og restart sshd.", description: "SSH-serveren tillater direkte root-innlogging, som øker risikoen ved brute-force angrep.", family: "SSH", cve: [], impact: "En angriper som får root-passordet har full tilgang til systemet uten sporbarhet.", affectedService: "OpenSSH", affectedVersion: "9.5", detectedBy: "OpenVAS ssh-check", firstSeen: "2024-10-01", lastSeen: "2025-02-10", tags: ["ssh", "autentisering"] },
    { id: "v10", name: "ICMP Timestamp respons aktivert", severity: "low", host: "192.168.1.1", port: 0, cvss: 1.5, solution: "Blokker ICMP timestamp i brannmur med UniFi-regel.", description: "Enheten svarer på ICMP timestamp-forespørsler, som kan avsløre systemklokke og brukes til fingerprinting.", family: "ICMP", affectedService: "OS Kernel", detectedBy: "Nmap", firstSeen: "2024-11-15", lastSeen: "2025-02-10", tags: ["nettverk", "informasjonslekkasje"] },
    { id: "v11", name: "NTP: Monlist kommando tilgjengelig", severity: "medium", host: "192.168.1.1", port: 123, cvss: 5.0, solution: "Deaktiver monlist i NTP-konfigurasjon: restrict default noquery", description: "NTP-serveren støtter monlist-kommandoen som kan misbrukes til DDoS-forsterkning.", family: "NTP", cve: ["CVE-2013-5211"], impact: "Kan misbrukes til å generere opptil 556x forsterket DDoS-trafikk mot et mål.", affectedService: "ntpd", affectedVersion: "4.2.8", detectedBy: "Nmap ntp-monlist", firstSeen: "2024-10-20", lastSeen: "2025-02-10", tags: ["ddos", "nettverk"], references: ["https://www.us-cert.gov/ncas/alerts/TA14-013A"] },
    { id: "v12", name: "HTTP: Manglende HSTS header", severity: "low", host: "192.168.1.30", port: 8123, cvss: 2.1, solution: "Aktiver Strict-Transport-Security header: add_header Strict-Transport-Security 'max-age=31536000; includeSubDomains' always;", description: "Webserveren sender ikke HSTS-header, som betyr at nettlesere ikke tvinges til å bruke HTTPS.", family: "HTTP", impact: "Brukere kan bli omdirigert til HTTP-versjon via SSL-stripping angrep.", affectedService: "Home Assistant", affectedVersion: "2025.1", detectedBy: "OpenVAS http-headers", firstSeen: "2025-01-10", lastSeen: "2025-02-10", tags: ["web", "kryptering"] },
  ]);
  const [isLoadingOpenvas, setIsLoadingOpenvas] = useState(false);
  const [selectedVlans, setSelectedVlans] = useState<string[]>([]);
  const [availableVlans, setAvailableVlans] = useState<VlanSubnet[]>([]);
  
  // OpenVAS new scan dialog
  const [openvasDialogOpen, setOpenvasDialogOpen] = useState(false);
  const [newScanTarget, setNewScanTarget] = useState("");
  const [newScanName, setNewScanName] = useState("");
  const [newScanConfig, setNewScanConfig] = useState("full");
  const [isStartingOpenvasScan, setIsStartingOpenvasScan] = useState(false);
  
  // Scan report dialog
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedScan, setSelectedScan] = useState<OpenVASScan | null>(null);
  
  // Nmap host detail dialog
  const [nmapDetailOpen, setNmapDetailOpen] = useState(false);
  const [selectedNmapHost, setSelectedNmapHost] = useState<NmapHostDetail | null>(null);
  
  // Vulnerability detail dialog
  const [vulnDetailOpen, setVulnDetailOpen] = useState(false);
  const [selectedVuln, setSelectedVuln] = useState<VulnerabilityDetail | null>(null);

  // Geo map state for scan results
  const [scanGeoLocations, setScanGeoLocations] = useState<Array<{ lat: number; lng: number; severity: string; country: string }>>([
    { lat: 55.75, lng: 37.62, severity: "critical", country: "Russland" },
    { lat: 39.90, lng: 116.40, severity: "high", country: "Kina" },
    { lat: 35.68, lng: 139.69, severity: "medium", country: "Japan" },
    { lat: 37.57, lng: 126.98, severity: "high", country: "Sør-Korea" },
    { lat: 28.61, lng: 77.21, severity: "medium", country: "India" },
    { lat: -23.55, lng: -46.63, severity: "low", country: "Brasil" },
    { lat: 51.51, lng: -0.13, severity: "low", country: "Storbritannia" },
    { lat: 40.71, lng: -74.01, severity: "medium", country: "USA" },
    { lat: 48.86, lng: 2.35, severity: "low", country: "Frankrike" },
    { lat: 52.52, lng: 13.40, severity: "medium", country: "Tyskland" },
    { lat: 41.01, lng: 28.98, severity: "high", country: "Tyrkia" },
    { lat: -33.87, lng: 151.21, severity: "low", country: "Australia" },
  ]);
  const [isGeoLookingUp, setIsGeoLookingUp] = useState(false);

  // WAN scan state
  const [wanIp, setWanIp] = useState<string>("84.214.132.47");
  const [isLoadingWanIp, setIsLoadingWanIp] = useState(false);
  const [wanScanType, setWanScanType] = useState("ports");
  const [wanResults, setWanResults] = useState<NmapHost[]>([
    { host: "84.214.132.47", hostname: "84-214-132-47.customer.telinet.no", status: "up", ports: [443, 51820], os: "Linux (UDM Pro)" },
  ]);
  const [wanProgress, setWanProgress] = useState<NmapProgress>({ percent: 100, hostsFound: 1, status: 'complete' });
  const wanEventSourceRef = useRef<EventSource | null>(null);

  // Stats
  const stats = {
    high: vulnerabilities.filter(v => v.severity === "high").length,
    medium: vulnerabilities.filter(v => v.severity === "medium").length,
    low: vulnerabilities.filter(v => v.severity === "low").length,
    info: vulnerabilities.filter(v => v.severity === "info").length,
  };

  // Fetch OpenVAS data
  const fetchOpenvasData = async () => {
    setIsLoadingOpenvas(true);
    try {
      const [scansRes, vulnsRes] = await Promise.all([
        fetch(`${API_BASE}/api/openvas/scans`),
        fetch(`${API_BASE}/api/openvas/vulnerabilities`),
      ]);

      if (scansRes.ok) {
        const scansData = await scansRes.json();
        setOpenvasScans(scansData.tasks || scansData.data || []);
      }

      if (vulnsRes.ok) {
        const vulnsData = await vulnsRes.json();
        setVulnerabilities(vulnsData.results || vulnsData.data || []);
      }
    } catch (error) {
      console.error("OpenVAS fetch error:", error);
      toast.error("Kunne ikke koble til OpenVAS. Sjekk at backend kjører.");
    } finally {
      setIsLoadingOpenvas(false);
    }
  };

  // Run Nmap scan with streaming
  const handleNmapScan = () => {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(nmapTarget)) {
      toast.error("Ugyldig mål-format. Bruk IP-adresse eller CIDR (f.eks. 192.168.1.0/24)");
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setNmapProgress({ percent: 0, hostsFound: 0, status: 'scanning' });
    setNmapResults([]);

    const url = `${API_BASE}/api/nmap/scan-stream?target=${encodeURIComponent(nmapTarget)}&scanType=${nmapScanType}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'started':
          toast.info(`Starter scan av ${data.target}...`);
          break;
        case 'progress':
          setNmapProgress(prev => ({ ...prev, percent: data.percent }));
          break;
        case 'hosts_update':
          setNmapProgress(prev => ({ ...prev, hostsFound: data.count }));
          break;
        case 'complete':
          const hosts = parseNmapXML(data.result);
          setNmapResults(hosts);
          setNmapProgress({ percent: 100, hostsFound: hosts.length, status: 'complete' });
          toast.success(`Scan fullført! Fant ${hosts.length} host(s)`);
          eventSource.close();
          break;
        case 'error':
          setNmapProgress(prev => ({ ...prev, status: 'error', message: data.message }));
          toast.error(`Scan feilet: ${data.message}`);
          eventSource.close();
          break;
      }
    };

    eventSource.onerror = () => {
      setNmapProgress(prev => ({ ...prev, status: 'error', message: 'Forbindelsen ble avbrutt' }));
      toast.error("Forbindelse til server tapt");
      eventSource.close();
    };
  };

  // Parallel VLAN scan
  const handleParallelVlanScan = () => {
    if (selectedVlans.length === 0) {
      toast.error("Velg minst ett VLAN å skanne");
      return;
    }

    const vlansToScan = availableVlans.filter(v => selectedVlans.includes(v.id));
    
    // Stop any existing parallel scans
    handleStopParallelScan();
    setIsParallelScanning(true);

    const newResults = new Map<string, VlanScanResult>();
    vlansToScan.forEach(vlan => {
      newResults.set(vlan.id, {
        vlan,
        hosts: [],
        progress: { percent: 0, hostsFound: 0, status: 'scanning' },
      });
    });
    setVlanScanResults(new Map(newResults));

    vlansToScan.forEach(vlan => {
      const url = `${API_BASE}/api/nmap/scan-stream?target=${encodeURIComponent(vlan.subnet)}&scanType=${nmapScanType}`;
      const es = new EventSource(url);
      vlanEventSourcesRef.current.set(vlan.id, es);

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setVlanScanResults(prev => {
          const updated = new Map(prev);
          const current = updated.get(vlan.id);
          if (!current) return prev;

          switch (data.type) {
            case 'progress':
              updated.set(vlan.id, { ...current, progress: { ...current.progress, percent: data.percent } });
              break;
            case 'hosts_update':
              updated.set(vlan.id, { ...current, progress: { ...current.progress, hostsFound: data.count } });
              break;
            case 'complete': {
              const hosts = parseNmapXML(data.result);
              updated.set(vlan.id, { ...current, hosts, progress: { percent: 100, hostsFound: hosts.length, status: 'complete' } });
              es.close();
              vlanEventSourcesRef.current.delete(vlan.id);
              // Check if all done
              const allDone = [...updated.values()].every(r => r.progress.status !== 'scanning');
              if (allDone) setIsParallelScanning(false);
              toast.success(`${vlan.name} (VLAN ${vlan.vlanId}): ${hosts.length} hosts funnet`);
              break;
            }
            case 'error':
              updated.set(vlan.id, { ...current, progress: { ...current.progress, status: 'error', message: data.message } });
              es.close();
              vlanEventSourcesRef.current.delete(vlan.id);
              toast.error(`${vlan.name}: ${data.message}`);
              break;
          }
          return updated;
        });
      };

      es.onerror = () => {
        setVlanScanResults(prev => {
          const updated = new Map(prev);
          const current = updated.get(vlan.id);
          if (current) {
            updated.set(vlan.id, { ...current, progress: { ...current.progress, status: 'error', message: 'Forbindelse tapt' } });
          }
          return updated;
        });
        es.close();
        vlanEventSourcesRef.current.delete(vlan.id);
      };
    });

    toast.info(`Starter parallell scan av ${vlansToScan.length} VLAN(s)...`);
  };

  // Stop parallel scans
  const handleStopParallelScan = () => {
    vlanEventSourcesRef.current.forEach(es => es.close());
    vlanEventSourcesRef.current.clear();
    setIsParallelScanning(false);
    toast.info("Parallelle scans stoppet");
  };

  // Stop Nmap scan
  const handleStopNmapScan = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setNmapProgress(prev => ({ ...prev, status: 'idle' }));
      toast.info("Scan avbrutt");
    }
  };

  // GeoIP lookup for scan results (nmap hosts + vulnerability hosts)
  const handleScanGeoLookup = async () => {
    setIsGeoLookingUp(true);
    toast.info("Henter GeoIP data for scan-resultater...");
    try {
      const ips = [
        ...nmapResults.map(h => h.host),
        ...vulnerabilities.map(v => v.host),
        ...openvasScans.map(s => s.target),
      ];
      const uniqueIps = [...new Set(ips)];
      const results = await batchLookupGeoIP(uniqueIps);

      const locations: Array<{ lat: number; lng: number; severity: string; country: string }> = [];
      
      // Add vulnerability hosts
      vulnerabilities.forEach(v => {
        const geo = results.get(v.host);
        if (geo) {
          locations.push({ lat: geo.lat, lng: geo.lng, severity: v.severity, country: geo.countryCode });
        }
      });

      // Add nmap hosts
      nmapResults.forEach(h => {
        const geo = results.get(h.host);
        if (geo) {
          locations.push({ lat: geo.lat, lng: geo.lng, severity: 'medium', country: geo.countryCode });
        }
      });

      // Add scan targets
      openvasScans.forEach(s => {
        const geo = results.get(s.target);
        if (geo) {
          const severity = s.high > 0 ? 'high' : s.medium > 0 ? 'medium' : 'low';
          locations.push({ lat: geo.lat, lng: geo.lng, severity, country: geo.countryCode });
        }
      });

      setScanGeoLocations(locations);
      toast.success(`GeoIP fullført! ${locations.length} lokasjoner kartlagt`);
    } catch {
      toast.error("Kunne ikke hente GeoIP data");
    } finally {
      setIsGeoLookingUp(false);
    }
  };

  // Start OpenVAS scan
  const handleStartOpenvasScan = async () => {
    if (!newScanTarget || !newScanName) {
      toast.error("Fyll ut alle feltene");
      return;
    }

    setIsStartingOpenvasScan(true);
    try {
      const response = await fetch(`${API_BASE}/api/openvas/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: newScanTarget,
          name: newScanName,
          scanConfig: newScanConfig
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Kunne ikke starte scan");
      }

      toast.success("OpenVAS scan startet!");
      setOpenvasDialogOpen(false);
      setNewScanTarget("");
      setNewScanName("");
      fetchOpenvasData();
    } catch (error) {
      toast.error(`Feil: ${error instanceof Error ? error.message : "Ukjent feil"}`);
    } finally {
      setIsStartingOpenvasScan(false);
    }
  };

  // Fetch WAN IP
  const fetchWanIp = async () => {
    setIsLoadingWanIp(true);
    try {
      const res = await fetch(`${API_BASE}/api/network/wan-ip`);
      if (res.ok) {
        const data = await res.json();
        setWanIp(data.ip);
        toast.success(`WAN IP: ${data.ip}`);
      } else {
        toast.error("Kunne ikke hente WAN IP");
      }
    } catch {
      toast.error("Kunne ikke koble til backend for WAN IP");
    } finally {
      setIsLoadingWanIp(false);
    }
  };

  // Run WAN scan
  const handleWanScan = () => {
    if (!wanIp) {
      toast.error("Hent WAN IP først");
      return;
    }

    if (wanEventSourceRef.current) {
      wanEventSourceRef.current.close();
    }

    setWanProgress({ percent: 0, hostsFound: 0, status: 'scanning' });
    setWanResults([]);

    const url = `${API_BASE}/api/nmap/scan-stream?target=${encodeURIComponent(wanIp)}&scanType=${wanScanType}`;
    const eventSource = new EventSource(url);
    wanEventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'started':
          toast.info(`Starter WAN scan av ${data.target}...`);
          break;
        case 'progress':
          setWanProgress(prev => ({ ...prev, percent: data.percent }));
          break;
        case 'hosts_update':
          setWanProgress(prev => ({ ...prev, hostsFound: data.count }));
          break;
        case 'complete': {
          const hosts = parseNmapXML(data.result);
          setWanResults(hosts);
          setWanProgress({ percent: 100, hostsFound: hosts.length, status: 'complete' });
          const totalPorts = hosts.reduce((sum, h) => sum + h.ports.length, 0);
          if (totalPorts === 0) {
            toast.success("WAN scan fullført! Ingen åpne porter funnet – bra!");
          } else {
            toast.warning(`WAN scan fullført! ${totalPorts} åpne porter funnet!`);
          }
          eventSource.close();
          break;
        }
        case 'error':
          setWanProgress(prev => ({ ...prev, status: 'error', message: data.message }));
          toast.error(`WAN scan feilet: ${data.message}`);
          eventSource.close();
          break;
      }
    };

    eventSource.onerror = () => {
      setWanProgress(prev => ({ ...prev, status: 'error', message: 'Forbindelsen ble avbrutt' }));
      toast.error("Forbindelse til server tapt");
      eventSource.close();
    };
  };

  const handleStopWanScan = () => {
    if (wanEventSourceRef.current) {
      wanEventSourceRef.current.close();
      wanEventSourceRef.current = null;
      setWanProgress(prev => ({ ...prev, status: 'idle' }));
      toast.info("WAN scan avbrutt");
    }
  };

  // Initial load
  useEffect(() => {
    fetchOpenvasData();
    fetchWanIp();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (wanEventSourceRef.current) {
        wanEventSourceRef.current.close();
      }
      vlanEventSourcesRef.current.forEach(es => es.close());
    };
  }, []);

  const isScanning = nmapProgress.status === 'scanning';
  const totalParallelHosts = [...vlanScanResults.values()].reduce((sum, r) => sum + r.hosts.length, 0);

  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-primary/10 p-3">
            <Radar className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sikkerhetsscanning</h1>
            <p className="text-sm text-muted-foreground">OpenVAS • Nmap • Sårbarhetsanalyse</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-destructive">{stats.high}</p>
              <p className="text-xs text-muted-foreground">Høy risiko</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-warning">{stats.medium}</p>
              <p className="text-xs text-muted-foreground">Medium risiko</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-primary">{stats.low}</p>
              <p className="text-xs text-muted-foreground">Lav risiko</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-muted-foreground">{stats.info}</p>
              <p className="text-xs text-muted-foreground">Informasjon</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-success">
                {vulnerabilities.length > 0 ? Math.max(0, 100 - stats.high * 10 - stats.medium * 3 - stats.low) : "--"}
              </p>
              <p className="text-xs text-muted-foreground">Sikkerhets-score</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="score" className="space-y-4">
          <TabsList className="bg-muted flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="score" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Activity className="h-4 w-4 mr-2" />
              Score
            </TabsTrigger>
            <TabsTrigger value="nmap" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Target className="h-4 w-4 mr-2" />
              Nmap
            </TabsTrigger>
            <TabsTrigger value="wan" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Wifi className="h-4 w-4 mr-2" />
              WAN Scan
            </TabsTrigger>
            <TabsTrigger value="ssl" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Lock className="h-4 w-4 mr-2" />
              SSL/TLS
            </TabsTrigger>
            <TabsTrigger value="firewall" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              Brannmur
            </TabsTrigger>
            <TabsTrigger value="dns" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="h-4 w-4 mr-2" />
              DNS
            </TabsTrigger>
            <TabsTrigger value="openvas" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              OpenVAS
            </TabsTrigger>
            <TabsTrigger value="vulnerabilities" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Sårbarheter ({vulnerabilities.length})
            </TabsTrigger>
            <TabsTrigger value="map" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MapPin className="h-4 w-4 mr-2" />
              Geo-kart
            </TabsTrigger>
          </TabsList>

          <TabsContent value="score">
            <SecurityScorePanel />
          </TabsContent>

          <TabsContent value="nmap">
            <div className="space-y-4">
              {/* VLAN / Subnet Manager */}
              <VlanSubnetManager
                selectedVlans={selectedVlans}
                onSelectionChange={setSelectedVlans}
                onScanTargetChange={setNmapTarget}
                onVlansChange={setAvailableVlans}
              />

              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      Nmap Skanning
                    </CardTitle>
                    {selectedVlans.length > 1 && (
                      <div className="flex items-center gap-2">
                        {isParallelScanning ? (
                          <Button size="sm" variant="destructive" onClick={handleStopParallelScan}>
                            <StopCircle className="h-3.5 w-3.5 mr-1.5" />
                            Stopp alle
                          </Button>
                        ) : (
                          <Button size="sm" onClick={handleParallelVlanScan} className="bg-primary text-primary-foreground">
                            <Network className="h-3.5 w-3.5 mr-1.5" />
                            Parallell scan ({selectedVlans.length} VLANs)
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="flex gap-4">
                    <Input 
                      placeholder="Mål (IP eller subnet, f.eks. 192.168.1.0/24)"
                      value={nmapTarget}
                      onChange={(e) => setNmapTarget(e.target.value)}
                      className="flex-1 bg-muted border-border font-mono"
                      disabled={isScanning}
                    />
                    <Select value={nmapScanType} onValueChange={setNmapScanType} disabled={isScanning || isParallelScanning}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quick">Ping Scan</SelectItem>
                        <SelectItem value="ports">Port Scan</SelectItem>
                        <SelectItem value="full">Full Scan</SelectItem>
                      </SelectContent>
                    </Select>
                    {isScanning ? (
                      <Button 
                        onClick={handleStopNmapScan}
                        variant="destructive"
                      >
                        <StopCircle className="h-4 w-4 mr-2" />
                        Stopp
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleNmapScan}
                        className="bg-primary text-primary-foreground"
                        disabled={isParallelScanning}
                      >
                        <Search className="h-4 w-4 mr-2" />
                        Enkelt Scan
                      </Button>
                    )}
                  </div>
                  
                  {/* Progress indicator */}
                  {isScanning && (
                    <div className="space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Skanner...
                        </span>
                        <span className="font-mono text-primary">
                          {nmapProgress.percent.toFixed(0)}%
                        </span>
                      </div>
                      <Progress value={nmapProgress.percent} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Hosts funnet: {nmapProgress.hostsFound}</span>
                        <span>Mål: {nmapTarget}</span>
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    Kommando: nmap {nmapScanType === 'quick' ? '-sn' : nmapScanType === 'ports' ? '-sT -F' : '-sV -sC'} {nmapTarget}
                  </p>
                </CardContent>
              </Card>

              {/* Per-VLAN Parallel Results */}
              {vlanScanResults.size > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="border-b border-border">
                    <CardTitle className="flex items-center gap-2">
                      <Network className="h-5 w-5 text-primary" />
                      Parallelle VLAN-resultater ({totalParallelHosts} hosts totalt)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="max-h-[500px]">
                      <div className="divide-y divide-border">
                        {[...vlanScanResults.values()].map((result) => (
                          <div key={result.vlan.id} className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="font-mono text-xs">
                                  VLAN {result.vlan.vlanId}
                                </Badge>
                                <span className="font-medium text-foreground">{result.vlan.name}</span>
                                <span className="text-xs font-mono text-muted-foreground">{result.vlan.subnet}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {result.progress.status === 'scanning' && (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                )}
                                {result.progress.status === 'complete' && (
                                  <CheckCircle className="h-4 w-4 text-success" />
                                )}
                                {result.progress.status === 'error' && (
                                  <AlertTriangle className="h-4 w-4 text-destructive" />
                                )}
                                <Badge variant={result.progress.status === 'complete' ? 'default' : 'secondary'}>
                                  {result.hosts.length} hosts
                                </Badge>
                              </div>
                            </div>

                            {result.progress.status === 'scanning' && (
                              <Progress value={result.progress.percent} className="h-1.5 mb-3" />
                            )}

                            {result.hosts.length > 0 && (
                              <div className="space-y-1 ml-4 border-l-2 border-primary/20 pl-4">
                                {result.hosts.map((host) => (
                                  <div key={host.host} className="flex items-center justify-between py-1.5">
                                    <div className="flex items-center gap-2">
                                      <Server className="h-3.5 w-3.5 text-success" />
                                      <span className="font-mono text-sm text-foreground">{host.host}</span>
                                      <span className="text-xs text-muted-foreground">{host.hostname}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {host.ports.length > 0 && (
                                        <div className="flex gap-1">
                                          {host.ports.slice(0, 5).map(port => (
                                            <Badge key={port} variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
                                              {port}
                                            </Badge>
                                          ))}
                                          {host.ports.length > 5 && (
                                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                              +{host.ports.length - 5}
                                            </Badge>
                                          )}
                                        </div>
                                      )}
                                      <Badge variant="outline" className="text-[10px] ml-2">{host.os}</Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Single scan results */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Oppdagede Hosts ({nmapResults.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {nmapResults.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Ingen resultater ennå. Kjør en scan for å oppdage hosts.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="divide-y divide-border">
                        {nmapResults.map((host) => (
                          <div key={host.host} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => { setSelectedNmapHost(host); setNmapDetailOpen(true); }}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div className="rounded-lg p-2 bg-success/10">
                                  {host.connection?.type === "wifi" ? (
                                    <Wifi className="h-4 w-4 text-success" />
                                  ) : (
                                    <Server className="h-4 w-4 text-success" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-mono font-medium text-foreground">{host.host}</p>
                                  <p className="text-xs text-muted-foreground">{host.hostname}</p>
                                </div>
                                {host.connection && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {host.connection.type === "wifi" 
                                      ? `WiFi → ${host.connection.ap}` 
                                      : `${host.connection.switchName} P${host.connection.switchPort}`}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{host.os}</Badge>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                            {host.ports.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {host.ports.map((port) => (
                                  <Badge key={port} variant="secondary" className="font-mono text-xs">
                                    {port}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="wan">
            <div className="space-y-4">
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Wifi className="h-4 w-4 text-primary" />
                      Ekstern WAN Skanning
                    </CardTitle>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Skann din offentlige IP-adresse utenfra for å se hvilke porter og tjenester som er synlige fra internett.
                  </p>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="flex gap-4 items-end">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Din WAN IP</Label>
                      <div className="flex gap-2">
                        <Input
                          value={wanIp}
                          onChange={(e) => setWanIp(e.target.value)}
                          placeholder="Henter WAN IP..."
                          className="font-mono bg-muted border-border"
                          disabled={wanProgress.status === 'scanning'}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={fetchWanIp}
                          disabled={isLoadingWanIp}
                          title="Hent WAN IP automatisk"
                        >
                          {isLoadingWanIp ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Scan type</Label>
                      <Select value={wanScanType} onValueChange={setWanScanType} disabled={wanProgress.status === 'scanning'}>
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ports">Port Scan</SelectItem>
                          <SelectItem value="full">Full Scan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {wanProgress.status === 'scanning' ? (
                      <Button variant="destructive" onClick={handleStopWanScan}>
                        <StopCircle className="h-4 w-4 mr-2" />
                        Stopp
                      </Button>
                    ) : (
                      <Button onClick={handleWanScan} disabled={!wanIp} className="bg-primary text-primary-foreground">
                        <Search className="h-4 w-4 mr-2" />
                        Skann WAN
                      </Button>
                    )}
                  </div>

                  {wanProgress.status === 'scanning' && (
                    <div className="space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Skanner WAN IP...
                        </span>
                        <span className="font-mono text-primary">
                          {wanProgress.percent.toFixed(0)}%
                        </span>
                      </div>
                      <Progress value={wanProgress.percent} className="h-2" />
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Kommando: nmap {wanScanType === 'ports' ? '-sT -F' : '-sV -sC'} {wanIp || '<WAN IP>'}
                  </p>
                </CardContent>
              </Card>

              {/* WAN Results */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    WAN Scan Resultater
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {wanProgress.status === 'complete' && wanResults.length > 0 ? (
                    <div>
                      {/* Summary */}
                      {(() => {
                        const totalPorts = wanResults.reduce((sum, h) => sum + h.ports.length, 0);
                        return (
                          <div className={`p-4 border-b border-border ${totalPorts === 0 ? 'bg-success/5' : 'bg-destructive/5'}`}>
                            {totalPorts === 0 ? (
                              <div className="flex items-center gap-2 text-success">
                                <CheckCircle className="h-5 w-5" />
                                <div>
                                  <p className="font-medium">Ingen åpne porter funnet</p>
                                  <p className="text-xs text-muted-foreground">Din WAN IP ({wanIp}) har ingen synlige porter fra internett.</p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="h-5 w-5" />
                                <div>
                                  <p className="font-medium">{totalPorts} åpne porter funnet!</p>
                                  <p className="text-xs text-muted-foreground">Disse portene er synlige fra internett og bør vurderes for sikkerhet.</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <ScrollArea className="max-h-[400px]">
                        <div className="divide-y divide-border">
                          {wanResults.map((host) => (
                            <div key={host.host} className="p-4 hover:bg-muted/50 transition-colors">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <div className="rounded-lg p-2 bg-primary/10">
                                    <Wifi className="h-4 w-4 text-primary" />
                                  </div>
                                  <div>
                                    <p className="font-mono font-medium text-foreground">{host.host}</p>
                                    <p className="text-xs text-muted-foreground">{host.hostname}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{host.os}</Badge>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(`https://www.shodan.io/host/${host.host}`, '_blank')}
                                    title="Se på Shodan"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              {host.ports.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {host.ports.map((port) => (
                                    <Badge key={port} variant="destructive" className="font-mono text-xs">
                                      {port}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-success mt-1">Ingen åpne porter</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  ) : wanProgress.status === 'complete' && wanResults.length === 0 ? (
                    <div className="p-8 text-center">
                      <CheckCircle className="h-12 w-12 mx-auto mb-3 text-success opacity-70" />
                      <p className="font-medium text-success">Alt ser bra ut!</p>
                      <p className="text-sm text-muted-foreground mt-1">Ingen hosts eller åpne porter synlig fra internett.</p>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      <Wifi className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Kjør en WAN scan for å se hva som er synlig fra internett.</p>
                      <p className="text-xs mt-1">Denne scannen sjekker din offentlige IP ({wanIp || '...'}) for åpne porter.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="ssl">
            <SslCheckPanel />
          </TabsContent>

          <TabsContent value="firewall">
            <FirewallAuditPanel />
          </TabsContent>

          <TabsContent value="dns">
            <DnsLeakPanel />
          </TabsContent>

          <TabsContent value="openvas">
            <div className="grid gap-4">
              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Dialog open={openvasDialogOpen} onOpenChange={setOpenvasDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="default">
                      <Plus className="h-4 w-4 mr-2" />
                      Ny Scan
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Start OpenVAS Scan</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="scan-name">Scan Navn</Label>
                        <Input
                          id="scan-name"
                          placeholder="F.eks. Nettverksscan Q4"
                          value={newScanName}
                          onChange={(e) => setNewScanName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="scan-target">Mål (IP/Hostname/Range)</Label>
                        <Input
                          id="scan-target"
                          placeholder="192.168.1.0/24 eller server.local"
                          value={newScanTarget}
                          onChange={(e) => setNewScanTarget(e.target.value)}
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Scan Konfigurasjon</Label>
                        <Select value={newScanConfig} onValueChange={setNewScanConfig}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="discovery">Host Discovery (rask)</SelectItem>
                            <SelectItem value="system">System Discovery</SelectItem>
                            <SelectItem value="full">Full and Fast (anbefalt)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpenvasDialogOpen(false)}>
                        Avbryt
                      </Button>
                      <Button onClick={handleStartOpenvasScan} disabled={isStartingOpenvasScan}>
                        {isStartingOpenvasScan ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Starter...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Start Scan
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchOpenvasData}
                  disabled={isLoadingOpenvas}
                >
                  {isLoadingOpenvas ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Oppdater
                </Button>
              </div>

              {/* Scan history */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Scan Historikk
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {isLoadingOpenvas ? (
                    <div className="p-8 text-center">
                      <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                      <p className="mt-2 text-muted-foreground">Laster OpenVAS data...</p>
                    </div>
                  ) : openvasScans.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Ingen OpenVAS scans funnet.</p>
                      <p className="text-xs mt-1">Start en ny scan med knappen over.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {openvasScans.map((scan) => (
                        <div 
                          key={scan.id} 
                          className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => {
                            setSelectedScan(scan);
                            setReportDialogOpen(true);
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-medium text-foreground">{scan.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{scan.target}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={scan.status === 'Running' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success border-success/20'}>
                                {scan.status === 'Running' ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                )}
                                {scan.status}
                              </Badge>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {scan.lastRun}
                            </span>
                            <div className="flex gap-2">
                              <Badge variant="destructive" className="text-[10px]">{scan.high} Høy</Badge>
                              <Badge className="bg-warning/80 text-warning-foreground text-[10px]">{scan.medium} Medium</Badge>
                              <Badge className="bg-primary/80 text-primary-foreground text-[10px]">{scan.low} Lav</Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="vulnerabilities">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Oppdagede Sårbarheter
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {vulnerabilities.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Ingen sårbarheter funnet.</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="divide-y divide-border">
                      {vulnerabilities.map((vuln) => (
                        <div key={vuln.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => { setSelectedVuln(vuln); setVulnDetailOpen(true); }}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge className={severityColors[vuln.severity as keyof typeof severityColors]}>
                                {vuln.severity.toUpperCase()}
                              </Badge>
                              <Badge variant="outline" className="font-mono text-xs">
                                CVSS: {vuln.cvss}
                              </Badge>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                          </div>
                          <p className="font-medium text-foreground mb-1">{vuln.name}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="font-mono">{vuln.host}:{vuln.port}</span>
                            {vuln.affectedService && <span>{vuln.affectedService}</span>}
                            {vuln.family && <Badge variant="secondary" className="text-[10px]">{vuln.family}</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="map">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Scan Geolokasjon
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleScanGeoLookup}
                    disabled={isGeoLookingUp}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isGeoLookingUp ? 'animate-spin' : ''}`} />
                    Oppdater GeoIP
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Viser geografisk lokasjon for nmap-hosts, OpenVAS-mål og sårbarheter med eksterne IP-adresser.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <AttackMap attacks={scanGeoLocations} />
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* Scan Report Dialog */}
        <ScanReportDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          scan={selectedScan}
          vulnerabilities={vulnerabilities}
        />
        
        {/* Nmap Host Detail Dialog */}
        <NmapHostDetailDialog
          open={nmapDetailOpen}
          onOpenChange={setNmapDetailOpen}
          host={selectedNmapHost}
        />
        
        {/* Vulnerability Detail Dialog */}
        <VulnerabilityDetailDialog
          open={vulnDetailOpen}
          onOpenChange={setVulnDetailOpen}
          vulnerability={selectedVuln}
        />
      </main>
    </div>
  );
}
