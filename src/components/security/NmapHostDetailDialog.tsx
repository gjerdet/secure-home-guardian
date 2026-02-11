import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Server, Wifi, Cpu, HardDrive, Clock, Network, Globe, Shield } from "lucide-react";

export interface NmapHostDetail {
  host: string;
  hostname: string;
  status: string;
  ports: number[];
  os: string;
  // Extended fields for detail view
  mac?: string;
  vendor?: string;
  uptime?: string;
  lastBoot?: string;
  connectionType?: string;
  gateway?: string;
  vlan?: string;
  services?: Array<{
    port: number;
    protocol: string;
    service: string;
    version?: string;
    state: string;
  }>;
  osDetails?: {
    name: string;
    accuracy: number;
    family: string;
    generation?: string;
    cpe?: string;
  };
  traceroute?: Array<{
    hop: number;
    ip: string;
    rtt: string;
    hostname?: string;
  }>;
  scripts?: Array<{
    name: string;
    output: string;
  }>;
}

interface NmapHostDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  host: NmapHostDetail | null;
}

export function NmapHostDetailDialog({ open, onOpenChange, host }: NmapHostDetailDialogProps) {
  if (!host) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            {host.host} — {host.hostname}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="space-y-4">
            {/* General Info */}
            <Card className="bg-muted/30 border-border">
              <CardContent className="p-4 grid grid-cols-2 gap-3 text-sm">
                <InfoRow icon={<Globe className="h-4 w-4" />} label="IP-adresse" value={host.host} mono />
                <InfoRow icon={<Server className="h-4 w-4" />} label="Hostname" value={host.hostname} />
                <InfoRow icon={<Cpu className="h-4 w-4" />} label="OS" value={host.os} />
                {host.mac && <InfoRow icon={<Network className="h-4 w-4" />} label="MAC-adresse" value={host.mac} mono />}
                {host.vendor && <InfoRow icon={<HardDrive className="h-4 w-4" />} label="Leverandør" value={host.vendor} />}
                {host.connectionType && <InfoRow icon={<Wifi className="h-4 w-4" />} label="Tilkobling" value={host.connectionType} />}
                {host.gateway && <InfoRow icon={<Network className="h-4 w-4" />} label="Gateway" value={host.gateway} mono />}
                {host.vlan && <InfoRow icon={<Shield className="h-4 w-4" />} label="VLAN" value={host.vlan} />}
                {host.uptime && <InfoRow icon={<Clock className="h-4 w-4" />} label="Oppetid" value={host.uptime} />}
                {host.lastBoot && <InfoRow icon={<Clock className="h-4 w-4" />} label="Sist startet" value={host.lastBoot} />}
              </CardContent>
            </Card>

            {/* OS Details */}
            {host.osDetails && (
              <Card className="bg-muted/30 border-border">
                <CardContent className="p-4">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-primary" />
                    OS-detaljer
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Navn:</span>
                      <p className="text-foreground">{host.osDetails.name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Nøyaktighet:</span>
                      <p className="text-foreground">{host.osDetails.accuracy}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Familie:</span>
                      <p className="text-foreground">{host.osDetails.family}</p>
                    </div>
                    {host.osDetails.generation && (
                      <div>
                        <span className="text-muted-foreground text-xs">Generasjon:</span>
                        <p className="text-foreground">{host.osDetails.generation}</p>
                      </div>
                    )}
                    {host.osDetails.cpe && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground text-xs">CPE:</span>
                        <p className="font-mono text-xs text-foreground">{host.osDetails.cpe}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Services / Ports */}
            {host.services && host.services.length > 0 && (
              <Card className="bg-muted/30 border-border">
                <CardContent className="p-4">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Tjenester ({host.services.length})
                  </h4>
                  <div className="space-y-1">
                    <div className="grid grid-cols-[60px_60px_1fr_1fr] gap-2 text-xs text-muted-foreground font-semibold pb-1 border-b border-border">
                      <span>Port</span>
                      <span>Proto</span>
                      <span>Tjeneste</span>
                      <span>Versjon</span>
                    </div>
                    {host.services.map((svc, i) => (
                      <div key={i} className="grid grid-cols-[60px_60px_1fr_1fr] gap-2 text-sm py-1.5 border-b border-border/50 last:border-0">
                        <Badge variant="secondary" className="font-mono text-xs w-fit">{svc.port}</Badge>
                        <span className="text-muted-foreground">{svc.protocol}</span>
                        <span className="text-foreground font-medium">{svc.service}</span>
                        <span className="text-muted-foreground text-xs">{svc.version || "—"}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Traceroute */}
            {host.traceroute && host.traceroute.length > 0 && (
              <Card className="bg-muted/30 border-border">
                <CardContent className="p-4">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Network className="h-4 w-4 text-primary" />
                    Traceroute
                  </h4>
                  <div className="space-y-1">
                    {host.traceroute.map((hop, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm py-1 border-b border-border/50 last:border-0">
                        <Badge variant="outline" className="font-mono text-xs w-8 justify-center">{hop.hop}</Badge>
                        <span className="font-mono text-foreground">{hop.ip}</span>
                        {hop.hostname && <span className="text-muted-foreground text-xs">({hop.hostname})</span>}
                        <span className="ml-auto text-xs text-muted-foreground">{hop.rtt}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* NSE Scripts */}
            {host.scripts && host.scripts.length > 0 && (
              <Card className="bg-muted/30 border-border">
                <CardContent className="p-4">
                  <h4 className="text-sm font-semibold mb-3">NSE Script Resultater</h4>
                  <div className="space-y-2">
                    {host.scripts.map((script, i) => (
                      <div key={i} className="text-sm">
                        <p className="font-medium text-foreground">{script.name}</p>
                        <pre className="text-xs text-muted-foreground bg-muted p-2 rounded mt-1 whitespace-pre-wrap">{script.output}</pre>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary">{icon}</span>
      <div>
        <span className="text-muted-foreground text-xs">{label}</span>
        <p className={`text-foreground text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
    </div>
  );
}
