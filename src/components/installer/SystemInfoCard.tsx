import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { Cpu, MemoryStick, HardDrive, Monitor, Clock, Server } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface SystemInfo {
  os: string;
  hostname: string;
  uptime: string;
  kernel: string;
  arch: string;
  cpu: { model: string; cores: number; usage: number };
  ram: { total: number; used: number; free: number };
  disk: { total: number; used: number };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function SystemInfoCard() {
  const { token } = useAuth();
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/system/info`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setInfo(await res.json());
        } else {
          setInfo(null);
        }
      } catch {
        setInfo(null);
      }
    };

    fetchInfo();
    const interval = setInterval(fetchInfo, 30000);
    return () => clearInterval(interval);
  }, [token]);

  if (!info) return null;

  const ramPercent = Math.round((info.ram.used / info.ram.total) * 100);
  const diskPercent = info.disk.total > 0 ? Math.round((info.disk.used / info.disk.total) * 100) : 0;

  const metrics = [
    {
      icon: Cpu,
      label: "CPU",
      value: `${info.cpu.usage}%`,
      detail: `${info.cpu.model.substring(0, 35)}${info.cpu.model.length > 35 ? "…" : ""} (${info.cpu.cores} kjerner)`,
      percent: info.cpu.usage,
      color: info.cpu.usage > 80 ? "text-destructive" : info.cpu.usage > 60 ? "text-warning" : "text-primary",
    },
    {
      icon: MemoryStick,
      label: "RAM",
      value: `${formatBytes(info.ram.used)} / ${formatBytes(info.ram.total)}`,
      detail: `${formatBytes(info.ram.free)} ledig`,
      percent: ramPercent,
      color: ramPercent > 85 ? "text-destructive" : ramPercent > 70 ? "text-warning" : "text-primary",
    },
    {
      icon: HardDrive,
      label: "Disk",
      value: `${formatBytes(info.disk.used)} / ${formatBytes(info.disk.total)}`,
      detail: `${formatBytes(info.disk.total - info.disk.used)} ledig`,
      percent: diskPercent,
      color: diskPercent > 90 ? "text-destructive" : diskPercent > 75 ? "text-warning" : "text-primary",
    },
  ];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" />
            Systeminformasjon
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Oppetid: {info.uptime}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* OS info row */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 font-mono text-xs">
            <Server className="h-3 w-3" />
            {info.hostname}
          </Badge>
          <Badge variant="secondary" className="text-xs">{info.os}</Badge>
          <Badge variant="secondary" className="text-xs font-mono">{info.kernel}</Badge>
          <Badge variant="secondary" className="text-xs">{info.arch}</Badge>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${m.color}`} />
                    <span className="text-sm font-medium">{m.label}</span>
                  </div>
                  <span className={`text-sm font-mono ${m.color}`}>
                    {m.label === "CPU" ? m.value : `${m.percent}%`}
                  </span>
                </div>
                <Progress value={m.percent} className="h-2" />
                <p className="text-xs text-muted-foreground truncate" title={m.detail}>
                  {m.value !== `${m.percent}%` && m.label !== "CPU" ? m.value : m.detail}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
