import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ScanReportDialog } from "@/components/security/ScanReportDialog";
import { AttackMap } from "@/components/AttackMap";
import { batchLookupGeoIP } from "@/lib/ids-utils";
import { 
  Radar, Shield, Search, Clock, AlertTriangle, CheckCircle,
  Play, Target, Globe, Server, FileText, ChevronRight, Loader2, RefreshCw, Plus, StopCircle, MapPin
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface OpenVASScan {
  id: string;
  name: string;
  target: string;
  lastRun: string;
  status: string;
  high: number;
  medium: number;
  low: number;
  info: number;
}

interface Vulnerability {
  id: string;
  name: string;
  severity: string;
  host: string;
  port: number;
  cvss: number;
  solution: string;
}

interface NmapHost {
  host: string;
  hostname: string;
  status: string;
  ports: number[];
  os: string;
}

interface NmapProgress {
  percent: number;
  hostsFound: number;
  status: 'idle' | 'scanning' | 'complete' | 'error';
  message?: string;
}

const severityColors = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/80 text-destructive-foreground",
  medium: "bg-warning text-warning-foreground",
  low: "bg-primary/80 text-primary-foreground",
  info: "bg-muted text-muted-foreground",
};

// Parse nmap XML output
function parseNmapXML(xmlString: string): NmapHost[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const hosts: NmapHost[] = [];

  const hostNodes = doc.querySelectorAll("host");
  hostNodes.forEach((hostNode) => {
    const status = hostNode.querySelector("status")?.getAttribute("state") || "unknown";
    if (status !== "up") return;

    const address = hostNode.querySelector("address")?.getAttribute("addr") || "";
    const hostname = hostNode.querySelector("hostnames hostname")?.getAttribute("name") || "unknown";
    
    const ports: number[] = [];
    hostNode.querySelectorAll("port").forEach((portNode) => {
      const state = portNode.querySelector("state")?.getAttribute("state");
      if (state === "open") {
        ports.push(parseInt(portNode.getAttribute("portid") || "0"));
      }
    });

    const osMatch = hostNode.querySelector("osmatch")?.getAttribute("name") || "Unknown";

    hosts.push({
      host: address,
      hostname,
      status,
      ports,
      os: osMatch,
    });
  });

  return hosts;
}

