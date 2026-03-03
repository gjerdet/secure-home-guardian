import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  ShieldAlert, Plus, Trash2, Edit2, Play, Clock, CheckCircle,
  AlertTriangle, Loader2, Server, Router, Laptop, Smartphone,
  HardDrive, Cpu, Monitor, RefreshCw, Calendar, XCircle
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE, fetchJsonSafely } from "@/lib/api";

export interface CriticalDevice {
  id: string;
  name: string;
  host: string; // IP or hostname
  description?: string;
  icon: string;
  tags: string[];
  scheduledScan: {
    enabled: boolean;
    interval: "hourly" | "daily" | "weekly";
    scanType: "quick" | "full" | "deep" | "ports";
    lastRun?: string;
    nextRun?: string;
  };
  lastScanStatus?: "ok" | "warning" | "critical" | "error" | "pending";
  lastScanSummary?: string;
}

interface ScanState {
  deviceId: string;
  jobId: string;
  percent: number;
  status: "scanning" | "complete" | "error";
}

const ICONS = [
  { value: "server", label: "Server", Icon: Server },
  { value: "router", label: "Ruter", Icon: Router },
  { value: "laptop", label: "PC", Icon: Laptop },
  { value: "smartphone", label: "Mobil", Icon: Smartphone },
  { value: "harddrive", label: "NAS/Lagring", Icon: HardDrive },
  { value: "cpu", label: "PLC/Industri", Icon: Cpu },
  { value: "monitor", label: "Skjerm/Kamera", Icon: Monitor },
];

function DeviceIcon({ icon, className }: { icon: string; className?: string }) {
  const found = ICONS.find(i => i.value === icon);
  const Icon = found?.Icon ?? Server;
  return <Icon className={className} />;
}

const STORAGE_KEY = "netguard_critical_devices";

