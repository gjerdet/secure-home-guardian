import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Settings as SettingsIcon, Server, Wifi, HardDrive, Shield,
  Save, TestTube, CheckCircle, XCircle
} from "lucide-react";

const endpoints = [
  { name: "UniFi Controller", key: "unifi", url: "https://192.168.1.1:8443", status: "connected" },
  { name: "TrueNAS API", key: "truenas", url: "http://192.168.1.20/api/v2.0", status: "connected" },
  { name: "Proxmox API", key: "proxmox", url: "https://192.168.1.30:8006/api2/json", status: "connected" },
  { name: "OpenVAS", key: "openvas", url: "http://192.168.1.40:9392", status: "disconnected" },
];

export default function Settings() {
  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-primary/10 p-3">
            <SettingsIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Innstillinger</h1>
            <p className="text-sm text-muted-foreground">Konfigurer API-endepunkter og tilkoblinger</p>
          </div>
        </div>

        <Tabs defaultValue="endpoints" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="endpoints" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Server className="h-4 w-4 mr-2" />
              API Endepunkter
            </TabsTrigger>
            <TabsTrigger value="backend" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              Backend Setup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="endpoints">
            <div className="space-y-4">
              {/* UniFi */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wifi className="h-5 w-5 text-primary" />
                      UniFi Controller
                    </div>
                    <Badge className={endpoints[0].status === "connected" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>
                      {endpoints[0].status === "connected" ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      {endpoints[0].status === "connected" ? "Tilkoblet" : "Frakoblet"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Controller URL</Label>
                      <Input defaultValue="https://192.168.1.1:8443" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Site Name</Label>
                      <Input defaultValue="default" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Brukernavn</Label>
                      <Input defaultValue="admin" className="bg-muted border-border mt-1" />
                    </div>
                    <div>
                      <Label>Passord</Label>
                      <Input type="password" defaultValue="********" className="bg-muted border-border mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline"><TestTube className="h-4 w-4 mr-2" />Test Tilkobling</Button>
                    <Button className="bg-primary text-primary-foreground"><Save className="h-4 w-4 mr-2" />Lagre</Button>
                  </div>
                </CardContent>
              </Card>

              {/* TrueNAS */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-5 w-5 text-primary" />
                      TrueNAS Scale
                    </div>
                    <Badge className="bg-success/10 text-success">
                      <CheckCircle className="h-3 w-3 mr-1" />Tilkoblet
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>API URL</Label>
                      <Input defaultValue="http://192.168.1.20/api/v2.0" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>API Key</Label>
                      <Input type="password" defaultValue="********" className="bg-muted border-border font-mono mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline"><TestTube className="h-4 w-4 mr-2" />Test Tilkobling</Button>
                    <Button className="bg-primary text-primary-foreground"><Save className="h-4 w-4 mr-2" />Lagre</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Proxmox */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-primary" />
                      Proxmox VE
                    </div>
                    <Badge className="bg-success/10 text-success">
                      <CheckCircle className="h-3 w-3 mr-1" />Tilkoblet
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>API URL</Label>
                      <Input defaultValue="https://192.168.1.30:8006" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Node Name</Label>
                      <Input defaultValue="proxmox-01" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Brukernavn</Label>
                      <Input defaultValue="root@pam" className="bg-muted border-border mt-1" />
                    </div>
                    <div>
                      <Label>API Token</Label>
                      <Input type="password" defaultValue="********" className="bg-muted border-border font-mono mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline"><TestTube className="h-4 w-4 mr-2" />Test Tilkobling</Button>
                    <Button className="bg-primary text-primary-foreground"><Save className="h-4 w-4 mr-2" />Lagre</Button>
                  </div>
                </CardContent>
              </Card>

              {/* OpenVAS */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      OpenVAS / Greenbone
                    </div>
                    <Badge className="bg-destructive/10 text-destructive">
                      <XCircle className="h-3 w-3 mr-1" />Frakoblet
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>GMP URL</Label>
                      <Input defaultValue="http://192.168.1.40:9392" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Brukernavn</Label>
                      <Input defaultValue="admin" className="bg-muted border-border mt-1" />
                    </div>
                    <div>
                      <Label>Passord</Label>
                      <Input type="password" className="bg-muted border-border mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline"><TestTube className="h-4 w-4 mr-2" />Test Tilkobling</Button>
                    <Button className="bg-primary text-primary-foreground"><Save className="h-4 w-4 mr-2" />Lagre</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="backend">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle>Lokal Backend Setup</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="prose prose-invert max-w-none text-sm">
                  <p className="text-muted-foreground mb-4">
                    For å koble denne frontend-appen til dine lokale systemer, må du sette opp en lokal backend API-server på Ubuntu-serveren din.
                  </p>
                  
                  <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs overflow-x-auto mb-4">
                    <p className="text-primary mb-2"># Installer Node.js og npm</p>
                    <p className="text-foreground">sudo apt update && sudo apt install nodejs npm</p>
                    <p className="text-foreground mt-2">cd /opt && mkdir netguard-api && cd netguard-api</p>
                    <p className="text-foreground">npm init -y</p>
                    <p className="text-foreground">npm install express cors axios python-shell</p>
                  </div>

                  <p className="text-muted-foreground mb-2">Backend API-en vil fungere som en proxy mellom denne appen og:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
                    <li>UniFi Controller API (for IDS/IPS data og enheter)</li>
                    <li>TrueNAS REST API (for pool og dataset info)</li>
                    <li>Proxmox VE API (for VM/container status)</li>
                    <li>OpenVAS GMP (for sikkerhetsscanning)</li>
                    <li>Nmap (via python-nmap eller shell commands)</li>
                  </ul>

                  <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs mb-4">
                    <p className="text-primary mb-2"># Eksempel API endpoint for UniFi</p>
                    <p className="text-foreground">GET /api/unifi/alerts → Hent IDS/IPS alerts</p>
                    <p className="text-foreground">GET /api/unifi/clients → Hent tilkoblede enheter</p>
                    <p className="text-foreground">GET /api/truenas/pools → Hent storage pools</p>
                    <p className="text-foreground">GET /api/proxmox/vms → Hent VM liste</p>
                    <p className="text-foreground">POST /api/nmap/scan → Start nmap scan</p>
                  </div>

                  <div className="flex gap-2">
                    <div>
                      <Label>Backend API URL</Label>
                      <Input defaultValue="http://localhost:3001" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <Button className="bg-primary text-primary-foreground self-end">
                      <Save className="h-4 w-4 mr-2" />Lagre
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
