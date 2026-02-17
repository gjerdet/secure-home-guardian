import { useState, useEffect, useMemo, useCallback } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  HardDrive, Database, Clock, CheckCircle, AlertTriangle,
  Thermometer, Activity, Server, FolderOpen, Container, Share2, 
  Play, Square, RotateCcw, RefreshCw, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE, fetchJsonSafely } from "@/lib/api";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0)} ${sizes[i]}`;
}

interface DatasetType {
  id?: string;
  name: string;
  used: { rawvalue?: string; value?: string; parsed?: number };
  available: { rawvalue?: string; value?: string; parsed?: number };
  quota: { rawvalue?: string; value?: string; parsed?: number };
  compression: { value?: string };
  mountpoint: string;
  type: string;
  comments?: { value?: string };
  children?: DatasetType[];
}

export default function TrueNAS() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [pools, setPools] = useState<any[]>([]);
  const [datasets, setDatasets] = useState<DatasetType[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [shares, setShares] = useState<any[]>([]);
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<DatasetType | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [poolsRes, datasetsRes, snapshotsRes, systemRes, sharesRes] = await Promise.all([
        fetchJsonSafely(`${API_BASE}/api/truenas/pools`, { headers: authHeaders }),
        fetchJsonSafely(`${API_BASE}/api/truenas/datasets`, { headers: authHeaders }),
        fetchJsonSafely(`${API_BASE}/api/truenas/snapshots`, { headers: authHeaders }),
        fetchJsonSafely(`${API_BASE}/api/truenas/system`, { headers: authHeaders }),
        fetchJsonSafely(`${API_BASE}/api/truenas/shares`, { headers: authHeaders }),
      ]);

      // Debug logging — will show in browser console
      console.log("[TrueNAS] pools:", poolsRes);
      console.log("[TrueNAS] datasets:", datasetsRes);
      console.log("[TrueNAS] system:", systemRes);
      console.log("[TrueNAS] snapshots:", snapshotsRes);
      console.log("[TrueNAS] shares:", sharesRes);

      if (poolsRes.ok && poolsRes.data) setPools(Array.isArray(poolsRes.data) ? poolsRes.data : [poolsRes.data]);
      if (datasetsRes.ok && datasetsRes.data) setDatasets(Array.isArray(datasetsRes.data) ? datasetsRes.data : [datasetsRes.data]);
      if (snapshotsRes.ok && snapshotsRes.data) setSnapshots(Array.isArray(snapshotsRes.data) ? snapshotsRes.data : []);
      if (systemRes.ok && systemRes.data) setSystemInfo(systemRes.data);
      if (sharesRes.ok && sharesRes.data) setShares(Array.isArray(sharesRes.data) ? sharesRes.data : []);

      // Show error if ANY main endpoint fails
      const failedEndpoints = [
        !poolsRes.ok && `Pools: ${poolsRes.error || poolsRes.status}`,
        !systemRes.ok && `System: ${systemRes.error || systemRes.status}`,
        !datasetsRes.ok && `Datasets: ${datasetsRes.error || datasetsRes.status}`,
      ].filter(Boolean);

      if (failedEndpoints.length > 0) {
        const errMsg = failedEndpoints.join("; ");
        console.error("[TrueNAS] Failed endpoints:", errMsg);
        setError(errMsg);
        toast.error("TrueNAS: " + errMsg);
      }
    } catch {
      setError("Nettverksfeil ved henting av TrueNAS-data");
      toast.error("Kunne ikkje hente TrueNAS-data");
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isConnected = systemInfo || pools.length > 0;

  // Parse pool stats
  const poolStats = useMemo(() => {
    return pools.map(p => {
      const totalRaw = p.topology?.data?.reduce((s: number, vdev: any) => {
        return s + (vdev.stats?.size || 0);
      }, 0) || 0;
      const allocRaw = p.topology?.data?.reduce((s: number, vdev: any) => {
        return s + (vdev.stats?.allocated || 0);
      }, 0) || 0;
      return {
        name: p.name,
        status: p.status || p.healthy ? "ONLINE" : "DEGRADED",
        healthy: p.healthy,
        totalBytes: totalRaw,
        usedBytes: allocRaw,
        usedPct: totalRaw > 0 ? (allocRaw / totalRaw) * 100 : 0,
        topology: p.topology,
      };
    });
  }, [pools]);

  const totalStorage = poolStats.reduce((s, p) => s + p.totalBytes, 0);
  const usedStorage = poolStats.reduce((s, p) => s + p.usedBytes, 0);

  // System stats
  const cpuUsage = systemInfo?.loadavg ? Math.round(systemInfo.loadavg[0] * 100 / (systemInfo.cores || 4)) : 0;
  const memTotal = systemInfo?.physmem ? systemInfo.physmem : 0;
  const memUsed = memTotal - (systemInfo?.physmem_free || memTotal);
  const uptime = systemInfo?.uptime_seconds
    ? `${Math.floor(systemInfo.uptime_seconds / 86400)}d ${Math.floor((systemInfo.uptime_seconds % 86400) / 3600)}h`
    : systemInfo?.uptime || "—";
  const version = systemInfo?.version_str || systemInfo?.version || "—";

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
            <p className="text-sm text-muted-foreground">{version} • Uptime: {uptime}</p>
          </div>
          <Badge className={`ml-auto ${isConnected ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}>
            {isConnected ? "Tilkobla" : "Ikkje tilkobla"}
          </Badge>
          <Button onClick={fetchData} disabled={isLoading} size="sm" variant="outline">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {error && (
          <Card className="bg-destructive/10 border-destructive/30 mb-6">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">{error}</p>
                <p className="text-xs text-muted-foreground">Sjekk at TrueNAS URL og API-nøkkel er riktig i Innstillingar.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* System Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                <Activity className="h-3 w-3" /> CPU
              </div>
              <p className="text-2xl font-mono font-bold text-foreground mb-2">{cpuUsage}%</p>
              <Progress value={cpuUsage} className="h-1.5" />
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                <Server className="h-3 w-3" /> RAM
              </div>
              <p className="text-2xl font-mono font-bold text-foreground mb-2">
                {memTotal > 0 ? formatBytes(memUsed) : "—"}
              </p>
              <Progress value={memTotal > 0 ? (memUsed / memTotal) * 100 : 0} className="h-1.5" />
              {memTotal > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">av {formatBytes(memTotal)}</p>
              )}
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                <Database className="h-3 w-3" /> Total Lagring
              </div>
              <p className="text-2xl font-mono font-bold text-foreground">
                {totalStorage > 0 ? formatBytes(totalStorage) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{pools.length} pool{pools.length !== 1 ? "s" : ""}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                <Clock className="h-3 w-3" /> Snapshots
              </div>
              <p className="text-2xl font-mono font-bold text-foreground">{snapshots.length}</p>
              <p className="text-xs text-muted-foreground">{datasets.length} datasets</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="pools" className="space-y-4">
          <TabsList className="bg-muted flex-wrap">
            <TabsTrigger value="pools" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Database className="h-4 w-4 mr-2" /> Pools ({pools.length})
            </TabsTrigger>
            <TabsTrigger value="datasets" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FolderOpen className="h-4 w-4 mr-2" /> Datasets ({datasets.length})
            </TabsTrigger>
            <TabsTrigger value="snapshots" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Clock className="h-4 w-4 mr-2" /> Snapshots ({snapshots.length})
            </TabsTrigger>
            <TabsTrigger value="shares" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Share2 className="h-4 w-4 mr-2" /> Deling ({shares.length})
            </TabsTrigger>
          </TabsList>

          {/* Pools Tab */}
          <TabsContent value="pools">
            <div className="space-y-4">
              {isLoading && pools.length === 0 ? (
                <Card className="bg-card border-border">
                  <CardContent className="p-8 flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Hentar pools...</p>
                  </CardContent>
                </Card>
              ) : poolStats.length === 0 ? (
                <Card className="bg-card border-border">
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Ingen pools funne</p>
                    <p className="text-xs">Sjekk TrueNAS-tilkoblinga i Innstillingar</p>
                  </CardContent>
                </Card>
              ) : poolStats.map((pool) => (
                <Card key={pool.name} className="bg-card border-border">
                  <CardHeader className="border-b border-border">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        {pool.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge className={pool.status === "ONLINE"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-destructive/10 text-destructive border-destructive/20"
                        }>
                          {pool.status === "ONLINE" ? <CheckCircle className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                          {pool.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Brukt: {formatBytes(pool.usedBytes)} / {formatBytes(pool.totalBytes)}</span>
                        <span className="font-mono text-foreground">{pool.usedPct.toFixed(1)}%</span>
                      </div>
                      <Progress value={pool.usedPct} className="h-2" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">Tilgjengeleg:</span>
                        <p className="font-mono text-foreground">{formatBytes(pool.totalBytes - pool.usedBytes)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Helse:</span>
                        <p className="font-mono text-foreground">{pool.healthy ? "Frisk" : "Degradert"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">VDevs:</span>
                        <p className="font-mono text-foreground">{pool.topology?.data?.length || 0}</p>
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
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {datasets.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Ingen datasets</p>
                      </div>
                    ) : datasets.map((ds) => {
                      const usedVal = ds.used?.parsed || parseInt(ds.used?.rawvalue || "0");
                      const availVal = ds.available?.parsed || parseInt(ds.available?.rawvalue || "0");
                      const quotaVal = ds.quota?.parsed || parseInt(ds.quota?.rawvalue || "0");
                      return (
                        <div key={ds.id || ds.name} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedDataset(ds)}>
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-mono font-medium text-foreground text-sm">{ds.name}</p>
                            <Badge variant="outline" className="text-[10px]">{ds.type}</Badge>
                          </div>
                          <div className="grid grid-cols-3 md:grid-cols-4 gap-4 text-xs">
                            <div>
                              <span className="text-muted-foreground">Brukt:</span>
                              <p className="font-mono text-foreground">{formatBytes(usedVal)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Tilgjengeleg:</span>
                              <p className="font-mono text-foreground">{formatBytes(availVal)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Kvote:</span>
                              <p className="font-mono text-foreground">{quotaVal > 0 ? formatBytes(quotaVal) : "Ingen"}</p>
                            </div>
                            <div className="hidden md:block">
                              <span className="text-muted-foreground">Komprimering:</span>
                              <p className="font-mono text-foreground">{ds.compression?.value || "—"}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Snapshots Tab */}
          <TabsContent value="snapshots">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {snapshots.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Ingen snapshots</p>
                      </div>
                    ) : snapshots.slice(0, 100).map((snap, idx) => {
                      const props = snap.properties || {};
                      const created = props.creation?.value
                        ? new Date(parseInt(props.creation.value) * 1000).toLocaleString("nb-NO")
                        : snap.snapshot_name || "—";
                      const usedBytes = props.used?.parsed || parseInt(props.used?.rawvalue || "0");
                      return (
                        <div key={snap.id || idx} className="p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-mono text-sm text-foreground truncate max-w-[70%]">
                              {snap.snapshot_name || snap.name || snap.id}
                            </p>
                            <Badge variant="outline" className="text-[10px]">
                              {formatBytes(usedBytes)}
                            </Badge>
                          </div>
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {created}
                            </span>
                            <span>{snap.dataset || ""}</span>
                          </div>
                        </div>
                      );
                    })}
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
                  Delte ressursar ({shares.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border">
                    {shares.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Share2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Ingen delte ressursar</p>
                      </div>
                    ) : shares.map((share, idx) => (
                      <div key={share.id || idx} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={`rounded-lg p-2 ${share.enabled !== false ? "bg-primary/10" : "bg-muted"}`}>
                              <Share2 className={`h-4 w-4 ${share.enabled !== false ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{share.name || share.comment || share.path}</p>
                              <p className="text-xs text-muted-foreground font-mono">{share.path || share.paths?.[0] || "—"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[10px]">{share.shareType || "SMB"}</Badge>
                            <Badge variant={share.enabled !== false ? "default" : "secondary"} className="text-[10px]">
                              {share.enabled !== false ? "Aktiv" : "Deaktivert"}
                            </Badge>
                          </div>
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
          {selectedDataset && (() => {
            const usedVal = selectedDataset.used?.parsed || parseInt(selectedDataset.used?.rawvalue || "0");
            const availVal = selectedDataset.available?.parsed || parseInt(selectedDataset.available?.rawvalue || "0");
            const quotaVal = selectedDataset.quota?.parsed || parseInt(selectedDataset.quota?.rawvalue || "0");
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Brukt</p>
                    <p className="font-mono font-bold text-foreground">{formatBytes(usedVal)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Tilgjengeleg</p>
                    <p className="font-mono font-bold text-foreground">{formatBytes(availVal)}</p>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mountpoint</span>
                    <span className="font-mono text-foreground text-xs">{selectedDataset.mountpoint || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Komprimering</span>
                    <span className="font-mono text-foreground">{selectedDataset.compression?.value || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-mono text-foreground">{selectedDataset.type || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Kvote</span>
                    <span className="font-mono text-foreground">{quotaVal > 0 ? formatBytes(quotaVal) : "Ingen"}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