function loadDevices(): CriticalDevice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveDevices(devices: CriticalDevice[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

function nextRunTime(interval: "hourly" | "daily" | "weekly"): string {
  const now = new Date();
  if (interval === "hourly") now.setHours(now.getHours() + 1);
  else if (interval === "daily") now.setDate(now.getDate() + 1);
  else now.setDate(now.getDate() + 7);
  return now.toISOString();
}

function formatRelative(iso?: string): string {
  if (!iso) return "Aldri";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "Akkurat nå";
  if (mins < 60) return `${mins} min siden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} t siden`;
  return `${Math.floor(hrs / 24)} dager siden`;
}

function formatNextRun(iso?: string): string {
  if (!iso) return "Ikke planlagt";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Snart";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Om ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Om ${hrs} t`;
  return `Om ${Math.floor(hrs / 24)} dager`;
}

const statusConfig = {
  ok: { label: "OK", color: "bg-success/10 text-success border-success/20", Icon: CheckCircle },
  warning: { label: "Advarsel", color: "bg-warning/10 text-warning border-warning/20", Icon: AlertTriangle },
  critical: { label: "Kritisk", color: "bg-destructive/10 text-destructive border-destructive/20", Icon: AlertTriangle },
  error: { label: "Feil", color: "bg-muted text-muted-foreground border-border", Icon: XCircle },
  pending: { label: "Venter", color: "bg-primary/10 text-primary border-primary/20", Icon: Clock },
};

interface CriticalDevicesPanelProps {
  authHeaders: Record<string, string>;
}

export function CriticalDevicesPanel({ authHeaders }: CriticalDevicesPanelProps) {
  const [devices, setDevices] = useState<CriticalDevice[]>(loadDevices);
  const [scans, setScans] = useState<Map<string, ScanState>>(new Map());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDevice, setEditDevice] = useState<CriticalDevice | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formHost, setFormHost] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formIcon, setFormIcon] = useState("server");
  const [formTags, setFormTags] = useState("");
  const [formSchedEnabled, setFormSchedEnabled] = useState(false);
  const [formSchedInterval, setFormSchedInterval] = useState<"hourly" | "daily" | "weekly">("daily");
  const [formScanType, setFormScanType] = useState<"quick" | "full" | "deep" | "ports">("quick");

  // Check scheduled scans every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setDevices(prev => {
        let updated = false;
        const next = prev.map(d => {
          if (!d.scheduledScan.enabled || !d.scheduledScan.nextRun) return d;
          if (new Date(d.scheduledScan.nextRun).getTime() <= now) {
            updated = true;
            runScan(d);
            return {
              ...d,
              scheduledScan: {
                ...d.scheduledScan,
                lastRun: new Date().toISOString(),
                nextRun: nextRunTime(d.scheduledScan.interval),
              },
            };
          }
          return d;
        });
        if (updated) saveDevices(next);
        return updated ? next : prev;
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateDevices = useCallback((next: CriticalDevice[]) => {
    setDevices(next);
    saveDevices(next);
  }, []);

  const openAdd = () => {
    setEditDevice(null);
    setFormName(""); setFormHost(""); setFormDesc(""); setFormIcon("server");
    setFormTags(""); setFormSchedEnabled(false); setFormSchedInterval("daily");
    setFormScanType("quick");
    setDialogOpen(true);
  };

  const openEdit = (d: CriticalDevice) => {
    setEditDevice(d);
    setFormName(d.name); setFormHost(d.host); setFormDesc(d.description || "");
    setFormIcon(d.icon); setFormTags(d.tags.join(", "));
    setFormSchedEnabled(d.scheduledScan.enabled);
    setFormSchedInterval(d.scheduledScan.interval);
    setFormScanType(d.scheduledScan.scanType);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim() || !formHost.trim()) {
      toast.error("Namn og IP/hostname er påkravd");
      return;
    }
    const tags = formTags.split(",").map(t => t.trim()).filter(Boolean);
    if (editDevice) {
      updateDevices(devices.map(d =>
        d.id === editDevice.id ? {
          ...d, name: formName, host: formHost, description: formDesc,
          icon: formIcon, tags,
          scheduledScan: {
            ...d.scheduledScan,
            enabled: formSchedEnabled,
            interval: formSchedInterval,
            scanType: formScanType,
            nextRun: formSchedEnabled ? nextRunTime(formSchedInterval) : undefined,
          },
        } : d
      ));
      toast.success("Enhet oppdatert");
    } else {
      const newDevice: CriticalDevice = {
        id: crypto.randomUUID(),
        name: formName, host: formHost, description: formDesc,
        icon: formIcon, tags,
        scheduledScan: {
          enabled: formSchedEnabled,
          interval: formSchedInterval,
          scanType: formScanType,
          nextRun: formSchedEnabled ? nextRunTime(formSchedInterval) : undefined,
        },
        lastScanStatus: "pending",
      };
      updateDevices([...devices, newDevice]);
      toast.success("Enhet lagt til");
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Slette denne enheten?")) return;
    updateDevices(devices.filter(d => d.id !== id));
    toast.success("Enhet sletta");
  };

  const runScan = useCallback(async (device: CriticalDevice) => {
    if (scans.get(device.id)?.status === "scanning") {
      toast.info("Skanning allereie pågår");
      return;
    }

    setScans(prev => new Map(prev).set(device.id, { deviceId: device.id, jobId: "", percent: 0, status: "scanning" }));

    try {
      const res = await fetchJsonSafely(`${API_BASE}/api/nmap/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ target: device.host, scanType: device.scheduledScan.scanType }),
      });

      if (!res.ok || !res.data) throw new Error(res.error || "Kunne ikkje starte skanning");

      const jobId = (res.data as any).jobId;
      setScans(prev => new Map(prev).set(device.id, { deviceId: device.id, jobId, percent: 5, status: "scanning" }));

      // Poll for completion
      const poll = setInterval(async () => {
        const statusRes = await fetchJsonSafely(`${API_BASE}/api/nmap/scan-status/${jobId}`, { headers: authHeaders });
        if (!statusRes.ok) return;

        const data = statusRes.data as any;
        setScans(prev => new Map(prev).set(device.id, { deviceId: device.id, jobId, percent: data.percent ?? 50, status: "scanning" }));

        if (data.status === "complete" || data.status === "error" || data.status === "cancelled") {
          clearInterval(poll);

          const openPorts: number[] = [];
          if (data.result) {
            // Count open ports from raw XML
            const matches = (data.result as string).matchAll(/state="open"/g);
            for (const _ of matches) openPorts.push(1);
          }

          const lastScanStatus: CriticalDevice["lastScanStatus"] =
            data.status !== "complete" ? "error" :
            openPorts.length > 10 ? "warning" :
            "ok";

          setDevices(prev => {
            const next = prev.map(d => d.id === device.id ? {
              ...d,
              lastScanStatus,
              lastScanSummary: data.status === "complete"
                ? `${openPorts.length} opne portar funne`
                : "Skanning mislyktes",
              scheduledScan: {
                ...d.scheduledScan,
                lastRun: new Date().toISOString(),
                nextRun: d.scheduledScan.enabled ? nextRunTime(d.scheduledScan.interval) : d.scheduledScan.nextRun,
              },
            } : d);
            saveDevices(next);
            return next;
          });

          setScans(prev => new Map(prev).set(device.id, { deviceId: device.id, jobId, percent: 100, status: data.status === "complete" ? "complete" : "error" }));
          toast.success(`Skanning av ${device.name} fullført`);
        }
      }, 3000);
    } catch (err: any) {
      setScans(prev => new Map(prev).set(device.id, { deviceId: device.id, jobId: "", percent: 0, status: "error" }));
      toast.error(`Skanning feilet: ${err.message}`);
    }
  }, [authHeaders, scans]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            Kritiske einheiter
            <Badge variant="outline" className="ml-1 text-xs font-normal">
              {devices.length}
            </Badge>
          </CardTitle>
          <Button size="sm" onClick={openAdd} className="h-7 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Legg til
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Definer kritiske einheiter og sett opp planlagte Nmap-skanningar mot dei.
        </p>
      </CardHeader>

      <CardContent className="pt-0">
        {devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <ShieldAlert className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium">Ingen kritiske einheiter</p>
              <p className="text-xs text-muted-foreground mt-1">
                Legg til einheiter du vil overvake med planlagte skanningar
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Legg til første enhet
            </Button>
          </div>
        ) : (
          <ScrollArea className="max-h-[560px]">
            <div className="space-y-2">
              {devices.map(device => {
                const scan = scans.get(device.id);
                const isScanning = scan?.status === "scanning";
                const statusInfo = statusConfig[device.lastScanStatus ?? "pending"];
                const StatusIcon = statusInfo.Icon;

                return (
                  <div
                    key={device.id}
                    className="rounded-lg border border-border bg-card p-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="mt-0.5 h-8 w-8 rounded-md bg-destructive/10 flex items-center justify-center shrink-0">
                        <DeviceIcon icon={device.icon} className="h-4 w-4 text-destructive" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{device.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{device.host}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 h-4 border ${statusInfo.color}`}
                          >
                            <StatusIcon className="h-2.5 w-2.5 mr-1" />
                            {statusInfo.label}
                          </Badge>
                        </div>

                        {device.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{device.description}</p>
                        )}

                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Sist: {formatRelative(device.scheduledScan.lastRun)}
                          </span>
                          {device.scheduledScan.enabled && (
                            <span className="flex items-center gap-1 text-primary">
                              <Calendar className="h-3 w-3" />
                              Neste: {formatNextRun(device.scheduledScan.nextRun)}
                            </span>
                          )}
                          {device.lastScanSummary && (
                            <span className="text-muted-foreground">{device.lastScanSummary}</span>
                          )}
                        </div>

                        {isScanning && (
                          <div className="mt-2">
                            <div className="flex items-center gap-2 mb-1">
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                              <span className="text-[10px] text-primary">Skanner... {scan?.percent ?? 0}%</span>
                            </div>
                            <Progress value={scan?.percent ?? 0} className="h-1" />
                          </div>
                        )}

                        {device.tags.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {device.tags.map(tag => (
                              <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1.5 py-0">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => runScan(device)}
                          disabled={isScanning}
                          title="Start skanning nå"
                        >
                          {isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEdit(device)}
                          title="Rediger"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 hover:text-destructive"
                          onClick={() => handleDelete(device.id)}
                          title="Slett"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* Summary bar */}
        {devices.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5 text-success" />
              {devices.filter(d => d.lastScanStatus === "ok").length} OK
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              {devices.filter(d => d.lastScanStatus === "warning").length} Advarsel
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              {devices.filter(d => d.lastScanStatus === "critical").length} Kritisk
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              {devices.filter(d => d.scheduledScan.enabled).length} planlagte skanningar aktive
            </span>
          </div>
        )}
      </CardContent>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              {editDevice ? "Rediger kritisk enhet" : "Legg til kritisk enhet"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Namn *</Label>
                <Input
                  placeholder="f.eks. Hovudrouter"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">IP / Hostname *</Label>
                <Input
                  placeholder="192.168.1.1"
                  value={formHost}
                  onChange={e => setFormHost(e.target.value)}
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Beskriving</Label>
              <Input
                placeholder="Kort beskriving av einheita"
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Ikon</Label>
                <Select value={formIcon} onValueChange={setFormIcon}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICONS.map(({ value, label, Icon }) => (
                      <SelectItem key={value} value={value}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" /> {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tagger (komma-separert)</Label>
                <Input
                  placeholder="router, kritisk, nett"
                  value={formTags}
                  onChange={e => setFormTags(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Scheduled scan */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Planlagt skanning</p>
                  <p className="text-xs text-muted-foreground">Køyr Nmap automatisk</p>
                </div>
                <Switch checked={formSchedEnabled} onCheckedChange={setFormSchedEnabled} />
              </div>

              {formSchedEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Intervall</Label>
                    <Select value={formSchedInterval} onValueChange={v => setFormSchedInterval(v as any)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Kvar time</SelectItem>
                        <SelectItem value="daily">Dagleg</SelectItem>
                        <SelectItem value="weekly">Vekeleg</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Scan-type</Label>
                    <Select value={formScanType} onValueChange={v => setFormScanType(v as any)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quick">Rask</SelectItem>
                        <SelectItem value="ports">Portar</SelectItem>
                        <SelectItem value="full">Full</SelectItem>
                        <SelectItem value="deep">Djup (OS + tenestar)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-8 text-sm">
              Avbryt
            </Button>
            <Button onClick={handleSave} className="h-8 text-sm gap-1.5">
              {editDevice ? <RefreshCw className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {editDevice ? "Lagre" : "Legg til"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
