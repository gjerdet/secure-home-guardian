import { useState } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Server, Cpu, MemoryStick, HardDrive, Play, Square, 
  RotateCcw, Monitor, Box, Clock, Activity, Database, Shield
} from "lucide-react";
import { VMDetailDialog } from "@/components/dialogs/VMDetailDialog";

const vms: any[] = [];
const containers: any[] = [];
const storageNodes: any[] = [];

const nodeStats = {
  hostname: "—",
  version: "Ikke tilkoblet",
  kernel: "—",
  cpu: { model: "—", cores: 0, threads: 0, usage: 0 },
  memory: { used: 0, total: 0 },
  storage: { used: 0, total: 0 },
  uptime: "—",
};

const clusterNodes: any[] = [];

interface SelectedVM {
  id: string;
  name: string;
  status: string;
  cpu: number;
  memory: { used: number; total: number };
  disk: number;
  uptime: string;
  type: "vm" | "lxc";
  os?: string;
  image?: string;
  cores?: number;
  network?: { ip?: string; bridge?: string };
  snapshots?: number;
  backup?: string;
}

export default function Proxmox() {
  const [selectedVM, setSelectedVM] = useState<SelectedVM | null>(null);

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
          <Badge className="ml-auto bg-muted text-muted-foreground border-border">Ikke tilkoblet</Badge>
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
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><Cpu className="h-3 w-3" />CPU ({nodeStats.cpu.cores}C/{nodeStats.cpu.threads}T)</div>
                <p className="text-2xl font-mono font-bold text-foreground mb-2">{nodeStats.cpu.usage}%</p>
                <Progress value={nodeStats.cpu.usage} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">{nodeStats.cpu.model}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><MemoryStick className="h-3 w-3" />RAM</div>
                <p className="text-2xl font-mono font-bold text-foreground mb-2">{nodeStats.memory.used} GB</p>
                <Progress value={(nodeStats.memory.used / nodeStats.memory.total) * 100} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">/ {nodeStats.memory.total} GB</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><HardDrive className="h-3 w-3" />Lagring</div>
                <p className="text-2xl font-mono font-bold text-foreground mb-2">{nodeStats.storage.used} GB</p>
                <Progress value={(nodeStats.storage.used / nodeStats.storage.total) * 100} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">/ {nodeStats.storage.total} GB</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><Clock className="h-3 w-3" />Uptime</div>
                <p className="text-2xl font-mono font-bold text-foreground">{nodeStats.uptime}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Kernel: {nodeStats.kernel}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="vms" className="space-y-4">
          <TabsList className="bg-muted flex-wrap">
            <TabsTrigger value="vms" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Monitor className="h-4 w-4 mr-2" />
              VMs ({vms.length})
            </TabsTrigger>
            <TabsTrigger value="containers" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Box className="h-4 w-4 mr-2" />
              LXC ({containers.length})
            </TabsTrigger>
            <TabsTrigger value="storage" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Database className="h-4 w-4 mr-2" />
              Lagring
            </TabsTrigger>
            <TabsTrigger value="cluster" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              Cluster
            </TabsTrigger>
          </TabsList>

          {/* VMs Tab */}
          <TabsContent value="vms">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {vms.map((vm) => (
                      <div key={vm.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedVM({ ...vm, type: "vm" })}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`rounded-lg p-2 ${vm.status === "running" ? "bg-success/10" : "bg-muted"}`}>
                              <Monitor className={`h-4 w-4 ${vm.status === "running" ? "text-success" : "text-muted-foreground"}`} />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{vm.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">VMID: {vm.id} • {vm.os} • {vm.cores} kjerner</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {vm.network?.ip && <span className="text-xs text-muted-foreground font-mono">{vm.network.ip}</span>}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                              {vm.status === "running" ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {vm.status === "running" && (
                          <div className="grid grid-cols-4 gap-3 text-xs">
                            <div>
                              <div className="flex justify-between mb-1"><span className="text-muted-foreground">CPU</span><span className={`font-mono ${vm.cpu > 80 ? "text-warning" : "text-foreground"}`}>{vm.cpu}%</span></div>
                              <Progress value={vm.cpu} className="h-1" />
                            </div>
                            <div>
                              <div className="flex justify-between mb-1"><span className="text-muted-foreground">RAM</span><span className="font-mono text-foreground">{vm.memory.used}/{vm.memory.total}GB</span></div>
                              <Progress value={(vm.memory.used / vm.memory.total) * 100} className="h-1" />
                            </div>
                            <div>
                              <span className="text-muted-foreground">Disk:</span>
                              <p className="font-mono text-foreground">{vm.disk} GB</p>
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
          </TabsContent>

          {/* LXC Tab */}
          <TabsContent value="containers">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {containers.map((ct) => (
                      <div key={ct.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedVM({ ...ct, type: "lxc", os: undefined })}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg p-2 bg-success/10">
                              <Box className="h-4 w-4 text-success" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{ct.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">CTID: {ct.id} • {ct.network?.ip}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                              <Square className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <div className="flex justify-between mb-1"><span className="text-muted-foreground">CPU</span><span className="font-mono text-foreground">{ct.cpu}%</span></div>
                            <Progress value={ct.cpu} className="h-1" />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1"><span className="text-muted-foreground">RAM</span><span className="font-mono text-foreground">{ct.memory.used}/{ct.memory.total}MB</span></div>
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
          </TabsContent>

          {/* Storage Tab */}
          <TabsContent value="storage">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-5 w-5 text-primary" />
                  Lagringsressurser ({storageNodes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {storageNodes.map((s) => (
                    <div key={s.name} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium text-foreground font-mono">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.content}</p>
                        </div>
                        <Badge variant="outline" className="font-mono text-[10px]">{s.type}</Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <Progress value={(s.used / s.total) * 100} className="h-2 flex-1" />
                        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{s.used} / {s.total} GB</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cluster Tab */}
          <TabsContent value="cluster">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="h-5 w-5 text-primary" />
                  Cluster Noder ({clusterNodes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {clusterNodes.map((node) => (
                    <div key={node.name} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`rounded-lg p-2 ${node.status === "online" ? "bg-success/10" : "bg-destructive/10"}`}>
                            <Server className={`h-4 w-4 ${node.status === "online" ? "text-success" : "text-destructive"}`} />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{node.name}</p>
                            <p className="text-xs text-muted-foreground">{node.role === "master" ? "Master node" : "Worker node"}</p>
                          </div>
                        </div>
                        <Badge variant={node.status === "online" ? "default" : "destructive"} className="text-[10px]">
                          {node.status === "online" ? "Online" : "Offline"}
                        </Badge>
                      </div>
                      {node.status === "online" && (
                        <div className="grid grid-cols-4 gap-3 text-xs">
                          <div>
                            <div className="flex justify-between mb-1"><span className="text-muted-foreground">CPU</span><span className="font-mono text-foreground">{node.cpu}%</span></div>
                            <Progress value={node.cpu} className="h-1" />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1"><span className="text-muted-foreground">RAM</span><span className="font-mono text-foreground">{node.ram.used}/{node.ram.total}GB</span></div>
                            <Progress value={(node.ram.used / node.ram.total) * 100} className="h-1" />
                          </div>
                          <div><span className="text-muted-foreground">VMs:</span><p className="font-mono text-foreground">{node.vms}</p></div>
                          <div><span className="text-muted-foreground">CTs:</span><p className="font-mono text-foreground">{node.cts}</p></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <VMDetailDialog
        vm={selectedVM}
        open={!!selectedVM}
        onOpenChange={(open) => !open && setSelectedVM(null)}
      />
    </div>
  );
}
