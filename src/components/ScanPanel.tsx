import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Radar, Search, Clock, AlertTriangle, CheckCircle } from "lucide-react";

interface ScanResult {
  type: "vulnerability" | "port" | "host";
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
  target: string;
}

interface ScanPanelProps {
  lastScan?: string;
  nextScan?: string;
  isScanning: boolean;
  results: ScanResult[];
  onStartScan: () => void;
  className?: string;
}

const severityConfig = {
  critical: { color: "text-destructive", bg: "bg-destructive/10" },
  high: { color: "text-destructive", bg: "bg-destructive/10" },
  medium: { color: "text-warning", bg: "bg-warning/10" },
  low: { color: "text-primary", bg: "bg-primary/10" },
  info: { color: "text-muted-foreground", bg: "bg-muted" },
};

export function ScanPanel({
  lastScan,
  nextScan,
  isScanning,
  results,
  onStartScan,
  className,
}: ScanPanelProps) {
  const criticalCount = results.filter(
    (r) => r.severity === "critical" || r.severity === "high"
  ).length;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card overflow-hidden",
        className
      )}
    >
      <div className="border-b border-border px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm sm:text-base">
            <Radar className="h-4 w-4 text-primary" />
            Sikkerhetsscanning
          </h3>
          <Button
            size="sm"
            onClick={onStartScan}
            disabled={isScanning}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3"
          >
            {isScanning ? (
              <>
                <Search className="h-3.5 w-3.5 mr-1 sm:mr-1.5 animate-pulse" />
                <span className="hidden sm:inline">Skanner...</span>
                <span className="sm:hidden">...</span>
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5 mr-1 sm:mr-1.5" />
                Scan
              </>
            )}
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-1 sm:gap-6 text-[10px] sm:text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>Sist: </span>
            <span className="font-mono text-foreground">{lastScan || "Aldri"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>Neste: </span>
            <span className="font-mono text-foreground">{nextScan || "Ikke planlagt"}</span>
          </div>
        </div>
      </div>

      {isScanning && (
        <div className="relative h-1 bg-muted overflow-hidden">
          <div className="absolute inset-0 scan-line" />
        </div>
      )}

      <div className="p-3 sm:p-4">
        <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
          {criticalCount > 0 ? (
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs sm:text-sm font-medium">
                {criticalCount} kritiske funn
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs sm:text-sm font-medium">Ingen kritiske funn</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5 sm:space-y-2">
          {results.slice(0, 5).map((result, index) => {
            const config = severityConfig[result.severity];
            return (
              <div
                key={index}
                className="flex items-start gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-md bg-muted/30"
              >
                <span
                  className={cn(
                    "px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-xs font-medium rounded uppercase shrink-0",
                    config.bg,
                    config.color
                  )}
                >
                  {result.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-foreground break-words">{result.description}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground font-mono truncate">
                    {result.target}
                  </p>
                </div>
              </div>
            );
          })}
          {results.length === 0 && !isScanning && (
            <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">
              Kjør en scan for å se resultater
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
