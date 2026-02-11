import { StatusCard } from "@/components/StatusCard";
import { Wifi, HardDrive, Server, Shield } from "lucide-react";

export function StatusCardsModule() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatusCard
        title="UniFi Controller"
        status="offline"
        icon={Wifi}
        value="—"
        subtitle="Ikke tilkoblet"
        href="/unifi"
        className="animate-fade-in"
      />
      <StatusCard
        title="TrueNAS"
        status="offline"
        icon={HardDrive}
        value="—"
        subtitle="Ikke tilkoblet"
        href="/truenas"
        className="animate-fade-in [animation-delay:100ms]"
      />
      <StatusCard
        title="Proxmox VE"
        status="offline"
        icon={Server}
        value="—"
        subtitle="Ikke tilkoblet"
        href="/proxmox"
        className="animate-fade-in [animation-delay:200ms]"
      />
      <StatusCard
        title="Sikkerhets Score"
        status="offline"
        icon={Shield}
        value="—"
        subtitle="Ikke tilkoblet"
        href="/security"
        className="animate-fade-in [animation-delay:300ms]"
      />
    </div>
  );
}