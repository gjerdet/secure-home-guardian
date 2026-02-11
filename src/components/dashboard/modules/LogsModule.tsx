import { useState, useEffect, useMemo } from "react";
import { LogsPanel } from "@/components/LogsPanel";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE, fetchJsonSafely } from "@/lib/api";

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "success";
  source: string;
  message: string;
}

export function LogsModule() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      // Fetch UniFi alerts as log entries
      try {
        const res = await fetchJsonSafely(`${API_BASE}/api/unifi/alerts`, { headers: authHeaders });
        if (res.ok && res.data) {
          const items = (res.data as any)?.data || [];
          const alertLogs: LogEntry[] = items.slice(0, 20).map((a: any, i: number) => ({
            id: a._id || `alert-${i}`,
            timestamp: a.datetime || a.time || new Date().toISOString(),
            level: a.key?.includes('EVT_IPS') ? 'error' as const
              : a.key?.includes('EVT_WU') ? 'warning' as const
              : 'info' as const,
            source: 'UniFi',
            message: a.msg || a.message || a.key || 'Event',
          }));
          setLogs(prev => [...alertLogs, ...prev].slice(0, 50));
        }
      } catch { /* silent */ }

      // Fetch IDS alerts
      try {
        const res = await fetchJsonSafely(`${API_BASE}/api/unifi/ids-alerts`, { headers: authHeaders });
        if (res.ok && res.data) {
          const alerts = (res.data as any)?.alerts || [];
          const idsLogs: LogEntry[] = alerts.slice(0, 10).map((a: any) => ({
            id: a.id || Math.random().toString(),
            timestamp: a.timestamp || new Date().toISOString(),
            level: a.severity === 'high' ? 'error' as const : a.severity === 'medium' ? 'warning' as const : 'info' as const,
            source: 'IDS/IPS',
            message: a.signature || a.category || 'Security event',
          }));
          setLogs(prev => {
            const combined = [...idsLogs, ...prev];
            const unique = combined.filter((l, i) => combined.findIndex(x => x.id === l.id) === i);
            return unique.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 50);
          });
        }
      } catch { /* silent */ }
    };

    fetchLogs();
  }, [authHeaders]);

  return (
    <LogsPanel
      logs={logs}
      className="animate-fade-in [animation-delay:500ms]"
    />
  );
}
