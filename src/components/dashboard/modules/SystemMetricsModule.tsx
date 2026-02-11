import { useState, useEffect, useMemo } from "react";
import { SystemCard } from "@/components/SystemCard";
import { Database, Server, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE, fetchJsonSafely } from "@/lib/api";

interface MetricData {
  status: "online" | "warning" | "offline";
  metrics: { label: string; value: number; max?: number; unit?: string }[];
}

export function SystemMetricsModule() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [truenas, setTruenas] = useState<MetricData>({
    status: "offline",
    metrics: [
      { label: "CPU", value: 0 },
      { label: "RAM", value: 0, max: 100 },
      { label: "Pool Health", value: 0 },
    ],
  });
  const [proxmox, setProxmox] = useState<MetricData>({
    status: "offline",
    metrics: [
      { label: "CPU", value: 0 },
      { label: "RAM", value: 0, max: 32, unit: "GB" },
      { label: "Storage", value: 0, max: 1000, unit: "GB" },
    ],
  });
  const [unifi, setUnifi] = useState<MetricData>({
    status: "offline",
    metrics: [
      { label: "Båndbredde", value: 0, max: 1000, unit: "Mbps" },
      { label: "Aktive Enheter", value: 0, max: 50, unit: "" },
      { label: "Uptime", value: 0, unit: "%" },
    ],
  });

  useEffect(() => {
    // TrueNAS
    fetchJsonSafely(`${API_BASE}/api/truenas/system`, { headers: authHeaders })
      .then(res => {
        if (res.ok && res.data) {
          const d = res.data as any;
          const cpuPct = d.cpu_usage ?? d.loadavg?.[0] ?? 0;
          const ramTotal = d.physmem ? Math.round(d.physmem / 1073741824) : 100;
          const ramUsed = d.physmem && d.physmem_used
            ? Math.round((d.physmem_used / d.physmem) * 100)
            : 0;
          setTruenas({
            status: "online",
            metrics: [
              { label: "CPU", value: Math.round(cpuPct) },
              { label: "RAM", value: ramUsed, max: 100 },
              { label: "Pool Health", value: 100 },
            ],
          });
        }
      })
      .catch(() => {});

    // Also check TrueNAS pools for health
    fetchJsonSafely(`${API_BASE}/api/truenas/pools`, { headers: authHeaders })
      .then(res => {
        if (res.ok && res.data) {
          const pools = Array.isArray(res.data) ? res.data : [];
          const healthyCount = pools.filter((p: any) => p.healthy !== false && p.status !== 'DEGRADED').length;
          const healthPct = pools.length > 0 ? Math.round((healthyCount / pools.length) * 100) : 0;
          setTruenas(prev => ({
            ...prev,
            metrics: prev.metrics.map(m => m.label === "Pool Health" ? { ...m, value: healthPct } : m),
          }));
        }
      })
      .catch(() => {});

    // Proxmox
    fetchJsonSafely(`${API_BASE}/api/proxmox/nodes`, { headers: authHeaders })
      .then(res => {
        if (res.ok && res.data) {
          const nodes = (res.data as any)?.data || [];
          if (nodes.length > 0) {
            const node = nodes[0];
            const cpuPct = Math.round((node.cpu || 0) * 100);
            const ramMax = Math.round((node.maxmem || 0) / 1073741824);
            const ramUsed = Math.round((node.mem || 0) / 1073741824);
            const diskMax = Math.round((node.maxdisk || 0) / 1073741824);
            const diskUsed = Math.round((node.disk || 0) / 1073741824);
            setProxmox({
              status: node.status === "online" ? "online" : "warning",
              metrics: [
                { label: "CPU", value: cpuPct },
                { label: "RAM", value: ramUsed, max: ramMax, unit: "GB" },
                { label: "Storage", value: diskUsed, max: diskMax, unit: "GB" },
              ],
            });
          }
        }
      })
      .catch(() => {});

    // UniFi
    Promise.all([
      fetchJsonSafely(`${API_BASE}/api/unifi/health`, { headers: authHeaders }),
      fetchJsonSafely(`${API_BASE}/api/unifi/clients`, { headers: authHeaders }),
    ]).then(([healthRes, clientsRes]) => {
      const subsystems = healthRes.ok ? ((healthRes.data as any)?.data || []) : [];
      const clients = clientsRes.ok ? ((clientsRes.data as any)?.data || []) : [];
      const wan = subsystems.find((s: any) => s.subsystem === 'wan');
      const wlan = subsystems.find((s: any) => s.subsystem === 'wlan');

      if (subsystems.length > 0 || clients.length > 0) {
        const txRate = wan?.tx_bytes_r ? Math.round(wan.tx_bytes_r * 8 / 1000000) : 0;
        const rxRate = wan?.rx_bytes_r ? Math.round(wan.rx_bytes_r * 8 / 1000000) : 0;
        const bandwidth = txRate + rxRate;
        const uptimePct = wan?.status === 'ok' ? 100 : wan ? 50 : 0;

        setUnifi({
          status: wan?.status === 'ok' ? "online" : subsystems.length > 0 ? "warning" : "offline",
          metrics: [
            { label: "Båndbredde", value: bandwidth, max: 1000, unit: "Mbps" },
            { label: "Aktive Enheter", value: clients.length, max: Math.max(50, clients.length), unit: "" },
            { label: "Uptime", value: uptimePct, unit: "%" },
          ],
        });
      }
    }).catch(() => {});
  }, [authHeaders]);

  return (
    <div className="space-y-6">
      <SystemCard
        title="TrueNAS Scale"
        icon={Database}
        status={truenas.status}
        metrics={truenas.metrics}
        className="animate-fade-in [animation-delay:400ms]"
      />
      <SystemCard
        title="Proxmox VE"
        icon={Server}
        status={proxmox.status}
        metrics={proxmox.metrics}
        className="animate-fade-in [animation-delay:500ms]"
      />
      <SystemCard
        title="UniFi Network"
        icon={Activity}
        status={unifi.status}
        metrics={unifi.metrics}
        className="animate-fade-in [animation-delay:600ms]"
      />
    </div>
  );
}
