import { useState, useEffect, useMemo, useCallback } from "react";
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
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    const allLogs: LogEntry[] = [];

    // Fetch UniFi events (uses the improved backend with regex filtering)
    try {
      const res = await fetchJsonSafely(`${API_BASE}/api/unifi/events`, { headers: authHeaders });
      if (res.ok && res.data) {
        const items = (res.data as any)?.events || [];
        const eventLogs: LogEntry[] = items.slice(0, 30).map((a: any, i: number) => ({
          id: a.id || `evt-${i}`,
          timestamp: a.timestamp || new Date().toISOString(),
          level: a.type === 'ids' || a.type === 'firewall' ? 'error' as const
            : a.key?.includes('Lost_Contact') ? 'warning' as const
            : a.key?.includes('Connected') || a.key?.includes('Upgraded') ? 'success' as const
            : 'info' as const,
          source: a.type === 'ids' ? 'IDS/IPS' : a.type === 'firewall' ? 'Firewall' : 'UniFi',
          message: a.msg || a.key || 'Event',
        }));
        allLogs.push(...eventLogs);
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
        allLogs.push(...idsLogs);
      }
    } catch { /* silent */ }

    // Deduplicate and sort
    const unique = allLogs.filter((l, i) => allLogs.findIndex(x => x.id === l.id) === i);
    unique.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    setLogs(unique.slice(0, 50));
    setIsLoading(false);
  }, [authHeaders]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <LogsPanel
      logs={logs}
      className="animate-fade-in [animation-delay:500ms]"
      onRefresh={fetchLogs}
      isLoading={isLoading}
    />
  );
}
