import { StatusCard } from "@/components/StatusCard";
import { Wifi, HardDrive, Server, Shield } from "lucide-react";

export function StatusCardsModule() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatusCard
        title="UniFi Controller"
        status="online"
        icon={Wifi}
        value="12 enheter"
        subtitle="IDS/IPS Aktiv"
        href="/unifi"
        className="animate-fade-in"
      />
      <StatusCard
        title="TrueNAS"
        status="online"
        icon={HardDrive}
        value="42.3 TB"
        subtitle="Tilgjengelig lagring"
        href="/truenas"
        className="animate-fade-in [animation-delay:100ms]"
      />
      <StatusCard
        title="Proxmox VE"
        status="warning"
        icon={Server}
        value="8 VMs"
        subtitle="2 containere aktive"
        href="/proxmox"
        className="animate-fade-in [animation-delay:200ms]"
      />
      <StatusCard
        title="Sikkerhets Score"
        status="online"
        icon={Shield}
        value="87/100"
        subtitle="Sist oppdatert: 2t siden"
        href="/security"
        className="animate-fade-in [animation-delay:300ms]"
      />
    </div>
  );
}
