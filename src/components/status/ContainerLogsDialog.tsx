import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, Download, Trash2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ContainerLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: {
    id: string;
    name: string;
  } | null;
}

export function ContainerLogsDialog({ open, onOpenChange, container }: ContainerLogsDialogProps) {
  const [logs, setLogs] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [tailLines, setTailLines] = useState(100);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    if (!container) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/docker/containers/${container.id}/logs?tail=${tailLines}`
      );
      
      if (!response.ok) {
        throw new Error('Kunne ikke hente logs');
      }
      
      const data = await response.json();
      setLogs(data.logs || 'Ingen logs tilgjengelig');
      
      // Auto-scroll to bottom
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    } catch (error) {
      setLogs(`Feil: ${error instanceof Error ? error.message : 'Ukjent feil'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadLogs = () => {
    if (!logs || !container) return;
    
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${container.name}-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (open && container) {
      fetchLogs();
    }
  }, [open, container, tailLines]);

  // Parse and colorize log lines
  const formatLogs = (logText: string) => {
    return logText.split('\n').map((line, idx) => {
      let className = "text-muted-foreground";
      
      if (line.includes('ERROR') || line.includes('error') || line.includes('FATAL')) {
        className = "text-destructive";
      } else if (line.includes('WARN') || line.includes('warn') || line.includes('WARNING')) {
        className = "text-warning";
      } else if (line.includes('INFO') || line.includes('info')) {
        className = "text-primary";
      } else if (line.includes('DEBUG') || line.includes('debug')) {
        className = "text-muted-foreground/70";
      }
      
      return (
        <div key={idx} className={`${className} hover:bg-muted/30 px-2 py-0.5`}>
          <span className="text-muted-foreground/50 mr-3 select-none">{idx + 1}</span>
          {line}
        </div>
      );
    });
  };

  if (!container) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Logs: {container.name}</span>
            <div className="flex items-center gap-2">
              <select
                value={tailLines}
                onChange={(e) => setTailLines(Number(e.target.value))}
                className="text-sm bg-muted border border-border rounded px-2 py-1"
              >
                <option value={50}>Siste 50 linjer</option>
                <option value={100}>Siste 100 linjer</option>
                <option value={500}>Siste 500 linjer</option>
                <option value={1000}>Siste 1000 linjer</option>
              </select>
              <Button size="sm" variant="outline" onClick={downloadLogs}>
                <Download className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={fetchLogs} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {isLoading && logs === "" ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
              <p className="mt-2 text-muted-foreground">Henter logs...</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]" ref={scrollRef}>
              <pre className="font-mono text-xs p-2 whitespace-pre-wrap break-all">
                {formatLogs(logs)}
              </pre>
            </ScrollArea>
          )}
        </div>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Container ID: {container.id.substring(0, 12)}</span>
          <Badge variant="outline">{tailLines} linjer</Badge>
        </div>
      </DialogContent>
    </Dialog>
  );
}
