import { useState, useEffect, useMemo } from "react";
import { StatusCard } from "@/components/StatusCard";
import { Wifi, HardDrive, Server, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE, fetchJsonSafely } from "@/lib/api";

interface ServiceStatus {
  status: "online" | "warning" | "offline";
  value: string;
  subtitle: string;
}

export function StatusCardsModule() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  
  const [unifi, setUnifi] = useState<ServiceStatus>({ status: "offline", value: "—", subtitle: "Sjekker..." });
  const [truenas, setTruenas] = useState<ServiceStatus>({ status: "offline", value: "—", subtitle: "Sjekker..." });
  const [proxmox, setProxmox] = useState<ServiceStatus>({ status: "offline", value: "—", subtitle: "Sjekker..." });
  const [security, setSecurity] = useState<ServiceStatus>({ status: "offline", value: "—", subtitle: "Ikke beregnet" });

  useEffect(() => {
    // Check UniFi
    fetchJsonSafely(`${API_BASE}/api/unifi/health`, { headers: authHeaders })
      .then(res => {
        if (res.ok && res.data) {
          const subsystems = res.data?.data || [];
          const wan = subsystems.find((s: any) => s.subsystem === 'wan');
          const wanStatus = wan?.status === 'ok' ? 'online' : wan ? 'warning' : 'online';
          setUnifi({ 
            status: wanStatus, 
            value: `${subsystems.length} subsystem`, 
            subtitle: wan?.status === 'ok' ? 'WAN OK' : 'Tilkoblet' 
          });
        } else {
          setUnifi({ status: "offline", value: "—", subtitle: "Ikke tilkoblet" });
        }
      })
      .catch(() => setUnifi({ status: "offline", value: "—", subtitle: "Ikke tilkoblet" }));

    // Check TrueNAS
    fetchJsonSafely(`${API_BASE}/api/truenas/pools`)
      .then(res => {
        if (res.ok && res.data) {
          const pools = Array.isArray(res.data) ? res.data : [];
          const healthy = pools.every((p: any) => p.healthy || p.status === 'ONLINE');
          setTruenas({ 
            status: healthy ? "online" : "warning", 
            value: `${pools.length} pool${pools.length !== 1 ? 's' : ''}`, 
            subtitle: healthy ? 'Alle friske' : 'Sjekk pools' 
          });
        } else {
          setTruenas({ status: "offline", value: "—", subtitle: "Ikke tilkoblet" });
        }
      })
      .catch(() => setTruenas({ status: "offline", value: "—", subtitle: "Ikke tilkoblet" }));

    // Check Proxmox
    fetchJsonSafely(`${API_BASE}/api/proxmox/nodes`, { headers: authHeaders })
      .then(res => {
        if (res.ok && res.data) {
          const nodes = res.data?.data || [];
          const onlineNodes = nodes.filter((n: any) => n.status === 'online');
          setProxmox({ 
            status: onlineNodes.length > 0 ? "online" : "warning", 
            value: `${onlineNodes.length}/${nodes.length} noder`, 
            subtitle: onlineNodes.length === nodes.length ? 'Alle online' : 'Noder nede' 
          });
        } else {
          setProxmox({ status: "offline", value: "—", subtitle: "Ikke tilkoblet" });
        }
      })
      .catch(() => setProxmox({ status: "offline", value: "—", subtitle: "Ikke tilkoblet" }));

    // Check security score from cached firewall data
    fetchJsonSafely(`${API_BASE}/api/security/firewall-rules/cached`, { headers: authHeaders })
      .then(res => {
        if (res.ok && res.data && !res.data.empty) {
          const rules = res.data.firewallRules?.length || 0;
          const forwards = res.data.portForwards?.length || 0;
          setSecurity({ 
            status: rules > 0 ? "online" : "warning", 
            value: `${rules} regler`, 
            subtitle: `${forwards} port forwards` 
          });
        } else {
          setSecurity({ status: "offline", value: "—", subtitle: "Ikkje henta" });
        }
      })
      .catch(() => setSecurity({ status: "offline", value: "—", subtitle: "Ikkje tilgjengeleg" }));
  }, [authHeaders]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatusCard
        title="UniFi Controller"
        status={unifi.status}
        icon={Wifi}
        value={unifi.value}
        subtitle={unifi.subtitle}
        href="/unifi"
        className="animate-fade-in"
      />
      <StatusCard
        title="TrueNAS"
        status={truenas.status}
        icon={HardDrive}
        value={truenas.value}
        subtitle={truenas.subtitle}
        href="/truenas"
        className="animate-fade-in [animation-delay:100ms]"
      />
      <StatusCard
        title="Proxmox VE"
        status={proxmox.status}
        icon={Server}
        value={proxmox.value}
        subtitle={proxmox.subtitle}
        href="/proxmox"
        className="animate-fade-in [animation-delay:200ms]"
      />
      <StatusCard
        title="Brannmur"
        status={security.status}
        icon={Shield}
        value={security.value}
        subtitle={security.subtitle}
        href="/security"
        className="animate-fade-in [animation-delay:300ms]"
      />
    </div>
  );
}
