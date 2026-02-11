import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Wifi, WifiOff, Shield, ShieldAlert, Clock, MapPin, Fingerprint, Globe } from "lucide-react";

interface IoTDevice {
  id: string;
  name: string;
  ip: string;
  mac: string;
  status: "online" | "offline";
  trusted: boolean;
  lastSeen: string;
  vendor?: string;
  model?: string;
  firmware?: string;
  firstSeen?: string;
  network?: string;
  vlan?: number;
  rxBytes?: number;
  txBytes?: number;
  signalStrength?: number;
}

interface Props {
  device: IoTDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function IoTDeviceDetailDialog({ device, open, onOpenChange }: Props) {
  if (!device) return null;

  const details = [
    { icon: Globe, label: "IP-adresse", value: device.ip },
    { icon: Fingerprint, label: "MAC-adresse", value: device.mac },
    { icon: MapPin, label: "Nettverk", value: device.network || "LAN" },
    { icon: Clock, label: "Sist sett", value: device.lastSeen },
    { icon: Clock, label: "Først sett", value: device.firstSeen || "Ukjent" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${device.status === "online" ? "bg-success/10" : "bg-destructive/10"}`}>
              {device.status === "online" ? (
                <Wifi className="h-5 w-5 text-success" />
              ) : (
                <WifiOff className="h-5 w-5 text-destructive" />
              )}
            </div>
            <div>
              <span>{device.name}</span>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={device.status === "online" ? "default" : "destructive"} className="text-[10px]">
                  {device.status === "online" ? "Online" : "Offline"}
                </Badge>
                <Badge variant="outline" className="gap-1 text-[10px]">
                  {device.trusted ? <Shield className="h-3 w-3 text-success" /> : <ShieldAlert className="h-3 w-3 text-warning" />}
                  {device.trusted ? "Klarert" : "Ukjent"}
                </Badge>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Device info */}
          {(device.vendor || device.model) && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              {device.vendor && <p className="text-muted-foreground">Produsent: <span className="text-foreground font-medium">{device.vendor}</span></p>}
              {device.model && <p className="text-muted-foreground">Modell: <span className="text-foreground font-medium">{device.model}</span></p>}
              {device.firmware && <p className="text-muted-foreground">Firmware: <span className="text-foreground font-mono text-xs">{device.firmware}</span></p>}
            </div>
          )}

          <Separator />

          {/* Details grid */}
          <div className="space-y-3">
            {details.map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {d.label}
                  </span>
                  <span className="font-mono text-foreground text-xs">{d.value}</span>
                </div>
              );
            })}
          </div>

          {/* Traffic */}
          {(device.rxBytes || device.txBytes) && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Nedlastet</p>
                  <p className="font-mono font-bold text-foreground">{formatBytes(device.rxBytes)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Opplastet</p>
                  <p className="font-mono font-bold text-foreground">{formatBytes(device.txBytes)}</p>
                </div>
              </div>
            </>
          )}

          {/* Signal */}
          {device.signalStrength !== undefined && (
            <div className="text-sm flex items-center justify-between">
              <span className="text-muted-foreground">Signalstyrke</span>
              <span className="font-mono text-foreground">{device.signalStrength} dBm</span>
            </div>
          )}

          {/* VLAN */}
          {device.vlan !== undefined && (
            <div className="text-sm flex items-center justify-between">
              <span className="text-muted-foreground">VLAN</span>
              <Badge variant="outline" className="font-mono">{device.vlan}</Badge>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
