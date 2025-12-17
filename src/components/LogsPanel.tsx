import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Info, XCircle, CheckCircle } from "lucide-react";

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "success";
  source: string;
  message: string;
}

interface LogsPanelProps {
  logs: LogEntry[];
  className?: string;
}

const levelConfig = {
  info: {
    icon: Info,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-warning",
    bg: "bg-warning/10",
  },
  error: {
    icon: XCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  success: {
    icon: CheckCircle,
    color: "text-success",
    bg: "bg-success/10",
  },
};

export function LogsPanel({ logs, className }: LogsPanelProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card overflow-hidden",
        className
      )}
    >
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="font-semibold text-foreground">System Logger</h3>
        <span className="text-xs text-muted-foreground font-mono">
          {logs.length} hendelser
        </span>
      </div>
      <ScrollArea className="h-[300px]">
        <div className="p-2 space-y-1">
          {logs.map((log) => {
            const config = levelConfig[log.level];
            const IconComponent = config.icon;
            return (
              <div
                key={log.id}
                className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <div className={cn("rounded p-1", config.bg)}>
                  <IconComponent className={cn("h-3.5 w-3.5", config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-muted-foreground">
                      {log.timestamp}
                    </span>
                    <span className="text-xs font-medium text-primary">
                      [{log.source}]
                    </span>
                  </div>
                  <p className="text-sm text-foreground truncate">{log.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
