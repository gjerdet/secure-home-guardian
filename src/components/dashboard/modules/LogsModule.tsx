import { LogsPanel } from "@/components/LogsPanel";

export function LogsModule() {
  return (
    <LogsPanel 
      logs={[]} 
      className="animate-fade-in [animation-delay:500ms]" 
    />
  );
}