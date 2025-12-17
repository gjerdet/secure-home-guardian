import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Wifi, Shield, ShieldAlert, AlertTriangle, Activity, 
  Users, Globe, Clock, ArrowUpRight, ArrowDownRight,
  Monitor, Smartphone, Laptop, Router
} from "lucide-react";

const idsAlerts = [
  { id: "1", timestamp: "2024-12-17 14:32:05", severity: "high", category: "ET SCAN", signature: "Potential SSH Brute Force Attack", srcIp: "45.33.32.156", dstIp: "192.168.1.1", srcPort: 54321, dstPort: 22, action: "blocked" },
  { id: "2", timestamp: "2024-12-17 14:28:12", severity: "medium", category: "ET MALWARE", signature: "Suspicious DNS Query - Known Malware Domain", srcIp: "192.168.1.45", dstIp: "8.8.8.8", srcPort: 53421, dstPort: 53, action: "alerted" },
  { id: "3", timestamp: "2024-12-17 14:15:33", severity: "low", category: "ET POLICY", signature: "Potential Corporate Privacy Violation", srcIp: "192.168.1.52", dstIp: "142.250.185.78", srcPort: 443, dstPort: 443, action: "alerted" },
  { id: "4", timestamp: "2024-12-17 13:45:00", severity: "high", category: "ET EXPLOIT", signature: "Possible SQL Injection Attempt", srcIp: "103.21.244.0", dstIp: "192.168.1.10", srcPort: 12345, dstPort: 80, action: "blocked" },
  { id: "5", timestamp: "2024-12-17 13:20:45", severity: "critical", category: "ET TROJAN", signature: "Known Command and Control Traffic", srcIp: "192.168.1.99", dstIp: "185.220.101.1", srcPort: 49152, dstPort: 443, action: "blocked" },
];

const connectedDevices = [
  { id: "1", name: "MacBook Pro", type: "laptop", ip: "192.168.1.10", mac: "A4:83:E7:12:34:56", connection: "5GHz", signal: -45, rxRate: 866, txRate: 866, uptime: "5d 12h" },
  { id: "2", name: "iPhone 14 Pro", type: "phone", ip: "192.168.1.45", mac: "F0:18:98:AB:CD:EF", connection: "5GHz", signal: -52, rxRate: 780, txRate: 780, uptime: "2h 34m" },
  { id: "3", name: "Samsung TV", type: "tv", ip: "192.168.1.52", mac: "F4:7B:09:CD:EF:12", connection: "2.4GHz", signal: -68, rxRate: 72, txRate: 72, uptime: "3d 8h" },
  { id: "4", name: "Windows Desktop", type: "desktop", ip: "192.168.1.20", mac: "DC:4A:3E:78:90:12", connection: "Ethernet", signal: 0, rxRate: 1000, txRate: 1000, uptime: "12d 4h" },
  { id: "5", name: "Ukjent Enhet", type: "unknown", ip: "192.168.1.99", mac: "00:1A:2B:3C:4D:5E", connection: "2.4GHz", signal: -75, rxRate: 54, txRate: 54, uptime: "45m" },
];

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

const DeviceIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "laptop": return <Laptop className="h-4 w-4" />;
    case "phone": return <Smartphone className="h-4 w-4" />;
    case "tv": case "desktop": return <Monitor className="h-4 w-4" />;
    default: return <Router className="h-4 w-4" />;
  }
};

export default function UniFi() {
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

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ArrowDownRight className="h-3 w-3 text-success" />
                Nedlasting
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{trafficStats.currentDown}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ArrowUpRight className="h-3 w-3 text-primary" />
                Opplasting
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{trafficStats.currentUp}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Users className="h-3 w-3" />
                Enheter
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{connectedDevices.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Globe className="h-3 w-3" />
                WAN Latency
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{trafficStats.wanLatency}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ShieldAlert className="h-3 w-3 text-destructive" />
                IDS Alerts
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{idsAlerts.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Activity className="h-3 w-3" />
                DNS Queries
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{trafficStats.dnsQueries.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="ids" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="ids" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ShieldAlert className="h-4 w-4 mr-2" />
              IDS/IPS Alerts
            </TabsTrigger>
            <TabsTrigger value="devices" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-4 w-4 mr-2" />
              Tilkoblede Enheter
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ids">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Intrusion Detection / Prevention System
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {idsAlerts.map((alert) => (
                      <div key={alert.id} className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge className={severityColors[alert.severity as keyof typeof severityColors]}>
                              {alert.severity.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="font-mono text-xs">
                              {alert.category}
                            </Badge>
                            <Badge variant={alert.action === "blocked" ? "destructive" : "secondary"}>
                              {alert.action === "blocked" ? "Blokkert" : "Varslet"}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
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
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
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
