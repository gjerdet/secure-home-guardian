import { useState } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Radar, Shield, Search, Clock, AlertTriangle, CheckCircle,
  Play, Target, Globe, Server, FileText, ChevronRight
} from "lucide-react";

const openvasScans = [
  { 
    id: "1", 
    name: "Full Network Scan", 
    target: "192.168.1.0/24",
    lastRun: "2024-12-17 03:00",
    status: "completed",
    high: 2,
    medium: 5,
    low: 12,
    info: 45,
  },
  { 
    id: "2", 
    name: "Web Server Scan", 
    target: "192.168.1.10",
    lastRun: "2024-12-15 18:30",
    status: "completed",
    high: 1,
    medium: 3,
    low: 8,
    info: 22,
  },
];

const vulnerabilities = [
  { id: "1", name: "SSL Certificate Expired", severity: "high", host: "192.168.1.10", port: 443, cvss: 7.5, solution: "Renew SSL certificate" },
  { id: "2", name: "SSH Weak Key Exchange Algorithms", severity: "medium", host: "192.168.1.1", port: 22, cvss: 5.3, solution: "Disable weak algorithms in sshd_config" },
  { id: "3", name: "HTTP TRACE Method Enabled", severity: "medium", host: "192.168.1.10", port: 80, cvss: 5.0, solution: "Disable TRACE method in web server config" },
  { id: "4", name: "DNS Server Cache Snooping", severity: "low", host: "192.168.1.1", port: 53, cvss: 3.7, solution: "Disable recursive queries for external networks" },
  { id: "5", name: "ICMP Timestamp Response", severity: "low", host: "192.168.1.0/24", port: 0, cvss: 2.1, solution: "Filter ICMP timestamp requests at firewall" },
];

const nmapResults = [
  { host: "192.168.1.1", hostname: "router.local", status: "up", ports: [22, 53, 80, 443], os: "Linux 5.x" },
  { host: "192.168.1.10", hostname: "webserver.local", status: "up", ports: [22, 80, 443, 3306], os: "Ubuntu" },
  { host: "192.168.1.20", hostname: "nas.local", status: "up", ports: [22, 80, 139, 445, 9000], os: "TrueNAS" },
  { host: "192.168.1.50", hostname: "hue-bridge.local", status: "up", ports: [80, 443], os: "Embedded" },
  { host: "192.168.1.99", hostname: "unknown", status: "up", ports: [80], os: "Unknown" },
];

const severityColors = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/80 text-destructive-foreground",
  medium: "bg-warning text-warning-foreground",
  low: "bg-primary/80 text-primary-foreground",
  info: "bg-muted text-muted-foreground",
};

export default function Security() {
  const [nmapTarget, setNmapTarget] = useState("192.168.1.0/24");
  const [isScanning, setIsScanning] = useState(false);

  const handleNmapScan = () => {
    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 3000);
  };

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
              <p className="text-3xl font-mono font-bold text-destructive">3</p>
              <p className="text-xs text-muted-foreground">Høy risiko</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-warning">8</p>
              <p className="text-xs text-muted-foreground">Medium risiko</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-primary">20</p>
              <p className="text-xs text-muted-foreground">Lav risiko</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-muted-foreground">67</p>
              <p className="text-xs text-muted-foreground">Informasjon</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-success">87</p>
              <p className="text-xs text-muted-foreground">Sikkerhets-score</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="openvas" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="openvas" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              OpenVAS Scans
            </TabsTrigger>
            <TabsTrigger value="vulnerabilities" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Sårbarheter
            </TabsTrigger>
            <TabsTrigger value="nmap" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Target className="h-4 w-4 mr-2" />
              Nmap
            </TabsTrigger>
          </TabsList>

          <TabsContent value="openvas">
            <div className="grid gap-4">
              {/* Schedule new scan */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Play className="h-4 w-4 text-primary" />
                    Start Ny Scan
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <Input 
                      placeholder="Mål (IP eller subnet)" 
                      defaultValue="192.168.1.0/24"
                      className="flex-1 bg-muted border-border"
                    />
                    <Button className="bg-primary text-primary-foreground">
                      <Play className="h-4 w-4 mr-2" />
                      Start Full Scan
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Scan history */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Scan Historikk
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
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
                              Fullført
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
              </CardContent>
            </Card>
          </TabsContent>

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
                      placeholder="Mål (IP, hostname, eller subnet)"
                      value={nmapTarget}
                      onChange={(e) => setNmapTarget(e.target.value)}
                      className="flex-1 bg-muted border-border font-mono"
                    />
                    <Button 
                      onClick={handleNmapScan}
                      disabled={isScanning}
                      className="bg-primary text-primary-foreground"
                    >
                      {isScanning ? (
                        <>
                          <Search className="h-4 w-4 mr-2 animate-pulse" />
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
                    Kommando: nmap -sV -sC -O {nmapTarget}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Oppdagede Hosts
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
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
                          <div className="flex flex-wrap gap-1 mt-2">
                            {host.ports.map((port) => (
                              <Badge key={port} variant="secondary" className="font-mono text-xs">
                                {port}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
