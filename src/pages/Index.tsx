import { useState } from "react";
import { Header } from "@/components/Header";
import { StatusCard } from "@/components/StatusCard";
import { SystemCard } from "@/components/SystemCard";
import { LogsPanel } from "@/components/LogsPanel";
import { IoTDeviceList } from "@/components/IoTDeviceList";
import { ScanPanel } from "@/components/ScanPanel";
import {
  Wifi,
  Server,
  HardDrive,
  Database,
  Activity,
  Shield,
} from "lucide-react";

// Mock data - i produksjon kommer dette fra API-er
const mockLogs = [
  {
    id: "1",
    timestamp: "14:32:05",
    level: "info" as const,
    source: "UniFi",
    message: "Ny enhet koblet til: iPhone-12 (192.168.1.45)",
  },
  {
    id: "2",
    timestamp: "14:30:12",
    level: "warning" as const,
    source: "Proxmox",
    message: "VM 'docker-host' CPU bruk over 80%",
  },
  {
    id: "3",
    timestamp: "14:28:45",
    level: "success" as const,
    source: "TrueNAS",
    message: "Snapshot 'daily-backup' fullført",
  },
  {
    id: "4",
    timestamp: "14:25:00",
    level: "error" as const,
    source: "OpenVAS",
    message: "Scan feilet: Timeout på 192.168.1.100",
  },
  {
    id: "5",
    timestamp: "14:20:33",
    level: "info" as const,
    source: "UniFi",
    message: "Firmware oppdatering tilgjengelig for USW-24",
  },
  {
    id: "6",
    timestamp: "14:15:20",
    level: "success" as const,
    source: "System",
    message: "Ukentlig sikkerhetsscan fullført",
  },
  {
    id: "7",
    timestamp: "14:10:00",
    level: "info" as const,
    source: "Proxmox",
    message: "Container 'pihole' restartet automatisk",
  },
];

const mockDevices = [
  {
    id: "1",
    name: "Philips Hue Bridge",
    ip: "192.168.1.50",
    mac: "EC:B5:FA:12:34:56",
    status: "online" as const,
    trusted: true,
    lastSeen: "Nå",
  },
  {
    id: "2",
    name: "Sonos Speaker",
    ip: "192.168.1.51",
    mac: "94:9F:3E:78:90:AB",
    status: "online" as const,
    trusted: true,
    lastSeen: "Nå",
  },
  {
    id: "3",
    name: "Samsung TV",
    ip: "192.168.1.52",
    mac: "F4:7B:09:CD:EF:12",
    status: "online" as const,
    trusted: true,
    lastSeen: "Nå",
  },
  {
    id: "4",
    name: "Ukjent Enhet",
    ip: "192.168.1.99",
    mac: "00:1A:2B:3C:4D:5E",
    status: "online" as const,
    trusted: false,
    lastSeen: "2 min",
  },
  {
    id: "5",
    name: "Ring Doorbell",
    ip: "192.168.1.53",
    mac: "A0:B1:C2:D3:E4:F5",
    status: "offline" as const,
    trusted: true,
    lastSeen: "3t siden",
  },
  {
    id: "6",
    name: "Xiaomi Vacuum",
    ip: "192.168.1.54",
    mac: "28:6C:07:AB:CD:EF",
    status: "online" as const,
    trusted: true,
    lastSeen: "Nå",
  },
];

const mockScanResults = [
  {
    type: "vulnerability" as const,
    severity: "medium" as const,
    description: "Utdatert SSL-sertifikat på webserver",
    target: "192.168.1.10:443",
  },
  {
    type: "port" as const,
    severity: "low" as const,
    description: "Åpen port 22 (SSH) eksponert",
    target: "192.168.1.1:22",
  },
  {
    type: "host" as const,
    severity: "info" as const,
    description: "Ny enhet oppdaget på nettverket",
    target: "192.168.1.99",
  },
];

const Index = () => {
  const [isScanning, setIsScanning] = useState(false);

  const handleStartScan = () => {
    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 5000);
  };

  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />

      <main className="container mx-auto px-4 py-6">
        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatusCard
            title="UniFi Controller"
            status="online"
            icon={Wifi}
            value="12 enheter"
            subtitle="Alle tilkoblede enheter"
            className="animate-fade-in"
          />
          <StatusCard
            title="TrueNAS"
            status="online"
            icon={HardDrive}
            value="42.3 TB"
            subtitle="Tilgjengelig lagring"
            className="animate-fade-in [animation-delay:100ms]"
          />
          <StatusCard
            title="Proxmox VE"
            status="warning"
            icon={Server}
            value="8 VMs"
            subtitle="2 containere aktive"
            className="animate-fade-in [animation-delay:200ms]"
          />
          <StatusCard
            title="Sikkerhets Score"
            status="online"
            icon={Shield}
            value="87/100"
            subtitle="Sist oppdatert: 2t siden"
            className="animate-fade-in [animation-delay:300ms]"
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - System Status */}
          <div className="space-y-6">
            <SystemCard
              title="TrueNAS Scale"
              icon={Database}
              status="online"
              metrics={[
                { label: "CPU", value: 23 },
                { label: "RAM", value: 67, max: 100 },
                { label: "Pool Health", value: 100 },
              ]}
              className="animate-fade-in [animation-delay:400ms]"
            />
            <SystemCard
              title="Proxmox VE"
              icon={Server}
              status="warning"
              metrics={[
                { label: "CPU", value: 82 },
                { label: "RAM", value: 28, max: 32, unit: "GB" },
                { label: "Storage", value: 456, max: 1000, unit: "GB" },
              ]}
              className="animate-fade-in [animation-delay:500ms]"
            />
            <SystemCard
              title="UniFi Network"
              icon={Activity}
              status="online"
              metrics={[
                { label: "Båndbredde", value: 245, max: 1000, unit: "Mbps" },
                { label: "Aktive Enheter", value: 12, max: 50, unit: "" },
                { label: "Uptime", value: 99.9, unit: "%" },
              ]}
              className="animate-fade-in [animation-delay:600ms]"
            />
          </div>

          {/* Middle Column - Logs & Scanning */}
          <div className="space-y-6">
            <LogsPanel
              logs={mockLogs}
              className="animate-fade-in [animation-delay:500ms]"
            />
            <ScanPanel
              lastScan="12. des 2024, 03:00"
              nextScan="19. des 2024, 03:00"
              isScanning={isScanning}
              results={mockScanResults}
              onStartScan={handleStartScan}
              className="animate-fade-in [animation-delay:600ms]"
            />
          </div>

          {/* Right Column - IoT Devices */}
          <div>
            <IoTDeviceList
              devices={mockDevices}
              className="animate-fade-in [animation-delay:700ms]"
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
