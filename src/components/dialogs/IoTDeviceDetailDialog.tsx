import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Wifi, WifiOff, Shield, ShieldAlert, Clock, MapPin, Fingerprint, Globe, Radio, Router, Network } from "lucide-react";

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
  connectedTo?: string;
  connection?: string;
  channel?: string;
  txRate?: number;
  rxRate?: number;
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

  const isWired = device.connection === "Ethernet";

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
          {/* Connection path */}
          {device.connectedTo && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-2">Tilkoblingssti</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="gap-1 bg-primary/10 text-primary border-primary/20">
                  {isWired ? <Network className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
                  {device.name}
                </Badge>
                <span className="text-muted-foreground text-xs">→</span>
                <Badge variant="outline" className="gap-1 font-mono text-xs">
                  {isWired ? <Network className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
                  {device.connectedTo}
                </Badge>
                <span className="text-muted-foreground text-xs">→</span>
                <Badge variant="outline" className="gap-1 font-mono text-xs">
                  <Router className="h-3 w-3" />
                  Gateway
                </Badge>
                <span className="text-muted-foreground text-xs">→</span>
                <Badge variant="outline" className="gap-1 font-mono text-xs">
                  <Globe className="h-3 w-3" />
                  WAN
                </Badge>
              </div>
              {device.connection && (
                <p className="text-xs text-muted-foreground mt-2">
                  Tilkobling: <span className="text-foreground font-medium">{device.connection}</span>
                  {device.channel && <> • Kanal: <span className="text-foreground font-mono">{device.channel}</span></>}
                </p>
              )}
            </div>
          )}

          {/* Device info */}
          {(device.vendor || device.model) && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              {device.vendor && <p className="text-muted-foreground">Produsent: <span className="text-foreground font-medium">{device.vendor}</span></p>}
              {device.model && <p className="text-muted-foreground">Modell: <span className="text-foreground font-medium">{device.model}</span></p>}
              {device.firmware && <p className="text-muted-foreground">Firmware: <span className="text-foreground font-mono text-xs">{device.firmware}</span></p>}
            </div>
          )}

          <Separator />

          {/* Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><Globe className="h-3.5 w-3.5" />IP-adresse</span>
              <span className="font-mono text-foreground text-xs">{device.ip}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><Fingerprint className="h-3.5 w-3.5" />MAC-adresse</span>
              <span className="font-mono text-foreground text-xs">{device.mac}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5" />Nettverk</span>
              <span className="font-mono text-foreground text-xs">{device.network || "LAN"}{device.vlan !== undefined && ` (VLAN ${device.vlan})`}</span>
            </div>
            {device.connectedTo && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><Radio className="h-3.5 w-3.5" />Tilkoblet til</span>
                <span className="font-mono text-foreground text-xs">{device.connectedTo}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3.5 w-3.5" />Sist sett</span>
              <span className="font-mono text-foreground text-xs">{device.lastSeen}</span>
            </div>
          </div>

          {/* Signal strength */}
          {device.signalStrength !== undefined && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-2">Signalstyrke</p>
                <div className="flex items-center gap-3">
                  <Progress
                    value={Math.min(100, Math.max(0, (device.signalStrength + 90) * 2.5))}
                    className="h-2 flex-1"
                  />
                  <span className={`font-mono text-sm ${device.signalStrength > -50 ? "text-success" : device.signalStrength > -65 ? "text-foreground" : device.signalStrength > -75 ? "text-warning" : "text-destructive"}`}>
                    {device.signalStrength} dBm
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {device.signalStrength > -50 ? "Utmerket" : device.signalStrength > -65 ? "Bra" : device.signalStrength > -75 ? "Middels" : "Svakt"} signal
                </p>
              </div>
            </>
          )}

          {/* Speed */}
          {(device.txRate || device.rxRate) && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">TX hastighet</p>
                <p className="font-mono font-bold text-foreground">{device.txRate} Mbps</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">RX hastighet</p>
                <p className="font-mono font-bold text-foreground">{device.rxRate} Mbps</p>
              </div>
            </div>
          )}

          {/* Traffic */}
          {(device.rxBytes || device.txBytes) && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Nedlastet</p>
                <p className="font-mono font-bold text-foreground">{formatBytes(device.rxBytes)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Opplastet</p>
                <p className="font-mono font-bold text-foreground">{formatBytes(device.txBytes)}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
