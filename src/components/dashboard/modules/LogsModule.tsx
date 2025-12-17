import { LogsPanel } from "@/components/LogsPanel";

const mockLogs = [
  { id: "1", timestamp: "14:32:05", level: "info" as const, source: "UniFi", message: "Ny enhet koblet til: iPhone-12 (192.168.1.45)" },
  { id: "2", timestamp: "14:30:12", level: "warning" as const, source: "Proxmox", message: "VM 'docker-host' CPU bruk over 80%" },
  { id: "3", timestamp: "14:28:45", level: "success" as const, source: "TrueNAS", message: "Snapshot 'daily-backup' fullført" },
  { id: "4", timestamp: "14:25:00", level: "error" as const, source: "OpenVAS", message: "Scan feilet: Timeout på 192.168.1.100" },
  { id: "5", timestamp: "14:20:33", level: "info" as const, source: "UniFi", message: "Firmware oppdatering tilgjengelig for USW-24" },
  { id: "6", timestamp: "14:15:20", level: "success" as const, source: "System", message: "Ukentlig sikkerhetsscan fullført" },
  { id: "7", timestamp: "14:10:00", level: "info" as const, source: "Proxmox", message: "Container 'pihole' restartet automatisk" },
];

export function LogsModule() {
  return (
    <LogsPanel 
      logs={mockLogs} 
      className="animate-fade-in [animation-delay:500ms]" 
    />
  );
}
