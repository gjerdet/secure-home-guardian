import { cn } from "@/lib/utils";

interface DashboardModuleProps {
  children: React.ReactNode;
  className?: string;
  colSpan?: 1 | 2 | 3;
  rowSpan?: 1 | 2;
}

export function DashboardModule({ 
  children, 
  className,
  colSpan = 1,
  rowSpan = 1
}: DashboardModuleProps) {
  return (
    <div 
      className={cn(
        "animate-fade-in",
        colSpan === 2 && "lg:col-span-2",
        colSpan === 3 && "lg:col-span-3",
        rowSpan === 2 && "lg:row-span-2",
        className
      )}
    >
      {children}
    </div>
  );
}
