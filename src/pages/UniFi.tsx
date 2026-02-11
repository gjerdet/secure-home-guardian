import { useState, useMemo, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AttackMap } from "@/components/AttackMap";
import { exportToCSV, exportToJSON, batchLookupGeoIP } from "@/lib/ids-utils";
import { FirewallAuditPanel } from "@/components/security/FirewallAuditPanel";
import { useToast } from "@/hooks/use-toast";
import { 
  Wifi, Shield, ShieldAlert, AlertTriangle, Activity, 
  Users, Globe, Clock, ArrowUpRight, ArrowDownRight,
  Monitor, Smartphone, Laptop, Router, Radio, Network,
  ArrowUpDown, Download, FileJson, FileSpreadsheet, RefreshCw,
  Ban, CheckCircle, Filter, Power, Zap, Loader2, ExternalLink,
  Search, Copy, Info
} from "lucide-react";

import { API_BASE, fetchJsonSafely } from "@/lib/api";

interface IdsAlert {
  id: string;
  timestamp: string;
  severity: string;
  category: string;
  signature: string;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  action: string;
  country?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  isp?: string;
}

const initialAlerts: IdsAlert[] = [];

const connectedDevices: {
  id: string; name: string; type: string; ip: string; mac: string; connection: string;
  signal: number; rxRate: number; txRate: number; uptime: string; connectedTo: string;
  network: string; vlan: number; rxBytes: number; txBytes: number; channel: string | null;
}[] = [];

interface APDevice {
  name: string;
  model: string;
  status: "online" | "offline" | "upgrading";
  clients: number;
  channel2g: string;
  channel5g: string;
  experience: number;
  ip: string;
  mac: string;
  firmware: string;
  uptime: string;
  txPower2g: number;
  txPower5g: number;
  load: number;
  memUsage: number;
  cpuUsage: number;
  satisfaction: number;
  connectedClients: { name: string; ip: string; signal: number; band: string; rxRate: number; txRate: number }[];
}

interface SwitchPort {
  port: number;
  name: string;
  status: "up" | "down" | "disabled";
  speed: string;
  poeEnabled: boolean;
  poeWatts: number;
  device: string;
  vlan: number;
  rxBytes: number;
  txBytes: number;
}

interface SwitchDevice {
  name: string;
  model: string;
  status: "online" | "offline";
  ports: number;
  portsUsed: number;
  poeWatts: number;
  poeBudget: number;
  ip: string;
  mac: string;
  firmware: string;
  uptime: string;
  temperature: number;
  fanLevel: number;
  portList: SwitchPort[];
}

const networkDevices: {
  aps: APDevice[];
  switches: SwitchDevice[];
  gateway: { name: string; status: string; wanIp: string; uptime: string };
} = {
  aps: [],
  switches: [],
  gateway: { name: "", status: "offline", wanIp: "", uptime: "" },
};

interface FirewallLog {
  id: string;
  timestamp: string;
  action: "block" | "allow";
  rule: string;
  protocol: string;
  srcIp: string;
  srcPort: number;
  dstIp: string;
  dstPort: number;
  interface: string;
  bytes: number;
}

interface SystemEvent {
  id: string;
  timestamp: string;
  key: string;
  msg: string;
  subsystem: string;
  type: string;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  proto: string;
  action: string;
  deviceName: string;
  deviceMac: string;
  clientName: string;
  clientMac: string;
}

const firewallLogs: FirewallLog[] = [];

const trafficStats = {
  totalDownload: "—",
  totalUpload: "—",
  currentDown: "—",
  currentUp: "—",
  wanLatency: "—",
  dnsQueries: 0,
};

const severityColors = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/80 text-destructive-foreground",
  medium: "bg-warning text-warning-foreground",
  low: "bg-primary/80 text-primary-foreground",
};

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

const DeviceIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "laptop": return <Laptop className="h-4 w-4" />;
    case "phone": return <Smartphone className="h-4 w-4" />;
    case "tv": case "desktop": return <Monitor className="h-4 w-4" />;
    case "camera": return <Shield className="h-4 w-4" />;
    case "speaker": return <Radio className="h-4 w-4" />;
    case "printer": return <Monitor className="h-4 w-4" />;
    default: return <Router className="h-4 w-4" />;
  }
};

