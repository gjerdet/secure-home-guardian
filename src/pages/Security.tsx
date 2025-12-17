import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Radar, Shield, Search, Clock, AlertTriangle, CheckCircle,
  Play, Target, Globe, Server, FileText, ChevronRight, Loader2, RefreshCw
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
  const [isNmapScanning, setIsNmapScanning] = useState(false);
  const [nmapResults, setNmapResults] = useState<NmapHost[]>([]);
  
  const [openvasScans, setOpenvasScans] = useState<OpenVASScan[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [isLoadingOpenvas, setIsLoadingOpenvas] = useState(false);

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
      toast.error("Kunne ikke koble til OpenVAS. Sjekk at backend kjører og OpenVAS er konfigurert.");
    } finally {
      setIsLoadingOpenvas(false);
    }
  };

  // Run Nmap scan
  const handleNmapScan = async () => {
    // Validate target
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(nmapTarget)) {
      toast.error("Ugyldig mål-format. Bruk IP-adresse eller CIDR (f.eks. 192.168.1.0/24)");
      return;
    }

    setIsNmapScanning(true);
    try {
      const response = await fetch(`${API_BASE}/api/nmap/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: nmapTarget, scanType: nmapScanType }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Scan feilet");
      }

      const data = await response.json();
      const hosts = parseNmapXML(data.result);
      setNmapResults(hosts);
      toast.success(`Scan fullført! Fant ${hosts.length} host(s)`);
    } catch (error) {
      console.error("Nmap scan error:", error);
      toast.error(`Nmap scan feilet: ${error instanceof Error ? error.message : "Ukjent feil"}`);
    } finally {
      setIsNmapScanning(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchOpenvasData();
  }, []);

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
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <Input 
                      placeholder="Mål (IP eller subnet, f.eks. 192.168.1.0/24)"
                      value={nmapTarget}
                      onChange={(e) => setNmapTarget(e.target.value)}
                      className="flex-1 bg-muted border-border font-mono"
                    />
                    <Select value={nmapScanType} onValueChange={setNmapScanType}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quick">Ping Scan</SelectItem>
                        <SelectItem value="ports">Port Scan</SelectItem>
                        <SelectItem value="full">Full Scan</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={handleNmapScan}
                      disabled={isNmapScanning}
                      className="bg-primary text-primary-foreground"
                    >
                      {isNmapScanning ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Skanner...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4 mr-2" />
                          Start Scan
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
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
              {/* Refresh button */}
              <div className="flex justify-end">
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
                      <p className="text-xs mt-1">Sjekk at OpenVAS er konfigurert i backend.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {openvasScans.map((scan) => (
                        <div key={scan.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-medium text-foreground">{scan.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{scan.target}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-success/10 text-success border-success/20">
                                <CheckCircle className="h-3 w-3 mr-1" />
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
        </Tabs>
      </main>
    </div>
  );
}
