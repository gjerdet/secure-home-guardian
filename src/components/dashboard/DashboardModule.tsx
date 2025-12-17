import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  GripVertical, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  Settings2,
  X 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardModuleProps {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
  isEditMode?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}

export function DashboardModule({ 
  id,
  title,
  children, 
  className,
  isEditMode = false,
  canMoveUp = true,
  canMoveDown = true,
  onMoveUp,
  onMoveDown,
  onDelete,
  onEdit,
}: DashboardModuleProps) {
  return (
    <div 
      className={cn(
        "relative group animate-fade-in",
        isEditMode && "ring-2 ring-primary/30 ring-dashed rounded-lg",
        className
      )}
    >
      {isEditMode && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-card border border-border rounded-full px-2 py-1 shadow-lg">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground px-1">{title}</span>
          
          <div className="flex items-center gap-0.5 ml-1 border-l border-border pl-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onMoveUp}
              disabled={!canMoveUp}
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onMoveDown}
              disabled={!canMoveDown}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
      
      {children}
    </div>
  );
}
