import { SystemCard } from "@/components/SystemCard";
import { Database, Server, Activity } from "lucide-react";

export function SystemMetricsModule() {
  return (
    <div className="space-y-6">
      <SystemCard 
        title="TrueNAS Scale" 
        icon={Database} 
        status="offline" 
        metrics={[
          { label: "CPU", value: 0 }, 
          { label: "RAM", value: 0, max: 100 }, 
          { label: "Pool Health", value: 0 }
        ]} 
        className="animate-fade-in [animation-delay:400ms]" 
      />
      <SystemCard 
        title="Proxmox VE" 
        icon={Server} 
        status="offline" 
        metrics={[
          { label: "CPU", value: 0 }, 
          { label: "RAM", value: 0, max: 32, unit: "GB" }, 
          { label: "Storage", value: 0, max: 1000, unit: "GB" }
        ]} 
        className="animate-fade-in [animation-delay:500ms]" 
      />
      <SystemCard 
        title="UniFi Network" 
        icon={Activity} 
        status="offline" 
        metrics={[
          { label: "Båndbredde", value: 0, max: 1000, unit: "Mbps" }, 
          { label: "Aktive Enheter", value: 0, max: 50, unit: "" }, 
          { label: "Uptime", value: 0, unit: "%" }
        ]} 
        className="animate-fade-in [animation-delay:600ms]" 
      />
    </div>
  );
}
