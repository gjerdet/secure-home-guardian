import { useState, useEffect, useMemo } from "react";
import { IoTDeviceList } from "@/components/IoTDeviceList";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE, fetchJsonSafely } from "@/lib/api";

interface IoTDevice {
  id: string;
  name: string;
  ip: string;
  mac: string;
  status: "online" | "offline";
  trusted: boolean;
  lastSeen: string;
  vendor?: string;
  network?: string;
}

export function IoTModule() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [devices, setDevices] = useState<IoTDevice[]>([]);

  useEffect(() => {
    fetchJsonSafely(`${API_BASE}/api/unifi/clients`, { headers: authHeaders })
      .then(res => {
        if (res.ok && res.data) {
          const clients = (res.data as any)?.data || [];
          const mapped: IoTDevice[] = clients.map((c: any) => ({
            id: c._id || c.mac || Math.random().toString(),
            name: c.name || c.hostname || c.oui || c.mac || 'Ukjent',
            ip: c.ip || c.fixed_ip || '—',
            mac: c.mac || '',
            status: (c.is_wired !== undefined || c.last_seen)
              ? ((Date.now() / 1000 - (c.last_seen || 0)) < 300 ? 'online' : 'offline')
              : 'offline',
            trusted: !c.is_guest && !c.noted,
            lastSeen: c.last_seen
              ? new Date(c.last_seen * 1000).toLocaleString('nb-NO')
              : '—',
            vendor: c.oui || '',
            network: c.network || c.essid || '',
          }));
          // Sort online first
          mapped.sort((a, b) => (a.status === b.status ? 0 : a.status === 'online' ? -1 : 1));
          setDevices(mapped);
        }
      })
      .catch(() => {});
  }, [authHeaders]);

  return (
    <IoTDeviceList
      devices={devices}
      className="animate-fade-in [animation-delay:700ms]"
    />
  );
}
