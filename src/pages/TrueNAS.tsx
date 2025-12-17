import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  HardDrive, Database, Clock, CheckCircle, AlertTriangle,
  Thermometer, Activity, Server, FolderOpen
} from "lucide-react";

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
  { name: "tank/media", used: "12.3 TB", quota: "20 TB", snapshots: 24, compression: "1.8x" },
  { name: "tank/backups", used: "4.2 TB", quota: "10 TB", snapshots: 168, compression: "2.1x" },
  { name: "tank/documents", used: "856 GB", quota: "2 TB", snapshots: 48, compression: "3.2x" },
  { name: "tank/vms", used: "1.4 TB", quota: "5 TB", snapshots: 12, compression: "1.2x" },
  { name: "ssd-pool/cache", used: "420 GB", quota: "800 GB", snapshots: 0, compression: "1.0x" },
];

const recentSnapshots = [
  { name: "tank/backups@auto-2024-12-17_03-00", created: "2024-12-17 03:00", size: "2.1 GB", type: "auto" },
  { name: "tank/documents@auto-2024-12-17_03-00", created: "2024-12-17 03:00", size: "124 MB", type: "auto" },
  { name: "tank/vms@manual-pre-update", created: "2024-12-16 18:30", size: "4.8 GB", type: "manual" },
  { name: "tank/media@auto-2024-12-17_03-00", created: "2024-12-17 03:00", size: "0 B", type: "auto" },
];

const systemStats = {
  cpu: 23,
  memory: { used: 48, total: 64 },
  uptime: "45 days 12:34:56",
  version: "TrueNAS SCALE 24.04.2",
};

export default function TrueNAS() {
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
                <FolderOpen className="h-3 w-3" />
                Datasets
              </div>
              <p className="text-2xl font-mono font-bold text-foreground">{datasets.length}</p>
              <p className="text-xs text-muted-foreground">{recentSnapshots.length} snapshots</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="pools" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="pools" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Database className="h-4 w-4 mr-2" />
              Storage Pools
            </TabsTrigger>
            <TabsTrigger value="datasets" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FolderOpen className="h-4 w-4 mr-2" />
              Datasets
            </TabsTrigger>
            <TabsTrigger value="snapshots" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Clock className="h-4 w-4 mr-2" />
              Snapshots
            </TabsTrigger>
          </TabsList>

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
                      <div>
                        <span className="text-muted-foreground">Komprimering:</span>
                        <p className="font-mono text-foreground">{pool.compression}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Dedup:</span>
                        <p className="font-mono text-foreground">{pool.dedup ? "Aktivert" : "Deaktivert"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Disker:</span>
                        <p className="font-mono text-foreground">{pool.disks.length} stk</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tilgjengelig:</span>
                        <p className="font-mono text-foreground">{(pool.total - pool.used).toFixed(1)} TB</p>
                      </div>
                    </div>
                    <div className="border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground mb-2">Disker:</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {pool.disks.map((disk) => (
                          <div key={disk.name} className="bg-muted/50 rounded-md p-2 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono font-medium text-foreground">{disk.name}</span>
                              <Badge variant="outline" className="text-[10px] px-1">
                                {disk.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span>{disk.size}</span>
                              <span className="flex items-center gap-0.5">
                                <Thermometer className="h-3 w-3" />
                                {disk.temp}°C
                              </span>
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

          <TabsContent value="datasets">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border">
                    {datasets.map((ds) => (
                      <div key={ds.name} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-mono font-medium text-foreground">{ds.name}</p>
                          <Badge variant="outline">{ds.snapshots} snapshots</Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-4 text-xs">
                          <div>
                            <span className="text-muted-foreground">Brukt:</span>
                            <p className="font-mono text-foreground">{ds.used}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Kvote:</span>
                            <p className="font-mono text-foreground">{ds.quota}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Komprimering:</span>
                            <p className="font-mono text-foreground">{ds.compression}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="snapshots">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border">
                    {recentSnapshots.map((snap) => (
                      <div key={snap.name} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-mono text-sm text-foreground">{snap.name}</p>
                          <Badge variant={snap.type === "auto" ? "secondary" : "outline"}>
                            {snap.type}
                          </Badge>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {snap.created}
                          </span>
                          <span>Størrelse: {snap.size}</span>
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
    </div>
  );
}
