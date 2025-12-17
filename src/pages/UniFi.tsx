import { useState, useMemo, useEffect } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AttackMap } from "@/components/AttackMap";
import { exportToCSV, exportToJSON, batchLookupGeoIP } from "@/lib/ids-utils";
import { useToast } from "@/hooks/use-toast";
import { 
  Wifi, Shield, ShieldAlert, AlertTriangle, Activity, 
  Users, Globe, Clock, ArrowUpRight, ArrowDownRight,
  Monitor, Smartphone, Laptop, Router, Radio, Network,
  ArrowUpDown, Download, FileJson, FileSpreadsheet, RefreshCw
} from "lucide-react";

interface IdsAlert {
  id: string;
  timestamp: string;
  severity: string;
  category: string;
  signature: string;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  action: string;
  country?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  isp?: string;
}

const initialAlerts: IdsAlert[] = [
  { id: "1", timestamp: "2024-12-17 14:32:05", severity: "high", category: "ET SCAN", signature: "Potential SSH Brute Force Attack", srcIp: "45.33.32.156", dstIp: "192.168.1.1", srcPort: 54321, dstPort: 22, action: "blocked" },
  { id: "2", timestamp: "2024-12-17 14:28:12", severity: "medium", category: "ET MALWARE", signature: "Suspicious DNS Query - Known Malware Domain", srcIp: "192.168.1.45", dstIp: "8.8.8.8", srcPort: 53421, dstPort: 53, action: "alerted" },
  { id: "3", timestamp: "2024-12-17 14:15:33", severity: "low", category: "ET POLICY", signature: "Potential Corporate Privacy Violation", srcIp: "192.168.1.52", dstIp: "142.250.185.78", srcPort: 443, dstPort: 443, action: "alerted" },
  { id: "4", timestamp: "2024-12-17 13:45:00", severity: "high", category: "ET EXPLOIT", signature: "Possible SQL Injection Attempt", srcIp: "103.21.244.15", dstIp: "192.168.1.10", srcPort: 12345, dstPort: 80, action: "blocked" },
  { id: "5", timestamp: "2024-12-17 13:20:45", severity: "critical", category: "ET TROJAN", signature: "Known Command and Control Traffic", srcIp: "185.220.101.1", dstIp: "192.168.1.99", srcPort: 443, dstPort: 49152, action: "blocked" },
  { id: "6", timestamp: "2024-12-17 12:55:00", severity: "high", category: "ET SCAN", signature: "Nmap OS Detection Attempt", srcIp: "91.189.88.142", dstIp: "192.168.1.1", srcPort: 45678, dstPort: 0, action: "blocked" },
  { id: "7", timestamp: "2024-12-17 12:30:22", severity: "medium", category: "ET WEB", signature: "XSS Attack Attempt", srcIp: "177.54.148.213", dstIp: "192.168.1.10", srcPort: 34567, dstPort: 443, action: "blocked" },
  { id: "8", timestamp: "2024-12-17 11:45:10", severity: "critical", category: "ET EXPLOIT", signature: "Log4j RCE Attempt", srcIp: "5.188.86.172", dstIp: "192.168.1.10", srcPort: 56789, dstPort: 8080, action: "blocked" },
];

const connectedDevices = [
  { id: "1", name: "MacBook Pro", type: "laptop", ip: "192.168.1.10", mac: "A4:83:E7:12:34:56", connection: "5GHz", signal: -45, rxRate: 866, txRate: 866, uptime: "5d 12h" },
  { id: "2", name: "iPhone 14 Pro", type: "phone", ip: "192.168.1.45", mac: "F0:18:98:AB:CD:EF", connection: "5GHz", signal: -52, rxRate: 780, txRate: 780, uptime: "2h 34m" },
  { id: "3", name: "Samsung TV", type: "tv", ip: "192.168.1.52", mac: "F4:7B:09:CD:EF:12", connection: "2.4GHz", signal: -68, rxRate: 72, txRate: 72, uptime: "3d 8h" },
  { id: "4", name: "Windows Desktop", type: "desktop", ip: "192.168.1.20", mac: "DC:4A:3E:78:90:12", connection: "Ethernet", signal: 0, rxRate: 1000, txRate: 1000, uptime: "12d 4h" },
  { id: "5", name: "Ukjent Enhet", type: "unknown", ip: "192.168.1.99", mac: "00:1A:2B:3C:4D:5E", connection: "2.4GHz", signal: -75, rxRate: 54, txRate: 54, uptime: "45m" },
];

const networkDevices = {
  aps: [
    { name: "U6-Pro Stue", status: "online", clients: 8, channel: "36/80", experience: 98 },
    { name: "U6-Lite Kontor", status: "online", clients: 4, channel: "149/80", experience: 95 },
    { name: "U6-Mesh Garasje", status: "online", clients: 2, channel: "6", experience: 88 },
  ],
  switches: [
    { name: "USW-24-POE", status: "online", ports: 24, portsUsed: 18, poeWatts: 145 },
    { name: "USW-Lite-8-POE", status: "online", ports: 8, portsUsed: 6, poeWatts: 52 },
  ],
  gateway: { name: "UDM-Pro", status: "online", wanIp: "85.123.45.67", uptime: "45d 12h" },
};

