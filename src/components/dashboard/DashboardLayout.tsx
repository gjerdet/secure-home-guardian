import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Settings2, X, RotateCcw } from "lucide-react";
import { DashboardModule } from "./DashboardModule";
import { AddModuleDialog, ModuleType } from "./AddModuleDialog";
import {
  StatusCardsModule,
  SystemMetricsModule,
  LogsModule,
  ScanModule,
  IoTModule,
} from "./modules";

interface ModuleConfig {
  id: ModuleType;
  title: string;
  enabled: boolean;
}

const defaultModules: ModuleConfig[] = [
  { id: "status-cards", title: "Status Kort", enabled: true },
  { id: "system-metrics", title: "System Metrikker", enabled: true },
  { id: "logs", title: "Logger", enabled: true },
  { id: "scan", title: "Sikkerhetsskanning", enabled: true },
  { id: "iot", title: "Klienter", enabled: true },
];

const moduleComponents: Record<ModuleType, React.ComponentType> = {
  "status-cards": StatusCardsModule,
  "system-metrics": SystemMetricsModule,
  "logs": LogsModule,
  "scan": ScanModule,
  "iot": IoTModule,
};

const moduleTitles: Record<ModuleType, string> = {
  "status-cards": "Status Kort",
  "system-metrics": "System Metrikker",
  "logs": "Logger",
  "scan": "Sikkerhetsskanning",
  "iot": "Klienter",
};

const STORAGE_KEY = "netguard-dashboard-modules";

export function DashboardLayout() {
  const [isEditMode, setIsEditMode] = useState(false);
  const [modules, setModules] = useState<ModuleConfig[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return defaultModules;
      }
    }
    return defaultModules;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
  }, [modules]);

  const enabledModules = modules.filter((m) => m.enabled);

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newModules = [...modules];
    [newModules[index - 1], newModules[index]] = [newModules[index], newModules[index - 1]];
    setModules(newModules);
  };

  const handleMoveDown = (index: number) => {
    if (index === modules.length - 1) return;
    const newModules = [...modules];
    [newModules[index], newModules[index + 1]] = [newModules[index + 1], newModules[index]];
    setModules(newModules);
  };

  const handleDelete = (moduleId: ModuleType) => {
    setModules(modules.filter((m) => m.id !== moduleId));
  };

  const handleAddModule = (moduleId: ModuleType) => {
    setModules([
      ...modules,
      { id: moduleId, title: moduleTitles[moduleId], enabled: true },
    ]);
  };

  const handleReset = () => {
    setModules(defaultModules);
  };

  const renderModule = (config: ModuleConfig, index: number) => {
    const Component = moduleComponents[config.id];
    const enabledIndex = enabledModules.findIndex((m) => m.id === config.id);
    
    return (
      <DashboardModule
        key={config.id}
        id={config.id}
        title={config.title}
        isEditMode={isEditMode}
        canMoveUp={index > 0}
        canMoveDown={index < modules.length - 1}
        onMoveUp={() => handleMoveUp(index)}
        onMoveDown={() => handleMoveDown(index)}
        onDelete={() => handleDelete(config.id)}
      >
        <Component />
      </DashboardModule>
    );
  };

  // Separate status cards from grid modules for layout purposes
  const statusCardsIndex = modules.findIndex((m) => m.id === "status-cards" && m.enabled);
  const gridModules = modules.filter((m) => m.id !== "status-cards" && m.enabled);

  return (
    <div className="space-y-6">
      {/* Edit Mode Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={isEditMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditMode(!isEditMode)}
            className="gap-2"
          >
            {isEditMode ? (
              <>
                <X className="h-4 w-4" />
                Avslutt redigering
              </>
            ) : (
              <>
                <Settings2 className="h-4 w-4" />
                Rediger dashboard
              </>
            )}
          </Button>
          
          {isEditMode && (
            <>
              <AddModuleDialog 
                onAdd={handleAddModule} 
                existingModules={modules.map((m) => m.id)} 
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="gap-2 text-muted-foreground"
              >
                <RotateCcw className="h-4 w-4" />
                Tilbakestill
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Status Cards - Always full width if enabled */}
      {statusCardsIndex !== -1 && (
        renderModule(modules[statusCardsIndex], statusCardsIndex)
      )}

      {/* Main Grid - 3 Columns */}
      {gridModules.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1 - System Metrics */}
          <div className="space-y-6">
            {modules.map((config, index) => {
              if (config.id === "system-metrics" && config.enabled) {
                return renderModule(config, index);
              }
              return null;
            })}
          </div>

          {/* Column 2 - Logs & Scan */}
          <div className="space-y-6">
            {modules.map((config, index) => {
              if ((config.id === "logs" || config.id === "scan") && config.enabled) {
                return renderModule(config, index);
              }
              return null;
            })}
          </div>

          {/* Column 3 - IoT */}
          <div className="space-y-6">
            {modules.map((config, index) => {
              if (config.id === "iot" && config.enabled) {
                return renderModule(config, index);
              }
              return null;
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {enabledModules.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground mb-4">Ingen moduler er aktive</p>
          <AddModuleDialog 
            onAdd={handleAddModule} 
            existingModules={modules.map((m) => m.id)} 
          />
        </div>
      )}
    </div>
  );
}