export default function UniFi() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [sortBy, setSortBy] = useState<string>("time");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterFirewall, setFilterFirewall] = useState<string>("all");
  const [idsAlerts, setIdsAlerts] = useState<IdsAlert[]>(initialAlerts);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<typeof connectedDevices[0] | null>(null);
  const [selectedAP, setSelectedAP] = useState<APDevice | null>(null);
  const [selectedSwitch, setSelectedSwitch] = useState<SwitchDevice | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<IdsAlert | null>(null);
  const [selectedFirewallLog, setSelectedFirewallLog] = useState<FirewallLog | null>(null);
  const [isRestarting, setIsRestarting] = useState<string | null>(null);
  const [isCyclingPort, setIsCyclingPort] = useState<number | null>(null);
  const [liveAPs, setLiveAPs] = useState<APDevice[]>(networkDevices.aps);
  const [liveSwitches, setLiveSwitches] = useState<SwitchDevice[]>(networkDevices.switches);
  const [liveClients, setLiveClients] = useState<typeof connectedDevices>([]);
  const [liveTraffic, setLiveTraffic] = useState(trafficStats);
  const [liveFirewallLogs, setLiveFirewallLogs] = useState<FirewallLog[]>(firewallLogs);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SystemEvent | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [abuseData, setAbuseData] = useState<Record<string, any>>({});
  const [isLoadingAbuse, setIsLoadingAbuse] = useState(false);
  const { toast } = useToast();

  // Fetch live device data from backend
  const fetchLiveData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [devicesRes, alertsRes, clientsRes, healthRes, idsRes, eventsRes] = await Promise.all([
        fetchJsonSafely(`${API_BASE}/api/unifi/devices`, { headers: authHeaders }),
        fetchJsonSafely(`${API_BASE}/api/unifi/alerts`, { headers: authHeaders }),
        fetchJsonSafely(`${API_BASE}/api/unifi/clients`, { headers: authHeaders }),
        fetchJsonSafely(`${API_BASE}/api/unifi/health`, { headers: authHeaders }),
        fetchJsonSafely(`${API_BASE}/api/unifi/ids-alerts`, { headers: authHeaders }),
        fetchJsonSafely(`${API_BASE}/api/unifi/events`, { headers: authHeaders }),
      ]);

      if (!devicesRes.ok && !alertsRes.ok && !clientsRes.ok) {
        setConnectionError(devicesRes.error || "Kan ikke koble til UniFi Controller");
        setIsLoading(false);
        return;
      }

      setConnectionError(null);

      // Parse devices
      if (devicesRes.ok && devicesRes.data?.data) {
        const aps: APDevice[] = devicesRes.data.data
          .filter((d: any) => d.type === "uap")
          .map((d: any) => ({
            name: d.name || d.model,
            model: d.model,
            status: d.state === 1 ? "online" : "offline",
            clients: d["num_sta"] || 0,
            channel2g: d.radio_table?.find((r: any) => r.radio === "ng")?.channel?.toString() || "-",
            channel5g: d.radio_table?.find((r: any) => r.radio === "na")?.channel?.toString() || "-",
            experience: d.satisfaction ?? 0,
            ip: d.ip || "",
            mac: d.mac || "",
            firmware: d.version || "",
            uptime: d.uptime ? `${Math.floor(d.uptime / 86400)}d ${Math.floor((d.uptime % 86400) / 3600)}h` : "-",
            txPower2g: d.radio_table?.find((r: any) => r.radio === "ng")?.tx_power_mode === "custom" ? d.radio_table.find((r: any) => r.radio === "ng").tx_power : 20,
            txPower5g: d.radio_table?.find((r: any) => r.radio === "na")?.tx_power_mode === "custom" ? d.radio_table.find((r: any) => r.radio === "na").tx_power : 23,
            load: Math.round((d["sys_stats"]?.loadavg_1 || 0) * 100),
            memUsage: Math.round((d["sys_stats"]?.mem_used || 0) / (d["sys_stats"]?.mem_total || 1) * 100),
            cpuUsage: Math.round(d["system-stats"]?.cpu || 0),
            satisfaction: d.satisfaction ?? 0,
            connectedClients: [] as { name: string; ip: string; signal: number; band: string; rxRate: number; txRate: number }[],
          }));

        const switches: SwitchDevice[] = devicesRes.data.data
          .filter((d: any) => d.type === "usw")
          .map((d: any) => ({
            name: d.name || d.model,
            model: d.model,
            status: d.state === 1 ? "online" : "offline",
            ports: d.port_table?.length || 0,
            portsUsed: d.port_table?.filter((p: any) => p.up).length || 0,
            poeWatts: d.port_table?.reduce((sum: number, p: any) => sum + (p.poe_power || 0), 0) || 0,
            poeBudget: d.total_max_power || 0,
            ip: d.ip || "",
            mac: d.mac || "",
            firmware: d.version || "",
            uptime: d.uptime ? `${Math.floor(d.uptime / 86400)}d ${Math.floor((d.uptime % 86400) / 3600)}h` : "-",
            temperature: d.general_temperature || 0,
            fanLevel: d.fan_level || 0,
            portList: (d.port_table || []).map((p: any) => ({
              port: p.port_idx,
              name: p.name || "",
              status: p.up ? "up" : "down",
              speed: p.speed ? `${p.speed} Mbps` : "-",
              poeEnabled: p.poe_enable || false,
              poeWatts: p.poe_power || 0,
              device: p.name || "",
              vlan: p.port_vlan || 1,
              rxBytes: p.rx_bytes || 0,
              txBytes: p.tx_bytes || 0,
            })),
          }));

        if (aps.length > 0) setLiveAPs(aps);
        if (switches.length > 0) setLiveSwitches(switches);
      }

      // Parse IDS alerts
      if (alertsRes.ok && alertsRes.data?.data) {
        const alerts: IdsAlert[] = alertsRes.data.data.slice(0, 100).map((a: any) => ({
          id: a._id || a.key || Math.random().toString(),
          timestamp: a.datetime || a.time ? new Date(a.time).toISOString() : new Date().toISOString(),
          severity: a.catname?.includes("high") || a.threat_level > 3 ? "high" : a.catname?.includes("medium") ? "medium" : "low",
          category: a.catname || a.inner_alert_category || "unknown",
          signature: a.msg || a.inner_alert_signature || "Ukjent signatur",
          srcIp: a.src_ip || a.srcipGeo?.ip || "",
          dstIp: a.dst_ip || a.dstipGeo?.ip || "",
          srcPort: a.src_port || 0,
          dstPort: a.dst_port || 0,
          action: a.inner_alert_action || a.action || "alert",
          country: a.srcipGeo?.country_name,
          lat: a.srcipGeo?.latitude,
          lng: a.srcipGeo?.longitude,
        }));
        if (alerts.length > 0) setIdsAlerts(alerts);
      }

      // Parse clients and link to APs/switches
      if (clientsRes.ok && clientsRes.data?.data) {
        // Build device lookup from raw data for name resolution
        const allDevices = devicesRes.ok ? (devicesRes.data?.data || []) : [];
        const deviceByMac: Record<string, { name: string; type: string; ports?: any[] }> = {};
        allDevices.forEach((d: any) => {
          if (d.mac) {
            deviceByMac[d.mac.toLowerCase()] = {
              name: d.name || d.model || d.mac,
              type: d.type,
              ports: d.port_table,
            };
          }
        });

        const clients = clientsRes.data.data.slice(0, 100).map((c: any) => {
          const apMac = c.ap_mac?.toLowerCase();
          const swMac = c.sw_mac?.toLowerCase();
          const apDevice = apMac ? deviceByMac[apMac] : null;
          const swDevice = swMac ? deviceByMac[swMac] : null;

          let connectedTo = "-";
          if (!c.is_wired && apDevice) {
            connectedTo = apDevice.name;
          } else if (c.is_wired && swDevice) {
            const portNum = c.sw_port;
            connectedTo = portNum ? `${swDevice.name} Port ${portNum}` : swDevice.name;
          } else if (apMac) {
            connectedTo = apMac;
          } else if (swMac) {
            connectedTo = swMac;
          }

          return {
            id: c._id || c.mac,
            name: c.hostname || c.name || c.oui || c.mac,
            type: c.is_wired ? "desktop" : c.dev_cat === 7 ? "phone" : "laptop",
            ip: c.ip || "",
            mac: c.mac || "",
            connection: c.is_wired ? "Wired" : `WiFi ${c.channel && c.channel > 14 ? "5G" : "2.4G"}`,
            signal: c.rssi || 0,
            rxRate: Math.round((c.rx_rate || 0) / 1000),
            txRate: Math.round((c.tx_rate || 0) / 1000),
            uptime: c.uptime ? `${Math.floor(c.uptime / 3600)}h ${Math.floor((c.uptime % 3600) / 60)}m` : "-",
            connectedTo,
            network: c.network || c.essid || "-",
            vlan: c.vlan || 1,
            rxBytes: c.rx_bytes || 0,
            txBytes: c.tx_bytes || 0,
            channel: c.channel?.toString() || null,
            ap_mac: c.ap_mac || null,
          };
        });
        setLiveClients(clients);

        // Link wireless clients to their APs
        if (devicesRes.ok && devicesRes.data?.data) {
          setLiveAPs(prev => prev.map(ap => ({
            ...ap,
            connectedClients: clients
              .filter((c: any) => c.ap_mac && c.ap_mac.toLowerCase() === ap.mac.toLowerCase())
              .map((c: any) => ({
                name: c.name,
                ip: c.ip,
                signal: c.signal,
                band: c.connection.replace('WiFi ', ''),
                rxRate: c.rxRate,
                txRate: c.txRate,
              })),
          })));
        }
      }

      // Parse health/traffic
      if (healthRes.ok && healthRes.data?.data) {
        const wan = healthRes.data.data.find((h: any) => h.subsystem === "wan");
        const lan = healthRes.data.data.find((h: any) => h.subsystem === "lan");
        if (wan || lan) {
          setLiveTraffic({
            totalDownload: wan?.rx_bytes_r ? `${(wan.rx_bytes_r / 1048576).toFixed(1)} MB/s` : "—",
            totalUpload: wan?.tx_bytes_r ? `${(wan.tx_bytes_r / 1048576).toFixed(1)} MB/s` : "—",
            currentDown: wan?.rx_bytes_r ? `${(wan.rx_bytes_r / 1048576).toFixed(1)} MB/s` : "—",
            currentUp: wan?.tx_bytes_r ? `${(wan.tx_bytes_r / 1048576).toFixed(1)} MB/s` : "—",
            wanLatency: wan?.latency ? `${wan.latency}ms` : "—",
            dnsQueries: lan?.num_sta || 0,
          });
        }
      }

      // Parse dedicated IDS/IPS alerts
      if (idsRes.ok && idsRes.data?.alerts?.length > 0) {
        const idsAlertsMapped: IdsAlert[] = idsRes.data.alerts.map((a: any) => ({
          id: a.id,
          timestamp: a.timestamp,
          severity: a.severity || 'low',
          category: a.category || 'unknown',
          signature: a.signature || 'Ukjent signatur',
          srcIp: a.srcIp || '',
          dstIp: a.dstIp || '',
          srcPort: a.srcPort || 0,
          dstPort: a.dstPort || 0,
          action: a.action || 'alert',
        }));
        setIdsAlerts(idsAlertsMapped);
      }

      // Parse system events (includes firewall logs)
      if (eventsRes.ok && eventsRes.data?.events) {
        const allEvents: SystemEvent[] = eventsRes.data.events;
        setSystemEvents(allEvents);
        
        // Extract firewall events as firewall logs
        const fwLogs: FirewallLog[] = allEvents
          .filter((e: SystemEvent) => e.type === 'firewall' || e.key?.includes('FW'))
          .map((e: SystemEvent) => ({
            id: e.id,
            timestamp: e.timestamp,
            action: (e.action === 'drop' || e.action === 'reject' || e.key?.includes('BLOCK')) ? 'block' as const : 'allow' as const,
            rule: e.msg || e.key || '',
            protocol: e.proto || '',
            srcIp: e.srcIp || '',
            srcPort: e.srcPort || 0,
            dstIp: e.dstIp || '',
            dstPort: e.dstPort || 0,
            interface: e.subsystem || '',
            bytes: 0,
          }));
        if (fwLogs.length > 0) setLiveFirewallLogs(fwLogs);
      }

      // Firewall logs come from events
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : "Nettverksfeil");
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchLiveData();
    const interval = setInterval(fetchLiveData, 15000);
    return () => clearInterval(interval);
  }, [fetchLiveData]);

  const handleRestartAP = async (mac: string) => {
    setIsRestarting(mac);
    try {
      const res = await fetch(`${API_BASE}/api/unifi/devices/${mac}/restart`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        toast({ title: "Restart", description: "AP restartes. Dette tar ca. 2-3 minutter." });
      } else {
        const err = await res.json();
        toast({ title: "Feil", description: err.error || "Kunne ikke restarte AP", variant: "destructive" });
      }
    } catch {
      toast({ title: "Feil", description: "Backend ikke tilgjengelig", variant: "destructive" });
    } finally {
      setIsRestarting(null);
    }
  };

  const handlePowerCyclePort = async (switchMac: string, portIdx: number) => {
    setIsCyclingPort(portIdx);
    try {
      const res = await fetch(`${API_BASE}/api/unifi/devices/${switchMac}/port/${portIdx}/cycle`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        toast({ title: "Power Cycle", description: `Port ${portIdx} power-cycles. Enheten vil miste strøm i noen sekunder.` });
      } else {
        const err = await res.json();
        toast({ title: "Feil", description: err.error || "Kunne ikke power-cycle port", variant: "destructive" });
      }
    } catch {
      toast({ title: "Feil", description: "Backend ikke tilgjengelig", variant: "destructive" });
    } finally {
      setIsCyclingPort(null);
    }
  };
  // AbuseIPDB lookup
  const fetchAbuseData = useCallback(async (ip: string) => {
    if (abuseData[ip] || isLoadingAbuse) return;
    // Skip private IPs
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)) return;

    setIsLoadingAbuse(true);
    try {
      const res = await fetch(`${API_BASE}/api/abuseipdb/check/${ip}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAbuseData(prev => ({ ...prev, [ip]: data }));
      } else if (res.status === 400) {
        // API key not configured - silent fail
        setAbuseData(prev => ({ ...prev, [ip]: { notConfigured: true } }));
      }
    } catch {
      // Silent fail
    } finally {
      setIsLoadingAbuse(false);
    }
  }, [abuseData, isLoadingAbuse, token]);

  // Auto-fetch AbuseIPDB when alert is selected
  useEffect(() => {
    if (selectedAlert?.srcIp) {
      fetchAbuseData(selectedAlert.srcIp);
    }
  }, [selectedAlert?.srcIp, fetchAbuseData]);

  useEffect(() => {
    const cached = localStorage.getItem("ids_geoip_cache");
    if (cached) {
      try {
        const geoData = JSON.parse(cached);
        setIdsAlerts(prev => prev.map(alert => ({
          ...alert,
          ...geoData[alert.srcIp]
        })));
      } catch (e) {
        console.error("Failed to load cached GeoIP data");
      }
    }
  }, []);

  const handleGeoIPLookup = async () => {
    setIsLookingUp(true);
    toast({ title: "GeoIP Oppslag", description: "Henter lokasjon for IP-adresser..." });

    try {
      const ips = idsAlerts.map(a => a.srcIp);
      const results = await batchLookupGeoIP(ips);
      
      // Update alerts with GeoIP data
      const updatedAlerts = idsAlerts.map(alert => {
        const geo = results.get(alert.srcIp);
        if (geo) {
          return {
            ...alert,
            country: geo.countryCode,
            city: geo.city,
            lat: geo.lat,
            lng: geo.lng,
            isp: geo.isp
          };
        }
        return alert;
      });

      setIdsAlerts(updatedAlerts);

      // Cache results
      const geoCache: Record<string, any> = {};
      results.forEach((value, key) => {
        geoCache[key] = {
          country: value.countryCode,
          city: value.city,
          lat: value.lat,
          lng: value.lng,
          isp: value.isp
        };
      });
      localStorage.setItem("ids_geoip_cache", JSON.stringify(geoCache));

      toast({ 
        title: "GeoIP Fullført", 
        description: `Hentet lokasjon for ${results.size} IP-adresser` 
      });
    } catch (error) {
      toast({ 
        title: "Feil", 
        description: "Kunne ikke hente GeoIP data", 
        variant: "destructive" 
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  // MAC/IP to client name lookup
  const clientLookup = useMemo(() => {
    const byMac: Record<string, string> = {};
    const byIp: Record<string, string> = {};
    liveClients.forEach(c => {
      if (c.mac) byMac[c.mac.toLowerCase()] = c.name;
      if (c.ip) byIp[c.ip] = c.name;
    });
    return { byMac, byIp };
  }, [liveClients]);

  const resolveClient = (mac?: string, ip?: string) => {
    if (mac) {
      const name = clientLookup.byMac[mac.toLowerCase()];
      if (name) return name;
    }
    if (ip) {
      const name = clientLookup.byIp[ip];
      if (name) return name;
    }
    return null;
  };

  const sortedAlerts = useMemo(() => {
    let filtered = [...idsAlerts];
    
    if (filterSeverity !== "all") {
      filtered = filtered.filter(a => a.severity === filterSeverity);
    }

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "severity":
          return severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder];
        case "country":
          return (a.country || "ZZZ").localeCompare(b.country || "ZZZ");
        case "time":
        default:
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
    });
  }, [sortBy, filterSeverity, idsAlerts]);

  const attackLocations = idsAlerts
    .filter(a => a.lat && a.lng)
    .map(a => ({ lat: a.lat!, lng: a.lng!, severity: a.severity, country: a.country || "Unknown" }));

  const handleExportCSV = () => {
    exportToCSV(sortedAlerts, `ids-alerts-${new Date().toISOString().split('T')[0]}.csv`);
    toast({ title: "Eksportert", description: "IDS alerts eksportert til CSV" });
  };

  const handleExportJSON = () => {
    exportToJSON(sortedAlerts, `ids-alerts-${new Date().toISOString().split('T')[0]}.json`);
    toast({ title: "Eksportert", description: "IDS alerts eksportert til JSON" });
  };

  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-primary/10 p-3">
            <Wifi className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">UniFi Controller</h1>
            <p className="text-sm text-muted-foreground">IDS/IPS Overvåkning • Enhetsadministrasjon</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={fetchLiveData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Badge className={connectionError
              ? "bg-destructive/10 text-destructive border-destructive/20"
              : "bg-success/10 text-success border-success/20"
            }>
              {isLoading ? "Laster..." : connectionError ? "Ikke tilkoblet" : "Online"}
            </Badge>
          </div>
        </div>

        {connectionError && (
          <Card className="bg-destructive/10 border-destructive/30 mb-6">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <p className="text-sm text-destructive">{connectionError}</p>
            </CardContent>
          </Card>
        )}
        {/* Network Equipment Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Radio className="h-3 w-3 text-primary" />
                Access Points
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{liveAPs.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Network className="h-3 w-3 text-primary" />
                Switcher
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{liveSwitches.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ArrowDownRight className="h-3 w-3 text-success" />
                Nedlasting
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{liveTraffic.currentDown}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ArrowUpRight className="h-3 w-3 text-primary" />
                Opplasting
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{liveTraffic.currentUp}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Users className="h-3 w-3" />
                Klienter
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{liveClients.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Globe className="h-3 w-3" />
                WAN Latency
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{liveTraffic.wanLatency}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ShieldAlert className="h-3 w-3 text-destructive" />
                IDS Alerts
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{idsAlerts.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Activity className="h-3 w-3" />
                DNS Queries
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{liveTraffic.dnsQueries > 1000 ? `${(liveTraffic.dnsQueries / 1000).toFixed(1)}k` : liveTraffic.dnsQueries}</p>
            </CardContent>
          </Card>
        </div>

        {/* Network Equipment Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-card border-border">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                Access Points
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {liveAPs.map((ap) => (
                  <div key={ap.name} className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedAP(ap)}>
                    <div>
                      <p className="text-sm font-medium text-foreground">{ap.name}</p>
                      <p className="text-xs text-muted-foreground">Ch {ap.channel5g} • {ap.clients} klienter</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{ap.experience}%</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" />
                Switcher
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {liveSwitches.map((sw) => (
                  <div key={sw.name} className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedSwitch(sw)}>
                    <div>
                      <p className="text-sm font-medium text-foreground">{sw.name}</p>
                      <p className="text-xs text-muted-foreground">{sw.portsUsed}/{sw.ports} porter • {sw.poeWatts}W PoE</p>
                    </div>
                    <Badge className="bg-success/10 text-success text-xs">Online</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Router className="h-4 w-4 text-primary" />
                Gateway
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <p className="text-sm font-medium text-foreground">{networkDevices.gateway.name}</p>
              <p className="text-xs text-muted-foreground mt-1">WAN: {networkDevices.gateway.wanIp}</p>
              <p className="text-xs text-muted-foreground">Uptime: {networkDevices.gateway.uptime}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="ids" className="space-y-4">
          <TabsList className="bg-muted flex-wrap">
            <TabsTrigger value="ids" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ShieldAlert className="h-4 w-4 mr-2" />
              IDS/IPS Alerts
            </TabsTrigger>
            <TabsTrigger value="firewall" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              Firewall Logger
            </TabsTrigger>
            <TabsTrigger value="map" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="h-4 w-4 mr-2" />
              Angreps-kart
            </TabsTrigger>
            <TabsTrigger value="devices" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-4 w-4 mr-2" />
              Tilkoblede Enheter
            </TabsTrigger>
            <TabsTrigger value="fw-rules" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              Brannmurregler
            </TabsTrigger>
            <TabsTrigger value="syslog" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Activity className="h-4 w-4 mr-2" />
              System Logger
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ids">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Intrusion Detection / Prevention System
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleGeoIPLookup}
                      disabled={isLookingUp}
                      className="h-8 text-xs"
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${isLookingUp ? 'animate-spin' : ''}`} />
                      GeoIP Oppslag
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-8 text-xs">
                      <FileSpreadsheet className="h-3 w-3 mr-1" />
                      CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportJSON} className="h-8 text-xs">
                      <FileJson className="h-3 w-3 mr-1" />
                      JSON
                    </Button>
                    <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                      <SelectTrigger className="w-[120px] h-8 text-xs bg-muted border-border">
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle nivåer</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="w-[130px] h-8 text-xs bg-muted border-border">
                        <ArrowUpDown className="h-3 w-3 mr-1" />
                        <SelectValue placeholder="Sorter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="time">Tid (nyeste)</SelectItem>
                        <SelectItem value="severity">Alvorlighet</SelectItem>
                        <SelectItem value="country">Land</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {sortedAlerts.length === 0 ? (
                      <div className="p-12 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="rounded-full bg-success/10 p-4">
                            <CheckCircle className="h-8 w-8 text-success" />
                          </div>
                          <h3 className="text-lg font-medium text-foreground">Ingen truslar oppdaga</h3>
                          <p className="text-sm text-muted-foreground max-w-md">
                            IPS er aktiv og overvåkar nettverket. Ingen inntrengingsforsøk eller truslar er registrert.
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge className="bg-success/10 text-success border-success/20">IPS Aktiv</Badge>
                            <Badge variant="outline" className="text-xs">Notify & Block</Badge>
                          </div>
                        </div>
                      </div>
                    ) : sortedAlerts.map((alert) => (
                      <div key={alert.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedAlert(alert)}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={severityColors[alert.severity as keyof typeof severityColors]}>
                              {alert.severity.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="font-mono text-xs">
                              {alert.category}
                            </Badge>
                            <Badge variant={alert.action === "blocked" ? "destructive" : "secondary"}>
                              {alert.action === "blocked" ? "Blokkert" : "Varslet"}
                            </Badge>
                            {alert.country && (
                              <Badge variant="outline" className="text-xs">
                                <Globe className="h-3 w-3 mr-1" />
                                {alert.country}
                                {alert.city && ` • ${alert.city}`}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground font-mono flex items-center gap-1 shrink-0">
                            <Clock className="h-3 w-3" />
                            {alert.timestamp}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground mb-2">{alert.signature}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <span className="text-muted-foreground">Kilde IP:</span>
                            <p className="font-mono text-foreground">{alert.srcIp}:{alert.srcPort}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Destinasjon IP:</span>
                            <p className="font-mono text-foreground">{alert.dstIp}:{alert.dstPort}</p>
                          </div>
                          {alert.isp && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">ISP:</span>
                              <p className="font-mono text-foreground">{alert.isp}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="firewall">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Firewall Logger
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Ban className="h-3 w-3 text-destructive" />
                        Blokkert: {liveFirewallLogs.filter(l => l.action === "block").length}
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-success" />
                        Tillatt: {liveFirewallLogs.filter(l => l.action === "allow").length}
                      </span>
                    </div>
                    <Select value={filterFirewall} onValueChange={setFilterFirewall}>
                      <SelectTrigger className="w-[120px] h-8 text-xs bg-muted border-border">
                        <Filter className="h-3 w-3 mr-1" />
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="all">Alle</SelectItem>
                        <SelectItem value="block">Blokkert</SelectItem>
                        <SelectItem value="allow">Tillatt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {liveFirewallLogs.filter(log => filterFirewall === "all" || log.action === filterFirewall).length === 0 ? (
                      <div className="p-12 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Shield className="h-8 w-8 text-muted-foreground/50" />
                          <h3 className="text-lg font-medium text-foreground">Ingen brannmurlogger</h3>
                          <p className="text-sm text-muted-foreground max-w-md">
                            Brannmurlogger kjem frå EVT_FW-hendingar i UniFi. Ingen slike hendingar er registrert i loggen.
                          </p>
                        </div>
                      </div>
                    ) : liveFirewallLogs
                      .filter(log => filterFirewall === "all" || log.action === filterFirewall)
                      .map((log) => (
                      <div key={log.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedFirewallLog(log)}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={log.action === "block" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}>
                              {log.action === "block" ? (
                                <><Ban className="h-3 w-3 mr-1" />BLOCK</>
                              ) : (
                                <><CheckCircle className="h-3 w-3 mr-1" />ALLOW</>
                              )}
                            </Badge>
                            <Badge variant="outline" className="font-mono text-xs">
                              {log.protocol}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {log.interface}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono flex items-center gap-1 shrink-0">
                            <Clock className="h-3 w-3" />
                            {log.timestamp}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground mb-2">{log.rule}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <span className="text-muted-foreground">Kilde:</span>
                            <p className="font-mono text-foreground">{log.srcIp}{log.srcPort > 0 ? `:${log.srcPort}` : ""}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Destinasjon:</span>
                            <p className="font-mono text-foreground">{log.dstIp}{log.dstPort > 0 ? `:${log.dstPort}` : ""}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Bytes:</span>
                            <p className="font-mono text-foreground">{log.bytes.toLocaleString()}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Interface:</span>
                            <p className="font-mono text-foreground">{log.interface}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="map">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Angreps Geolokasjon
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleGeoIPLookup}
                    disabled={isLookingUp}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLookingUp ? 'animate-spin' : ''}`} />
                    Oppdater GeoIP
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <AttackMap attacks={attackLocations} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Tilkoblede Enheter ({liveClients.length})
                  </CardTitle>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Wifi className="h-3 w-3" /> WiFi: {liveClients.filter(d => d.connection !== "Ethernet").length}</span>
                    <span className="flex items-center gap-1"><Network className="h-3 w-3" /> Kabel: {liveClients.filter(d => d.connection === "Ethernet").length}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                    {liveClients.map((device) => (
                      <div key={device.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedDevice(device)}>
                        <div className="flex items-center gap-4">
                          <div className={`rounded-lg p-2.5 ${device.type === "unknown" ? "bg-warning/10" : "bg-primary/10"}`}>
                            <DeviceIcon type={device.type} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-foreground">{device.name}</p>
                              {device.type === "unknown" && (
                                <AlertTriangle className="h-4 w-4 text-warning" />
                              )}
                              <Badge variant="outline" className="text-[10px] font-mono">{device.network}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">{device.ip} • {device.mac}</p>
                          </div>
                          <div className="hidden md:block text-right text-xs">
                            <p className="text-muted-foreground">Tilkoblet via</p>
                            <p className="font-mono text-foreground text-[11px]">{device.connectedTo}</p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="text-muted-foreground">{device.connection}</p>
                            <p className="font-mono text-foreground">{device.signal !== 0 ? `${device.signal} dBm` : "Kablet"}</p>
                          </div>
                          <div className="hidden lg:block text-right text-xs">
                            <p className="text-muted-foreground">TX/RX</p>
                            <p className="font-mono text-foreground">{device.txRate}/{device.rxRate} Mbps</p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="text-muted-foreground">Uptime</p>
                            <p className="font-mono text-foreground">{device.uptime}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fw-rules">
            <FirewallAuditPanel />
          </TabsContent>

          <TabsContent value="syslog">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    System Logger ({systemEvents.length})
                  </CardTitle>
                  <Button variant="ghost" size="icon" onClick={fetchLiveData} disabled={isLoading}>
                    <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-border">
                     {systemEvents.length === 0 ? (
                       <div className="p-8 text-center text-muted-foreground text-sm">
                         {isLoading ? "Laster hendelser..." : "Ingen systemhendelser funnet"}
                       </div>
                     ) : systemEvents.map((event) => {
                       // Normalize MAC for comparison (lowercase, strip colons)
                       const normMac = (mac: string) => mac?.toLowerCase().replace(/[:-]/g, '') || '';
                       const macClient = event.clientMac ? liveClients.find(c => normMac(c.mac) === normMac(event.clientMac)) : null;
                       const ipClient = !macClient && event.srcIp ? liveClients.find(c => c.ip === event.srcIp) : null;
                       const linkedClient = macClient || ipClient;
                       const resolvedName = event.clientName || resolveClient(event.clientMac, event.srcIp) || resolveClient(event.deviceMac) || linkedClient?.name;
                       return (
                       <div key={event.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedEvent(event)}>
                         <div className="flex items-start justify-between mb-1">
                           <div className="flex flex-wrap items-center gap-2">
                             <Badge variant="outline" className={`text-xs ${
                               event.type === 'ids' ? 'border-destructive/30 text-destructive' :
                               event.type === 'firewall' ? 'border-warning/30 text-warning' :
                               'border-primary/30 text-primary'
                             }`}>
                               {event.type === 'ids' ? 'IDS/IPS' : event.type === 'firewall' ? 'Brannmur' : 'System'}
                             </Badge>
                             <Badge variant="secondary" className="text-[10px] font-mono">{event.key}</Badge>
                             {/* Always show client MAC as clickable badge when available */}
                             {event.clientMac && (
                               <Badge 
                                 className="text-[10px] bg-primary/10 text-primary border-primary/20 cursor-pointer hover:bg-primary/20"
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   if (linkedClient) {
                                     setSelectedDevice(linkedClient);
                                   } else {
                                     // Try harder: find by partial MAC match
                                     const dev = liveClients.find(c => normMac(c.mac) === normMac(event.clientMac));
                                     if (dev) setSelectedDevice(dev);
                                     else {
                                       toast({ title: "Klient ikkje funnen", description: `MAC ${event.clientMac} er ikkje blant aktive klientar`, variant: "destructive" });
                                     }
                                   }
                                 }}
                               >
                                 <Users className="h-3 w-3 mr-1" />
                                 {resolvedName || event.clientMac}
                                 {linkedClient && <ArrowUpRight className="h-3 w-3 ml-1" />}
                               </Badge>
                             )}
                             {/* Show resolved name separately if no MAC but name resolved from IP */}
                             {!event.clientMac && resolvedName && (
                               <Badge 
                                 className={`text-[10px] bg-primary/10 text-primary border-primary/20 ${ipClient ? 'cursor-pointer hover:bg-primary/20' : ''}`}
                                 onClick={(e) => {
                                   if (ipClient) {
                                     e.stopPropagation();
                                     setSelectedDevice(ipClient);
                                   }
                                 }}
                               >
                                 <Users className="h-3 w-3 mr-1" />
                                 {resolvedName}
                                 {ipClient && <ArrowUpRight className="h-3 w-3 ml-1" />}
                               </Badge>
                             )}
                             {event.deviceName && (
                               <Badge variant="outline" className="text-[10px]">{event.deviceName}</Badge>
                             )}
                           </div>
                           <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 shrink-0">
                             <Clock className="h-3 w-3" />
                             {event.timestamp ? new Date(event.timestamp).toLocaleString('nb-NO') : '—'}
                           </span>
                         </div>
                         <p className="text-sm text-foreground">{event.msg}</p>
                         <div className="flex gap-4 mt-1 text-xs text-muted-foreground font-mono flex-wrap">
                           {event.clientMac && (
                             <span className="text-muted-foreground/70">MAC: {event.clientMac}</span>
                           )}
                           {event.srcIp && <span>Kilde: {event.srcIp}{event.srcPort ? `:${event.srcPort}` : ''}</span>}
                           {event.dstIp && <span>Mål: {event.dstIp}{event.dstPort ? `:${event.dstPort}` : ''}</span>}
                           {event.proto && <span>{event.proto}</span>}
                         </div>
                       </div>
                       );
                     })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Device Detail Dialog */}
      <Dialog open={!!selectedDevice} onOpenChange={(open) => !open && setSelectedDevice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`rounded-lg p-2.5 ${selectedDevice?.type === "unknown" ? "bg-warning/10" : "bg-primary/10"}`}>
                {selectedDevice && <DeviceIcon type={selectedDevice.type} />}
              </div>
              <div>
                <span>{selectedDevice?.name}</span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] font-mono">{selectedDevice?.network}</Badge>
                  {selectedDevice?.type === "unknown" && <Badge variant="secondary" className="text-[10px] gap-1"><AlertTriangle className="h-3 w-3" />Ukjent enhet</Badge>}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedDevice && (
            <div className="space-y-4">
              {/* Connection path */}
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-2">Tilkoblingssti</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="gap-1 bg-primary/10 text-primary border-primary/20">
                    {selectedDevice.connection === "Ethernet" ? <Network className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
                    {selectedDevice.name}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge
                    variant="outline"
                    className="gap-1 font-mono text-xs cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => {
                      const ap = liveAPs.find(a => selectedDevice.connectedTo.includes(a.name));
                      const sw = liveSwitches.find(s => selectedDevice.connectedTo.includes(s.name));
                      setSelectedDevice(null);
                      setTimeout(() => {
                        if (ap) setSelectedAP(ap);
                        else if (sw) setSelectedSwitch(sw);
                      }, 150);
                    }}
                  >
                    {selectedDevice.connection === "Ethernet" ? <Network className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
                    {selectedDevice.connectedTo}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline" className="gap-1 font-mono text-xs">
                    <Router className="h-3 w-3" />
                    {networkDevices.gateway.name}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline" className="gap-1 font-mono text-xs">
                    <Globe className="h-3 w-3" />
                    WAN
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Network details */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">IP-adresse</span><span className="font-mono text-foreground">{selectedDevice.ip}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">MAC-adresse</span><span className="font-mono text-foreground text-xs">{selectedDevice.mac}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Nettverk</span><span className="text-foreground">{selectedDevice.network} (VLAN {selectedDevice.vlan})</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tilkobling</span><span className="text-foreground">{selectedDevice.connection}</span></div>
                {selectedDevice.channel && <div className="flex justify-between"><span className="text-muted-foreground">Kanal</span><span className="font-mono text-foreground">{selectedDevice.channel}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Tilkoblet til</span><span className="font-mono text-foreground text-xs">{selectedDevice.connectedTo}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Oppetid</span><span className="font-mono text-foreground">{selectedDevice.uptime}</span></div>
              </div>

              <Separator />

              {/* Signal & speed */}
              {selectedDevice.signal !== 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Signalstyrke</p>
                  <div className="flex items-center gap-3">
                    <Progress
                      value={Math.min(100, Math.max(0, (selectedDevice.signal + 90) * 2.5))}
                      className="h-2 flex-1"
                    />
                    <span className={`font-mono text-sm ${selectedDevice.signal > -50 ? "text-success" : selectedDevice.signal > -65 ? "text-foreground" : selectedDevice.signal > -75 ? "text-warning" : "text-destructive"}`}>
                      {selectedDevice.signal} dBm
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedDevice.signal > -50 ? "Utmerket" : selectedDevice.signal > -65 ? "Bra" : selectedDevice.signal > -75 ? "Middels" : "Svakt"} signal
                  </p>
                </div>
              )}

              {/* Speed */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">TX hastighet</p>
                  <p className="font-mono font-bold text-foreground">{selectedDevice.txRate} Mbps</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">RX hastighet</p>
                  <p className="font-mono font-bold text-foreground">{selectedDevice.rxRate} Mbps</p>
                </div>
              </div>

              {/* Traffic */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Nedlastet totalt</p>
                  <p className="font-mono font-bold text-foreground">{formatBytes(selectedDevice.rxBytes)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Opplastet totalt</p>
                  <p className="font-mono font-bold text-foreground">{formatBytes(selectedDevice.txBytes)}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AP Detail Dialog */}
      <Dialog open={!!selectedAP} onOpenChange={(open) => !open && setSelectedAP(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="rounded-lg p-2.5 bg-primary/10">
                <Radio className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span>{selectedAP?.name}</span>
                <p className="text-xs text-muted-foreground font-normal mt-1">{selectedAP?.model} • {selectedAP?.firmware}</p>
              </div>
              <Badge className="ml-auto bg-success/10 text-success border-success/20">{selectedAP?.status}</Badge>
            </DialogTitle>
          </DialogHeader>
          {selectedAP && (
            <div className="space-y-4">
              {/* Device Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">IP-adresse</span><span className="font-mono text-foreground">{selectedAP.ip}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">MAC-adresse</span><span className="font-mono text-foreground text-xs">{selectedAP.mac}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Firmware</span><span className="font-mono text-foreground">{selectedAP.firmware}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Oppetid</span><span className="font-mono text-foreground">{selectedAP.uptime}</span></div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">2.4GHz Kanal</span><span className="font-mono text-foreground">Ch {selectedAP.channel2g}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">5GHz Kanal</span><span className="font-mono text-foreground">Ch {selectedAP.channel5g}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">TX 2.4GHz</span><span className="font-mono text-foreground">{selectedAP.txPower2g} dBm</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">TX 5GHz</span><span className="font-mono text-foreground">{selectedAP.txPower5g} dBm</span></div>
                </div>
              </div>

              <Separator />

              {/* Resource Usage */}
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium">Ressursbruk</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16">CPU</span>
                    <Progress value={selectedAP.cpuUsage} className="h-2 flex-1" />
                    <span className="text-xs font-mono text-foreground w-10 text-right">{selectedAP.cpuUsage}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16">Minne</span>
                    <Progress value={selectedAP.memUsage} className="h-2 flex-1" />
                    <span className="text-xs font-mono text-foreground w-10 text-right">{selectedAP.memUsage}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16">Kanalbruk</span>
                    <Progress value={selectedAP.load} className="h-2 flex-1" />
                    <span className="text-xs font-mono text-foreground w-10 text-right">{selectedAP.load}%</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Satisfaction */}
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">WiFi Satisfaction</p>
                <p className={`text-3xl font-mono font-bold ${selectedAP.satisfaction >= 90 ? "text-success" : selectedAP.satisfaction >= 70 ? "text-warning" : "text-destructive"}`}>
                  {selectedAP.satisfaction}%
                </p>
              </div>

              <Separator />

              {/* Connected Clients */}
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">Tilkoblede klienter ({selectedAP.connectedClients.length})</p>
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {selectedAP.connectedClients.map((client, idx) => {
                    const device = liveClients.find(d => d.ip === client.ip);
                    return (
                      <div
                        key={idx}
                        className={`p-3 flex items-center justify-between text-sm ${device ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                        onClick={() => {
                          if (device) {
                            setSelectedAP(null);
                            setTimeout(() => setSelectedDevice(device), 150);
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {device && <DeviceIcon type={device.type} />}
                          <div>
                            <p className="font-medium text-foreground">{client.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{client.ip} • {client.band}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right text-xs">
                            <p className={`font-mono ${client.signal > -50 ? "text-success" : client.signal > -65 ? "text-foreground" : "text-warning"}`}>
                              {client.signal} dBm
                            </p>
                            <p className="text-muted-foreground">{client.txRate}/{client.rxRate} Mbps</p>
                          </div>
                          {device && <ArrowUpRight className="h-3 w-3 text-muted-foreground" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Restart Button */}
              <Button
                variant="destructive"
                className="w-full gap-2"
                onClick={() => handleRestartAP(selectedAP.mac)}
                disabled={isRestarting === selectedAP.mac}
              >
                {isRestarting === selectedAP.mac ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Restarter...</>
                ) : (
                  <><Power className="h-4 w-4" />Restart AP</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Switch Detail Dialog */}
      <Dialog open={!!selectedSwitch} onOpenChange={(open) => !open && setSelectedSwitch(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="rounded-lg p-2.5 bg-primary/10">
                <Network className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span>{selectedSwitch?.name}</span>
                <p className="text-xs text-muted-foreground font-normal mt-1">{selectedSwitch?.model} • {selectedSwitch?.firmware}</p>
              </div>
              <Badge className="ml-auto bg-success/10 text-success border-success/20">{selectedSwitch?.status}</Badge>
            </DialogTitle>
          </DialogHeader>
          {selectedSwitch && (
            <div className="space-y-4">
              {/* Switch Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Porter i bruk</p>
                  <p className="font-mono font-bold text-foreground">{selectedSwitch.portsUsed}/{selectedSwitch.ports}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">PoE Forbruk</p>
                  <p className="font-mono font-bold text-foreground">{selectedSwitch.poeWatts}W / {selectedSwitch.poeBudget}W</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Temperatur</p>
                  <p className={`font-mono font-bold ${selectedSwitch.temperature > 55 ? "text-destructive" : selectedSwitch.temperature > 45 ? "text-warning" : "text-foreground"}`}>
                    {selectedSwitch.temperature}°C
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Oppetid</p>
                  <p className="font-mono font-bold text-foreground">{selectedSwitch.uptime}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">IP-adresse</span><span className="font-mono text-foreground">{selectedSwitch.ip}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">MAC-adresse</span><span className="font-mono text-foreground text-xs">{selectedSwitch.mac}</span></div>
              </div>

              {/* PoE Budget Bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">PoE Budsjett</span>
                  <span className="font-mono text-foreground">{Math.round((selectedSwitch.poeWatts / selectedSwitch.poeBudget) * 100)}%</span>
                </div>
                <Progress value={(selectedSwitch.poeWatts / selectedSwitch.poeBudget) * 100} className="h-2" />
              </div>

              <Separator />

              {/* Port List */}
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">Porter</p>
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-[50px_1fr_80px_80px_70px_80px_80px_60px] gap-2 p-2 bg-muted/80 text-[10px] text-muted-foreground font-medium sticky top-0">
                      <span>Port</span>
                      <span>Enhet</span>
                      <span>Status</span>
                      <span>Hastighet</span>
                      <span>VLAN</span>
                      <span>PoE</span>
                      <span>Trafikk</span>
                      <span>Handling</span>
                    </div>
                    {selectedSwitch.portList.map((port) => {
                      const connDevice = port.name ? liveClients.find(d => d.connectedTo.includes(selectedSwitch.name) && d.connectedTo.includes(`Port ${port.port}`)) || liveClients.find(d => d.name === port.name) : null;
                      return (
                        <div
                          key={port.port}
                          className={`grid grid-cols-[50px_1fr_80px_80px_70px_80px_80px_60px] gap-2 p-2 text-xs items-center ${port.status === "down" ? "opacity-50" : ""} ${connDevice ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                          onClick={() => {
                            if (connDevice) {
                              setSelectedSwitch(null);
                              setTimeout(() => setSelectedDevice(connDevice), 150);
                            }
                          }}
                        >
                          <span className="font-mono font-bold text-foreground">{port.port}</span>
                          <span className="text-foreground truncate flex items-center gap-1">
                            {port.name || <span className="text-muted-foreground italic">Ledig</span>}
                            {connDevice && <ArrowUpRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                          </span>
                          <Badge variant={port.status === "up" ? "default" : "secondary"} className={`text-[10px] justify-center ${port.status === "up" ? "bg-success/10 text-success" : ""}`}>
                            {port.status === "up" ? "● Oppe" : "○ Nede"}
                          </Badge>
                          <span className="font-mono text-foreground text-[11px]">{port.speed}</span>
                          <span className="font-mono text-foreground">{port.vlan}</span>
                          <span className="font-mono text-foreground text-[11px]">
                            {port.poeEnabled ? `${port.poeWatts}W` : <span className="text-muted-foreground">—</span>}
                          </span>
                          <span className="font-mono text-foreground text-[11px]">
                            {port.status === "up" ? `${formatBytes(port.rxBytes + port.txBytes)}` : "—"}
                          </span>
                          <span>
                            {port.poeEnabled && port.status === "up" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                title="Power Cycle Port"
                                onClick={(e) => { e.stopPropagation(); handlePowerCyclePort(selectedSwitch.mac, port.port); }}
                                disabled={isCyclingPort === port.port}
                              >
                                {isCyclingPort === port.port ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Zap className="h-3 w-3 text-warning" />
                                )}
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              <Separator />

              {/* Restart Switch */}
              <Button
                variant="destructive"
                className="w-full gap-2"
                onClick={() => handleRestartAP(selectedSwitch.mac)}
                disabled={isRestarting === selectedSwitch.mac}
              >
                {isRestarting === selectedSwitch.mac ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Restarter...</>
                ) : (
                  <><Power className="h-4 w-4" />Restart Switch</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* IDS Alert Detail Dialog */}
      <Dialog open={!!selectedAlert} onOpenChange={(open) => !open && setSelectedAlert(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="rounded-lg p-2.5 bg-destructive/10">
                <ShieldAlert className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-base">IDS/IPS Varsel</span>
                {selectedAlert && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={severityColors[selectedAlert.severity as keyof typeof severityColors]}>
                      {selectedAlert.severity.toUpperCase()}
                    </Badge>
                    <Badge variant={selectedAlert.action === "blocked" ? "destructive" : "secondary"}>
                      {selectedAlert.action === "blocked" ? "Blokkert" : "Varslet"}
                    </Badge>
                  </div>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedAlert && (
            <div className="space-y-4">
              {/* Signature */}
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Signatur</p>
                <p className="font-medium text-foreground">{selectedAlert.signature}</p>
                <Badge variant="outline" className="font-mono text-xs mt-2">{selectedAlert.category}</Badge>
              </div>

              <Separator />

              {/* Timing */}
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Tidspunkt:</span>
                <span className="font-mono text-foreground">{selectedAlert.timestamp}</span>
              </div>

              <Separator />

              {/* Source & Destination */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" /> Kilde
                  </p>
                  <p className="font-mono text-foreground text-sm">{selectedAlert.srcIp}</p>
                  <p className="font-mono text-xs text-muted-foreground">Port {selectedAlert.srcPort}</p>
                  {selectedAlert.country && (
                    <div className="mt-2 flex items-center gap-1">
                      <Globe className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-foreground">
                        {selectedAlert.country}
                        {selectedAlert.city && ` • ${selectedAlert.city}`}
                      </span>
                    </div>
                  )}
                  {selectedAlert.isp && (
                    <p className="text-xs text-muted-foreground mt-1">ISP: {selectedAlert.isp}</p>
                  )}
                  {/* Link to device if internal IP */}
                  {(() => {
                    const dev = liveClients.find(d => d.ip === selectedAlert.srcIp);
                    return dev ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 text-xs gap-1 text-primary"
                        onClick={() => { setSelectedAlert(null); setTimeout(() => setSelectedDevice(dev), 150); }}
                      >
                        <DeviceIcon type={dev.type} /> {dev.name} <ArrowUpRight className="h-3 w-3" />
                      </Button>
                    ) : null;
                  })()}
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <ArrowDownRight className="h-3 w-3" /> Destinasjon
                  </p>
                  <p className="font-mono text-foreground text-sm">{selectedAlert.dstIp}</p>
                  <p className="font-mono text-xs text-muted-foreground">Port {selectedAlert.dstPort}</p>
                  {/* Link to device if internal IP */}
                  {(() => {
                    const dev = liveClients.find(d => d.ip === selectedAlert.dstIp);
                    return dev ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 text-xs gap-1 text-primary"
                        onClick={() => { setSelectedAlert(null); setTimeout(() => setSelectedDevice(dev), 150); }}
                      >
                        <DeviceIcon type={dev.type} /> {dev.name} <ArrowUpRight className="h-3 w-3" />
                      </Button>
                    ) : null;
                  })()}
                </div>
              </div>

              <Separator />

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedAlert.srcIp);
                    toast({ title: "Kopiert", description: `${selectedAlert.srcIp} kopiert til utklippstavle` });
                  }}
                >
                  <Copy className="h-3 w-3" /> Kopier kilde-IP
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => window.open(`https://www.abuseipdb.com/check/${selectedAlert.srcIp}`, '_blank')}
                >
                  <ExternalLink className="h-3 w-3" /> Sjekk AbuseIPDB
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => window.open(`https://www.shodan.io/host/${selectedAlert.srcIp}`, '_blank')}
                >
                  <Search className="h-3 w-3" /> Shodan
                </Button>
              </div>

              {/* AbuseIPDB Score */}
              {(() => {
                const abuse = abuseData[selectedAlert.srcIp];
                if (!abuse || abuse.notConfigured) return null;
                const score = abuse.abuseConfidenceScore ?? 0;
                const scoreColor = score >= 75 ? 'text-destructive' : score >= 25 ? 'text-warning' : 'text-success';
                const scoreBg = score >= 75 ? 'bg-destructive/10 border-destructive/30' : score >= 25 ? 'bg-warning/10 border-warning/30' : 'bg-success/10 border-success/30';
                return (
                  <div className={`rounded-lg p-4 border ${scoreBg}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className={`h-4 w-4 ${scoreColor}`} />
                        <span className="text-sm font-medium text-foreground">AbuseIPDB</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-2xl font-bold ${scoreColor}`}>{score}%</span>
                        <span className="text-xs text-muted-foreground">abuse score</span>
                      </div>
                    </div>
                    <Progress value={score} className="h-2 mb-3" />
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {abuse.totalReports != null && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Rapporter:</span><span className="font-mono text-foreground">{abuse.totalReports}</span></div>
                      )}
                      {abuse.numDistinctUsers != null && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Rapportører:</span><span className="font-mono text-foreground">{abuse.numDistinctUsers}</span></div>
                      )}
                      {abuse.isp && (
                        <div className="flex justify-between col-span-2"><span className="text-muted-foreground">ISP:</span><span className="font-mono text-foreground truncate ml-2">{abuse.isp}</span></div>
                      )}
                      {abuse.domain && (
                        <div className="flex justify-between col-span-2"><span className="text-muted-foreground">Domene:</span><span className="font-mono text-foreground">{abuse.domain}</span></div>
                      )}
                      {abuse.usageType && (
                        <div className="flex justify-between col-span-2"><span className="text-muted-foreground">Type:</span><span className="font-mono text-foreground">{abuse.usageType}</span></div>
                      )}
                      {abuse.isTor && (
                        <div className="col-span-2"><Badge variant="destructive" className="text-xs">Tor Exit Node</Badge></div>
                      )}
                      {abuse.lastReportedAt && (
                        <div className="flex justify-between col-span-2"><span className="text-muted-foreground">Sist rapportert:</span><span className="font-mono text-foreground">{new Date(abuse.lastReportedAt).toLocaleDateString('nb-NO')}</span></div>
                      )}
                    </div>
                    {abuse.reports?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs font-medium text-foreground mb-2">Siste rapporter:</p>
                        <div className="space-y-1.5 max-h-24 overflow-y-auto">
                          {abuse.reports.map((r: any, i: number) => (
                            <div key={i} className="text-xs text-muted-foreground">
                              <span className="font-mono">{new Date(r.reportedAt).toLocaleDateString('nb-NO')}</span>
                              {r.comment && <span className="ml-2 text-foreground">— {r.comment.slice(0, 80)}{r.comment.length > 80 ? '…' : ''}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {isLoadingAbuse && !abuseData[selectedAlert.srcIp] && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Henter AbuseIPDB data...
                </div>
              )}

              {/* Threat Info */}
              <div className="bg-muted/30 rounded-lg p-3 border border-border">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Om denne regelen</p>
                    {selectedAlert.category.includes("SCAN") && <p>Skanneaktivitet oppdaget. Noen prøver å kartlegge nettverket ditt eller finne åpne porter/tjenester.</p>}
                    {selectedAlert.category.includes("MALWARE") && <p>Potensiell malware-aktivitet. En enhet kan kommunisere med kjente ondsinnede domener.</p>}
                    {selectedAlert.category.includes("EXPLOIT") && <p>Utnyttelsesforsøk oppdaget. En angriper prøver å utnytte kjente sårbarheter i tjenestene dine.</p>}
                    {selectedAlert.category.includes("TROJAN") && <p>Trojaner/C2-trafikk oppdaget. En enhet kan være kompromittert og kommuniserer med en kontrollserver.</p>}
                    {selectedAlert.category.includes("POLICY") && <p>Policy-brudd oppdaget. Trafikk som bryter med nettverkspolicyen din.</p>}
                    {selectedAlert.category.includes("WEB") && <p>Nettangrep oppdaget (f.eks. XSS, injeksjon). En angriper prøver å utnytte webtjenester.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Firewall Log Detail Dialog */}
      <Dialog open={!!selectedFirewallLog} onOpenChange={(open) => !open && setSelectedFirewallLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`rounded-lg p-2.5 ${selectedFirewallLog?.action === "block" ? "bg-destructive/10" : "bg-success/10"}`}>
                {selectedFirewallLog?.action === "block" ? (
                  <Ban className="h-5 w-5 text-destructive" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-success" />
                )}
              </div>
              <div>
                <span className="text-base">Firewall Logg</span>
                {selectedFirewallLog && (
                  <p className="text-xs text-muted-foreground font-normal mt-1">{selectedFirewallLog.rule}</p>
                )}
              </div>
              {selectedFirewallLog && (
                <Badge className={`ml-auto ${selectedFirewallLog.action === "block" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
                  {selectedFirewallLog.action === "block" ? "BLOKKERT" : "TILLATT"}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedFirewallLog && (
            <div className="space-y-4">
              {/* Timing & Protocol */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-foreground">{selectedFirewallLog.timestamp}</span>
                </div>
                <Badge variant="outline" className="font-mono text-xs">{selectedFirewallLog.protocol}</Badge>
                <Badge variant="secondary" className="text-xs">{selectedFirewallLog.interface}</Badge>
              </div>

              <Separator />

              {/* Rule Info */}
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Firewall-regel</p>
                <p className="font-medium text-foreground">{selectedFirewallLog.rule}</p>
              </div>

              <Separator />

              {/* Source & Destination */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" /> Kilde
                  </p>
                  <p className="font-mono text-foreground text-sm">{selectedFirewallLog.srcIp}</p>
                  {selectedFirewallLog.srcPort > 0 && (
                    <p className="font-mono text-xs text-muted-foreground">Port {selectedFirewallLog.srcPort}</p>
                  )}
                  {(() => {
                    const dev = liveClients.find(d => d.ip === selectedFirewallLog.srcIp);
                    return dev ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 text-xs gap-1 text-primary"
                        onClick={() => { setSelectedFirewallLog(null); setTimeout(() => setSelectedDevice(dev), 150); }}
                      >
                        <DeviceIcon type={dev.type} /> {dev.name} <ArrowUpRight className="h-3 w-3" />
                      </Button>
                    ) : null;
                  })()}
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <ArrowDownRight className="h-3 w-3" /> Destinasjon
                  </p>
                  <p className="font-mono text-foreground text-sm">{selectedFirewallLog.dstIp}</p>
                  {selectedFirewallLog.dstPort > 0 && (
                    <p className="font-mono text-xs text-muted-foreground">Port {selectedFirewallLog.dstPort}</p>
                  )}
                  {(() => {
                    const dev = liveClients.find(d => d.ip === selectedFirewallLog.dstIp);
                    return dev ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 text-xs gap-1 text-primary"
                        onClick={() => { setSelectedFirewallLog(null); setTimeout(() => setSelectedDevice(dev), 150); }}
                      >
                        <DeviceIcon type={dev.type} /> {dev.name} <ArrowUpRight className="h-3 w-3" />
                      </Button>
                    ) : null;
                  })()}
                </div>
              </div>

              <Separator />

              {/* Traffic Details */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Bytes</p>
                  <p className="font-mono font-bold text-foreground">{selectedFirewallLog.bytes.toLocaleString()}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Protokoll</p>
                  <p className="font-mono font-bold text-foreground">{selectedFirewallLog.protocol}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Grensesnitt</p>
                  <p className="font-mono font-bold text-foreground">{selectedFirewallLog.interface}</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedFirewallLog.srcIp);
                    toast({ title: "Kopiert", description: `${selectedFirewallLog.srcIp} kopiert til utklippstavle` });
                  }}
                >
                  <Copy className="h-3 w-3" /> Kopier kilde-IP
                </Button>
                {selectedFirewallLog.action === "block" && !selectedFirewallLog.srcIp.startsWith("192.168") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => window.open(`https://www.abuseipdb.com/check/${selectedFirewallLog.srcIp}`, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" /> Sjekk AbuseIPDB
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* System Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Hendelsesdetaljer
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={`text-xs ${
                  selectedEvent.type === 'ids' ? 'border-destructive/30 text-destructive' :
                  selectedEvent.type === 'firewall' ? 'border-warning/30 text-warning' :
                  'border-primary/30 text-primary'
                }`}>
                  {selectedEvent.type === 'ids' ? 'IDS/IPS' : selectedEvent.type === 'firewall' ? 'Brannmur' : 'System'}
                </Badge>
                <Badge variant="secondary" className="font-mono text-xs">{selectedEvent.key}</Badge>
                {selectedEvent.action && <Badge variant="outline" className="text-xs">{selectedEvent.action}</Badge>}
              </div>

              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-foreground">{selectedEvent.msg}</p>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Tidspunkt</span><span className="font-mono text-foreground">{selectedEvent.timestamp ? new Date(selectedEvent.timestamp).toLocaleString('nb-NO') : '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Hendelsestype</span><span className="font-mono text-foreground">{selectedEvent.key}</span></div>
                {selectedEvent.subsystem && <div className="flex justify-between"><span className="text-muted-foreground">Subsystem</span><span className="text-foreground">{selectedEvent.subsystem}</span></div>}
                {selectedEvent.deviceName && <div className="flex justify-between"><span className="text-muted-foreground">Enhet</span><span className="text-foreground">{selectedEvent.deviceName}</span></div>}
                {selectedEvent.deviceMac && <div className="flex justify-between"><span className="text-muted-foreground">Enhet MAC</span><span className="font-mono text-foreground text-xs">{selectedEvent.deviceMac}</span></div>}
                {selectedEvent.srcIp && <div className="flex justify-between"><span className="text-muted-foreground">Kilde IP</span><span className="font-mono text-foreground">{selectedEvent.srcIp}{selectedEvent.srcPort ? `:${selectedEvent.srcPort}` : ''}</span></div>}
                {selectedEvent.dstIp && <div className="flex justify-between"><span className="text-muted-foreground">Mål IP</span><span className="font-mono text-foreground">{selectedEvent.dstIp}{selectedEvent.dstPort ? `:${selectedEvent.dstPort}` : ''}</span></div>}
                {selectedEvent.proto && <div className="flex justify-between"><span className="text-muted-foreground">Protokoll</span><span className="font-mono text-foreground">{selectedEvent.proto}</span></div>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
