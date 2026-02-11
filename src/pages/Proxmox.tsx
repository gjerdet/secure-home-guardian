import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Server, Cpu, MemoryStick, HardDrive, Play, Square, 
  RotateCcw, Monitor, Box, Clock, Activity, Database, Shield,
  Loader2, RefreshCw, AlertTriangle
} from "lucide-react";
import { VMDetailDialog } from "@/components/dialogs/VMDetailDialog";
import { API_BASE, fetchJsonSafely } from "@/lib/api";
import { toast } from "sonner";

interface SelectedVM {
  id: string;
  name: string;
  status: string;
  cpu: number;
  memory: { used: number; total: number };
  disk: number;
  uptime: string;
  type: "vm" | "lxc";
  node?: string;
  os?: string;
  image?: string;
  cores?: number;
  network?: { ip?: string; bridge?: string };
  snapshots?: number;
  backup?: string;
}

function formatUptime(seconds: number): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}t`;
  if (h > 0) return `${h}t ${m}m`;
  return `${m}m`;
}

function bytesToGB(bytes: number): number {
  return Math.round((bytes / 1073741824) * 10) / 10;
}

function bytesToMB(bytes: number): number {
  return Math.round((bytes / 1048576) * 10) / 10;
}

export default function Proxmox() {
  const [selectedVM, setSelectedVM] = useState<SelectedVM | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [vms, setVms] = useState<any[]>([]);
  const [containers, setContainers] = useState<any[]>([]);
  const [storageNodes, setStorageNodes] = useState<any[]>([]);
  const [clusterNodes, setClusterNodes] = useState<any[]>([]);
  const [nodeStats, setNodeStats] = useState({
    hostname: "—",
    version: "Laster...",
    kernel: "—",
    cpu: { model: "—", cores: 0, threads: 0, usage: 0 },
    memory: { used: 0, total: 0 },
    storage: { used: 0, total: 0 },
    uptime: "—",
  });
  const [connected, setConnected] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nodesRes, vmsRes, containersRes, storageRes, clusterRes] = await Promise.all([
        fetchJsonSafely(`${API_BASE}/api/proxmox/nodes`),
        fetchJsonSafely(`${API_BASE}/api/proxmox/vms`),
        fetchJsonSafely(`${API_BASE}/api/proxmox/containers`),
        fetchJsonSafely(`${API_BASE}/api/proxmox/storage`),
        fetchJsonSafely(`${API_BASE}/api/proxmox/cluster`),
      ]);

      if (!nodesRes.ok) {
        setError(nodesRes.error || `Feil ${nodesRes.status}`);
        setConnected(false);
        setLoading(false);
        return;
      }

      setConnected(true);

      // Parse node stats from first node
      const nodes = nodesRes.data?.data || [];
      if (nodes.length > 0) {
        const n = nodes[0];
        setNodeStats({
          hostname: n.node || "—",
          version: `Proxmox VE`,
          kernel: "—",
          cpu: {
            model: n.cpu ? `${n.maxcpu} vCPUs` : "—",
            cores: n.maxcpu || 0,
            threads: n.maxcpu || 0,
            usage: Math.round((n.cpu || 0) * 100),
          },
          memory: {
            used: bytesToGB(n.mem || 0),
            total: bytesToGB(n.maxmem || 0),
          },
          storage: {
            used: bytesToGB(n.disk || 0),
            total: bytesToGB(n.maxdisk || 0),
          },
          uptime: formatUptime(n.uptime || 0),
        });
      }

      // Parse VMs
      if (vmsRes.ok && vmsRes.data?.data) {
        setVms(vmsRes.data.data.map((vm: any) => ({
          id: vm.vmid,
          name: vm.name || `VM ${vm.vmid}`,
          status: vm.status,
          cpu: Math.round((vm.cpu || 0) * 100),
          memory: {
            used: bytesToGB(vm.mem || 0),
            total: bytesToGB(vm.maxmem || 0),
          },
          disk: bytesToGB(vm.maxdisk || 0),
          uptime: formatUptime(vm.uptime || 0),
          os: vm.lock || "—",
          cores: vm.cpus || vm.maxcpu || 0,
          network: { ip: vm.netin ? "—" : undefined },
          node: vm.node,
        })));
      }

      // Parse containers
      if (containersRes.ok && containersRes.data?.data) {
        setContainers(containersRes.data.data.map((ct: any) => ({
          id: ct.vmid,
          name: ct.name || `CT ${ct.vmid}`,
          status: ct.status,
          cpu: Math.round((ct.cpu || 0) * 100),
          memory: {
            used: bytesToMB(ct.mem || 0),
            total: bytesToMB(ct.maxmem || 0),
          },
          uptime: formatUptime(ct.uptime || 0),
          image: ct.type || "lxc",
          network: { ip: "—" },
          node: ct.node,
        })));
      }

      // Parse storage
      if (storageRes.ok && storageRes.data?.data) {
        setStorageNodes(storageRes.data.data
          .filter((s: any) => s.active !== 0)
          .map((s: any) => ({
            name: s.storage,
            type: s.type,
            content: s.content || "—",
            used: bytesToGB(s.used || 0),
            total: bytesToGB(s.total || 0),
            node: s.node,
          })));
      }

      // Parse cluster
      if (clusterRes.ok && clusterRes.data?.data) {
        setClusterNodes(clusterRes.data.data
          .filter((c: any) => c.type === "node")
          .map((c: any) => ({
            name: c.name,
            status: c.online ? "online" : "offline",
            role: c.local ? "master" : "worker",
            cpu: 0,
            ram: { used: 0, total: 0 },
            vms: 0,
            cts: 0,
          })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukjent feil");
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleVMAction = async (node: string, vmid: string, action: string, type: "vm" | "lxc", e: React.MouseEvent) => {
    e.stopPropagation();
    const endpoint = type === "vm" 
      ? `${API_BASE}/api/proxmox/vms/${node}/${vmid}/${action}`
      : `${API_BASE}/api/proxmox/vms/${node}/${vmid}/${action}`;
    
    const res = await fetchJsonSafely(endpoint, { method: "POST" });
    if (res.ok) {
      toast.success(`${action} sendt til ${vmid}`);
      setTimeout(fetchData, 2000);
    } else {
      toast.error(res.error || `Feil ved ${action}`);
    }
  };

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
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Badge className={connected 
              ? "bg-success/10 text-success border-success/30" 
              : "bg-muted text-muted-foreground border-border"
            }>
              {loading ? "Laster..." : connected ? "Tilkoblet" : "Ikke tilkoblet"}
            </Badge>
          </div>
        </div>

        {error && (
          <Card className="bg-destructive/10 border-destructive/30 mb-6">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

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
                <Progress value={nodeStats.memory.total > 0 ? (nodeStats.memory.used / nodeStats.memory.total) * 100 : 0} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">/ {nodeStats.memory.total} GB</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><HardDrive className="h-3 w-3" />Lagring</div>
                <p className="text-2xl font-mono font-bold text-foreground mb-2">{nodeStats.storage.used} GB</p>
                <Progress value={nodeStats.storage.total > 0 ? (nodeStats.storage.used / nodeStats.storage.total) * 100 : 0} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">/ {nodeStats.storage.total} GB</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><Clock className="h-3 w-3" />Uptime</div>
                <p className="text-2xl font-mono font-bold text-foreground">{nodeStats.uptime}</p>
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
              Lagring ({storageNodes.length})
            </TabsTrigger>
            <TabsTrigger value="cluster" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              Cluster ({clusterNodes.length})
            </TabsTrigger>
          </TabsList>

          {/* VMs Tab */}
          <TabsContent value="vms">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {vms.length === 0 && !loading ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Ingen virtuelle maskiner funnet</p>
                    </div>
                  ) : (
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
                                <p className="text-xs text-muted-foreground font-mono">VMID: {vm.id} • {vm.cores} kjerner • {vm.node}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={vm.status === "running" ? "default" : "secondary"} className="text-[10px]">
                                {vm.status}
                              </Badge>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => handleVMAction(vm.node, vm.id, vm.status === "running" ? "stop" : "start", "vm", e)}>
                                {vm.status === "running" ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => handleVMAction(vm.node, vm.id, "reset", "vm", e)}>
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
                                <Progress value={vm.memory.total > 0 ? (vm.memory.used / vm.memory.total) * 100 : 0} className="h-1" />
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
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* LXC Tab */}
          <TabsContent value="containers">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {containers.length === 0 && !loading ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Box className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Ingen LXC-containere funnet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {containers.map((ct) => (
                        <div key={ct.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedVM({ ...ct, type: "lxc", os: undefined })}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`rounded-lg p-2 ${ct.status === "running" ? "bg-success/10" : "bg-muted"}`}>
                                <Box className={`h-4 w-4 ${ct.status === "running" ? "text-success" : "text-muted-foreground"}`} />
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{ct.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">CTID: {ct.id} • {ct.node}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={ct.status === "running" ? "default" : "secondary"} className="text-[10px]">
                                {ct.status}
                              </Badge>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => handleVMAction(ct.node, ct.id, ct.status === "running" ? "stop" : "start", "lxc", e)}>
                                {ct.status === "running" ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => handleVMAction(ct.node, ct.id, "reboot", "lxc", e)}>
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {ct.status === "running" && (
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div>
                                <div className="flex justify-between mb-1"><span className="text-muted-foreground">CPU</span><span className="font-mono text-foreground">{ct.cpu}%</span></div>
                                <Progress value={ct.cpu} className="h-1" />
                              </div>
                              <div>
                                <div className="flex justify-between mb-1"><span className="text-muted-foreground">RAM</span><span className="font-mono text-foreground">{ct.memory.used}/{ct.memory.total}MB</span></div>
                                <Progress value={ct.memory.total > 0 ? (ct.memory.used / ct.memory.total) * 100 : 0} className="h-1" />
                              </div>
                              <div>
                                <span className="text-muted-foreground">Uptime:</span>
                                <p className="font-mono text-foreground">{ct.uptime}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
                {storageNodes.length === 0 && !loading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Ingen lagringsressurser funnet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {storageNodes.map((s, i) => (
                      <div key={`${s.name}-${s.node}-${i}`} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-medium text-foreground font-mono">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.content} • {s.node}</p>
                          </div>
                          <Badge variant="outline" className="font-mono text-[10px]">{s.type}</Badge>
                        </div>
                        <div className="flex items-center gap-4">
                          <Progress value={s.total > 0 ? (s.used / s.total) * 100 : 0} className="h-2 flex-1" />
                          <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{s.used} / {s.total} GB</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                {clusterNodes.length === 0 && !loading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Ingen cluster-noder funnet (standalone-modus)</p>
                  </div>
                ) : (
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
                              <p className="text-xs text-muted-foreground">{node.role === "master" ? "Lokal node" : "Worker node"}</p>
                            </div>
                          </div>
                          <Badge variant={node.status === "online" ? "default" : "destructive"} className="text-[10px]">
                            {node.status === "online" ? "Online" : "Offline"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
