import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Download, CheckCircle, XCircle, Loader2, RefreshCw,
  Play, RotateCcw, Package, Server, Shield, Search, Container
} from "lucide-react";


const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface ServiceStatus {
  id: string;
  name: string;
  installed: boolean;
  version: string;
  running: boolean | null;
}

const serviceIcons: Record<string, React.ElementType> = {
  nodejs: Package,
  nginx: Server,
  docker: Container,
  nmap: Search,
  openvas: Shield,
};

const serviceDescriptions: Record<string, string> = {
  nodejs: "JavaScript runtime for backend-serveren",
  nginx: "Webserver og reverse proxy for frontend",
  docker: "Container runtime for OpenVAS og andre tjenester",
  nmap: "Nettverksskanner for port- og vertsoppdagelse",
  openvas: "Fullverdig sårbarhetsskanner (Greenbone)",
};

export default function Installer() {
  const { token } = useAuth();
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState(0);
  const [installLogs, setInstallLogs] = useState<string[]>([]);
  const [restarting, setRestarting] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/system/services`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setServices(data.services);
      } else {
        // Demo mode fallback
        setServices([
          { id: "nodejs", name: "Node.js", installed: true, version: "v20.11.0", running: null },
          { id: "nginx", name: "Nginx", installed: true, version: "1.24.0", running: true },
          { id: "docker", name: "Docker", installed: false, version: "", running: false },
          { id: "nmap", name: "Nmap", installed: false, version: "", running: null },
          { id: "openvas", name: "OpenVAS/Greenbone", installed: false, version: "", running: false },
        ]);
      }
    } catch {
      // Demo fallback
      setServices([
        { id: "nodejs", name: "Node.js", installed: true, version: "v20.11.0", running: null },
        { id: "nginx", name: "Nginx", installed: true, version: "1.24.0", running: true },
        { id: "docker", name: "Docker", installed: false, version: "", running: false },
        { id: "nmap", name: "Nmap", installed: false, version: "", running: null },
        { id: "openvas", name: "OpenVAS/Greenbone", installed: false, version: "", running: false },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [installLogs]);

  const handleInstall = (serviceId: string) => {
    if (installing) return;

    // Check dependency: openvas requires docker
    if (serviceId === "openvas") {
      const docker = services.find((s) => s.id === "docker");
      if (!docker?.installed) {
        toast.error("Docker må installeres først for å kjøre OpenVAS");
        return;
      }
    }

    setInstalling(serviceId);
    setInstallProgress(0);
    setInstallLogs([]);

    const eventSource = new EventSource(
      `${API_BASE}/api/system/install/${serviceId}`
    );

    // Since SSE POST isn't standard via EventSource, use fetch with ReadableStream
    fetch(`${API_BASE}/api/system/install/${serviceId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (response) => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        setInstalling(null);
        return;
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));

              switch (event.type) {
                case "start":
                  setInstallLogs((prev) => [...prev, `🚀 ${event.message}`]);
                  break;
                case "progress":
                  setInstallProgress(
                    Math.round((event.step / event.total) * 100)
                  );
                  setInstallLogs((prev) => [...prev, `📦 ${event.message}`]);
                  break;
                case "log":
                  setInstallLogs((prev) => [...prev, event.message]);
                  break;
                case "error":
                  setInstallLogs((prev) => [...prev, `❌ ${event.message}`]);
                  break;
                case "complete":
                  setInstallLogs((prev) => [...prev, `✅ ${event.message}`]);
                  setInstallProgress(100);
                  toast.success(event.message);
                  setInstalling(null);
                  fetchServices();
                  break;
              }
            } catch {}
          }
        }
      }

      setInstalling(null);
    }).catch(() => {
      toast.error("Installasjon feilet - sjekk at backend kjører som root");
      setInstalling(null);
    });

    eventSource.close();
  };

  const handleRestart = async (serviceId: string) => {
    setRestarting(serviceId);
    try {
      const res = await fetch(`${API_BASE}/api/system/restart/${serviceId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(`${serviceId} restartet`);
        fetchServices();
      } else {
        const data = await res.json();
        toast.error(data.error || "Restart feilet");
      }
    } catch {
      toast.error("Kunne ikke kontakte server");
    } finally {
      setRestarting(null);
    }
  };

  const handleInstallAll = () => {
    const uninstalled = services.filter((s) => !s.installed);
    if (uninstalled.length === 0) {
      toast.info("Alle tjenester er allerede installert");
      return;
    }
    // Install first uninstalled service; user can click again for next
    handleInstall(uninstalled[0].id);
  };

  const installedCount = services.filter((s) => s.installed).length;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Download className="h-6 w-6 text-primary" />
              Systeminstallasjon
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Installer og administrer alle NetGuard-tjenester fra GUI
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchServices}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Oppdater status
            </Button>
            <Button
              size="sm"
              onClick={handleInstallAll}
              disabled={!!installing || installedCount === services.length}
            >
              <Download className="h-4 w-4 mr-2" />
              Installer alle
            </Button>
          </div>
        </div>

        {/* Overview card */}

        {/* Overview card */}
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                {installedCount} av {services.length} tjenester installert
              </div>
              <Progress
                value={(installedCount / Math.max(services.length, 1)) * 100}
                className="flex-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Service cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((svc) => {
            const Icon = serviceIcons[svc.id] || Package;
            const isInstalling = installing === svc.id;
            const isRestarting = restarting === svc.id;

            return (
              <Card
                key={svc.id}
                className={`bg-card border-border transition-all ${
                  isInstalling ? "ring-2 ring-primary" : ""
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          svc.installed
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{svc.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {serviceDescriptions[svc.id]}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Status badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {svc.installed ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Installert
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Ikke installert
                      </Badge>
                    )}
                    {svc.running === true && (
                      <Badge className="gap-1 bg-primary hover:bg-primary/90">
                        <Play className="h-3 w-3" />
                        Kjører
                      </Badge>
                    )}
                    {svc.running === false && svc.installed && (
                      <Badge variant="destructive" className="gap-1">
                        Stoppet
                      </Badge>
                    )}
                    {svc.version && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {svc.version}
                      </span>
                    )}
                  </div>

                  {/* Install progress */}
                  {isInstalling && (
                    <div className="space-y-2">
                      <Progress value={installProgress} />
                      <p className="text-xs text-muted-foreground">
                        Installerer... {installProgress}%
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {!svc.installed && (
                      <Button
                        size="sm"
                        onClick={() => handleInstall(svc.id)}
                        disabled={!!installing}
                        className="flex-1"
                      >
                        {isInstalling ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-1" />
                        )}
                        {isInstalling ? "Installerer..." : "Installer"}
                      </Button>
                    )}
                    {svc.installed && svc.running !== null && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestart(svc.id)}
                        disabled={isRestarting || !!installing}
                      >
                        {isRestarting ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4 mr-1" />
                        )}
                        Restart
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Installation logs */}
        {installLogs.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Installasjonslogg
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64 w-full rounded-md border border-border bg-background p-3">
                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                  {installLogs.map((line, i) => (
                    <div key={i} className={
                      line.startsWith("❌") ? "text-destructive" :
                      line.startsWith("✅") ? "text-primary" :
                      line.startsWith("🚀") ? "text-accent-foreground" :
                      ""
                    }>
                      {line}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}