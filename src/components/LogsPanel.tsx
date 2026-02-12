import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Info, XCircle, CheckCircle, RefreshCw, Loader2 } from "lucide-react";

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
  onRefresh?: () => void;
  isLoading?: boolean;
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

export function LogsPanel({ logs, className, onRefresh, isLoading }: LogsPanelProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card overflow-hidden",
        className
      )}
    >
      <div className="border-b border-border px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">System Logger</h3>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] sm:text-xs text-muted-foreground font-mono">
            {logs.length} hendelser
          </span>
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-7 px-2 text-xs"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline ml-1.5">Oppdater</span>
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="h-[250px] sm:h-[300px]">
        <div className="p-1.5 sm:p-2 space-y-0.5 sm:space-y-1">
          {logs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm">
              <Info className="h-6 w-6 mb-2" />
              <p>Ingen logger ennå</p>
              {onRefresh && <p className="text-xs mt-1">Trykk Oppdater for å hente</p>}
            </div>
          )}
          {logs.map((log) => {
            const config = levelConfig[log.level];
            const IconComponent = config.icon;
            return (
              <div
                key={log.id}
                className="flex items-start gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <div className={cn("rounded p-1 shrink-0", config.bg)}>
                  <IconComponent className={cn("h-3 w-3 sm:h-3.5 sm:w-3.5", config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5">
                    <span className="text-[10px] sm:text-xs font-mono text-muted-foreground">
                      {log.timestamp}
                    </span>
                    <span className="text-[10px] sm:text-xs font-medium text-primary">
                      [{log.source}]
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-foreground break-words">{log.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
