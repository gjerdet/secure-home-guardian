import { useState, useMemo, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AttackMap } from "@/components/AttackMap";
import { exportToCSV, exportToJSON, batchLookupGeoIP } from "@/lib/ids-utils";
import { useToast } from "@/hooks/use-toast";
import { 
  Wifi, Shield, ShieldAlert, AlertTriangle, Activity, 
  Users, Globe, Clock, ArrowUpRight, ArrowDownRight,
  Monitor, Smartphone, Laptop, Router, Radio, Network,
  ArrowUpDown, Download, FileJson, FileSpreadsheet, RefreshCw,
  Ban, CheckCircle, Filter, Power, Zap, Loader2
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface IdsAlert {
  id: string;
  timestamp: string;
  severity: string;
  category: string;
  signature: string;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  action: string;
  country?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  isp?: string;
}

const initialAlerts: IdsAlert[] = [
  { id: "1", timestamp: "2024-12-17 14:32:05", severity: "high", category: "ET SCAN", signature: "Potential SSH Brute Force Attack", srcIp: "45.33.32.156", dstIp: "192.168.1.1", srcPort: 54321, dstPort: 22, action: "blocked" },
  { id: "2", timestamp: "2024-12-17 14:28:12", severity: "medium", category: "ET MALWARE", signature: "Suspicious DNS Query - Known Malware Domain", srcIp: "192.168.1.45", dstIp: "8.8.8.8", srcPort: 53421, dstPort: 53, action: "alerted" },
  { id: "3", timestamp: "2024-12-17 14:15:33", severity: "low", category: "ET POLICY", signature: "Potential Corporate Privacy Violation", srcIp: "192.168.1.52", dstIp: "142.250.185.78", srcPort: 443, dstPort: 443, action: "alerted" },
  { id: "4", timestamp: "2024-12-17 13:45:00", severity: "high", category: "ET EXPLOIT", signature: "Possible SQL Injection Attempt", srcIp: "103.21.244.15", dstIp: "192.168.1.10", srcPort: 12345, dstPort: 80, action: "blocked" },
  { id: "5", timestamp: "2024-12-17 13:20:45", severity: "critical", category: "ET TROJAN", signature: "Known Command and Control Traffic", srcIp: "185.220.101.1", dstIp: "192.168.1.99", srcPort: 443, dstPort: 49152, action: "blocked" },
  { id: "6", timestamp: "2024-12-17 12:55:00", severity: "high", category: "ET SCAN", signature: "Nmap OS Detection Attempt", srcIp: "91.189.88.142", dstIp: "192.168.1.1", srcPort: 45678, dstPort: 0, action: "blocked" },
  { id: "7", timestamp: "2024-12-17 12:30:22", severity: "medium", category: "ET WEB", signature: "XSS Attack Attempt", srcIp: "177.54.148.213", dstIp: "192.168.1.10", srcPort: 34567, dstPort: 443, action: "blocked" },
  { id: "8", timestamp: "2024-12-17 11:45:10", severity: "critical", category: "ET EXPLOIT", signature: "Log4j RCE Attempt", srcIp: "5.188.86.172", dstIp: "192.168.1.10", srcPort: 56789, dstPort: 8080, action: "blocked" },
];

const connectedDevices = [
  { id: "1", name: "MacBook Pro", type: "laptop", ip: "192.168.1.10", mac: "A4:83:E7:12:34:56", connection: "5GHz", signal: -45, rxRate: 866, txRate: 866, uptime: "5d 12h", connectedTo: "U6-Pro Stue", network: "LAN", vlan: 1, rxBytes: 125400000000, txBytes: 42300000000, channel: "36/80" },
  { id: "2", name: "iPhone 14 Pro", type: "phone", ip: "192.168.1.45", mac: "F0:18:98:AB:CD:EF", connection: "5GHz", signal: -52, rxRate: 780, txRate: 780, uptime: "2h 34m", connectedTo: "U6-Pro Stue", network: "LAN", vlan: 1, rxBytes: 2300000000, txBytes: 450000000, channel: "36/80" },
  { id: "3", name: "Samsung TV", type: "tv", ip: "192.168.1.52", mac: "F4:7B:09:CD:EF:12", connection: "2.4GHz", signal: -68, rxRate: 72, txRate: 72, uptime: "3d 8h", connectedTo: "U6-Lite Kontor", network: "IoT", vlan: 10, rxBytes: 89000000000, txBytes: 1200000000, channel: "6" },
  { id: "4", name: "Windows Desktop", type: "desktop", ip: "192.168.1.20", mac: "DC:4A:3E:78:90:12", connection: "Ethernet", signal: 0, rxRate: 1000, txRate: 1000, uptime: "12d 4h", connectedTo: "USW-24-POE Port 5", network: "LAN", vlan: 1, rxBytes: 534000000000, txBytes: 156000000000, channel: null },
  { id: "5", name: "Ukjent Enhet", type: "unknown", ip: "192.168.1.99", mac: "00:1A:2B:3C:4D:5E", connection: "2.4GHz", signal: -75, rxRate: 54, txRate: 54, uptime: "45m", connectedTo: "U6-Mesh Garasje", network: "Gjest", vlan: 20, rxBytes: 45000000, txBytes: 12000000, channel: "6" },
  { id: "6", name: "Sonos Speaker", type: "speaker", ip: "192.168.10.15", mac: "B8:E9:37:45:67:89", connection: "2.4GHz", signal: -58, rxRate: 72, txRate: 72, uptime: "30d 8h", connectedTo: "U6-Pro Stue", network: "IoT", vlan: 10, rxBytes: 34000000000, txBytes: 500000000, channel: "6" },
  { id: "7", name: "HP Printer", type: "printer", ip: "192.168.1.30", mac: "C4:65:16:AB:CD:01", connection: "Ethernet", signal: 0, rxRate: 100, txRate: 100, uptime: "45d 2h", connectedTo: "USW-Lite-8-POE Port 3", network: "LAN", vlan: 1, rxBytes: 1200000000, txBytes: 890000000, channel: null },
  { id: "8", name: "Ring Doorbell", type: "camera", ip: "192.168.10.25", mac: "E0:4F:43:CD:EF:23", connection: "2.4GHz", signal: -62, rxRate: 72, txRate: 72, uptime: "14d 6h", connectedTo: "U6-Mesh Garasje", network: "IoT", vlan: 10, rxBytes: 67000000000, txBytes: 2300000000, channel: "6" },
];

interface APDevice {
  name: string;
  model: string;
  status: "online" | "offline" | "upgrading";
  clients: number;
  channel2g: string;
  channel5g: string;
  experience: number;
  ip: string;
  mac: string;
  firmware: string;
  uptime: string;
  txPower2g: number;
  txPower5g: number;
  load: number;
  memUsage: number;
  cpuUsage: number;
  satisfaction: number;
  connectedClients: { name: string; ip: string; signal: number; band: string; rxRate: number; txRate: number }[];
}

interface SwitchPort {
  port: number;
  name: string;
  status: "up" | "down" | "disabled";
  speed: string;
  poeEnabled: boolean;
  poeWatts: number;
  device: string;
  vlan: number;
  rxBytes: number;
  txBytes: number;
}

interface SwitchDevice {
  name: string;
  model: string;
  status: "online" | "offline";
  ports: number;
  portsUsed: number;
  poeWatts: number;
  poeBudget: number;
  ip: string;
  mac: string;
  firmware: string;
  uptime: string;
  temperature: number;
  fanLevel: number;
  portList: SwitchPort[];
}

const networkDevices: {
  aps: APDevice[];
  switches: SwitchDevice[];
  gateway: { name: string; status: string; wanIp: string; uptime: string };
} = {
  aps: [
    {
      name: "U6-Pro Stue", model: "U6-Pro", status: "online", clients: 8,
      channel2g: "6", channel5g: "36/80", experience: 98,
      ip: "192.168.1.201", mac: "24:5A:4C:AA:BB:01", firmware: "6.6.77",
      uptime: "45d 12h", txPower2g: 20, txPower5g: 23, load: 32,
      memUsage: 45, cpuUsage: 12, satisfaction: 98,
      connectedClients: [
        { name: "MacBook Pro", ip: "192.168.1.10", signal: -45, band: "5GHz", rxRate: 866, txRate: 866 },
        { name: "iPhone 14 Pro", ip: "192.168.1.45", signal: -52, band: "5GHz", rxRate: 780, txRate: 780 },
        { name: "Sonos Speaker", ip: "192.168.10.15", signal: -58, band: "2.4GHz", rxRate: 72, txRate: 72 },
      ]
    },
    {
      name: "U6-Lite Kontor", model: "U6-Lite", status: "online", clients: 4,
      channel2g: "11", channel5g: "149/80", experience: 95,
      ip: "192.168.1.202", mac: "24:5A:4C:AA:BB:02", firmware: "6.6.77",
      uptime: "45d 12h", txPower2g: 18, txPower5g: 20, load: 18,
      memUsage: 38, cpuUsage: 8, satisfaction: 95,
      connectedClients: [
        { name: "Samsung TV", ip: "192.168.1.52", signal: -68, band: "2.4GHz", rxRate: 72, txRate: 72 },
        { name: "iPad Air", ip: "192.168.1.55", signal: -48, band: "5GHz", rxRate: 573, txRate: 573 },
      ]
    },
    {
      name: "U6-Mesh Garasje", model: "U6-Mesh", status: "online", clients: 2,
      channel2g: "1", channel5g: "44/40", experience: 88,
      ip: "192.168.1.203", mac: "24:5A:4C:AA:BB:03", firmware: "6.6.65",
      uptime: "30d 4h", txPower2g: 20, txPower5g: 23, load: 8,
      memUsage: 32, cpuUsage: 5, satisfaction: 88,
      connectedClients: [
        { name: "Ring Doorbell", ip: "192.168.10.25", signal: -62, band: "2.4GHz", rxRate: 72, txRate: 72 },
        { name: "Ukjent Enhet", ip: "192.168.1.99", signal: -75, band: "2.4GHz", rxRate: 54, txRate: 54 },
      ]
    },
  ],
  switches: [
    {
      name: "USW-24-POE", model: "USW-24-PoE", status: "online", ports: 24, portsUsed: 18,
      poeWatts: 145, poeBudget: 250, ip: "192.168.1.210", mac: "24:5A:4C:CC:DD:01",
      firmware: "6.6.61", uptime: "90d 3h", temperature: 42, fanLevel: 1,
      portList: [
        { port: 1, name: "UDM-Pro Uplink", status: "up", speed: "1 Gbps", poeEnabled: false, poeWatts: 0, device: "UDM-Pro", vlan: 1, rxBytes: 1240000000000, txBytes: 890000000000 },
        { port: 2, name: "U6-Pro Stue", status: "up", speed: "1 Gbps", poeEnabled: true, poeWatts: 12.5, device: "U6-Pro", vlan: 1, rxBytes: 234000000000, txBytes: 67000000000 },
        { port: 3, name: "U6-Lite Kontor", status: "up", speed: "1 Gbps", poeEnabled: true, poeWatts: 8.2, device: "U6-Lite", vlan: 1, rxBytes: 156000000000, txBytes: 34000000000 },
        { port: 4, name: "USW-Lite-8", status: "up", speed: "1 Gbps", poeEnabled: false, poeWatts: 0, device: "USW-Lite-8-POE", vlan: 1, rxBytes: 89000000000, txBytes: 23000000000 },
        { port: 5, name: "Windows Desktop", status: "up", speed: "1 Gbps", poeEnabled: false, poeWatts: 0, device: "PC", vlan: 1, rxBytes: 534000000000, txBytes: 156000000000 },
        { port: 6, name: "NAS", status: "up", speed: "1 Gbps", poeEnabled: false, poeWatts: 0, device: "TrueNAS", vlan: 1, rxBytes: 2340000000000, txBytes: 1200000000000 },
        { port: 7, name: "Proxmox Node 1", status: "up", speed: "1 Gbps", poeEnabled: false, poeWatts: 0, device: "Proxmox", vlan: 1, rxBytes: 678000000000, txBytes: 345000000000 },
        { port: 8, name: "Proxmox Node 2", status: "up", speed: "1 Gbps", poeEnabled: false, poeWatts: 0, device: "Proxmox", vlan: 1, rxBytes: 567000000000, txBytes: 234000000000 },
        { port: 9, name: "IP Kamera 1", status: "up", speed: "100 Mbps", poeEnabled: true, poeWatts: 8.0, device: "Kamera", vlan: 10, rxBytes: 12000000000, txBytes: 890000000000 },
        { port: 10, name: "IP Kamera 2", status: "up", speed: "100 Mbps", poeEnabled: true, poeWatts: 7.5, device: "Kamera", vlan: 10, rxBytes: 11000000000, txBytes: 780000000000 },
        { port: 11, name: "IP Kamera 3", status: "up", speed: "100 Mbps", poeEnabled: true, poeWatts: 8.2, device: "Kamera", vlan: 10, rxBytes: 10500000000, txBytes: 720000000000 },
        { port: 12, name: "VoIP Telefon", status: "up", speed: "100 Mbps", poeEnabled: true, poeWatts: 5.5, device: "Telefon", vlan: 30, rxBytes: 4500000000, txBytes: 4200000000 },
        { port: 13, name: "U6-Mesh Garasje", status: "up", speed: "1 Gbps", poeEnabled: true, poeWatts: 10.8, device: "U6-Mesh", vlan: 1, rxBytes: 45000000000, txBytes: 12000000000 },
        { port: 14, name: "", status: "down", speed: "-", poeEnabled: false, poeWatts: 0, device: "", vlan: 1, rxBytes: 0, txBytes: 0 },
        { port: 15, name: "", status: "down", speed: "-", poeEnabled: false, poeWatts: 0, device: "", vlan: 1, rxBytes: 0, txBytes: 0 },
        { port: 16, name: "Smart Plug", status: "up", speed: "100 Mbps", poeEnabled: false, poeWatts: 0, device: "IoT", vlan: 10, rxBytes: 230000000, txBytes: 120000000 },
        { port: 17, name: "Printer", status: "up", speed: "100 Mbps", poeEnabled: false, poeWatts: 0, device: "Printer", vlan: 1, rxBytes: 1200000000, txBytes: 890000000 },
        { port: 18, name: "Rack Switch", status: "up", speed: "1 Gbps", poeEnabled: false, poeWatts: 0, device: "Switch", vlan: 1, rxBytes: 345000000000, txBytes: 123000000000 },
        { port: 19, name: "", status: "down", speed: "-", poeEnabled: false, poeWatts: 0, device: "", vlan: 1, rxBytes: 0, txBytes: 0 },
        { port: 20, name: "", status: "down", speed: "-", poeEnabled: false, poeWatts: 0, device: "", vlan: 1, rxBytes: 0, txBytes: 0 },
        { port: 21, name: "", status: "down", speed: "-", poeEnabled: false, poeWatts: 0, device: "", vlan: 1, rxBytes: 0, txBytes: 0 },
        { port: 22, name: "", status: "down", speed: "-", poeEnabled: false, poeWatts: 0, device: "", vlan: 1, rxBytes: 0, txBytes: 0 },
        { port: 23, name: "SFP+ Uplink 1", status: "up", speed: "10 Gbps", poeEnabled: false, poeWatts: 0, device: "Uplink", vlan: 1, rxBytes: 5600000000000, txBytes: 3400000000000 },
        { port: 24, name: "SFP+ Uplink 2", status: "down", speed: "-", poeEnabled: false, poeWatts: 0, device: "", vlan: 1, rxBytes: 0, txBytes: 0 },
      ]
    },
    {
      name: "USW-Lite-8-POE", model: "USW-Lite-8-PoE", status: "online", ports: 8, portsUsed: 6,
      poeWatts: 52, poeBudget: 60, ip: "192.168.1.211", mac: "24:5A:4C:CC:DD:02",
      firmware: "6.6.61", uptime: "90d 3h", temperature: 38, fanLevel: 0,
      portList: [
        { port: 1, name: "USW-24-POE Uplink", status: "up", speed: "1 Gbps", poeEnabled: false, poeWatts: 0, device: "Switch", vlan: 1, rxBytes: 89000000000, txBytes: 23000000000 },
        { port: 2, name: "Smart TV Kontor", status: "up", speed: "100 Mbps", poeEnabled: false, poeWatts: 0, device: "TV", vlan: 1, rxBytes: 45000000000, txBytes: 1200000000 },
        { port: 3, name: "HP Printer", status: "up", speed: "100 Mbps", poeEnabled: false, poeWatts: 0, device: "Printer", vlan: 1, rxBytes: 1200000000, txBytes: 890000000 },
        { port: 4, name: "IP Kamera Kontor", status: "up", speed: "100 Mbps", poeEnabled: true, poeWatts: 7.8, device: "Kamera", vlan: 10, rxBytes: 8900000000, txBytes: 670000000000 },
        { port: 5, name: "VoIP Kontor", status: "up", speed: "100 Mbps", poeEnabled: true, poeWatts: 5.2, device: "Telefon", vlan: 30, rxBytes: 2300000000, txBytes: 2100000000 },
        { port: 6, name: "Raspberry Pi", status: "up", speed: "1 Gbps", poeEnabled: true, poeWatts: 4.5, device: "Pi", vlan: 1, rxBytes: 12000000000, txBytes: 8900000000 },
        { port: 7, name: "", status: "down", speed: "-", poeEnabled: false, poeWatts: 0, device: "", vlan: 1, rxBytes: 0, txBytes: 0 },
        { port: 8, name: "", status: "down", speed: "-", poeEnabled: false, poeWatts: 0, device: "", vlan: 1, rxBytes: 0, txBytes: 0 },
      ]
    },
  ],
  gateway: { name: "UDM-Pro", status: "online", wanIp: "85.123.45.67", uptime: "45d 12h" },
};

interface FirewallLog {
  id: string;
  timestamp: string;
  action: "block" | "allow";
  rule: string;
  protocol: string;
  srcIp: string;
  srcPort: number;
  dstIp: string;
  dstPort: number;
  interface: string;
  bytes: number;
}

const firewallLogs: FirewallLog[] = [
  { id: "fw1", timestamp: "2024-12-17 14:35:12", action: "block", rule: "Block Incoming SSH", protocol: "TCP", srcIp: "45.33.32.156", srcPort: 54321, dstIp: "192.168.1.1", dstPort: 22, interface: "WAN", bytes: 64 },
  { id: "fw2", timestamp: "2024-12-17 14:34:58", action: "allow", rule: "LAN to WAN", protocol: "TCP", srcIp: "192.168.1.10", srcPort: 52341, dstIp: "142.250.185.78", dstPort: 443, interface: "LAN", bytes: 1420 },
  { id: "fw3", timestamp: "2024-12-17 14:34:45", action: "block", rule: "Block P2P", protocol: "UDP", srcIp: "192.168.1.45", srcPort: 6881, dstIp: "83.129.12.45", dstPort: 6881, interface: "LAN", bytes: 128 },
  { id: "fw4", timestamp: "2024-12-17 14:34:30", action: "allow", rule: "DNS Allow", protocol: "UDP", srcIp: "192.168.1.52", srcPort: 53421, dstIp: "8.8.8.8", dstPort: 53, interface: "LAN", bytes: 64 },
  { id: "fw5", timestamp: "2024-12-17 14:34:15", action: "block", rule: "GeoIP Block Russia", protocol: "TCP", srcIp: "91.189.88.142", srcPort: 45678, dstIp: "192.168.1.1", dstPort: 443, interface: "WAN", bytes: 60 },
  { id: "fw6", timestamp: "2024-12-17 14:34:00", action: "allow", rule: "Established/Related", protocol: "TCP", srcIp: "142.250.185.78", srcPort: 443, dstIp: "192.168.1.10", dstPort: 52341, interface: "WAN", bytes: 8920 },
  { id: "fw7", timestamp: "2024-12-17 14:33:45", action: "block", rule: "Block ICMP Flood", protocol: "ICMP", srcIp: "103.21.244.15", srcPort: 0, dstIp: "192.168.1.1", dstPort: 0, interface: "WAN", bytes: 84 },
  { id: "fw8", timestamp: "2024-12-17 14:33:30", action: "allow", rule: "IoT VLAN to DNS", protocol: "UDP", srcIp: "192.168.10.25", srcPort: 42567, dstIp: "192.168.1.1", dstPort: 53, interface: "IoT", bytes: 48 },
  { id: "fw9", timestamp: "2024-12-17 14:33:15", action: "block", rule: "Block Telnet", protocol: "TCP", srcIp: "5.188.86.172", srcPort: 56789, dstIp: "192.168.1.1", dstPort: 23, interface: "WAN", bytes: 60 },
  { id: "fw10", timestamp: "2024-12-17 14:33:00", action: "allow", rule: "HTTPS Allow", protocol: "TCP", srcIp: "192.168.1.20", srcPort: 58234, dstIp: "104.26.10.123", dstPort: 443, interface: "LAN", bytes: 2048 },
  { id: "fw11", timestamp: "2024-12-17 14:32:45", action: "block", rule: "Block Port Scan", protocol: "TCP", srcIp: "185.220.101.1", srcPort: 12345, dstIp: "192.168.1.1", dstPort: 8080, interface: "WAN", bytes: 60 },
  { id: "fw12", timestamp: "2024-12-17 14:32:30", action: "allow", rule: "VPN Clients", protocol: "UDP", srcIp: "82.45.123.89", srcPort: 54321, dstIp: "192.168.1.1", dstPort: 1194, interface: "WAN", bytes: 512 },
];

const trafficStats = {
  totalDownload: "1.2 TB",
  totalUpload: "342 GB",
  currentDown: "245 Mbps",
  currentUp: "45 Mbps",
  wanLatency: "12ms",
  dnsQueries: 15234,
};

const severityColors = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/80 text-destructive-foreground",
  medium: "bg-warning text-warning-foreground",
  low: "bg-primary/80 text-primary-foreground",
};

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

const DeviceIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "laptop": return <Laptop className="h-4 w-4" />;
    case "phone": return <Smartphone className="h-4 w-4" />;
    case "tv": case "desktop": return <Monitor className="h-4 w-4" />;
    case "camera": return <Shield className="h-4 w-4" />;
    case "speaker": return <Radio className="h-4 w-4" />;
    case "printer": return <Monitor className="h-4 w-4" />;
    default: return <Router className="h-4 w-4" />;
  }
};

export default function UniFi() {
  const [sortBy, setSortBy] = useState<string>("time");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterFirewall, setFilterFirewall] = useState<string>("all");
  const [idsAlerts, setIdsAlerts] = useState<IdsAlert[]>(initialAlerts);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<typeof connectedDevices[0] | null>(null);
  const [selectedAP, setSelectedAP] = useState<APDevice | null>(null);
  const [selectedSwitch, setSelectedSwitch] = useState<SwitchDevice | null>(null);
  const [isRestarting, setIsRestarting] = useState<string | null>(null);
  const [isCyclingPort, setIsCyclingPort] = useState<number | null>(null);
  const [liveAPs, setLiveAPs] = useState<APDevice[]>(networkDevices.aps);
  const [liveSwitches, setLiveSwitches] = useState<SwitchDevice[]>(networkDevices.switches);
  const { toast } = useToast();

  const token = localStorage.getItem("netguard_token");

  // Fetch live device data from backend
  const fetchLiveData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/unifi/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.data) {
        // Map UniFi API device data to our interfaces
        const aps: APDevice[] = data.data
          .filter((d: any) => d.type === "uap")
          .map((d: any) => ({
            name: d.name || d.model,
            model: d.model,
            status: d.state === 1 ? "online" : "offline",
            clients: d["num_sta"] || 0,
            channel2g: d.radio_table?.find((r: any) => r.radio === "ng")?.channel?.toString() || "-",
            channel5g: d.radio_table?.find((r: any) => r.radio === "na")?.channel?.toString() || "-",
            experience: d.satisfaction ?? 0,
            ip: d.ip || "",
            mac: d.mac || "",
            firmware: d.version || "",
            uptime: d.uptime ? `${Math.floor(d.uptime / 86400)}d ${Math.floor((d.uptime % 86400) / 3600)}h` : "-",
            txPower2g: d.radio_table?.find((r: any) => r.radio === "ng")?.tx_power_mode === "custom" ? d.radio_table.find((r: any) => r.radio === "ng").tx_power : 20,
            txPower5g: d.radio_table?.find((r: any) => r.radio === "na")?.tx_power_mode === "custom" ? d.radio_table.find((r: any) => r.radio === "na").tx_power : 23,
            load: Math.round((d["sys_stats"]?.loadavg_1 || 0) * 100),
            memUsage: Math.round((d["sys_stats"]?.mem_used || 0) / (d["sys_stats"]?.mem_total || 1) * 100),
            cpuUsage: Math.round(d["system-stats"]?.cpu || 0),
            satisfaction: d.satisfaction ?? 0,
            connectedClients: [],
          }));

        const switches: SwitchDevice[] = data.data
          .filter((d: any) => d.type === "usw")
          .map((d: any) => ({
            name: d.name || d.model,
            model: d.model,
            status: d.state === 1 ? "online" : "offline",
            ports: d.port_table?.length || 0,
            portsUsed: d.port_table?.filter((p: any) => p.up).length || 0,
            poeWatts: d.port_table?.reduce((sum: number, p: any) => sum + (p.poe_power || 0), 0) || 0,
            poeBudget: d.total_max_power || 0,
            ip: d.ip || "",
            mac: d.mac || "",
            firmware: d.version || "",
            uptime: d.uptime ? `${Math.floor(d.uptime / 86400)}d ${Math.floor((d.uptime % 86400) / 3600)}h` : "-",
            temperature: d.general_temperature || 0,
            fanLevel: d.fan_level || 0,
            portList: (d.port_table || []).map((p: any) => ({
              port: p.port_idx,
              name: p.name || "",
              status: p.up ? "up" : "down",
              speed: p.speed ? `${p.speed} Mbps` : "-",
              poeEnabled: p.poe_enable || false,
              poeWatts: p.poe_power || 0,
              device: p.name || "",
              vlan: p.port_vlan || 1,
              rxBytes: p.rx_bytes || 0,
              txBytes: p.tx_bytes || 0,
            })),
          }));

        if (aps.length > 0) setLiveAPs(aps);
        if (switches.length > 0) setLiveSwitches(switches);
      }
    } catch {
      // Backend not available, keep demo data
    }
  }, [token]);

  useEffect(() => {
    fetchLiveData();
    const interval = setInterval(fetchLiveData, 15000);
    return () => clearInterval(interval);
  }, [fetchLiveData]);

  const handleRestartAP = async (mac: string) => {
    setIsRestarting(mac);
    try {
      const res = await fetch(`${API_BASE}/api/unifi/devices/${mac}/restart`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        toast({ title: "Restart", description: "AP restartes. Dette tar ca. 2-3 minutter." });
      } else {
        const err = await res.json();
        toast({ title: "Feil", description: err.error || "Kunne ikke restarte AP", variant: "destructive" });
      }
    } catch {
      toast({ title: "Feil", description: "Backend ikke tilgjengelig", variant: "destructive" });
    } finally {
      setIsRestarting(null);
    }
  };

  const handlePowerCyclePort = async (switchMac: string, portIdx: number) => {
    setIsCyclingPort(portIdx);
    try {
      const res = await fetch(`${API_BASE}/api/unifi/devices/${switchMac}/port/${portIdx}/cycle`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        toast({ title: "Power Cycle", description: `Port ${portIdx} power-cycles. Enheten vil miste strøm i noen sekunder.` });
      } else {
        const err = await res.json();
        toast({ title: "Feil", description: err.error || "Kunne ikke power-cycle port", variant: "destructive" });
      }
    } catch {
      toast({ title: "Feil", description: "Backend ikke tilgjengelig", variant: "destructive" });
    } finally {
      setIsCyclingPort(null);
    }
  };

  useEffect(() => {
    const cached = localStorage.getItem("ids_geoip_cache");
    if (cached) {
      try {
        const geoData = JSON.parse(cached);
        setIdsAlerts(prev => prev.map(alert => ({
          ...alert,
          ...geoData[alert.srcIp]
        })));
      } catch (e) {
        console.error("Failed to load cached GeoIP data");
      }
    }
  }, []);

  const handleGeoIPLookup = async () => {
    setIsLookingUp(true);
    toast({ title: "GeoIP Oppslag", description: "Henter lokasjon for IP-adresser..." });

    try {
      const ips = idsAlerts.map(a => a.srcIp);
      const results = await batchLookupGeoIP(ips);
      
      // Update alerts with GeoIP data
      const updatedAlerts = idsAlerts.map(alert => {
        const geo = results.get(alert.srcIp);
        if (geo) {
          return {
            ...alert,
            country: geo.countryCode,
            city: geo.city,
            lat: geo.lat,
            lng: geo.lng,
            isp: geo.isp
          };
        }
        return alert;
      });

      setIdsAlerts(updatedAlerts);

      // Cache results
      const geoCache: Record<string, any> = {};
      results.forEach((value, key) => {
        geoCache[key] = {
          country: value.countryCode,
          city: value.city,
          lat: value.lat,
          lng: value.lng,
          isp: value.isp
        };
      });
      localStorage.setItem("ids_geoip_cache", JSON.stringify(geoCache));

      toast({ 
        title: "GeoIP Fullført", 
        description: `Hentet lokasjon for ${results.size} IP-adresser` 
      });
    } catch (error) {
      toast({ 
        title: "Feil", 
        description: "Kunne ikke hente GeoIP data", 
        variant: "destructive" 
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  const sortedAlerts = useMemo(() => {
    let filtered = [...idsAlerts];
    
    if (filterSeverity !== "all") {
      filtered = filtered.filter(a => a.severity === filterSeverity);
    }

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "severity":
          return severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder];
        case "country":
          return (a.country || "ZZZ").localeCompare(b.country || "ZZZ");
        case "time":
        default:
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
    });
  }, [sortBy, filterSeverity, idsAlerts]);

  const attackLocations = idsAlerts
    .filter(a => a.lat && a.lng)
    .map(a => ({ lat: a.lat!, lng: a.lng!, severity: a.severity, country: a.country || "Unknown" }));

  const handleExportCSV = () => {
    exportToCSV(sortedAlerts, `ids-alerts-${new Date().toISOString().split('T')[0]}.csv`);
    toast({ title: "Eksportert", description: "IDS alerts eksportert til CSV" });
  };

  const handleExportJSON = () => {
    exportToJSON(sortedAlerts, `ids-alerts-${new Date().toISOString().split('T')[0]}.json`);
    toast({ title: "Eksportert", description: "IDS alerts eksportert til JSON" });
  };

  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-primary/10 p-3">
            <Wifi className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">UniFi Controller</h1>
            <p className="text-sm text-muted-foreground">IDS/IPS Overvåkning • Enhetsadministrasjon</p>
          </div>
          <Badge className="ml-auto bg-success/10 text-success border-success/20">Online</Badge>
        </div>

        {/* Network Equipment Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Radio className="h-3 w-3 text-primary" />
                Access Points
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{liveAPs.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Network className="h-3 w-3 text-primary" />
                Switcher
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{liveSwitches.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ArrowDownRight className="h-3 w-3 text-success" />
                Nedlasting
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{trafficStats.currentDown}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ArrowUpRight className="h-3 w-3 text-primary" />
                Opplasting
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{trafficStats.currentUp}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Users className="h-3 w-3" />
                Klienter
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{connectedDevices.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Globe className="h-3 w-3" />
                WAN Latency
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{trafficStats.wanLatency}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ShieldAlert className="h-3 w-3 text-destructive" />
                IDS Alerts
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{idsAlerts.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Activity className="h-3 w-3" />
                DNS Queries
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{(trafficStats.dnsQueries / 1000).toFixed(1)}k</p>
            </CardContent>
          </Card>
        </div>

        {/* Network Equipment Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-card border-border">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                Access Points
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {liveAPs.map((ap) => (
                  <div key={ap.name} className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedAP(ap)}>
                    <div>
                      <p className="text-sm font-medium text-foreground">{ap.name}</p>
                      <p className="text-xs text-muted-foreground">Ch {ap.channel5g} • {ap.clients} klienter</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{ap.experience}%</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" />
                Switcher
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {liveSwitches.map((sw) => (
                  <div key={sw.name} className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedSwitch(sw)}>
                    <div>
                      <p className="text-sm font-medium text-foreground">{sw.name}</p>
                      <p className="text-xs text-muted-foreground">{sw.portsUsed}/{sw.ports} porter • {sw.poeWatts}W PoE</p>
                    </div>
                    <Badge className="bg-success/10 text-success text-xs">Online</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Router className="h-4 w-4 text-primary" />
                Gateway
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <p className="text-sm font-medium text-foreground">{networkDevices.gateway.name}</p>
              <p className="text-xs text-muted-foreground mt-1">WAN: {networkDevices.gateway.wanIp}</p>
              <p className="text-xs text-muted-foreground">Uptime: {networkDevices.gateway.uptime}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="ids" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="ids" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ShieldAlert className="h-4 w-4 mr-2" />
              IDS/IPS Alerts
            </TabsTrigger>
            <TabsTrigger value="firewall" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              Firewall Logger
            </TabsTrigger>
            <TabsTrigger value="map" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="h-4 w-4 mr-2" />
              Angreps-kart
            </TabsTrigger>
            <TabsTrigger value="devices" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-4 w-4 mr-2" />
              Tilkoblede Enheter
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ids">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Intrusion Detection / Prevention System
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleGeoIPLookup}
                      disabled={isLookingUp}
                      className="h-8 text-xs"
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${isLookingUp ? 'animate-spin' : ''}`} />
                      GeoIP Oppslag
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-8 text-xs">
                      <FileSpreadsheet className="h-3 w-3 mr-1" />
                      CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportJSON} className="h-8 text-xs">
                      <FileJson className="h-3 w-3 mr-1" />
                      JSON
                    </Button>
                    <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                      <SelectTrigger className="w-[120px] h-8 text-xs bg-muted border-border">
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle nivåer</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="w-[130px] h-8 text-xs bg-muted border-border">
                        <ArrowUpDown className="h-3 w-3 mr-1" />
                        <SelectValue placeholder="Sorter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="time">Tid (nyeste)</SelectItem>
                        <SelectItem value="severity">Alvorlighet</SelectItem>
                        <SelectItem value="country">Land</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {sortedAlerts.map((alert) => (
                      <div key={alert.id} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={severityColors[alert.severity as keyof typeof severityColors]}>
                              {alert.severity.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="font-mono text-xs">
                              {alert.category}
                            </Badge>
                            <Badge variant={alert.action === "blocked" ? "destructive" : "secondary"}>
                              {alert.action === "blocked" ? "Blokkert" : "Varslet"}
                            </Badge>
                            {alert.country && (
                              <Badge variant="outline" className="text-xs">
                                <Globe className="h-3 w-3 mr-1" />
                                {alert.country}
                                {alert.city && ` • ${alert.city}`}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground font-mono flex items-center gap-1 shrink-0">
                            <Clock className="h-3 w-3" />
                            {alert.timestamp}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground mb-2">{alert.signature}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <span className="text-muted-foreground">Kilde IP:</span>
                            <p className="font-mono text-foreground">{alert.srcIp}:{alert.srcPort}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Destinasjon IP:</span>
                            <p className="font-mono text-foreground">{alert.dstIp}:{alert.dstPort}</p>
                          </div>
                          {alert.isp && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">ISP:</span>
                              <p className="font-mono text-foreground">{alert.isp}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="firewall">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Firewall Logger
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Ban className="h-3 w-3 text-destructive" />
                        Blokkert: {firewallLogs.filter(l => l.action === "block").length}
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-success" />
                        Tillatt: {firewallLogs.filter(l => l.action === "allow").length}
                      </span>
                    </div>
                    <Select value={filterFirewall} onValueChange={setFilterFirewall}>
                      <SelectTrigger className="w-[120px] h-8 text-xs bg-muted border-border">
                        <Filter className="h-3 w-3 mr-1" />
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="all">Alle</SelectItem>
                        <SelectItem value="block">Blokkert</SelectItem>
                        <SelectItem value="allow">Tillatt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {firewallLogs
                      .filter(log => filterFirewall === "all" || log.action === filterFirewall)
                      .map((log) => (
                      <div key={log.id} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={log.action === "block" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}>
                              {log.action === "block" ? (
                                <><Ban className="h-3 w-3 mr-1" />BLOCK</>
                              ) : (
                                <><CheckCircle className="h-3 w-3 mr-1" />ALLOW</>
                              )}
                            </Badge>
                            <Badge variant="outline" className="font-mono text-xs">
                              {log.protocol}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {log.interface}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono flex items-center gap-1 shrink-0">
                            <Clock className="h-3 w-3" />
                            {log.timestamp}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground mb-2">{log.rule}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <span className="text-muted-foreground">Kilde:</span>
                            <p className="font-mono text-foreground">{log.srcIp}{log.srcPort > 0 ? `:${log.srcPort}` : ""}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Destinasjon:</span>
                            <p className="font-mono text-foreground">{log.dstIp}{log.dstPort > 0 ? `:${log.dstPort}` : ""}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Bytes:</span>
                            <p className="font-mono text-foreground">{log.bytes.toLocaleString()}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Interface:</span>
                            <p className="font-mono text-foreground">{log.interface}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="map">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Angreps Geolokasjon
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleGeoIPLookup}
                    disabled={isLookingUp}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLookingUp ? 'animate-spin' : ''}`} />
                    Oppdater GeoIP
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <AttackMap attacks={attackLocations} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Tilkoblede Enheter ({connectedDevices.length})
                  </CardTitle>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Wifi className="h-3 w-3" /> WiFi: {connectedDevices.filter(d => d.connection !== "Ethernet").length}</span>
                    <span className="flex items-center gap-1"><Network className="h-3 w-3" /> Kabel: {connectedDevices.filter(d => d.connection === "Ethernet").length}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {connectedDevices.map((device) => (
                      <div key={device.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedDevice(device)}>
                        <div className="flex items-center gap-4">
                          <div className={`rounded-lg p-2.5 ${device.type === "unknown" ? "bg-warning/10" : "bg-primary/10"}`}>
                            <DeviceIcon type={device.type} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-foreground">{device.name}</p>
                              {device.type === "unknown" && (
                                <AlertTriangle className="h-4 w-4 text-warning" />
                              )}
                              <Badge variant="outline" className="text-[10px] font-mono">{device.network}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">{device.ip} • {device.mac}</p>
                          </div>
                          <div className="hidden md:block text-right text-xs">
                            <p className="text-muted-foreground">Tilkoblet via</p>
                            <p className="font-mono text-foreground text-[11px]">{device.connectedTo}</p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="text-muted-foreground">{device.connection}</p>
                            <p className="font-mono text-foreground">{device.signal !== 0 ? `${device.signal} dBm` : "Kablet"}</p>
                          </div>
                          <div className="hidden lg:block text-right text-xs">
                            <p className="text-muted-foreground">TX/RX</p>
                            <p className="font-mono text-foreground">{device.txRate}/{device.rxRate} Mbps</p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="text-muted-foreground">Uptime</p>
                            <p className="font-mono text-foreground">{device.uptime}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Device Detail Dialog */}
      <Dialog open={!!selectedDevice} onOpenChange={(open) => !open && setSelectedDevice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`rounded-lg p-2.5 ${selectedDevice?.type === "unknown" ? "bg-warning/10" : "bg-primary/10"}`}>
                {selectedDevice && <DeviceIcon type={selectedDevice.type} />}
              </div>
              <div>
                <span>{selectedDevice?.name}</span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] font-mono">{selectedDevice?.network}</Badge>
                  {selectedDevice?.type === "unknown" && <Badge variant="secondary" className="text-[10px] gap-1"><AlertTriangle className="h-3 w-3" />Ukjent enhet</Badge>}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedDevice && (
            <div className="space-y-4">
              {/* Connection path */}
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-2">Tilkoblingssti</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="gap-1 bg-primary/10 text-primary border-primary/20">
                    {selectedDevice.connection === "Ethernet" ? <Network className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
                    {selectedDevice.name}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline" className="gap-1 font-mono text-xs">
                    {selectedDevice.connection === "Ethernet" ? <Network className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
                    {selectedDevice.connectedTo}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline" className="gap-1 font-mono text-xs">
                    <Router className="h-3 w-3" />
                    {networkDevices.gateway.name}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline" className="gap-1 font-mono text-xs">
                    <Globe className="h-3 w-3" />
                    WAN
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Network details */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">IP-adresse</span><span className="font-mono text-foreground">{selectedDevice.ip}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">MAC-adresse</span><span className="font-mono text-foreground text-xs">{selectedDevice.mac}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Nettverk</span><span className="text-foreground">{selectedDevice.network} (VLAN {selectedDevice.vlan})</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tilkobling</span><span className="text-foreground">{selectedDevice.connection}</span></div>
                {selectedDevice.channel && <div className="flex justify-between"><span className="text-muted-foreground">Kanal</span><span className="font-mono text-foreground">{selectedDevice.channel}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Tilkoblet til</span><span className="font-mono text-foreground text-xs">{selectedDevice.connectedTo}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Oppetid</span><span className="font-mono text-foreground">{selectedDevice.uptime}</span></div>
              </div>

              <Separator />

              {/* Signal & speed */}
              {selectedDevice.signal !== 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Signalstyrke</p>
                  <div className="flex items-center gap-3">
                    <Progress
                      value={Math.min(100, Math.max(0, (selectedDevice.signal + 90) * 2.5))}
                      className="h-2 flex-1"
                    />
                    <span className={`font-mono text-sm ${selectedDevice.signal > -50 ? "text-success" : selectedDevice.signal > -65 ? "text-foreground" : selectedDevice.signal > -75 ? "text-warning" : "text-destructive"}`}>
                      {selectedDevice.signal} dBm
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedDevice.signal > -50 ? "Utmerket" : selectedDevice.signal > -65 ? "Bra" : selectedDevice.signal > -75 ? "Middels" : "Svakt"} signal
                  </p>
                </div>
              )}

              {/* Speed */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">TX hastighet</p>
                  <p className="font-mono font-bold text-foreground">{selectedDevice.txRate} Mbps</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">RX hastighet</p>
                  <p className="font-mono font-bold text-foreground">{selectedDevice.rxRate} Mbps</p>
                </div>
              </div>

              {/* Traffic */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Nedlastet totalt</p>
                  <p className="font-mono font-bold text-foreground">{formatBytes(selectedDevice.rxBytes)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Opplastet totalt</p>
                  <p className="font-mono font-bold text-foreground">{formatBytes(selectedDevice.txBytes)}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AP Detail Dialog */}
      <Dialog open={!!selectedAP} onOpenChange={(open) => !open && setSelectedAP(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="rounded-lg p-2.5 bg-primary/10">
                <Radio className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span>{selectedAP?.name}</span>
                <p className="text-xs text-muted-foreground font-normal mt-1">{selectedAP?.model} • {selectedAP?.firmware}</p>
              </div>
              <Badge className="ml-auto bg-success/10 text-success border-success/20">{selectedAP?.status}</Badge>
            </DialogTitle>
          </DialogHeader>
          {selectedAP && (
            <div className="space-y-4">
              {/* Device Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">IP-adresse</span><span className="font-mono text-foreground">{selectedAP.ip}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">MAC-adresse</span><span className="font-mono text-foreground text-xs">{selectedAP.mac}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Firmware</span><span className="font-mono text-foreground">{selectedAP.firmware}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Oppetid</span><span className="font-mono text-foreground">{selectedAP.uptime}</span></div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">2.4GHz Kanal</span><span className="font-mono text-foreground">Ch {selectedAP.channel2g}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">5GHz Kanal</span><span className="font-mono text-foreground">Ch {selectedAP.channel5g}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">TX 2.4GHz</span><span className="font-mono text-foreground">{selectedAP.txPower2g} dBm</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">TX 5GHz</span><span className="font-mono text-foreground">{selectedAP.txPower5g} dBm</span></div>
                </div>
              </div>

              <Separator />

              {/* Resource Usage */}
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium">Ressursbruk</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16">CPU</span>
                    <Progress value={selectedAP.cpuUsage} className="h-2 flex-1" />
                    <span className="text-xs font-mono text-foreground w-10 text-right">{selectedAP.cpuUsage}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16">Minne</span>
                    <Progress value={selectedAP.memUsage} className="h-2 flex-1" />
                    <span className="text-xs font-mono text-foreground w-10 text-right">{selectedAP.memUsage}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16">Kanalbruk</span>
                    <Progress value={selectedAP.load} className="h-2 flex-1" />
                    <span className="text-xs font-mono text-foreground w-10 text-right">{selectedAP.load}%</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Satisfaction */}
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">WiFi Satisfaction</p>
                <p className={`text-3xl font-mono font-bold ${selectedAP.satisfaction >= 90 ? "text-success" : selectedAP.satisfaction >= 70 ? "text-warning" : "text-destructive"}`}>
                  {selectedAP.satisfaction}%
                </p>
              </div>

              <Separator />

              {/* Connected Clients */}
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">Tilkoblede klienter ({selectedAP.connectedClients.length})</p>
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {selectedAP.connectedClients.map((client, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-foreground">{client.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{client.ip} • {client.band}</p>
                      </div>
                      <div className="text-right text-xs">
                        <p className={`font-mono ${client.signal > -50 ? "text-success" : client.signal > -65 ? "text-foreground" : "text-warning"}`}>
                          {client.signal} dBm
                        </p>
                        <p className="text-muted-foreground">{client.txRate}/{client.rxRate} Mbps</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Restart Button */}
              <Button
                variant="destructive"
                className="w-full gap-2"
                onClick={() => handleRestartAP(selectedAP.mac)}
                disabled={isRestarting === selectedAP.mac}
              >
                {isRestarting === selectedAP.mac ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Restarter...</>
                ) : (
                  <><Power className="h-4 w-4" />Restart AP</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Switch Detail Dialog */}
      <Dialog open={!!selectedSwitch} onOpenChange={(open) => !open && setSelectedSwitch(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="rounded-lg p-2.5 bg-primary/10">
                <Network className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span>{selectedSwitch?.name}</span>
                <p className="text-xs text-muted-foreground font-normal mt-1">{selectedSwitch?.model} • {selectedSwitch?.firmware}</p>
              </div>
              <Badge className="ml-auto bg-success/10 text-success border-success/20">{selectedSwitch?.status}</Badge>
            </DialogTitle>
          </DialogHeader>
          {selectedSwitch && (
            <div className="space-y-4">
              {/* Switch Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Porter i bruk</p>
                  <p className="font-mono font-bold text-foreground">{selectedSwitch.portsUsed}/{selectedSwitch.ports}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">PoE Forbruk</p>
                  <p className="font-mono font-bold text-foreground">{selectedSwitch.poeWatts}W / {selectedSwitch.poeBudget}W</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Temperatur</p>
                  <p className={`font-mono font-bold ${selectedSwitch.temperature > 55 ? "text-destructive" : selectedSwitch.temperature > 45 ? "text-warning" : "text-foreground"}`}>
                    {selectedSwitch.temperature}°C
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Oppetid</p>
                  <p className="font-mono font-bold text-foreground">{selectedSwitch.uptime}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">IP-adresse</span><span className="font-mono text-foreground">{selectedSwitch.ip}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">MAC-adresse</span><span className="font-mono text-foreground text-xs">{selectedSwitch.mac}</span></div>
              </div>

              {/* PoE Budget Bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">PoE Budsjett</span>
                  <span className="font-mono text-foreground">{Math.round((selectedSwitch.poeWatts / selectedSwitch.poeBudget) * 100)}%</span>
                </div>
                <Progress value={(selectedSwitch.poeWatts / selectedSwitch.poeBudget) * 100} className="h-2" />
              </div>

              <Separator />

              {/* Port List */}
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">Porter</p>
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-[50px_1fr_80px_80px_70px_80px_80px_60px] gap-2 p-2 bg-muted/80 text-[10px] text-muted-foreground font-medium sticky top-0">
                      <span>Port</span>
                      <span>Enhet</span>
                      <span>Status</span>
                      <span>Hastighet</span>
                      <span>VLAN</span>
                      <span>PoE</span>
                      <span>Trafikk</span>
                      <span>Handling</span>
                    </div>
                    {selectedSwitch.portList.map((port) => (
                      <div key={port.port} className={`grid grid-cols-[50px_1fr_80px_80px_70px_80px_80px_60px] gap-2 p-2 text-xs items-center ${port.status === "down" ? "opacity-50" : ""}`}>
                        <span className="font-mono font-bold text-foreground">{port.port}</span>
                        <span className="text-foreground truncate">{port.name || <span className="text-muted-foreground italic">Ledig</span>}</span>
                        <Badge variant={port.status === "up" ? "default" : "secondary"} className={`text-[10px] justify-center ${port.status === "up" ? "bg-success/10 text-success" : ""}`}>
                          {port.status === "up" ? "● Oppe" : "○ Nede"}
                        </Badge>
                        <span className="font-mono text-foreground text-[11px]">{port.speed}</span>
                        <span className="font-mono text-foreground">{port.vlan}</span>
                        <span className="font-mono text-foreground text-[11px]">
                          {port.poeEnabled ? `${port.poeWatts}W` : <span className="text-muted-foreground">—</span>}
                        </span>
                        <span className="font-mono text-foreground text-[11px]">
                          {port.status === "up" ? `${formatBytes(port.rxBytes + port.txBytes)}` : "—"}
                        </span>
                        <span>
                          {port.poeEnabled && port.status === "up" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              title="Power Cycle Port"
                              onClick={() => handlePowerCyclePort(selectedSwitch.mac, port.port)}
                              disabled={isCyclingPort === port.port}
                            >
                              {isCyclingPort === port.port ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Zap className="h-3 w-3 text-warning" />
                              )}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <Separator />

              {/* Restart Switch */}
              <Button
                variant="destructive"
                className="w-full gap-2"
                onClick={() => handleRestartAP(selectedSwitch.mac)}
                disabled={isRestarting === selectedSwitch.mac}
              >
                {isRestarting === selectedSwitch.mac ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Restarter...</>
                ) : (
                  <><Power className="h-4 w-4" />Restart Switch</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
