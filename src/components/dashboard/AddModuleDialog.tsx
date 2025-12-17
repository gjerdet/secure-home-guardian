import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Plus,
  Activity,
  Database,
  FileText,
  Scan,
  Wifi,
  LayoutGrid,
  Server,
  HardDrive,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ModuleType = "status-cards" | "system-metrics" | "logs" | "scan" | "iot";

interface ModuleOption {
  id: ModuleType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const availableModules: ModuleOption[] = [
  { 
    id: "status-cards", 
    title: "Status Kort", 
    description: "Oversikt over systemstatus",
    icon: LayoutGrid 
  },
  { 
    id: "system-metrics", 
    title: "System Metrikker", 
    description: "CPU, RAM og lagringsbruk",
    icon: Activity 
  },
  { 
    id: "logs", 
    title: "Logger", 
    description: "Systemlogger og hendelser",
    icon: FileText 
  },
  { 
    id: "scan", 
    title: "Sikkerhetsskanning", 
    description: "Sårbarheter og portskanning",
    icon: Scan 
  },
  { 
    id: "iot", 
    title: "IoT Enheter", 
    description: "Smarte enheter på nettverket",
    icon: Wifi 
  },
];

interface AddModuleDialogProps {
  onAdd: (moduleId: ModuleType) => void;
  existingModules: ModuleType[];
}

export function AddModuleDialog({ onAdd, existingModules }: AddModuleDialogProps) {
  const [open, setOpen] = useState(false);

  const handleAdd = (moduleId: ModuleType) => {
    onAdd(moduleId);
    setOpen(false);
  };

  const availableToAdd = availableModules.filter(
    (m) => !existingModules.includes(m.id)
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          Legg til modul
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card">
        <DialogHeader>
          <DialogTitle>Legg til modul</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          {availableToAdd.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              Alle moduler er allerede lagt til
            </p>
          ) : (
            availableToAdd.map((module) => (
              <button
                key={module.id}
                onClick={() => handleAdd(module.id)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border border-border",
                  "hover:bg-accent hover:border-primary/50 transition-colors",
                  "text-left"
                )}
              >
                <div className="p-2 rounded-md bg-primary/10">
                  <module.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{module.title}</p>
                  <p className="text-sm text-muted-foreground">{module.description}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
