import { useState } from "react";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Shield, ShieldAlert } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IoTDeviceDetailDialog } from "@/components/dialogs/IoTDeviceDetailDialog";

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

interface IoTDeviceListProps {
  devices: IoTDevice[];
  className?: string;
}

export function IoTDeviceList({ devices, className }: IoTDeviceListProps) {
  const [selectedDevice, setSelectedDevice] = useState<IoTDevice | null>(null);
  const onlineCount = devices.filter((d) => d.status === "online").length;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card overflow-hidden",
        className
      )}
    >
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="font-semibold text-foreground">IoT Enheter</h3>
        <span className="text-xs text-muted-foreground">
          <span className="text-success font-mono">{onlineCount}</span> /{" "}
          <span className="font-mono">{devices.length}</span> online
        </span>
      </div>
      <ScrollArea className="h-[280px]">
        <div className="p-2 space-y-1">
          {devices.map((device) => (
            <div
              key={device.id}
              onClick={() => setSelectedDevice(device)}
              className="flex items-center gap-3 p-3 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <div
                className={cn(
                  "rounded-lg p-2",
                  device.status === "online"
                    ? "bg-success/10"
                    : "bg-destructive/10"
                )}
              >
                {device.status === "online" ? (
                  <Wifi className="h-4 w-4 text-success" />
                ) : (
                  <WifiOff className="h-4 w-4 text-destructive" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {device.name}
                  </p>
                  {device.trusted ? (
                    <Shield className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5 text-warning" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  {device.ip} • {device.mac}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{device.lastSeen}</span>
            </div>
          ))}
        </div>
      </ScrollArea>

      <IoTDeviceDetailDialog
        device={selectedDevice}
        open={!!selectedDevice}
        onOpenChange={(open) => !open && setSelectedDevice(null)}
      />
    </div>
  );
}