export default function Security() {
  const [nmapTarget, setNmapTarget] = useState("192.168.1.0/24");
  const [nmapScanType, setNmapScanType] = useState("quick");
  const [nmapResults, setNmapResults] = useState<NmapHost[]>([]);
  const [nmapProgress, setNmapProgress] = useState<NmapProgress>({
    percent: 0,
    hostsFound: 0,
    status: 'idle'
  });
  const eventSourceRef = useRef<EventSource | null>(null);
  
  const [openvasScans, setOpenvasScans] = useState<OpenVASScan[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [isLoadingOpenvas, setIsLoadingOpenvas] = useState(false);
  
  // OpenVAS new scan dialog
  const [openvasDialogOpen, setOpenvasDialogOpen] = useState(false);
  const [newScanTarget, setNewScanTarget] = useState("");
  const [newScanName, setNewScanName] = useState("");
  const [newScanConfig, setNewScanConfig] = useState("full");
  const [isStartingOpenvasScan, setIsStartingOpenvasScan] = useState(false);
  
  // Scan report dialog
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedScan, setSelectedScan] = useState<OpenVASScan | null>(null);

  // Geo map state for scan results
  const [scanGeoLocations, setScanGeoLocations] = useState<Array<{ lat: number; lng: number; severity: string; country: string }>>([]);
  const [isGeoLookingUp, setIsGeoLookingUp] = useState(false);

  // Stats
  const stats = {
    high: vulnerabilities.filter(v => v.severity === "high").length,
    medium: vulnerabilities.filter(v => v.severity === "medium").length,
    low: vulnerabilities.filter(v => v.severity === "low").length,
    info: vulnerabilities.filter(v => v.severity === "info").length,
  };

  // Fetch OpenVAS data
  const fetchOpenvasData = async () => {
    setIsLoadingOpenvas(true);
    try {
      const [scansRes, vulnsRes] = await Promise.all([
        fetch(`${API_BASE}/api/openvas/scans`),
        fetch(`${API_BASE}/api/openvas/vulnerabilities`),
      ]);

      if (scansRes.ok) {
        const scansData = await scansRes.json();
        setOpenvasScans(scansData.tasks || scansData.data || []);
      }

      if (vulnsRes.ok) {
        const vulnsData = await vulnsRes.json();
        setVulnerabilities(vulnsData.results || vulnsData.data || []);
      }
    } catch (error) {
      console.error("OpenVAS fetch error:", error);
      toast.error("Kunne ikke koble til OpenVAS. Sjekk at backend kjører.");
    } finally {
      setIsLoadingOpenvas(false);
    }
  };

  // Run Nmap scan with streaming
  const handleNmapScan = () => {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(nmapTarget)) {
      toast.error("Ugyldig mål-format. Bruk IP-adresse eller CIDR (f.eks. 192.168.1.0/24)");
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setNmapProgress({ percent: 0, hostsFound: 0, status: 'scanning' });
    setNmapResults([]);

    const url = `${API_BASE}/api/nmap/scan-stream?target=${encodeURIComponent(nmapTarget)}&scanType=${nmapScanType}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'started':
          toast.info(`Starter scan av ${data.target}...`);
          break;
        case 'progress':
          setNmapProgress(prev => ({ ...prev, percent: data.percent }));
          break;
        case 'hosts_update':
          setNmapProgress(prev => ({ ...prev, hostsFound: data.count }));
          break;
        case 'complete':
          const hosts = parseNmapXML(data.result);
          setNmapResults(hosts);
          setNmapProgress({ percent: 100, hostsFound: hosts.length, status: 'complete' });
          toast.success(`Scan fullført! Fant ${hosts.length} host(s)`);
          eventSource.close();
          break;
        case 'error':
          setNmapProgress(prev => ({ ...prev, status: 'error', message: data.message }));
          toast.error(`Scan feilet: ${data.message}`);
          eventSource.close();
          break;
      }
    };

    eventSource.onerror = () => {
      setNmapProgress(prev => ({ ...prev, status: 'error', message: 'Forbindelsen ble avbrutt' }));
      toast.error("Forbindelse til server tapt");
      eventSource.close();
    };
  };

  // Stop Nmap scan
  const handleStopNmapScan = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setNmapProgress(prev => ({ ...prev, status: 'idle' }));
      toast.info("Scan avbrutt");
    }
  };

  // GeoIP lookup for scan results (nmap hosts + vulnerability hosts)
  const handleScanGeoLookup = async () => {
    setIsGeoLookingUp(true);
    toast.info("Henter GeoIP data for scan-resultater...");
    try {
      const ips = [
        ...nmapResults.map(h => h.host),
        ...vulnerabilities.map(v => v.host),
        ...openvasScans.map(s => s.target),
      ];
      const uniqueIps = [...new Set(ips)];
      const results = await batchLookupGeoIP(uniqueIps);

      const locations: Array<{ lat: number; lng: number; severity: string; country: string }> = [];
      
      // Add vulnerability hosts
      vulnerabilities.forEach(v => {
        const geo = results.get(v.host);
        if (geo) {
          locations.push({ lat: geo.lat, lng: geo.lng, severity: v.severity, country: geo.countryCode });
        }
      });

      // Add nmap hosts
      nmapResults.forEach(h => {
        const geo = results.get(h.host);
        if (geo) {
          locations.push({ lat: geo.lat, lng: geo.lng, severity: 'medium', country: geo.countryCode });
        }
      });

      // Add scan targets
      openvasScans.forEach(s => {
        const geo = results.get(s.target);
        if (geo) {
          const severity = s.high > 0 ? 'high' : s.medium > 0 ? 'medium' : 'low';
          locations.push({ lat: geo.lat, lng: geo.lng, severity, country: geo.countryCode });
        }
      });

      setScanGeoLocations(locations);
      toast.success(`GeoIP fullført! ${locations.length} lokasjoner kartlagt`);
    } catch {
      toast.error("Kunne ikke hente GeoIP data");
    } finally {
      setIsGeoLookingUp(false);
    }
  };

  // Start OpenVAS scan
  const handleStartOpenvasScan = async () => {
    if (!newScanTarget || !newScanName) {
      toast.error("Fyll ut alle feltene");
      return;
    }

    setIsStartingOpenvasScan(true);
    try {
      const response = await fetch(`${API_BASE}/api/openvas/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: newScanTarget,
          name: newScanName,
          scanConfig: newScanConfig
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Kunne ikke starte scan");
      }

      toast.success("OpenVAS scan startet!");
      setOpenvasDialogOpen(false);
      setNewScanTarget("");
      setNewScanName("");
      fetchOpenvasData();
    } catch (error) {
      toast.error(`Feil: ${error instanceof Error ? error.message : "Ukjent feil"}`);
    } finally {
      setIsStartingOpenvasScan(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchOpenvasData();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const isScanning = nmapProgress.status === 'scanning';

  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-primary/10 p-3">
            <Radar className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sikkerhetsscanning</h1>
            <p className="text-sm text-muted-foreground">OpenVAS • Nmap • Sårbarhetsanalyse</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-destructive">{stats.high}</p>
              <p className="text-xs text-muted-foreground">Høy risiko</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-warning">{stats.medium}</p>
              <p className="text-xs text-muted-foreground">Medium risiko</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-primary">{stats.low}</p>
              <p className="text-xs text-muted-foreground">Lav risiko</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-muted-foreground">{stats.info}</p>
              <p className="text-xs text-muted-foreground">Informasjon</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-success">
                {vulnerabilities.length > 0 ? Math.max(0, 100 - stats.high * 10 - stats.medium * 3 - stats.low) : "--"}
              </p>
              <p className="text-xs text-muted-foreground">Sikkerhets-score</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="nmap" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="nmap" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Target className="h-4 w-4 mr-2" />
              Nmap
            </TabsTrigger>
            <TabsTrigger value="openvas" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              OpenVAS
            </TabsTrigger>
            <TabsTrigger value="vulnerabilities" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Sårbarheter ({vulnerabilities.length})
            </TabsTrigger>
            <TabsTrigger value="map" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MapPin className="h-4 w-4 mr-2" />
              Geo-kart
            </TabsTrigger>
          </TabsList>

          <TabsContent value="nmap">
            <div className="space-y-4">
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    Nmap Skanning
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="flex gap-4">
                    <Input 
                      placeholder="Mål (IP eller subnet, f.eks. 192.168.1.0/24)"
                      value={nmapTarget}
                      onChange={(e) => setNmapTarget(e.target.value)}
                      className="flex-1 bg-muted border-border font-mono"
                      disabled={isScanning}
                    />
                    <Select value={nmapScanType} onValueChange={setNmapScanType} disabled={isScanning}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quick">Ping Scan</SelectItem>
                        <SelectItem value="ports">Port Scan</SelectItem>
                        <SelectItem value="full">Full Scan</SelectItem>
                      </SelectContent>
                    </Select>
                    {isScanning ? (
                      <Button 
                        onClick={handleStopNmapScan}
                        variant="destructive"
                      >
                        <StopCircle className="h-4 w-4 mr-2" />
                        Stopp
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleNmapScan}
                        className="bg-primary text-primary-foreground"
                      >
                        <Search className="h-4 w-4 mr-2" />
                        Start Scan
                      </Button>
                    )}
                  </div>
                  
                  {/* Progress indicator */}
                  {isScanning && (
                    <div className="space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Skanner...
                        </span>
                        <span className="font-mono text-primary">
                          {nmapProgress.percent.toFixed(0)}%
                        </span>
                      </div>
                      <Progress value={nmapProgress.percent} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Hosts funnet: {nmapProgress.hostsFound}</span>
                        <span>Mål: {nmapTarget}</span>
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    Kommando: nmap {nmapScanType === 'quick' ? '-sn' : nmapScanType === 'ports' ? '-sT -F' : '-sV -sC'} {nmapTarget}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Oppdagede Hosts ({nmapResults.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {nmapResults.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Ingen resultater ennå. Kjør en scan for å oppdage hosts.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="divide-y divide-border">
                        {nmapResults.map((host) => (
                          <div key={host.host} className="p-4 hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div className="rounded-lg p-2 bg-success/10">
                                  <Server className="h-4 w-4 text-success" />
                                </div>
                                <div>
                                  <p className="font-mono font-medium text-foreground">{host.host}</p>
                                  <p className="text-xs text-muted-foreground">{host.hostname}</p>
                                </div>
                              </div>
                              <Badge variant="outline">{host.os}</Badge>
                            </div>
                            {host.ports.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {host.ports.map((port) => (
                                  <Badge key={port} variant="secondary" className="font-mono text-xs">
                                    {port}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="openvas">
            <div className="grid gap-4">
              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Dialog open={openvasDialogOpen} onOpenChange={setOpenvasDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="default">
                      <Plus className="h-4 w-4 mr-2" />
                      Ny Scan
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Start OpenVAS Scan</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="scan-name">Scan Navn</Label>
                        <Input
                          id="scan-name"
                          placeholder="F.eks. Nettverksscan Q4"
                          value={newScanName}
                          onChange={(e) => setNewScanName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="scan-target">Mål (IP/Hostname/Range)</Label>
                        <Input
                          id="scan-target"
                          placeholder="192.168.1.0/24 eller server.local"
                          value={newScanTarget}
                          onChange={(e) => setNewScanTarget(e.target.value)}
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Scan Konfigurasjon</Label>
                        <Select value={newScanConfig} onValueChange={setNewScanConfig}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="discovery">Host Discovery (rask)</SelectItem>
                            <SelectItem value="system">System Discovery</SelectItem>
                            <SelectItem value="full">Full and Fast (anbefalt)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpenvasDialogOpen(false)}>
                        Avbryt
                      </Button>
                      <Button onClick={handleStartOpenvasScan} disabled={isStartingOpenvasScan}>
                        {isStartingOpenvasScan ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Starter...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Start Scan
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchOpenvasData}
                  disabled={isLoadingOpenvas}
                >
                  {isLoadingOpenvas ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Oppdater
                </Button>
              </div>

              {/* Scan history */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Scan Historikk
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {isLoadingOpenvas ? (
                    <div className="p-8 text-center">
                      <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                      <p className="mt-2 text-muted-foreground">Laster OpenVAS data...</p>
                    </div>
                  ) : openvasScans.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Ingen OpenVAS scans funnet.</p>
                      <p className="text-xs mt-1">Start en ny scan med knappen over.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {openvasScans.map((scan) => (
                        <div 
                          key={scan.id} 
                          className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => {
                            setSelectedScan(scan);
                            setReportDialogOpen(true);
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-medium text-foreground">{scan.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{scan.target}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={scan.status === 'Running' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success border-success/20'}>
                                {scan.status === 'Running' ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                )}
                                {scan.status}
                              </Badge>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {scan.lastRun}
                            </span>
                            <div className="flex gap-2">
                              <Badge variant="destructive" className="text-[10px]">{scan.high} Høy</Badge>
                              <Badge className="bg-warning/80 text-warning-foreground text-[10px]">{scan.medium} Medium</Badge>
                              <Badge className="bg-primary/80 text-primary-foreground text-[10px]">{scan.low} Lav</Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="vulnerabilities">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Oppdagede Sårbarheter
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {vulnerabilities.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Ingen sårbarheter funnet.</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="divide-y divide-border">
                      {vulnerabilities.map((vuln) => (
                        <div key={vuln.id} className="p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge className={severityColors[vuln.severity as keyof typeof severityColors]}>
                                {vuln.severity.toUpperCase()}
                              </Badge>
                              <Badge variant="outline" className="font-mono text-xs">
                                CVSS: {vuln.cvss}
                              </Badge>
                            </div>
                          </div>
                          <p className="font-medium text-foreground mb-1">{vuln.name}</p>
                          <div className="grid grid-cols-2 gap-4 text-xs mb-2">
                            <div>
                              <span className="text-muted-foreground">Host:</span>
                              <p className="font-mono text-foreground">{vuln.host}:{vuln.port}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Løsning:</span>
                              <p className="text-foreground">{vuln.solution}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="map">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Scan Geolokasjon
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleScanGeoLookup}
                    disabled={isGeoLookingUp}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isGeoLookingUp ? 'animate-spin' : ''}`} />
                    Oppdater GeoIP
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Viser geografisk lokasjon for nmap-hosts, OpenVAS-mål og sårbarheter med eksterne IP-adresser.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <AttackMap attacks={scanGeoLocations} />
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* Scan Report Dialog */}
        <ScanReportDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          scan={selectedScan}
          vulnerabilities={vulnerabilities}
        />
      </main>
    </div>
  );
}
