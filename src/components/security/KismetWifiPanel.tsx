import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Wifi, WifiOff, AlertTriangle, Shield, RefreshCw, Radio, Loader2, Eye, Lock, Unlock, Activity } from "lucide-react";
import { API_BASE, fetchJsonSafely } from "@/lib/api";

interface KismetDevice {
  mac: string;
  ssid?: string;
  type: string; // "AP" | "Client" | "Bridge"
  channel?: number;
  signal?: number; // dBm
  encryption?: string[];
  firstSeen?: string;
  lastSeen?: string;
  manufacturer?: string;
  packets?: number;
  isRogue?: boolean;
  knownNetworks?: string[];
}

interface KismetAlert {
  type: string;
  text: string;
  mac?: string;
  timestamp: string;
  severity: "low" | "medium" | "high" | "critical";
}

interface KismetStatus {
  connected: boolean;
  version?: string;
  deviceCount?: number;
  alertCount?: number;
  channels?: number[];
  datasources?: { name: string; running: boolean }[];
}

function signalColor(dbm?: number) {
  if (!dbm) return "text-muted-foreground";
  if (dbm >= -50) return "text-success";
  if (dbm >= -70) return "text-warning";
  return "text-destructive";
}

function encBadge(enc?: string[]) {
  if (!enc || enc.length === 0) return <Badge variant="destructive" className="text-[10px]"><Unlock className="h-2.5 w-2.5 mr-1" />Åpen</Badge>;
  const e = enc.join(", ");
  if (e.includes("WPA3")) return <Badge className="bg-success/20 text-success border-success/30 text-[10px]"><Lock className="h-2.5 w-2.5 mr-1" />WPA3</Badge>;
  if (e.includes("WPA2")) return <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]"><Lock className="h-2.5 w-2.5 mr-1" />WPA2</Badge>;
  if (e.includes("WPA")) return <Badge variant="secondary" className="text-[10px]"><Lock className="h-2.5 w-2.5 mr-1" />WPA</Badge>;
  if (e.includes("WEP")) return <Badge variant="destructive" className="text-[10px]"><Lock className="h-2.5 w-2.5 mr-1" />WEP</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{e}</Badge>;
}

const alertSeverityColor: Record<string, string> = {
  critical: "text-destructive",
  high: "text-destructive",
  medium: "text-warning",
  low: "text-primary",
};

