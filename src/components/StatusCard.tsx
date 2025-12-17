import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatusCardProps {
  title: string;
  status: "online" | "offline" | "warning" | "scanning";
  icon: LucideIcon;
  value?: string;
  subtitle?: string;
  className?: string;
}

const statusConfig = {
  online: {
    color: "text-success",
    bg: "bg-success/10",
    glow: "glow-success",
    label: "Online",
  },
  offline: {
    color: "text-destructive",
    bg: "bg-destructive/10",
    glow: "glow-destructive",
    label: "Offline",
  },
  warning: {
    color: "text-warning",
    bg: "bg-warning/10",
    glow: "glow-warning",
    label: "Advarsel",
  },
  scanning: {
    color: "text-primary",
    bg: "bg-primary/10",
    glow: "glow-primary",
    label: "Skanner",
  },
};

export function StatusCard({
  title,
  status,
  icon: Icon,
  value,
  subtitle,
  className,
}: StatusCardProps) {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card p-5 transition-all duration-300 hover:border-primary/50",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className={cn("rounded-lg p-2.5", config.bg)}>
            <Icon className={cn("h-5 w-5", config.color)} />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full status-pulse",
                status === "online" && "bg-success",
                status === "offline" && "bg-destructive",
                status === "warning" && "bg-warning",
                status === "scanning" && "bg-primary"
              )}
            />
            <span className={cn("text-xs font-medium", config.color)}>
              {config.label}
            </span>
          </div>
        </div>
        <div className="mt-4">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          {value && (
            <p className="mt-1 text-2xl font-semibold font-mono text-foreground">
              {value}
            </p>
          )}
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
