import { DashboardModule } from "./DashboardModule";
import {
  StatusCardsModule,
  SystemMetricsModule,
  LogsModule,
  ScanModule,
  IoTModule,
} from "./modules";

export type ModuleType = "status-cards" | "system-metrics" | "logs" | "scan" | "iot";

interface ModuleConfig {
  id: ModuleType;
  enabled: boolean;
  colSpan?: 1 | 2 | 3;
}

const defaultModules: ModuleConfig[] = [
  { id: "status-cards", enabled: true, colSpan: 3 },
  { id: "system-metrics", enabled: true },
  { id: "logs", enabled: true },
  { id: "scan", enabled: true },
  { id: "iot", enabled: true },
];

const moduleComponents: Record<ModuleType, React.ComponentType> = {
  "status-cards": StatusCardsModule,
  "system-metrics": SystemMetricsModule,
  "logs": LogsModule,
  "scan": ScanModule,
  "iot": IoTModule,
};

interface DashboardLayoutProps {
  modules?: ModuleConfig[];
}

export function DashboardLayout({ modules = defaultModules }: DashboardLayoutProps) {
  const enabledModules = modules.filter((m) => m.enabled);
  
  // Separate status cards from grid modules
  const statusCardsModule = enabledModules.find((m) => m.id === "status-cards");
  const gridModules = enabledModules.filter((m) => m.id !== "status-cards");

  return (
    <div className="space-y-6">
      {/* Status Cards - Full Width */}
      {statusCardsModule && (
        <DashboardModule>
          <StatusCardsModule />
        </DashboardModule>
      )}

      {/* Main Grid - 3 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - System Metrics */}
        {gridModules.find((m) => m.id === "system-metrics") && (
          <DashboardModule>
            <SystemMetricsModule />
          </DashboardModule>
        )}

        {/* Middle Column - Logs & Scan */}
        <DashboardModule>
          <div className="space-y-6">
            {gridModules.find((m) => m.id === "logs") && <LogsModule />}
            {gridModules.find((m) => m.id === "scan") && <ScanModule />}
          </div>
        </DashboardModule>

        {/* Right Column - IoT */}
        {gridModules.find((m) => m.id === "iot") && (
          <DashboardModule>
            <IoTModule />
          </DashboardModule>
        )}
      </div>
    </div>
  );
}
