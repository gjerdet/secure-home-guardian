import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LucideIcon, ChevronRight } from "lucide-react";

interface StatusCardProps {
  title: string;
  status: "online" | "offline" | "warning" | "scanning";
  icon: LucideIcon;
  value?: string;
  subtitle?: string;
  href?: string;
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
  href,
  className,
}: StatusCardProps) {
  const config = statusConfig[status];

  const content = (
    <>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className={cn("rounded-lg p-2 sm:p-2.5", config.bg)}>
            <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5", config.color)} />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full status-pulse",
                status === "online" && "bg-success",
                status === "offline" && "bg-destructive",
                status === "warning" && "bg-warning",
                status === "scanning" && "bg-primary"
              )}
            />
            <span className={cn("text-[10px] sm:text-xs font-medium", config.color)}>
              {config.label}
            </span>
          </div>
        </div>
        <div className="mt-3 sm:mt-4">
          <h3 className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</h3>
          {value && (
            <p className="mt-0.5 sm:mt-1 text-xl sm:text-2xl font-semibold font-mono text-foreground">
              {value}
            </p>
          )}
          {subtitle && (
            <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {href && (
          <div className="mt-2 sm:mt-3 flex items-center text-[10px] sm:text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            <span>Se detaljer</span>
            <ChevronRight className="h-3 w-3 ml-1" />
          </div>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        to={href}
        className={cn(
          "group relative overflow-hidden rounded-lg border border-border bg-card p-3.5 sm:p-5 transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 cursor-pointer block",
          className
        )}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card p-3.5 sm:p-5 transition-all duration-300 hover:border-primary/50",
        className
      )}
    >
      {content}
    </div>
  );
}
