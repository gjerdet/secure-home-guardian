import { SystemCard } from "@/components/SystemCard";
import { Database, Server, Activity } from "lucide-react";

export function SystemMetricsModule() {
  return (
    <div className="space-y-6">
      <SystemCard 
        title="TrueNAS Scale" 
        icon={Database} 
        status="online" 
        metrics={[
          { label: "CPU", value: 23 }, 
          { label: "RAM", value: 67, max: 100 }, 
          { label: "Pool Health", value: 100 }
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
          { label: "Storage", value: 456, max: 1000, unit: "GB" }
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
          { label: "Uptime", value: 99.9, unit: "%" }
        ]} 
        className="animate-fade-in [animation-delay:600ms]" 
      />
    </div>
  );
}