export function KismetWifiPanel() {
  const [kismetUrl, setKismetUrl] = useState(() => localStorage.getItem("kismet_url") || "http://localhost:2501");
  const [kismetUser, setKismetUser] = useState(() => localStorage.getItem("kismet_user") || "kismet");
  const [kismetPass, setKismetPass] = useState("");
  const [status, setStatus] = useState<KismetStatus>({ connected: false });
  const [devices, setDevices] = useState<KismetDevice[]>([]);
  const [alerts, setAlerts] = useState<KismetAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [filter, setFilter] = useState("");
  const [viewTab, setViewTab] = useState<"aps" | "clients" | "alerts" | "rogue">("aps");

  const fetchKismetData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchJsonSafely(`${API_BASE}/api/kismet/status`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      if (!res.ok || !res.data) {
        setStatus({ connected: false });
        setIsLoading(false);
        return;
      }

      const d = res.data as any;
      setStatus({
        connected: true,
        version: d.version,
        deviceCount: d.deviceCount,
        alertCount: d.alertCount,
        datasources: d.datasources,
      });
      setDevices(d.devices || []);
      setAlerts(d.alerts || []);
    } catch {
      setStatus({ connected: false });
    }
    setIsLoading(false);
  }, []);

  const saveConfig = async () => {
    localStorage.setItem("kismet_url", kismetUrl);
    localStorage.setItem("kismet_user", kismetUser);

    const res = await fetchJsonSafely(`${API_BASE}/api/kismet/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ url: kismetUrl, username: kismetUser, password: kismetPass }),
    });

    if (res.ok) {
      toast.success("Kismet-konfigurasjon lagra");
      setIsConfiguring(false);
      fetchKismetData();
    } else {
      toast.error("Kunne ikkje lagre Kismet-konfigurasjon");
    }
  };

  useEffect(() => {
    fetchKismetData();
    const interval = setInterval(fetchKismetData, 30000);
    return () => clearInterval(interval);
  }, [fetchKismetData]);

  const aps = devices.filter((d) => d.type === "AP" || !d.type);
  const clients = devices.filter((d) => d.type === "Client");
  const rogues = devices.filter((d) => d.isRogue);

  const filterFn = (d: KismetDevice) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      d.mac?.toLowerCase().includes(f) ||
      d.ssid?.toLowerCase().includes(f) ||
      d.manufacturer?.toLowerCase().includes(f)
    );
  };

  const visibleAps = aps.filter(filterFn);
  const visibleClients = clients.filter(filterFn);

  const openAlerts = alerts.filter((a) => a.severity === "high" || a.severity === "critical");

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              Kismet WiFi Overvåking
              {status.connected ? (
                <Badge className="bg-success/20 text-success border-success/30 text-[10px]">Tilkopla</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">Ikkje tilkopla</Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsConfiguring(!isConfiguring)}>
                Konfigurasjon
              </Button>
              <Button size="sm" variant="outline" onClick={fetchKismetData} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        {isConfiguring && (
          <CardContent className="pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Kismet er ein open-source trådlaus overvåkingsserver. Installer med Docker:
              <code className="ml-1 bg-muted px-1 rounded text-[10px]">docker run -p 2501:2501 kismetwireless/kismet</code>
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Kismet URL</Label>
                <Input value={kismetUrl} onChange={(e) => setKismetUrl(e.target.value)} placeholder="http://localhost:2501" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Brukernavn</Label>
                <Input value={kismetUser} onChange={(e) => setKismetUser(e.target.value)} placeholder="kismet" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Passord</Label>
                <Input type="password" value={kismetPass} onChange={(e) => setKismetPass(e.target.value)} placeholder="••••••" className="h-8 text-xs" />
              </div>
            </div>
            <Button size="sm" onClick={saveConfig}>Lagre og test tilkobling</Button>
          </CardContent>
        )}
      </Card>

      {/* Stats */}
      {status.connected && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-mono font-bold text-primary">{aps.length}</p>
              <p className="text-xs text-muted-foreground">Access Points</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-mono font-bold text-foreground">{clients.length}</p>
              <p className="text-xs text-muted-foreground">Klientar</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-mono font-bold text-destructive">{rogues.length}</p>
              <p className="text-xs text-muted-foreground">Rogue AP</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-mono font-bold text-warning">{openAlerts.length}</p>
              <p className="text-xs text-muted-foreground">Aktive åtvaringar</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Not connected state */}
      {!status.connected && !isLoading && (
        <Alert className="border-warning/40 bg-warning/5">
          <WifiOff className="h-4 w-4 text-warning" />
          <AlertDescription className="text-sm">
            <strong>Kismet er ikkje tilkopla.</strong> Kismet er ein open-source trådlaus overvåkingsserver som krev eit WiFi-kort med monitor mode (t.d. Alfa AWUS036ACH).
            <br />
            <span className="text-muted-foreground text-xs mt-1 block">
              Installer via Docker: <code className="bg-muted px-1 rounded">docker run --net=host --privileged -p 2501:2501 kismetwireless/kismet</code>
              <br />
              Opne konfigurasjonspanelet over for å kople til.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Datasources */}
      {status.connected && status.datasources && status.datasources.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="py-3 border-b border-border">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" /> Datakilder (WiFi-adapter)
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="flex flex-wrap gap-2">
              {status.datasources.map((ds, i) => (
                <Badge key={i} variant={ds.running ? "default" : "secondary"} className="text-xs">
                  {ds.running ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                  {ds.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main content */}
      {status.connected && (
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex gap-1">
                {(["aps", "clients", "alerts", "rogue"] as const).map((tab) => (
                  <Button
                    key={tab}
                    size="sm"
                    variant={viewTab === tab ? "default" : "ghost"}
                    className="h-7 text-xs"
                    onClick={() => setViewTab(tab)}
                  >
                    {tab === "aps" && `AP (${aps.length})`}
                    {tab === "clients" && `Klientar (${clients.length})`}
                    {tab === "alerts" && <><AlertTriangle className="h-3 w-3 mr-1" />Åtvaringar ({alerts.length})</>}
                    {tab === "rogue" && <><Shield className="h-3 w-3 mr-1" />Rogue ({rogues.length})</>}
                  </Button>
                ))}
              </div>
              {(viewTab === "aps" || viewTab === "clients") && (
                <Input
                  placeholder="Søk MAC / SSID / produsent..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="h-7 text-xs w-60"
                />
              )}
            </div>
          </CardHeader>

          {/* APs */}
          {viewTab === "aps" && (
            <ScrollArea className="h-96">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-xs">SSID</TableHead>
                    <TableHead className="text-xs">MAC</TableHead>
                    <TableHead className="text-xs">Kanal</TableHead>
                    <TableHead className="text-xs">Kryptering</TableHead>
                    <TableHead className="text-xs">Signal</TableHead>
                    <TableHead className="text-xs">Produsent</TableHead>
                    <TableHead className="text-xs">Pakker</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleAps.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-xs py-8">
                        {isLoading ? "Laster..." : "Ingen AP-ar funne"}
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleAps.map((ap, i) => (
                    <TableRow key={i} className="border-border hover:bg-muted/30">
                      <TableCell className="font-medium text-xs">{ap.ssid || <span className="text-muted-foreground italic">Skjult</span>}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{ap.mac}</TableCell>
                      <TableCell className="text-xs">{ap.channel ?? "—"}</TableCell>
                      <TableCell>{encBadge(ap.encryption)}</TableCell>
                      <TableCell className={`font-mono text-xs ${signalColor(ap.signal)}`}>{ap.signal ? `${ap.signal} dBm` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ap.manufacturer ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{ap.packets?.toLocaleString() ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          {/* Clients */}
          {viewTab === "clients" && (
            <ScrollArea className="h-96">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-xs">MAC</TableHead>
                    <TableHead className="text-xs">Tilkopla til</TableHead>
                    <TableHead className="text-xs">Signal</TableHead>
                    <TableHead className="text-xs">Produsent</TableHead>
                    <TableHead className="text-xs">Sist sett</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleClients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground text-xs py-8">
                        Ingen klientar funne
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleClients.map((c, i) => (
                    <TableRow key={i} className="border-border hover:bg-muted/30">
                      <TableCell className="font-mono text-xs">{c.mac}</TableCell>
                      <TableCell className="text-xs">{c.knownNetworks?.join(", ") || "—"}</TableCell>
                      <TableCell className={`font-mono text-xs ${signalColor(c.signal)}`}>{c.signal ? `${c.signal} dBm` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.manufacturer ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.lastSeen ? new Date(c.lastSeen).toLocaleTimeString("no") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          {/* Alerts */}
          {viewTab === "alerts" && (
            <ScrollArea className="h-96">
              <div className="divide-y divide-border">
                {alerts.length === 0 && (
                  <div className="text-center text-muted-foreground text-xs py-8">Ingen åtvaringar</div>
                )}
                {alerts.map((a, i) => (
                  <div key={i} className="p-3 flex items-start gap-3 hover:bg-muted/20">
                    <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${alertSeverityColor[a.severity]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${alertSeverityColor[a.severity]}`}>{a.type}</span>
                        {a.mac && <span className="font-mono text-xs text-muted-foreground">{a.mac}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.text}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(a.timestamp).toLocaleTimeString("no")}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Rogue APs */}
          {viewTab === "rogue" && (
            <ScrollArea className="h-96">
              {rogues.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="h-10 w-10 text-success mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">Ingen rogue AP-ar oppdaga</p>
                  <p className="text-xs text-muted-foreground mt-1">Kismet samanliknar oppdaga AP-ar med kjende nettverk</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-xs">SSID</TableHead>
                      <TableHead className="text-xs">MAC</TableHead>
                      <TableHead className="text-xs">Kanal</TableHead>
                      <TableHead className="text-xs">Signal</TableHead>
                      <TableHead className="text-xs">Første sett</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rogues.map((r, i) => (
                      <TableRow key={i} className="border-destructive/20 bg-destructive/5 hover:bg-destructive/10">
                        <TableCell className="font-medium text-xs text-destructive">{r.ssid || "Ukjend"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.mac}</TableCell>
                        <TableCell className="text-xs">{r.channel ?? "—"}</TableCell>
                        <TableCell className={`font-mono text-xs ${signalColor(r.signal)}`}>{r.signal ? `${r.signal} dBm` : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.firstSeen ? new Date(r.firstSeen).toLocaleString("no") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          )}
        </Card>
      )}
    </div>
  );
}
