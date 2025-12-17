import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface SystemCardProps {
  title: string;
  icon: LucideIcon;
  status: "online" | "offline" | "warning";
  metrics: {
    label: string;
    value: number;
    max?: number;
    unit?: string;
  }[];
  className?: string;
}

export function SystemCard({
  title,
  icon: Icon,
  status,
  metrics,
  className,
}: SystemCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card p-5 transition-all duration-300 hover:border-primary/50",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">{title}</h3>
          </div>
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full status-pulse",
              status === "online" && "bg-success",
              status === "offline" && "bg-destructive",
              status === "warning" && "bg-warning"
            )}
          />
        </div>
        <div className="space-y-3">
          {metrics.map((metric, index) => (
            <div key={index}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">{metric.label}</span>
                <span className="font-mono text-foreground">
                  {metric.value}
                  {metric.unit || "%"}
                  {metric.max && ` / ${metric.max}${metric.unit || "%"}`}
                </span>
              </div>
              <Progress
                value={metric.max ? (metric.value / metric.max) * 100 : metric.value}
                className="h-1.5 bg-muted"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
