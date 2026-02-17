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

    // Fetch all sources in parallel
    const [eventsRes, idsRes, alertsRes] = await Promise.all([
      fetchJsonSafely(`${API_BASE}/api/unifi/events`, { headers: authHeaders }).catch(() => null),
      fetchJsonSafely(`${API_BASE}/api/unifi/ids-alerts`, { headers: authHeaders }).catch(() => null),
      fetchJsonSafely(`${API_BASE}/api/unifi/alerts`, { headers: authHeaders }).catch(() => null),
    ]);

    // UniFi events (up to 200 — backend returns up to 500 classified events)
    if (eventsRes?.ok && eventsRes.data) {
      const items = (eventsRes.data as any)?.events || [];
      const eventLogs: LogEntry[] = items.slice(0, 200).map((a: any, i: number) => ({
        id: a.id || `evt-${i}`,
        timestamp: a.timestamp || new Date().toISOString(),
        level: a.type === 'ids' || a.type === 'firewall' ? 'error' as const
          : a.key?.includes('Lost_Contact') || a.key?.includes('Disconnect') ? 'warning' as const
          : a.key?.includes('Connected') || a.key?.includes('Upgraded') ? 'success' as const
          : 'info' as const,
        source: a.type === 'ids' ? 'IDS/IPS'
          : a.type === 'firewall' ? 'Firewall'
          : a.deviceName ? `UniFi (${a.deviceName})`
          : 'UniFi',
        message: a.msg || a.key || 'Event',
      }));
      allLogs.push(...eventLogs);
    }

    // IDS/IPS alerts (up to 50)
    if (idsRes?.ok && idsRes.data) {
      const alerts = (idsRes.data as any)?.alerts || [];
      const idsLogs: LogEntry[] = alerts.slice(0, 50).map((a: any) => ({
        id: a.id || Math.random().toString(),
        timestamp: a.timestamp || new Date().toISOString(),
        level: a.severity === 'high' ? 'error' as const : a.severity === 'medium' ? 'warning' as const : 'info' as const,
        source: 'IDS/IPS',
        message: a.signature || a.category || 'Security event',
      }));
      allLogs.push(...idsLogs);
    }

    // Legacy IPS alerts (stat/ips/event)
    if (alertsRes?.ok && alertsRes.data) {
      const data = (alertsRes.data as any)?.data || [];
      const legacyLogs: LogEntry[] = data.slice(0, 50).map((a: any) => ({
        id: a._id || Math.random().toString(),
        timestamp: a.datetime || (a.time ? new Date(a.time).toISOString() : new Date().toISOString()),
        level: 'error' as const,
        source: 'IPS Alert',
        message: a.msg || a.inner_alert_signature || a.catname || 'IPS event',
      }));
      allLogs.push(...legacyLogs);
    }

    // Deduplicate by id and sort newest first
    const unique = allLogs.filter((l, i) => allLogs.findIndex(x => x.id === l.id) === i);
    unique.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    setLogs(unique.slice(0, 200));
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
