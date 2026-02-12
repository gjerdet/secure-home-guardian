import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Activity, ArrowDownRight, ArrowUpRight, Globe, Loader2,
  RefreshCw, Search, Users, Wifi, ArrowLeftRight, ShieldCheck,
  ArrowUpDown, BarChart3
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE, fetchJsonSafely } from "@/lib/api";

interface FlowEntry {
  id: string;
  timestamp: string;
  source: string;
  sourceIp: string;
  destination: string;
  destinationIp: string;
  service: string;
  risk: string;
  direction: string;
  inInterface: string;
  outInterface: string;
  action: string;
  bytes: number;
  bytesOut: number;
  country: string;
}

interface DpiCategory {
  name: string;
  rxBytes: number;
  txBytes: number;
  totalBytes: number;
  clientCount?: number;
}

interface DpiApp {
  name: string;
  count?: number;
  rxBytes: number;
  txBytes: number;
  totalBytes: number;
}

interface DpiClient {
  mac: string;
  name: string;
  rxBytes: number;
  txBytes: number;
  ip?: string;
  network?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0)} ${sizes[i]}`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

const riskColors: Record<string, string> = {
  low: "bg-emerald-500/20 text-emerald-400",
  medium: "bg-warning/20 text-warning",
  high: "bg-destructive/20 text-destructive",
  suspicious: "bg-warning/20 text-warning",
  concerning: "bg-destructive/20 text-destructive",
};

const directionIcon = (dir: string) => {
  if (dir === "in" || dir === "down") return <ArrowDownRight className="h-3.5 w-3.5 text-blue-400" />;
  if (dir === "out" || dir === "up") return <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />;
  return <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />;
};

export function TrafficFlowsPanel() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [flows, setFlows] = useState<FlowEntry[]>([]);
  const [dpiCategories, setDpiCategories] = useState<DpiCategory[]>([]);
  const [dpiApps, setDpiApps] = useState<DpiApp[]>([]);
  const [dpiClients, setDpiClients] = useState<DpiClient[]>([]);
  const [totalRx, setTotalRx] = useState(0);
  const [totalTx, setTotalTx] = useState(0);
  const [totalClients, setTotalClients] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [flowsRes, dpiRes] = await Promise.all([
        fetchJsonSafely(`${API_BASE}/api/unifi/flows`, { headers: authHeaders }),
        fetchJsonSafely(`${API_BASE}/api/unifi/dpi`, { headers: authHeaders }),
      ]);

      if (flowsRes.ok && flowsRes.data) {
        setFlows((flowsRes.data as any).flows || []);
      }
      if (dpiRes.ok && dpiRes.data) {
        const d = dpiRes.data as any;
        setDpiCategories(d.categories || []);
        setDpiApps(d.topApps || []);
        setDpiClients(d.topClients || []);
        setTotalRx(d.totalRx || 0);
        setTotalTx(d.totalTx || 0);
        setTotalClients(d.totalClients || 0);
      }
    } catch {
      toast.error("Kunne ikke hente trafikkdata");
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredFlows = useMemo(() => {
    if (!searchQuery) return flows;
    const q = searchQuery.toLowerCase();
    return flows.filter(f =>
      f.source?.toLowerCase().includes(q) ||
      f.sourceIp?.includes(q) ||
      f.destination?.toLowerCase().includes(q) ||
      f.destinationIp?.includes(q) ||
      f.service?.toLowerCase().includes(q) ||
      f.action?.toLowerCase().includes(q)
    );
  }, [flows, searchQuery]);

  // Flow summary stats
  const flowSummary = useMemo(() => {
    const total = flows.length;
    const lowRisk = flows.filter(f => f.risk === "low" || !f.risk).length;
    const suspicious = flows.filter(f => f.risk === "medium" || f.risk === "suspicious").length;
    const concerning = flows.filter(f => f.risk === "high" || f.risk === "concerning").length;
    return { total, lowRisk, suspicious, concerning };
  }, [flows]);

  // Top destinations from flows
  const topDestinations = useMemo(() => {
    const map: Record<string, { count: number; country: string }> = {};
    flows.forEach(f => {
      const key = f.destination || f.destinationIp;
      if (!key) return;
      if (!map[key]) map[key] = { count: 0, country: f.country };
      map[key].count++;
    });
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [flows]);

  // Top clients from flows
  const topFlowClients = useMemo(() => {
    const map: Record<string, number> = {};
    flows.forEach(f => {
      const key = f.source || f.sourceIp;
      if (!key) return;
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [flows]);

  const totalDpiBytes = dpiCategories.reduce((s, c) => s + c.totalBytes, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Traffic & DPI</CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {flows.length} flows
              </Badge>
            </div>
            <Button onClick={fetchData} disabled={isLoading} size="sm" className="bg-primary text-primary-foreground">
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Oppdater
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Top Stats Row - like UniFi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Traffic Summary */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">Trafikkoversikt</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Klientar</span>
              <span className="font-mono font-bold">{formatNumber(totalClients)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <ArrowDownRight className="h-3 w-3 text-blue-400" />
                Nedlasta
              </span>
              <span className="font-mono text-blue-400">{formatBytes(totalRx)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                Opplasta
              </span>
              <span className="font-mono text-emerald-400">{formatBytes(totalTx)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Totalt</span>
              <span className="font-mono font-bold">{formatBytes(totalRx + totalTx)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Top Destinations */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">Top Destinations</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {topDestinations.length > 0 ? topDestinations.map((d, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="truncate max-w-[70%] font-mono">{d.name}</span>
                <span className="font-mono text-muted-foreground">{formatNumber(d.count)}</span>
              </div>
            )) : (
              <p className="text-xs text-muted-foreground">Ingen data</p>
            )}
          </CardContent>
        </Card>

        {/* Top Clients */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">Top Klientar</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {dpiClients.length > 0 ? dpiClients.slice(0, 5).map((c, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="truncate max-w-[55%]" title={c.ip || c.mac}>{c.name}</span>
                <span className="font-mono text-muted-foreground">
                  {formatBytes(c.rxBytes + c.txBytes)}
                </span>
              </div>
            )) : (
              <p className="text-xs text-muted-foreground">Ingen data</p>
            )}
          </CardContent>
        </Card>

        {/* Top Hendingstypar */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">Hendingstypar</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {dpiApps.length > 0 ? dpiApps.slice(0, 5).map((a, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="truncate max-w-[60%]">{a.name}</span>
                <span className="font-mono text-muted-foreground">
                  {a.count ? formatNumber(a.count) : formatBytes(a.totalBytes)}
                </span>
              </div>
            )) : (
              <p className="text-xs text-muted-foreground">Ingen data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* DPI Categories breakdown */}
      {dpiCategories.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border py-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Trafikk per nettverk</CardTitle>
              <Badge variant="outline" className="text-[10px]">{formatBytes(totalDpiBytes)} totalt</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2">
              {dpiCategories.slice(0, 10).map((cat, i) => {
                const pct = totalDpiBytes > 0 ? (cat.totalBytes / totalDpiBytes) * 100 : 0;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>{cat.name}</span>
                      <span className="font-mono text-muted-foreground">
                        {formatBytes(cat.totalBytes)} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card className="bg-card border-border">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Søk i kilde, destinasjon, service..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Flows Table */}
      <Card className="bg-card border-border">
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-xs">Kilde</TableHead>
                <TableHead className="text-xs">Destinasjon</TableHead>
                <TableHead className="text-xs">Service</TableHead>
                <TableHead className="text-xs">Risiko</TableHead>
                <TableHead className="text-xs">Retn.</TableHead>
                <TableHead className="text-xs">Inn</TableHead>
                <TableHead className="text-xs">Ut</TableHead>
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs">Tidspunkt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFlows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                    {isLoading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <p>Henter trafikkdata...</p>
                      </div>
                    ) : flows.length === 0 ? (
                      <div className="flex flex-col items-center gap-2">
                        <Activity className="h-8 w-8 text-muted-foreground/50" />
                        <p>Ingen trafikkflyt-data tilgjengeleg</p>
                        <p className="text-xs">Flows API er kanskje ikkje støtta på denne firmware-versjonen</p>
                      </div>
                    ) : "Ingen treff for søket"}
                  </TableCell>
                </TableRow>
              ) : filteredFlows.map(flow => (
                <TableRow key={flow.id} className="border-border hover:bg-muted/30">
                  <TableCell className="text-xs font-mono max-w-[140px] truncate" title={flow.sourceIp}>
                    {flow.source || flow.sourceIp || "—"}
                  </TableCell>
                  <TableCell className="text-xs font-mono max-w-[140px] truncate" title={flow.destinationIp}>
                    <span className="flex items-center gap-1">
                      {flow.country && <span className="text-[10px]">{flow.country}</span>}
                      {flow.destination || flow.destinationIp || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{flow.service || "—"}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${riskColors[flow.risk] || riskColors.low}`}>
                      {flow.risk || "low"}
                    </Badge>
                  </TableCell>
                  <TableCell>{directionIcon(flow.direction)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{flow.inInterface || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{flow.outInterface || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={flow.action === "allow" ? "outline" : "destructive"} className="text-[10px]">
                      {flow.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono whitespace-nowrap">
                    {flow.timestamp ? new Date(flow.timestamp).toLocaleString("nb-NO", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                    }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
}
