import { useState } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  HardDrive, Database, Clock, CheckCircle, AlertTriangle,
  Thermometer, Activity, Server, FolderOpen, Container, Share2, 
  Play, Square, RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

const pools = [
  {
    name: "tank",
    status: "ONLINE",
    health: 100,
    used: 18.7,
    total: 64,
    compression: "lz4",
    dedup: false,
    disks: [
      { name: "da0", status: "ONLINE", size: "16TB", temp: 32, errors: 0 },
      { name: "da1", status: "ONLINE", size: "16TB", temp: 34, errors: 0 },
      { name: "da2", status: "ONLINE", size: "16TB", temp: 33, errors: 0 },
      { name: "da3", status: "ONLINE", size: "16TB", temp: 35, errors: 0 },
    ],
  },
  {
    name: "ssd-pool",
    status: "ONLINE",
    health: 100,
    used: 0.8,
    total: 2,
    compression: "zstd",
    dedup: true,
    disks: [
      { name: "nvme0", status: "ONLINE", size: "1TB", temp: 42, errors: 0 },
      { name: "nvme1", status: "ONLINE", size: "1TB", temp: 44, errors: 0 },
    ],
  },
];

const datasets = [
  { name: "tank/media", used: "12.3 TB", quota: "20 TB", snapshots: 24, compression: "1.8x", mountpoint: "/mnt/tank/media", recordsize: "1M", atime: "off" },
  { name: "tank/backups", used: "4.2 TB", quota: "10 TB", snapshots: 168, compression: "2.1x", mountpoint: "/mnt/tank/backups", recordsize: "128K", atime: "off" },
  { name: "tank/documents", used: "856 GB", quota: "2 TB", snapshots: 48, compression: "3.2x", mountpoint: "/mnt/tank/documents", recordsize: "128K", atime: "on" },
  { name: "tank/vms", used: "1.4 TB", quota: "5 TB", snapshots: 12, compression: "1.2x", mountpoint: "/mnt/tank/vms", recordsize: "64K", atime: "off" },
  { name: "ssd-pool/cache", used: "420 GB", quota: "800 GB", snapshots: 0, compression: "1.0x", mountpoint: "/mnt/ssd-pool/cache", recordsize: "16K", atime: "off" },
];

const recentSnapshots = [
  { name: "tank/backups@auto-2024-12-17_03-00", created: "2024-12-17 03:00", size: "2.1 GB", type: "auto" },
  { name: "tank/documents@auto-2024-12-17_03-00", created: "2024-12-17 03:00", size: "124 MB", type: "auto" },
  { name: "tank/vms@manual-pre-update", created: "2024-12-16 18:30", size: "4.8 GB", type: "manual" },
  { name: "tank/media@auto-2024-12-17_03-00", created: "2024-12-17 03:00", size: "0 B", type: "auto" },
];

const dockerContainers = [
  { id: "abc123", name: "plex", image: "plexinc/pms-docker:latest", status: "running", cpu: 12, memory: "2.1 GB", ports: "32400:32400", uptime: "30d 8h" },
  { id: "def456", name: "nextcloud", image: "nextcloud:28", status: "running", cpu: 4, memory: "512 MB", ports: "8080:80", uptime: "15d 3h" },
  { id: "ghi789", name: "homeassistant", image: "ghcr.io/home-assistant/home-assistant:stable", status: "running", cpu: 3, memory: "384 MB", ports: "8123:8123", uptime: "30d 8h" },
  { id: "jkl012", name: "pihole", image: "pihole/pihole:latest", status: "running", cpu: 1, memory: "128 MB", ports: "53:53, 80:80", uptime: "30d 8h" },
  { id: "mno345", name: "wireguard", image: "linuxserver/wireguard", status: "stopped", cpu: 0, memory: "0 MB", ports: "51820:51820/udp", uptime: "-" },
];

const shares = [
  { name: "Media", path: "/mnt/tank/media", type: "SMB", enabled: true, users: 4, description: "Film og musikk" },
  { name: "Backups", path: "/mnt/tank/backups", type: "SMB", enabled: true, users: 2, description: "Sikkerhetskopiering" },
  { name: "Documents", path: "/mnt/tank/documents", type: "NFS", enabled: true, users: 8, description: "Felles dokumenter" },
  { name: "VM Storage", path: "/mnt/tank/vms", type: "iSCSI", enabled: true, users: 1, description: "VM disk lagring" },
  { name: "TimeMachine", path: "/mnt/tank/timemachine", type: "SMB", enabled: false, users: 0, description: "macOS backup" },
];

const systemStats = {
  cpu: 23,
  memory: { used: 48, total: 64 },
  uptime: "45 days 12:34:56",
  version: "TrueNAS SCALE 24.04.2",
};

interface DatasetType {
  name: string;
  used: string;
  quota: string;
  snapshots: number;
  compression: string;
  mountpoint: string;
  recordsize: string;
  atime: string;
}

