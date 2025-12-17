import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { ContainerLogsDialog } from "@/components/status/ContainerLogsDialog";
import { 
  Activity, Box, CheckCircle, XCircle, RefreshCw, Loader2,
  Play, Square, RotateCcw, Server, Database, Shield, Wifi,
  HardDrive, Cpu, MemoryStick, Clock, AlertTriangle, FileText
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ServiceStatus {
  name: string;
  status: 'online' | 'offline' | 'degraded' | 'unknown';
  responseTime?: number;
  message?: string;
  lastCheck?: string;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'exited' | 'paused' | 'restarting';
  ports: string[];
  created: string;
  uptime?: string;
}

interface SystemHealth {
  services: ServiceStatus[];
  containers: DockerContainer[];
  system: {
    uptime: string;
    load: number[];
    memory: { used: number; total: number };
    disk: { used: number; total: number };
  };
}

const statusColors = {
  online: "bg-success text-success-foreground",
  offline: "bg-destructive text-destructive-foreground",
  degraded: "bg-warning text-warning-foreground",
  unknown: "bg-muted text-muted-foreground",
};

const stateColors = {
  running: "bg-success/10 text-success border-success/20",
  exited: "bg-destructive/10 text-destructive border-destructive/20",
  paused: "bg-warning/10 text-warning border-warning/20",
  restarting: "bg-primary/10 text-primary border-primary/20",
};

const serviceIcons: Record<string, typeof Server> = {
  backend: Server,
  unifi: Wifi,
  truenas: HardDrive,
  proxmox: Cpu,
  openvas: Shield,
  docker: Box,
};

export default function Status() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemHealth['system'] | null>(null);
  const [containerAction, setContainerAction] = useState<string | null>(null);
  
  // Logs dialog state
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<DockerContainer | null>(null);

  const fetchStatus = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    
    try {
      const [healthRes, dockerRes] = await Promise.all([
        fetch(`${API_BASE}/api/health/all`),
        fetch(`${API_BASE}/api/docker/containers`),
      ]);

      if (healthRes.ok) {
        const data = await healthRes.json();
        setServices(data.services || []);
        setSystemInfo(data.system || null);
      }

      if (dockerRes.ok) {
        const data = await dockerRes.json();
        setContainers(data.containers || []);
      }
    } catch (error) {
      console.error("Status fetch error:", error);
      // Set fallback offline status
      setServices([
        { name: 'backend', status: 'offline', message: 'Kan ikke koble til backend' }
      ]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleContainerAction = async (containerId: string, action: 'start' | 'stop' | 'restart') => {
    setContainerAction(`${containerId}-${action}`);
    
    try {
      const response = await fetch(`${API_BASE}/api/docker/containers/${containerId}/${action}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Kunne ikke ${action} container`);
      }

      toast.success(`Container ${action === 'start' ? 'startet' : action === 'stop' ? 'stoppet' : 'restartet'}`);
      
      // Refresh after action
      setTimeout(() => fetchStatus(true), 1000);
    } catch (error) {
      toast.error(`Feil: ${error instanceof Error ? error.message : 'Ukjent feil'}`);
    } finally {
      setContainerAction(null);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => fetchStatus(), 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const onlineServices = services.filter(s => s.status === 'online').length;
  const runningContainers = containers.filter(c => c.state === 'running').length;

  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-3">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">System Status</h1>
              <p className="text-sm text-muted-foreground">Tjenester • Docker • Helsesjekk</p>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            onClick={() => fetchStatus(true)}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Oppdater
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-success">{onlineServices}</p>
                  <p className="text-xs text-muted-foreground">Tjenester online</p>
                </div>
                <CheckCircle className="h-8 w-8 text-success/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-primary">{runningContainers}</p>
                  <p className="text-xs text-muted-foreground">Containers kjører</p>
                </div>
                <Box className="h-8 w-8 text-primary/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {systemInfo ? `${Math.round((systemInfo.memory.used / systemInfo.memory.total) * 100)}%` : '--'}
                  </p>
                  <p className="text-xs text-muted-foreground">Minnebruk</p>
                </div>
                <MemoryStick className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {systemInfo?.uptime || '--'}
                  </p>
                  <p className="text-xs text-muted-foreground">Oppetid</p>
                </div>
                <Clock className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Services */}
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Tjenester
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                  <p className="mt-2 text-muted-foreground">Sjekker tjenester...</p>
                </div>
              ) : services.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Ingen tjenester konfigurert</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {services.map((service) => {
                    const Icon = serviceIcons[service.name] || Server;
                    return (
                      <div key={service.name} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`rounded-lg p-2 ${service.status === 'online' ? 'bg-success/10' : 'bg-muted'}`}>
                            <Icon className={`h-4 w-4 ${service.status === 'online' ? 'text-success' : 'text-muted-foreground'}`} />
                          </div>
                          <div>
                            <p className="font-medium text-foreground capitalize">{service.name}</p>
                            {service.message && (
                              <p className="text-xs text-muted-foreground">{service.message}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {service.responseTime && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {service.responseTime}ms
                            </span>
                          )}
                          <Badge className={statusColors[service.status]}>
                            {service.status === 'online' ? (
                              <CheckCircle className="h-3 w-3 mr-1" />
                            ) : (
                              <XCircle className="h-3 w-3 mr-1" />
                            )}
                            {service.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Docker Containers */}
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <Box className="h-5 w-5 text-primary" />
                Docker Containers
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                  <p className="mt-2 text-muted-foreground">Henter containers...</p>
                </div>
              ) : containers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Box className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Ingen Docker containers funnet</p>
                  <p className="text-xs mt-1">Sjekk at Docker er installert og kjører</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border">
                    {containers.map((container) => (
                      <div key={container.id} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={`rounded-lg p-2 ${container.state === 'running' ? 'bg-success/10' : 'bg-muted'}`}>
                              <Box className={`h-4 w-4 ${container.state === 'running' ? 'text-success' : 'text-muted-foreground'}`} />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{container.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{container.image}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className={stateColors[container.state]}>
                            {container.state}
                          </Badge>
                        </div>
                        
                        {container.ports.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {container.ports.map((port, idx) => (
                              <Badge key={idx} variant="secondary" className="font-mono text-xs">
                                {port}
                              </Badge>
                            ))}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2">
                          {container.state === 'running' ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleContainerAction(container.id, 'stop')}
                                disabled={containerAction === `${container.id}-stop`}
                              >
                                {containerAction === `${container.id}-stop` ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <Square className="h-3 w-3 mr-1" />
                                )}
                                Stopp
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleContainerAction(container.id, 'restart')}
                                disabled={containerAction === `${container.id}-restart`}
                              >
                                {containerAction === `${container.id}-restart` ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                )}
                                Restart
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleContainerAction(container.id, 'start')}
                              disabled={containerAction === `${container.id}-start`}
                            >
                              {containerAction === `${container.id}-start` ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <Play className="h-3 w-3 mr-1" />
                              )}
                              Start
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedContainer(container);
                              setLogsDialogOpen(true);
                            }}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            Logs
                          </Button>
                          {container.uptime && (
                            <span className="text-xs text-muted-foreground ml-auto">
                              Oppe i {container.uptime}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* System Resources */}
        {systemInfo && (
          <Card className="bg-card border-border mt-6">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                Systemressurser
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid md:grid-cols-3 gap-6">
                {/* CPU Load */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">CPU Load (1/5/15 min)</span>
                    <span className="font-mono">{systemInfo.load.map(l => l.toFixed(2)).join(' / ')}</span>
                  </div>
                  <Progress value={Math.min(systemInfo.load[0] * 100, 100)} className="h-2" />
                </div>
                
                {/* Memory */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Minne</span>
                    <span className="font-mono">
                      {(systemInfo.memory.used / 1024 / 1024 / 1024).toFixed(1)}GB / {(systemInfo.memory.total / 1024 / 1024 / 1024).toFixed(1)}GB
                    </span>
                  </div>
                  <Progress value={(systemInfo.memory.used / systemInfo.memory.total) * 100} className="h-2" />
                </div>
                
                {/* Disk */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Disk</span>
                    <span className="font-mono">
                      {(systemInfo.disk.used / 1024 / 1024 / 1024).toFixed(1)}GB / {(systemInfo.disk.total / 1024 / 1024 / 1024).toFixed(1)}GB
                    </span>
                  </div>
                  <Progress value={(systemInfo.disk.used / systemInfo.disk.total) * 100} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Container Logs Dialog */}
        <ContainerLogsDialog
          open={logsDialogOpen}
          onOpenChange={setLogsDialogOpen}
          container={selectedContainer}
        />
      </main>
    </div>
  );
}