const trafficStats = {
  totalDownload: "1.2 TB",
  totalUpload: "342 GB",
  currentDown: "245 Mbps",
  currentUp: "45 Mbps",
  wanLatency: "12ms",
  dnsQueries: 15234,
};

const severityColors = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/80 text-destructive-foreground",
  medium: "bg-warning text-warning-foreground",
  low: "bg-primary/80 text-primary-foreground",
};

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

const DeviceIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "laptop": return <Laptop className="h-4 w-4" />;
    case "phone": return <Smartphone className="h-4 w-4" />;
    case "tv": case "desktop": return <Monitor className="h-4 w-4" />;
    default: return <Router className="h-4 w-4" />;
  }
};

export default function UniFi() {
  const [sortBy, setSortBy] = useState<string>("time");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [idsAlerts, setIdsAlerts] = useState<IdsAlert[]>(initialAlerts);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const { toast } = useToast();

  // Load cached GeoIP data on mount
  useEffect(() => {
    const cached = localStorage.getItem("ids_geoip_cache");
    if (cached) {
      try {
        const geoData = JSON.parse(cached);
        setIdsAlerts(prev => prev.map(alert => ({
          ...alert,
          ...geoData[alert.srcIp]
        })));
      } catch (e) {
        console.error("Failed to load cached GeoIP data");
      }
    }
  }, []);

  const handleGeoIPLookup = async () => {
    setIsLookingUp(true);
    toast({ title: "GeoIP Oppslag", description: "Henter lokasjon for IP-adresser..." });

    try {
      const ips = idsAlerts.map(a => a.srcIp);
      const results = await batchLookupGeoIP(ips);
      
      // Update alerts with GeoIP data
      const updatedAlerts = idsAlerts.map(alert => {
        const geo = results.get(alert.srcIp);
        if (geo) {
          return {
            ...alert,
            country: geo.countryCode,
            city: geo.city,
            lat: geo.lat,
            lng: geo.lng,
            isp: geo.isp
          };
        }
        return alert;
      });

      setIdsAlerts(updatedAlerts);

      // Cache results
      const geoCache: Record<string, any> = {};
      results.forEach((value, key) => {
        geoCache[key] = {
          country: value.countryCode,
          city: value.city,
          lat: value.lat,
          lng: value.lng,
          isp: value.isp
        };
      });
      localStorage.setItem("ids_geoip_cache", JSON.stringify(geoCache));

      toast({ 
        title: "GeoIP Fullført", 
        description: `Hentet lokasjon for ${results.size} IP-adresser` 
      });
    } catch (error) {
      toast({ 
        title: "Feil", 
        description: "Kunne ikke hente GeoIP data", 
        variant: "destructive" 
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  const sortedAlerts = useMemo(() => {
    let filtered = [...idsAlerts];
    
    if (filterSeverity !== "all") {
      filtered = filtered.filter(a => a.severity === filterSeverity);
    }

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "severity":
          return severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder];
        case "country":
          return (a.country || "ZZZ").localeCompare(b.country || "ZZZ");
        case "time":
        default:
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
    });
  }, [sortBy, filterSeverity, idsAlerts]);

  const attackLocations = idsAlerts
    .filter(a => a.lat && a.lng)
    .map(a => ({ lat: a.lat!, lng: a.lng!, severity: a.severity, country: a.country || "Unknown" }));

  const handleExportCSV = () => {
    exportToCSV(sortedAlerts, `ids-alerts-${new Date().toISOString().split('T')[0]}.csv`);
    toast({ title: "Eksportert", description: "IDS alerts eksportert til CSV" });
  };

  const handleExportJSON = () => {
    exportToJSON(sortedAlerts, `ids-alerts-${new Date().toISOString().split('T')[0]}.json`);
    toast({ title: "Eksportert", description: "IDS alerts eksportert til JSON" });
  };

  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-primary/10 p-3">
            <Wifi className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">UniFi Controller</h1>
            <p className="text-sm text-muted-foreground">IDS/IPS Overvåkning • Enhetsadministrasjon</p>
          </div>
          <Badge className="ml-auto bg-success/10 text-success border-success/20">Online</Badge>
        </div>

        {/* Network Equipment Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Radio className="h-3 w-3 text-primary" />
                Access Points
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{networkDevices.aps.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Network className="h-3 w-3 text-primary" />
                Switcher
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{networkDevices.switches.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ArrowDownRight className="h-3 w-3 text-success" />
                Nedlasting
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{trafficStats.currentDown}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ArrowUpRight className="h-3 w-3 text-primary" />
                Opplasting
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{trafficStats.currentUp}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Users className="h-3 w-3" />
                Klienter
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{connectedDevices.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Globe className="h-3 w-3" />
                WAN Latency
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{trafficStats.wanLatency}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ShieldAlert className="h-3 w-3 text-destructive" />
                IDS Alerts
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{idsAlerts.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Activity className="h-3 w-3" />
                DNS Queries
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{(trafficStats.dnsQueries / 1000).toFixed(1)}k</p>
            </CardContent>
          </Card>
        </div>

        {/* Network Equipment Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-card border-border">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                Access Points
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {networkDevices.aps.map((ap) => (
                  <div key={ap.name} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{ap.name}</p>
                      <p className="text-xs text-muted-foreground">Ch {ap.channel} • {ap.clients} klienter</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{ap.experience}%</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" />
                Switcher
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {networkDevices.switches.map((sw) => (
                  <div key={sw.name} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{sw.name}</p>
                      <p className="text-xs text-muted-foreground">{sw.portsUsed}/{sw.ports} porter • {sw.poeWatts}W PoE</p>
                    </div>
                    <Badge className="bg-success/10 text-success text-xs">Online</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Router className="h-4 w-4 text-primary" />
                Gateway
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <p className="text-sm font-medium text-foreground">{networkDevices.gateway.name}</p>
              <p className="text-xs text-muted-foreground mt-1">WAN: {networkDevices.gateway.wanIp}</p>
              <p className="text-xs text-muted-foreground">Uptime: {networkDevices.gateway.uptime}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="ids" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="ids" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ShieldAlert className="h-4 w-4 mr-2" />
              IDS/IPS Alerts
            </TabsTrigger>
            <TabsTrigger value="map" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="h-4 w-4 mr-2" />
              Angreps-kart
            </TabsTrigger>
            <TabsTrigger value="devices" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-4 w-4 mr-2" />
              Tilkoblede Enheter
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ids">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Intrusion Detection / Prevention System
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleGeoIPLookup}
                      disabled={isLookingUp}
                      className="h-8 text-xs"
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${isLookingUp ? 'animate-spin' : ''}`} />
                      GeoIP Oppslag
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-8 text-xs">
                      <FileSpreadsheet className="h-3 w-3 mr-1" />
                      CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportJSON} className="h-8 text-xs">
                      <FileJson className="h-3 w-3 mr-1" />
                      JSON
                    </Button>
                    <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                      <SelectTrigger className="w-[120px] h-8 text-xs bg-muted border-border">
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle nivåer</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="w-[130px] h-8 text-xs bg-muted border-border">
                        <ArrowUpDown className="h-3 w-3 mr-1" />
                        <SelectValue placeholder="Sorter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="time">Tid (nyeste)</SelectItem>
                        <SelectItem value="severity">Alvorlighet</SelectItem>
                        <SelectItem value="country">Land</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {sortedAlerts.map((alert) => (
                      <div key={alert.id} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={severityColors[alert.severity as keyof typeof severityColors]}>
                              {alert.severity.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="font-mono text-xs">
                              {alert.category}
                            </Badge>
                            <Badge variant={alert.action === "blocked" ? "destructive" : "secondary"}>
                              {alert.action === "blocked" ? "Blokkert" : "Varslet"}
                            </Badge>
                            {alert.country && (
                              <Badge variant="outline" className="text-xs">
                                <Globe className="h-3 w-3 mr-1" />
                                {alert.country}
                                {alert.city && ` • ${alert.city}`}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground font-mono flex items-center gap-1 shrink-0">
                            <Clock className="h-3 w-3" />
                            {alert.timestamp}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground mb-2">{alert.signature}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <span className="text-muted-foreground">Kilde IP:</span>
                            <p className="font-mono text-foreground">{alert.srcIp}:{alert.srcPort}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Destinasjon IP:</span>
                            <p className="font-mono text-foreground">{alert.dstIp}:{alert.dstPort}</p>
                          </div>
                          {alert.isp && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">ISP:</span>
                              <p className="font-mono text-foreground">{alert.isp}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="map">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Angreps Geolokasjon
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleGeoIPLookup}
                    disabled={isLookingUp}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLookingUp ? 'animate-spin' : ''}`} />
                    Oppdater GeoIP
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <AttackMap attacks={attackLocations} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Tilkoblede Enheter
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {connectedDevices.map((device) => (
                      <div key={device.id} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`rounded-lg p-2.5 ${device.type === "unknown" ? "bg-warning/10" : "bg-primary/10"}`}>
                            <DeviceIcon type={device.type} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-foreground">{device.name}</p>
                              {device.type === "unknown" && (
                                <AlertTriangle className="h-4 w-4 text-warning" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">{device.ip} • {device.mac}</p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="text-muted-foreground">{device.connection}</p>
                            <p className="font-mono text-foreground">{device.signal !== 0 ? `${device.signal} dBm` : "Kablet"}</p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="text-muted-foreground">TX/RX</p>
                            <p className="font-mono text-foreground">{device.txRate}/{device.rxRate} Mbps</p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="text-muted-foreground">Uptime</p>
                            <p className="font-mono text-foreground">{device.uptime}</p>
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
    </div>
  );
}
