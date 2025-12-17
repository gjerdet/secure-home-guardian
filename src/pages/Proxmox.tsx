import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { 
  Server, Cpu, MemoryStick, HardDrive, Play, Square, 
  RotateCcw, Monitor, Box, Clock, Activity
} from "lucide-react";

const vms = [
  { id: "100", name: "docker-host", status: "running", cpu: 82, memory: { used: 12, total: 16 }, disk: 120, uptime: "12d 4h 23m", os: "Ubuntu 22.04" },
  { id: "101", name: "windows-server", status: "running", cpu: 15, memory: { used: 8, total: 16 }, disk: 256, uptime: "5d 2h 10m", os: "Windows Server 2022" },
  { id: "102", name: "dev-machine", status: "stopped", cpu: 0, memory: { used: 0, total: 8 }, disk: 64, uptime: "-", os: "Debian 12" },
  { id: "103", name: "backup-server", status: "running", cpu: 5, memory: { used: 2, total: 4 }, disk: 32, uptime: "45d 12h 5m", os: "Ubuntu 22.04" },
];

const containers = [
  { id: "200", name: "pihole", status: "running", cpu: 2, memory: { used: 256, total: 512 }, uptime: "30d 8h", image: "pihole/pihole:latest" },
  { id: "201", name: "nginx-proxy", status: "running", cpu: 1, memory: { used: 128, total: 256 }, uptime: "30d 8h", image: "nginx:alpine" },
  { id: "202", name: "prometheus", status: "running", cpu: 8, memory: { used: 512, total: 1024 }, uptime: "15d 3h", image: "prom/prometheus" },
  { id: "203", name: "grafana", status: "running", cpu: 3, memory: { used: 384, total: 512 }, uptime: "15d 3h", image: "grafana/grafana" },
];

const nodeStats = {
  hostname: "proxmox-01",
  version: "Proxmox VE 8.1.3",
  kernel: "6.5.11-7-pve",
  cpu: { model: "AMD Ryzen 9 5900X", cores: 12, threads: 24, usage: 45 },
  memory: { used: 28, total: 64 },
  storage: { used: 456, total: 1000 },
  uptime: "45 days",
};

export default function Proxmox() {
  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-warning/10 p-3">
            <Server className="h-6 w-6 text-warning" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Proxmox VE</h1>
            <p className="text-sm text-muted-foreground">{nodeStats.hostname} • {nodeStats.version}</p>
          </div>
          <Badge className="ml-auto bg-warning/10 text-warning border-warning/20">Høy CPU</Badge>
        </div>

        {/* Node Stats */}
        <Card className="bg-card border-border mb-6">
          <CardHeader className="border-b border-border py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Node Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                  <Cpu className="h-3 w-3" />
                  CPU ({nodeStats.cpu.cores}C/{nodeStats.cpu.threads}T)
                </div>
                <p className="text-2xl font-mono font-bold text-foreground mb-2">{nodeStats.cpu.usage}%</p>
                <Progress value={nodeStats.cpu.usage} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">{nodeStats.cpu.model}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                  <MemoryStick className="h-3 w-3" />
                  RAM
                </div>
                <p className="text-2xl font-mono font-bold text-foreground mb-2">{nodeStats.memory.used} GB</p>
                <Progress value={(nodeStats.memory.used / nodeStats.memory.total) * 100} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">/ {nodeStats.memory.total} GB</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                  <HardDrive className="h-3 w-3" />
                  Lagring
                </div>
                <p className="text-2xl font-mono font-bold text-foreground mb-2">{nodeStats.storage.used} GB</p>
                <Progress value={(nodeStats.storage.used / nodeStats.storage.total) * 100} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">/ {nodeStats.storage.total} GB</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                  <Clock className="h-3 w-3" />
                  Uptime
                </div>
                <p className="text-2xl font-mono font-bold text-foreground">{nodeStats.uptime}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Kernel: {nodeStats.kernel}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* VMs */}
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-primary" />
                Virtuelle Maskiner ({vms.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <div className="divide-y divide-border">
                  {vms.map((vm) => (
                    <div key={vm.id} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`rounded-lg p-2 ${vm.status === "running" ? "bg-success/10" : "bg-muted"}`}>
                            <Monitor className={`h-4 w-4 ${vm.status === "running" ? "text-success" : "text-muted-foreground"}`} />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{vm.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">VMID: {vm.id} • {vm.os}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            {vm.status === "running" ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {vm.status === "running" && (
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-muted-foreground">CPU</span>
                              <span className={`font-mono ${vm.cpu > 80 ? "text-warning" : "text-foreground"}`}>{vm.cpu}%</span>
                            </div>
                            <Progress value={vm.cpu} className="h-1" />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-muted-foreground">RAM</span>
                              <span className="font-mono text-foreground">{vm.memory.used}/{vm.memory.total}GB</span>
                            </div>
                            <Progress value={(vm.memory.used / vm.memory.total) * 100} className="h-1" />
                          </div>
                          <div>
                            <span className="text-muted-foreground">Uptime:</span>
                            <p className="font-mono text-foreground">{vm.uptime}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Containers */}
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <Box className="h-5 w-5 text-primary" />
                LXC Containere ({containers.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <div className="divide-y divide-border">
                  {containers.map((ct) => (
                    <div key={ct.id} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg p-2 bg-success/10">
                            <Box className="h-4 w-4 text-success" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{ct.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">CTID: {ct.id}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Square className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-muted-foreground">CPU</span>
                            <span className="font-mono text-foreground">{ct.cpu}%</span>
                          </div>
                          <Progress value={ct.cpu} className="h-1" />
                        </div>
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-muted-foreground">RAM</span>
                            <span className="font-mono text-foreground">{ct.memory.used}/{ct.memory.total}MB</span>
                          </div>
                          <Progress value={(ct.memory.used / ct.memory.total) * 100} className="h-1" />
                        </div>
                        <div>
                          <span className="text-muted-foreground">Uptime:</span>
                          <p className="font-mono text-foreground">{ct.uptime}</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2 font-mono">{ct.image}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