export default function TrueNAS() {
  const [selectedDataset, setSelectedDataset] = useState<DatasetType | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<typeof dockerContainers[0] | null>(null);

  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-primary/10 p-3">
            <HardDrive className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">TrueNAS Scale</h1>
            <p className="text-sm text-muted-foreground">{systemStats.version} • Uptime: {systemStats.uptime}</p>
          </div>
          <Badge className="ml-auto bg-success/10 text-success border-success/20">Online</Badge>
        </div>

        {/* System Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                <Activity className="h-3 w-3" />
                CPU
              </div>
              <p className="text-2xl font-mono font-bold text-foreground mb-2">{systemStats.cpu}%</p>
              <Progress value={systemStats.cpu} className="h-1.5" />
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                <Server className="h-3 w-3" />
                RAM
              </div>
              <p className="text-2xl font-mono font-bold text-foreground mb-2">{systemStats.memory.used} GB</p>
              <Progress value={(systemStats.memory.used / systemStats.memory.total) * 100} className="h-1.5" />
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                <Database className="h-3 w-3" />
                Total Lagring
              </div>
              <p className="text-2xl font-mono font-bold text-foreground">66 TB</p>
              <p className="text-xs text-muted-foreground">2 pools</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                <Container className="h-3 w-3" />
                Docker
              </div>
              <p className="text-2xl font-mono font-bold text-foreground">{dockerContainers.filter(c => c.status === "running").length}/{dockerContainers.length}</p>
              <p className="text-xs text-muted-foreground">containere kjører</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="pools" className="space-y-4">
          <TabsList className="bg-muted flex-wrap">
            <TabsTrigger value="pools" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Database className="h-4 w-4 mr-2" />
              Pools
            </TabsTrigger>
            <TabsTrigger value="datasets" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FolderOpen className="h-4 w-4 mr-2" />
              Datasets
            </TabsTrigger>
            <TabsTrigger value="snapshots" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Clock className="h-4 w-4 mr-2" />
              Snapshots
            </TabsTrigger>
            <TabsTrigger value="docker" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Container className="h-4 w-4 mr-2" />
              Docker
            </TabsTrigger>
            <TabsTrigger value="shares" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Share2 className="h-4 w-4 mr-2" />
              Deling
            </TabsTrigger>
          </TabsList>

          {/* Pools Tab */}
          <TabsContent value="pools">
            <div className="space-y-4">
              {pools.map((pool) => (
                <Card key={pool.name} className="bg-card border-border">
                  <CardHeader className="border-b border-border">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        {pool.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-success/10 text-success border-success/20">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {pool.status}
                        </Badge>
                        <Badge variant="outline">Health: {pool.health}%</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Brukt: {pool.used} TB / {pool.total} TB</span>
                        <span className="font-mono text-foreground">{((pool.used / pool.total) * 100).toFixed(1)}%</span>
                      </div>
                      <Progress value={(pool.used / pool.total) * 100} className="h-2" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
                      <div><span className="text-muted-foreground">Komprimering:</span><p className="font-mono text-foreground">{pool.compression}</p></div>
                      <div><span className="text-muted-foreground">Dedup:</span><p className="font-mono text-foreground">{pool.dedup ? "Aktivert" : "Deaktivert"}</p></div>
                      <div><span className="text-muted-foreground">Disker:</span><p className="font-mono text-foreground">{pool.disks.length} stk</p></div>
                      <div><span className="text-muted-foreground">Tilgjengelig:</span><p className="font-mono text-foreground">{(pool.total - pool.used).toFixed(1)} TB</p></div>
                    </div>
                    <div className="border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground mb-2">Disker:</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {pool.disks.map((disk) => (
                          <div key={disk.name} className="bg-muted/50 rounded-md p-2 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono font-medium text-foreground">{disk.name}</span>
                              <Badge variant="outline" className="text-[10px] px-1">{disk.status}</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span>{disk.size}</span>
                              <span className="flex items-center gap-0.5"><Thermometer className="h-3 w-3" />{disk.temp}°C</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Datasets Tab */}
          <TabsContent value="datasets">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border">
                    {datasets.map((ds) => (
                      <div key={ds.name} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedDataset(ds)}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-mono font-medium text-foreground">{ds.name}</p>
                          <Badge variant="outline">{ds.snapshots} snapshots</Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-4 text-xs">
                          <div><span className="text-muted-foreground">Brukt:</span><p className="font-mono text-foreground">{ds.used}</p></div>
                          <div><span className="text-muted-foreground">Kvote:</span><p className="font-mono text-foreground">{ds.quota}</p></div>
                          <div><span className="text-muted-foreground">Komprimering:</span><p className="font-mono text-foreground">{ds.compression}</p></div>
                          <div><span className="text-muted-foreground">Mountpoint:</span><p className="font-mono text-foreground truncate">{ds.mountpoint}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Snapshots Tab */}
          <TabsContent value="snapshots">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border">
                    {recentSnapshots.map((snap) => (
                      <div key={snap.name} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-mono text-sm text-foreground">{snap.name}</p>
                          <Badge variant={snap.type === "auto" ? "secondary" : "outline"}>{snap.type}</Badge>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{snap.created}</span>
                          <span>Størrelse: {snap.size}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Docker Tab */}
          <TabsContent value="docker">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Container className="h-5 w-5 text-primary" />
                  Docker Containere ({dockerContainers.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border">
                    {dockerContainers.map((ct) => (
                      <div key={ct.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedContainer(ct)}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={`rounded-lg p-2 ${ct.status === "running" ? "bg-success/10" : "bg-muted"}`}>
                              <Container className={`h-4 w-4 ${ct.status === "running" ? "text-success" : "text-muted-foreground"}`} />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{ct.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{ct.image}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={ct.status === "running" ? "default" : "secondary"} className="text-[10px]">
                              {ct.status === "running" ? "Kjører" : "Stoppet"}
                            </Badge>
                          </div>
                        </div>
                        {ct.status === "running" && (
                          <div className="grid grid-cols-4 gap-3 text-xs ml-11">
                            <div><span className="text-muted-foreground">CPU:</span><span className="font-mono text-foreground ml-1">{ct.cpu}%</span></div>
                            <div><span className="text-muted-foreground">RAM:</span><span className="font-mono text-foreground ml-1">{ct.memory}</span></div>
                            <div><span className="text-muted-foreground">Porter:</span><span className="font-mono text-foreground ml-1">{ct.ports}</span></div>
                            <div><span className="text-muted-foreground">Oppetid:</span><span className="font-mono text-foreground ml-1">{ct.uptime}</span></div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Shares Tab */}
          <TabsContent value="shares">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Share2 className="h-5 w-5 text-primary" />
                  Delte ressurser ({shares.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border">
                    {shares.map((share) => (
                      <div key={share.name} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={`rounded-lg p-2 ${share.enabled ? "bg-primary/10" : "bg-muted"}`}>
                              <Share2 className={`h-4 w-4 ${share.enabled ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{share.name}</p>
                              <p className="text-xs text-muted-foreground">{share.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[10px]">{share.type}</Badge>
                            <Badge variant={share.enabled ? "default" : "secondary"} className="text-[10px]">
                              {share.enabled ? "Aktiv" : "Deaktivert"}
                            </Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs ml-11">
                          <div><span className="text-muted-foreground">Sti:</span><span className="font-mono text-foreground ml-1">{share.path}</span></div>
                          <div><span className="text-muted-foreground">Brukere:</span><span className="font-mono text-foreground ml-1">{share.users}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Dataset Detail Dialog */}
      <Dialog open={!!selectedDataset} onOpenChange={(open) => !open && setSelectedDataset(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              {selectedDataset?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedDataset && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Brukt</p>
                  <p className="font-mono font-bold text-foreground">{selectedDataset.used}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Kvote</p>
                  <p className="font-mono font-bold text-foreground">{selectedDataset.quota}</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Mountpoint</span><span className="font-mono text-foreground text-xs">{selectedDataset.mountpoint}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Komprimering</span><span className="font-mono text-foreground">{selectedDataset.compression}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Recordsize</span><span className="font-mono text-foreground">{selectedDataset.recordsize}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Atime</span><span className="font-mono text-foreground">{selectedDataset.atime}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Snapshots</span><Badge variant="outline">{selectedDataset.snapshots}</Badge></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Docker Container Detail Dialog */}
      <Dialog open={!!selectedContainer} onOpenChange={(open) => !open && setSelectedContainer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${selectedContainer?.status === "running" ? "bg-success/10" : "bg-muted"}`}>
                <Container className={`h-5 w-5 ${selectedContainer?.status === "running" ? "text-success" : "text-muted-foreground"}`} />
              </div>
              <div>
                <span>{selectedContainer?.name}</span>
                <div className="mt-1">
                  <Badge variant={selectedContainer?.status === "running" ? "default" : "secondary"} className="text-[10px]">
                    {selectedContainer?.status === "running" ? "Kjører" : "Stoppet"}
                  </Badge>
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedContainer && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">Image: <span className="text-foreground font-mono text-xs">{selectedContainer.image}</span></p>
                <p className="text-muted-foreground mt-1">Container ID: <span className="text-foreground font-mono text-xs">{selectedContainer.id}</span></p>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">CPU</span><span className="font-mono text-foreground">{selectedContainer.cpu}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Minne</span><span className="font-mono text-foreground">{selectedContainer.memory}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Porter</span><span className="font-mono text-foreground text-xs">{selectedContainer.ports}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Oppetid</span><span className="font-mono text-foreground">{selectedContainer.uptime}</span></div>
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button size="sm" variant={selectedContainer.status === "running" ? "destructive" : "default"} className="flex-1">
                  {selectedContainer.status === "running" ? <Square className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                  {selectedContainer.status === "running" ? "Stopp" : "Start"}
                </Button>
                {selectedContainer.status === "running" && (
                  <Button size="sm" variant="outline">
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Restart
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
