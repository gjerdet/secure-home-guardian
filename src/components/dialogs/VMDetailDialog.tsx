import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Monitor, Box, Cpu, MemoryStick, HardDrive, Clock, Play, Square, RotateCcw, Network } from "lucide-react";

interface VMData {
  id: string;
  name: string;
  status: string;
  cpu: number;
  memory: { used: number; total: number };
  disk: number;
  uptime: string;
  os?: string;
  image?: string;
  type: "vm" | "lxc";
  cores?: number;
  sockets?: number;
  network?: { ip?: string; bridge?: string; rate?: number };
  snapshots?: number;
  backup?: string;
}

interface Props {
  vm: VMData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VMDetailDialog({ vm, open, onOpenChange }: Props) {
  if (!vm) return null;

  const Icon = vm.type === "vm" ? Monitor : Box;
  const isRunning = vm.status === "running";
  const memUnit = vm.type === "lxc" ? "MB" : "GB";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${isRunning ? "bg-success/10" : "bg-muted"}`}>
              <Icon className={`h-5 w-5 ${isRunning ? "text-success" : "text-muted-foreground"}`} />
            </div>
            <div>
              <span>{vm.name}</span>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={isRunning ? "default" : "secondary"} className="text-[10px]">
                  {isRunning ? "Kjører" : "Stoppet"}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">
                  {vm.type === "vm" ? "VMID" : "CTID"}: {vm.id}
                </span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick info */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            {vm.os && <p className="text-muted-foreground">OS: <span className="text-foreground font-medium">{vm.os}</span></p>}
            {vm.image && <p className="text-muted-foreground">Image: <span className="text-foreground font-mono text-xs">{vm.image}</span></p>}
            {vm.cores && <p className="text-muted-foreground">Kjerner: <span className="text-foreground font-medium">{vm.cores}</span></p>}
          </div>

          <Separator />

          {/* Resource meters */}
          {isRunning && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="flex items-center gap-2 text-muted-foreground"><Cpu className="h-3.5 w-3.5" /> CPU</span>
                  <span className={`font-mono ${vm.cpu > 80 ? "text-destructive" : vm.cpu > 60 ? "text-warning" : "text-foreground"}`}>{vm.cpu}%</span>
                </div>
                <Progress value={vm.cpu} className="h-2" />
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="flex items-center gap-2 text-muted-foreground"><MemoryStick className="h-3.5 w-3.5" /> RAM</span>
                  <span className="font-mono text-foreground">{vm.memory.used} / {vm.memory.total} {memUnit}</span>
                </div>
                <Progress value={(vm.memory.used / vm.memory.total) * 100} className="h-2" />
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><HardDrive className="h-3.5 w-3.5" /> Disk</span>
                <span className="font-mono text-foreground">{vm.disk} {vm.type === "vm" ? "GB" : "MB"}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Oppetid</span>
                <span className="font-mono text-foreground">{vm.uptime}</span>
              </div>
            </div>
          )}

          {/* Network info */}
          {vm.network && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2"><Network className="h-3.5 w-3.5 text-primary" /> Nettverk</h4>
                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                  {vm.network.ip && <p className="text-muted-foreground">IP: <span className="text-foreground font-mono">{vm.network.ip}</span></p>}
                  {vm.network.bridge && <p className="text-muted-foreground">Bridge: <span className="text-foreground font-mono">{vm.network.bridge}</span></p>}
                </div>
              </div>
            </>
          )}

          {/* Snapshots & backup */}
          {(vm.snapshots !== undefined || vm.backup) && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4 text-sm">
                {vm.snapshots !== undefined && (
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Snapshots</p>
                    <p className="font-mono font-bold text-foreground">{vm.snapshots}</p>
                  </div>
                )}
                {vm.backup && (
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Siste backup</p>
                    <p className="font-mono text-xs text-foreground">{vm.backup}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Actions */}
          <Separator />
          <div className="flex gap-2">
            <Button size="sm" variant={isRunning ? "destructive" : "default"} className="flex-1">
              {isRunning ? <Square className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              {isRunning ? "Stopp" : "Start"}
            </Button>
            {isRunning && (
              <Button size="sm" variant="outline">
                <RotateCcw className="h-4 w-4 mr-1" />
                Restart
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
