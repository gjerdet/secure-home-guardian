import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ScanReportDialog } from "@/components/security/ScanReportDialog";
import { AttackMap } from "@/components/AttackMap";
import { batchLookupGeoIP } from "@/lib/ids-utils";
import { VlanSubnetManager, type VlanSubnet } from "@/components/security/VlanSubnetManager";
import { SslCheckPanel } from "@/components/security/SslCheckPanel";
import { FirewallAuditPanel } from "@/components/security/FirewallAuditPanel";
import { DnsLeakPanel } from "@/components/security/DnsLeakPanel";
import { SecurityScorePanel } from "@/components/security/SecurityScorePanel";
import { IdsIpsPanel } from "@/components/security/IdsIpsPanel";
import { NmapHostDetailDialog, type NmapHostDetail } from "@/components/security/NmapHostDetailDialog";
import { VulnerabilityDetailDialog, type VulnerabilityDetail } from "@/components/security/VulnerabilityDetailDialog";
import { 
  Radar, Shield, Search, Clock, AlertTriangle, CheckCircle,
  Play, Target, Globe, Server, FileText, ChevronRight, Loader2, RefreshCw, Plus, StopCircle, MapPin, Network, Wifi, ExternalLink, Lock, Activity, History
} from "lucide-react";

import { API_BASE, fetchJsonSafely } from '@/lib/api';

interface OpenVASScan {
  id: string;
  name: string;
  target: string;
  lastRun: string;
  status: string;
  progress: number;
  comment: string;
  high: number;
  medium: number;
  low: number;
  info: number;
}

type Vulnerability = VulnerabilityDetail;

// NmapHost kept for compatibility, but we use NmapHostDetail for rich data
type NmapHost = NmapHostDetail;

interface NmapProgress {
  percent: number;
  hostsFound: number;
  status: 'idle' | 'scanning' | 'complete' | 'error';
  message?: string;
}

interface VlanScanResult {
  vlan: VlanSubnet;
  hosts: NmapHost[];
  progress: NmapProgress;
}

const severityColors = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/80 text-destructive-foreground",
  medium: "bg-warning text-warning-foreground",
  low: "bg-primary/80 text-primary-foreground",
  info: "bg-muted text-muted-foreground",
};

// Parse nmap XML output
function parseNmapXML(xmlString: string): NmapHost[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const hosts: NmapHost[] = [];

  const hostNodes = doc.querySelectorAll("host");
  hostNodes.forEach((hostNode) => {
    const status = hostNode.querySelector("status")?.getAttribute("state") || "unknown";
    if (status !== "up") return;

    const address = hostNode.querySelector("address")?.getAttribute("addr") || "";
    const hostname = hostNode.querySelector("hostnames hostname")?.getAttribute("name") || "unknown";
    
    const ports: number[] = [];
    hostNode.querySelectorAll("port").forEach((portNode) => {
      const state = portNode.querySelector("state")?.getAttribute("state");
      if (state === "open") {
        ports.push(parseInt(portNode.getAttribute("portid") || "0"));
      }
    });

    const osMatch = hostNode.querySelector("osmatch")?.getAttribute("name") || "Unknown";

    hosts.push({
      host: address,
      hostname,
      status,
      ports,
      os: osMatch,
    });
  });

  return hosts;
}

export default function Security() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [nmapTarget, setNmapTarget] = useState("192.168.1.0/24");
  const [nmapScanType, setNmapScanType] = useState("quick");
  const [nmapResults, setNmapResults] = useState<NmapHost[]>([]);
  const [nmapProgress, setNmapProgress] = useState<NmapProgress>({
    percent: 0,
    hostsFound: 0,
    status: 'idle'
  });
  const [nmapJobId, setNmapJobId] = useState<string | null>(null);
  const nmapPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const vlanEventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  
  // Per-VLAN scan results
  const [vlanScanResults, setVlanScanResults] = useState<Map<string, VlanScanResult>>(new Map());
  const [isParallelScanning, setIsParallelScanning] = useState(false);
  
  const [openvasScans, setOpenvasScans] = useState<OpenVASScan[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [isLoadingOpenvas, setIsLoadingOpenvas] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [unifiClients, setUnifiClients] = useState<any[]>([]);
  const [selectedVlans, setSelectedVlans] = useState<string[]>([]);
  const [availableVlans, setAvailableVlans] = useState<VlanSubnet[]>([]);
  
  // OpenVAS new scan dialog
  const [openvasDialogOpen, setOpenvasDialogOpen] = useState(false);
  const [newScanTarget, setNewScanTarget] = useState("");
  const [newScanName, setNewScanName] = useState("");
  const [newScanConfig, setNewScanConfig] = useState("full");
  const [isStartingOpenvasScan, setIsStartingOpenvasScan] = useState(false);
  
  // Scan report dialog
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedScan, setSelectedScan] = useState<OpenVASScan | null>(null);
  
  // Nmap host detail dialog
  const [nmapDetailOpen, setNmapDetailOpen] = useState(false);
  const [selectedNmapHost, setSelectedNmapHost] = useState<NmapHostDetail | null>(null);
  
  // Vulnerability detail dialog
  const [vulnDetailOpen, setVulnDetailOpen] = useState(false);
  const [selectedVuln, setSelectedVuln] = useState<VulnerabilityDetail | null>(null);

  // Geo map state for scan results
  const [scanGeoLocations, setScanGeoLocations] = useState<Array<{ lat: number; lng: number; severity: string; country: string }>>([]);
  const [isGeoLookingUp, setIsGeoLookingUp] = useState(false);

  // Scan history
  const [scanHistory, setScanHistory] = useState<Array<{
    id: string;
    target: string;
    scanType: string;
    hostsFound: number;
    timestamp: string;
    duration?: number;
    result?: string;
  }>>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  // WAN scan state
  const [wanIp, setWanIp] = useState<string>("");
  const [isLoadingWanIp, setIsLoadingWanIp] = useState(false);
  const [wanScanType, setWanScanType] = useState("ports");
  const [wanResults, setWanResults] = useState<NmapHost[]>([]);
  const [wanProgress, setWanProgress] = useState<NmapProgress>({ percent: 0, hostsFound: 0, status: 'idle' });
  const wanEventSourceRef = useRef<EventSource | null>(null);

  // Stats
  const stats = {
    high: vulnerabilities.filter(v => v.severity === "high").length,
    medium: vulnerabilities.filter(v => v.severity === "medium").length,
    low: vulnerabilities.filter(v => v.severity === "low").length,
    info: vulnerabilities.filter(v => v.severity === "info").length,
  };
  // Enrich nmap hosts with UniFi client data
  const enrichWithUnifi = (hosts: NmapHost[]): NmapHost[] => {
    if (unifiClients.length === 0) return hosts;
    return hosts.map(host => {
      const client = unifiClients.find((c: any) => 
        c.ip === host.host || c.mac?.toLowerCase() === host.mac?.toLowerCase()
      );
      if (!client) return host;
      
      const enriched = { ...host };
      if (!enriched.hostname || enriched.hostname === 'unknown') {
        enriched.hostname = client.name || client.hostname || enriched.hostname;
      }
      if (!enriched.mac && client.mac) enriched.mac = client.mac;
      if (!enriched.vendor && client.oui) enriched.vendor = client.oui;
      
      // Add connection info from UniFi
      if (client.is_wired) {
        enriched.connection = {
          type: 'ethernet',
          switchName: client.sw_name || client.sw_mac || undefined,
          switchMac: client.sw_mac || undefined,
          switchPort: client.sw_port || undefined,
          portSpeed: client.network_speed ? `${client.network_speed} Mbps` : undefined,
        };
      } else {
        enriched.connection = {
          type: 'wifi',
          ap: client.ap_name || client.ap_mac || undefined,
          apMac: client.ap_mac || undefined,
          ssid: client.essid || client.bssid || undefined,
          channel: client.channel || undefined,
          band: client.radio_proto || undefined,
          signal: client.rssi || client.signal || undefined,
          txRate: client.tx_rate ? `${Math.round(client.tx_rate / 1000)} Mbps` : undefined,
          rxRate: client.rx_rate ? `${Math.round(client.rx_rate / 1000)} Mbps` : undefined,
        };
      }
      
      return enriched;
    });
  };

  // Fetch report for a specific OpenVAS scan
  const fetchScanReport = async (scan: OpenVASScan) => {
    const safeScan = { ...scan, high: scan.high || 0, medium: scan.medium || 0, low: scan.low || 0, info: scan.info || 0 };
    setSelectedScan(safeScan);
    setReportDialogOpen(true);
    setIsLoadingReport(true);
    
    try {
      const statusRes = await fetch(`${API_BASE}/api/openvas/scan/${scan.id}/status`, { headers: authHeaders });
      if (!statusRes.ok) { setIsLoadingReport(false); return; }
      
      const contentType = statusRes.headers.get('content-type');
      if (!contentType?.includes('application/json')) { setIsLoadingReport(false); return; }
      
      const statusData = await statusRes.json();
      
      // Update progress
      const updated = { ...safeScan, status: statusData.status, progress: statusData.progress };
      
      if (statusData.reportId) {
        try {
          const reportRes = await fetch(`${API_BASE}/api/openvas/report/${statusData.reportId}`, { headers: authHeaders });
          if (reportRes.ok) {
            const reportData = await reportRes.json();
            const mappedVulns = (reportData.results || []).map((r: any) => ({
              id: r.id,
              name: r.name || 'Ukjend',
              severity: parseFloat(r.severity) >= 7 ? 'high' : parseFloat(r.severity) >= 4 ? 'medium' : parseFloat(r.severity) > 0 ? 'low' : 'info',
              host: r.host || '',
              port: parseInt(r.port) || 0,
              cvss: parseFloat(r.severity) || 0,
              solution: '',
              description: r.description || '',
              threat: r.threat || '',
            }));
            setVulnerabilities(mappedVulns);
            updated.high = mappedVulns.filter((v: any) => v.severity === 'high').length;
            updated.medium = mappedVulns.filter((v: any) => v.severity === 'medium').length;
            updated.low = mappedVulns.filter((v: any) => v.severity === 'low').length;
            updated.info = mappedVulns.filter((v: any) => v.severity === 'info').length;
          }
        } catch (reportErr) {
          console.error('Kunne ikkje hente rapport-detaljar:', reportErr);
        }
      }
      setSelectedScan(updated);
    } catch (err) {
      console.error('Kunne ikkje hente rapport:', err);
    } finally {
      setIsLoadingReport(false);
    }
  };


  const fetchOpenvasData = async () => {
    setIsLoadingOpenvas(true);
    try {
      const [scansRes, vulnsRes] = await Promise.all([
        fetch(`${API_BASE}/api/openvas/scans`, { headers: authHeaders }),
        fetch(`${API_BASE}/api/openvas/vulnerabilities`, { headers: authHeaders }),
      ]);

      if (scansRes.ok) {
        const scansData = await scansRes.json();
        setOpenvasScans(scansData.tasks || scansData.data || []);
      }

      if (vulnsRes.ok) {
        const vulnsData = await vulnsRes.json();
        setVulnerabilities(vulnsData.results || vulnsData.data || []);
      }
    } catch (error) {
      console.error("OpenVAS fetch error:", error);
      toast.error("Kunne ikke koble til OpenVAS. Sjekk at backend kjører.");
    } finally {
      setIsLoadingOpenvas(false);
    }
  };

  // Poll a nmap job for status
  const startPollingJob = (jobId: string) => {
    if (nmapPollRef.current) clearInterval(nmapPollRef.current);
    
    nmapPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/nmap/scan-status/${jobId}`, { headers: authHeaders });
        if (!res.ok) {
          clearInterval(nmapPollRef.current!);
          nmapPollRef.current = null;
          setNmapProgress(prev => ({ ...prev, status: 'error', message: 'Kunne ikke hente jobb-status' }));
          return;
        }
        const data = await res.json();
        setNmapProgress({ percent: data.percent, hostsFound: data.hostsFound, status: data.status });
        
        if (data.status === 'complete') {
          clearInterval(nmapPollRef.current!);
          nmapPollRef.current = null;
          const hosts = parseNmapXML(data.result);
          setNmapResults(enrichWithUnifi(hosts));
          setNmapProgress({ percent: 100, hostsFound: hosts.length, status: 'complete' });
          toast.success(`Scan fullført! Fant ${hosts.length} host(s)`);
          setNmapJobId(null);
        } else if (data.status === 'error' || data.status === 'cancelled') {
          clearInterval(nmapPollRef.current!);
          nmapPollRef.current = null;
          setNmapProgress(prev => ({ ...prev, status: data.status, message: data.error }));
          if (data.error) toast.error(`Scan feilet: ${data.error}`);
          setNmapJobId(null);
        }
      } catch {
        // Network error, keep polling
      }
    }, 2000);
  };

  // Run Nmap scan as background job
  const handleNmapScan = async () => {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(nmapTarget)) {
      toast.error("Ugyldig mål-format. Bruk IP-adresse eller CIDR (f.eks. 192.168.1.0/24)");
      return;
    }

    setNmapProgress({ percent: 0, hostsFound: 0, status: 'scanning' });
    setNmapResults([]);

    try {
      const res = await fetch(`${API_BASE}/api/nmap/scan-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ target: nmapTarget, scanType: nmapScanType })
      });
      const data = await res.json();
      if (data.jobId) {
        setNmapJobId(data.jobId);
        startPollingJob(data.jobId);
        toast.info(`Starter scan av ${nmapTarget}...`);
      } else {
        toast.error("Kunne ikke starte scan");
        setNmapProgress(prev => ({ ...prev, status: 'error' }));
      }
    } catch {
      toast.error("Kunne ikke koble til backend");
      setNmapProgress(prev => ({ ...prev, status: 'error' }));
    }
  };

  // Stop nmap scan
  const handleStopNmapScan = async () => {
    if (nmapJobId) {
      try {
        await fetch(`${API_BASE}/api/nmap/scan-cancel/${nmapJobId}`, { method: 'POST', headers: authHeaders });
      } catch { /* ignore */ }
      setNmapJobId(null);
    }
    if (nmapPollRef.current) {
      clearInterval(nmapPollRef.current);
      nmapPollRef.current = null;
    }
    setNmapProgress(prev => ({ ...prev, status: 'idle' }));
    toast.info("Scan avbrutt");
  };

  // Parallel VLAN scan
  const handleParallelVlanScan = () => {
    if (selectedVlans.length === 0) {
      toast.error("Velg minst ett VLAN å skanne");
      return;
    }

    const vlansToScan = availableVlans.filter(v => selectedVlans.includes(v.id));
    
    // Stop any existing parallel scans
    handleStopParallelScan();
    setIsParallelScanning(true);

    const newResults = new Map<string, VlanScanResult>();
    vlansToScan.forEach(vlan => {
      newResults.set(vlan.id, {
        vlan,
        hosts: [],
        progress: { percent: 0, hostsFound: 0, status: 'scanning' },
      });
    });
    setVlanScanResults(new Map(newResults));

    vlansToScan.forEach(vlan => {
      const url = `${API_BASE}/api/nmap/scan-stream?target=${encodeURIComponent(vlan.subnet)}&scanType=${nmapScanType}`;
      const es = new EventSource(url);
      vlanEventSourcesRef.current.set(vlan.id, es);

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setVlanScanResults(prev => {
          const updated = new Map(prev);
          const current = updated.get(vlan.id);
          if (!current) return prev;

          switch (data.type) {
            case 'progress':
              updated.set(vlan.id, { ...current, progress: { ...current.progress, percent: data.percent } });
              break;
            case 'hosts_update':
              updated.set(vlan.id, { ...current, progress: { ...current.progress, hostsFound: data.count } });
              break;
            case 'complete': {
              const hosts = parseNmapXML(data.result);
              updated.set(vlan.id, { ...current, hosts, progress: { percent: 100, hostsFound: hosts.length, status: 'complete' } });
              es.close();
              vlanEventSourcesRef.current.delete(vlan.id);
              // Check if all done
              const allDone = [...updated.values()].every(r => r.progress.status !== 'scanning');
              if (allDone) setIsParallelScanning(false);
              toast.success(`${vlan.name} (VLAN ${vlan.vlanId}): ${hosts.length} hosts funnet`);
              break;
            }
            case 'error':
              updated.set(vlan.id, { ...current, progress: { ...current.progress, status: 'error', message: data.message } });
              es.close();
              vlanEventSourcesRef.current.delete(vlan.id);
              toast.error(`${vlan.name}: ${data.message}`);
              break;
          }
          return updated;
        });
      };

      es.onerror = () => {
        setVlanScanResults(prev => {
          const updated = new Map(prev);
          const current = updated.get(vlan.id);
          if (current) {
            updated.set(vlan.id, { ...current, progress: { ...current.progress, status: 'error', message: 'Forbindelse tapt' } });
          }
          return updated;
        });
        es.close();
        vlanEventSourcesRef.current.delete(vlan.id);
      };
    });

    toast.info(`Starter parallell scan av ${vlansToScan.length} VLAN(s)...`);
  };

  // Stop parallel scans
  const handleStopParallelScan = () => {
    vlanEventSourcesRef.current.forEach(es => es.close());
    vlanEventSourcesRef.current.clear();
    setIsParallelScanning(false);
    toast.info("Parallelle scans stoppet");
  };


  // GeoIP lookup for scan results (nmap hosts + vulnerability hosts)
  const handleScanGeoLookup = async () => {
    setIsGeoLookingUp(true);
    toast.info("Henter GeoIP data for scan-resultater...");
    try {
      const ips = [
        ...nmapResults.map(h => h.host),
        ...vulnerabilities.map(v => v.host),
        ...openvasScans.map(s => s.target),
      ];
      const uniqueIps = [...new Set(ips)];
      const results = await batchLookupGeoIP(uniqueIps);

      const locations: Array<{ lat: number; lng: number; severity: string; country: string }> = [];
      
      // Add vulnerability hosts
      vulnerabilities.forEach(v => {
        const geo = results.get(v.host);
        if (geo) {
          locations.push({ lat: geo.lat, lng: geo.lng, severity: v.severity, country: geo.countryCode });
        }
      });

      // Add nmap hosts
      nmapResults.forEach(h => {
        const geo = results.get(h.host);
        if (geo) {
          locations.push({ lat: geo.lat, lng: geo.lng, severity: 'medium', country: geo.countryCode });
        }
      });

      // Add scan targets
      openvasScans.forEach(s => {
        const geo = results.get(s.target);
        if (geo) {
          const severity = s.high > 0 ? 'high' : s.medium > 0 ? 'medium' : 'low';
          locations.push({ lat: geo.lat, lng: geo.lng, severity, country: geo.countryCode });
        }
      });

      setScanGeoLocations(locations);
      toast.success(`GeoIP fullført! ${locations.length} lokasjoner kartlagt`);
    } catch {
      toast.error("Kunne ikke hente GeoIP data");
    } finally {
      setIsGeoLookingUp(false);
    }
  };

  // Start OpenVAS scan
  const handleStartOpenvasScan = async () => {
    if (!newScanTarget || !newScanName) {
      toast.error("Fyll ut alle feltene");
      return;
    }

    setIsStartingOpenvasScan(true);
    try {
      const response = await fetch(`${API_BASE}/api/openvas/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          target: newScanTarget,
          name: newScanName,
          scanConfig: newScanConfig
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Kunne ikke starte scan");
      }

      toast.success("OpenVAS scan startet!");
      setOpenvasDialogOpen(false);
      setNewScanTarget("");
      setNewScanName("");
      fetchOpenvasData();
    } catch (error) {
      toast.error(`Feil: ${error instanceof Error ? error.message : "Ukjent feil"}`);
    } finally {
      setIsStartingOpenvasScan(false);
    }
  };

  // Fetch WAN IP
  const fetchWanIp = async () => {
    setIsLoadingWanIp(true);
    try {
      const res = await fetch(`${API_BASE}/api/network/wan-ip`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setWanIp(data.ip);
        toast.success(`WAN IP: ${data.ip}`);
      } else {
        toast.error("Kunne ikke hente WAN IP");
      }
    } catch {
      toast.error("Kunne ikke koble til backend for WAN IP");
    } finally {
      setIsLoadingWanIp(false);
    }
  };

  // Run WAN scan
  const handleWanScan = () => {
    if (!wanIp) {
      toast.error("Hent WAN IP først");
      return;
    }

    if (wanEventSourceRef.current) {
      wanEventSourceRef.current.close();
    }

    setWanProgress({ percent: 0, hostsFound: 0, status: 'scanning' });
    setWanResults([]);

    const url = `${API_BASE}/api/nmap/scan-stream?target=${encodeURIComponent(wanIp)}&scanType=${wanScanType}&token=${encodeURIComponent(token || '')}`;
    const eventSource = new EventSource(url);
    wanEventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'started':
          toast.info(`Starter WAN scan av ${data.target}...`);
          break;
        case 'progress':
          setWanProgress(prev => ({ ...prev, percent: data.percent }));
          break;
        case 'hosts_update':
          setWanProgress(prev => ({ ...prev, hostsFound: data.count }));
          break;
        case 'complete': {
          const hosts = parseNmapXML(data.result);
          setWanResults(hosts);
          setWanProgress({ percent: 100, hostsFound: hosts.length, status: 'complete' });
          const totalPorts = hosts.reduce((sum, h) => sum + h.ports.length, 0);
          if (totalPorts === 0) {
            toast.success("WAN scan fullført! Ingen åpne porter funnet – bra!");
          } else {
            toast.warning(`WAN scan fullført! ${totalPorts} åpne porter funnet!`);
          }
          eventSource.close();
          break;
        }
        case 'error':
          setWanProgress(prev => ({ ...prev, status: 'error', message: data.message }));
          toast.error(`WAN scan feilet: ${data.message}`);
          eventSource.close();
          break;
      }
    };

    eventSource.onerror = () => {
      setWanProgress(prev => ({ ...prev, status: 'error', message: 'Forbindelsen ble avbrutt' }));
      toast.error("Forbindelse til server tapt");
      eventSource.close();
    };
  };

  const handleStopWanScan = () => {
    if (wanEventSourceRef.current) {
      wanEventSourceRef.current.close();
      wanEventSourceRef.current = null;
      setWanProgress(prev => ({ ...prev, status: 'idle' }));
      toast.info("WAN scan avbrutt");
    }
  };

  // Check for running nmap jobs on mount (resume after navigation)
  // Also load saved results from backend
  useEffect(() => {
    const checkRunningJobs = async () => {
      try {
        const res = await fetchJsonSafely(`${API_BASE}/api/nmap/jobs`, { headers: authHeaders });
        if (res.ok && res.data) {
          const runningJob = (res.data as any[]).find((j: any) => j.status === 'scanning');
          if (runningJob) {
            setNmapJobId(runningJob.id);
            setNmapTarget(runningJob.target);
            setNmapProgress({ percent: runningJob.percent, hostsFound: runningJob.hostsFound, status: 'scanning' });
            startPollingJob(runningJob.id);
            toast.info(`Gjenopptar pågående scan av ${runningJob.target}...`);
          }
        }
      } catch { /* backend might be offline */ }
    };

    const loadSavedResults = async () => {
      try {
        const res = await fetchJsonSafely(`${API_BASE}/api/nmap/results`, { headers: authHeaders });
        if (res.ok && res.data && Array.isArray(res.data) && res.data.length > 0) {
          // Load the most recent saved result
          const latest = res.data[0];
          if (latest.result && nmapResults.length === 0) {
            const hosts = parseNmapXML(latest.result);
            setNmapResults(enrichWithUnifi(hosts));
            setNmapTarget(latest.target || nmapTarget);
            setNmapProgress({ percent: 100, hostsFound: hosts.length, status: 'complete' });
          }
        }
      } catch { /* silent */ }
    };

    const loadScanHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const res = await fetchJsonSafely(`${API_BASE}/api/nmap/results`, { headers: authHeaders });
        if (res.ok && res.data && Array.isArray(res.data)) {
          setScanHistory(res.data.map((r: any, i: number) => ({
            id: r.id || `scan-${i}`,
            target: r.target || 'Ukjent',
            scanType: r.scanType || 'quick',
            hostsFound: r.hostsFound || 0,
            timestamp: r.timestamp || r.completedAt || '',
            duration: r.duration,
            result: r.result,
          })));
        }
      } catch { /* silent */ }
      finally { setIsLoadingHistory(false); }
    };

    // Fetch UniFi clients for nmap enrichment
    const fetchUnifiClients = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/unifi/clients`, { headers: authHeaders });
        if (res.ok) {
          const data = await res.json();
          setUnifiClients(data.data || data || []);
        }
      } catch { /* silent */ }
    };

    fetchOpenvasData();
    fetchUnifiClients();
    fetchWanIp();
    checkRunningJobs();
    loadSavedResults();
    loadScanHistory();
    
    return () => {
      if (nmapPollRef.current) clearInterval(nmapPollRef.current);
      if (wanEventSourceRef.current) {
        wanEventSourceRef.current.close();
      }
      vlanEventSourcesRef.current.forEach(es => es.close());
    };
  }, []);

  const isScanning = nmapProgress.status === 'scanning';
  const totalParallelHosts = [...vlanScanResults.values()].reduce((sum, r) => sum + r.hosts.length, 0);

  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-primary/10 p-3">
            <Radar className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sikkerhetsscanning</h1>
            <p className="text-sm text-muted-foreground">OpenVAS • Nmap • Sårbarhetsanalyse</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-destructive">{stats.high}</p>
              <p className="text-xs text-muted-foreground">Høy risiko</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-warning">{stats.medium}</p>
              <p className="text-xs text-muted-foreground">Medium risiko</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-primary">{stats.low}</p>
              <p className="text-xs text-muted-foreground">Lav risiko</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-muted-foreground">{stats.info}</p>
              <p className="text-xs text-muted-foreground">Informasjon</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-mono font-bold text-success">
                {vulnerabilities.length > 0 ? Math.max(0, 100 - stats.high * 10 - stats.medium * 3 - stats.low) : "--"}
              </p>
              <p className="text-xs text-muted-foreground">Sikkerhets-score</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="score" className="space-y-4">
          <TabsList className="bg-muted flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="score" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Activity className="h-4 w-4 mr-2" />
              Score
            </TabsTrigger>
            <TabsTrigger value="ids" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              IDS/IPS
            </TabsTrigger>
            <TabsTrigger value="nmap" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Target className="h-4 w-4 mr-2" />
              Nmap
            </TabsTrigger>
            <TabsTrigger value="wan" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Wifi className="h-4 w-4 mr-2" />
              WAN Scan
            </TabsTrigger>
            <TabsTrigger value="ssl" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Lock className="h-4 w-4 mr-2" />
              SSL/TLS
            </TabsTrigger>
            <TabsTrigger value="firewall" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              Brannmur
            </TabsTrigger>
            <TabsTrigger value="dns" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="h-4 w-4 mr-2" />
              DNS
            </TabsTrigger>
            <TabsTrigger value="openvas" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              OpenVAS
            </TabsTrigger>
            <TabsTrigger value="vulnerabilities" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Sårbarheter ({vulnerabilities.length})
            </TabsTrigger>
            <TabsTrigger value="map" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MapPin className="h-4 w-4 mr-2" />
              Geo-kart
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <History className="h-4 w-4 mr-2" />
              Historikk ({scanHistory.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="score">
            <SecurityScorePanel />
          </TabsContent>

          <TabsContent value="ids">
            <IdsIpsPanel />
          </TabsContent>

          <TabsContent value="nmap">
            <div className="space-y-4">
              {/* VLAN / Subnet Manager */}
              <VlanSubnetManager
                selectedVlans={selectedVlans}
                onSelectionChange={setSelectedVlans}
                onScanTargetChange={setNmapTarget}
                onVlansChange={setAvailableVlans}
              />

              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      Nmap Skanning
                    </CardTitle>
                    {selectedVlans.length > 1 && (
                      <div className="flex items-center gap-2">
                        {isParallelScanning ? (
                          <Button size="sm" variant="destructive" onClick={handleStopParallelScan}>
                            <StopCircle className="h-3.5 w-3.5 mr-1.5" />
                            Stopp alle
                          </Button>
                        ) : (
                          <Button size="sm" onClick={handleParallelVlanScan} className="bg-primary text-primary-foreground">
                            <Network className="h-3.5 w-3.5 mr-1.5" />
                            Parallell scan ({selectedVlans.length} VLANs)
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="flex gap-4">
                    <Input 
                      placeholder="Mål (IP eller subnet, f.eks. 192.168.1.0/24)"
                      value={nmapTarget}
                      onChange={(e) => setNmapTarget(e.target.value)}
                      className="flex-1 bg-muted border-border font-mono"
                      disabled={isScanning}
                    />
                    <Select value={nmapScanType} onValueChange={setNmapScanType} disabled={isScanning || isParallelScanning}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quick">Ping Scan</SelectItem>
                        <SelectItem value="ports">Port Scan</SelectItem>
                        <SelectItem value="full">Full Scan</SelectItem>
                      </SelectContent>
                    </Select>
                    {isScanning ? (
                      <Button 
                        onClick={handleStopNmapScan}
                        variant="destructive"
                      >
                        <StopCircle className="h-4 w-4 mr-2" />
                        Stopp
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleNmapScan}
                        className="bg-primary text-primary-foreground"
                        disabled={isParallelScanning}
                      >
                        <Search className="h-4 w-4 mr-2" />
                        Enkelt Scan
                      </Button>
                    )}
                  </div>
                  
                  {/* Progress indicator */}
                  {isScanning && (
                    <div className="space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Skanner...
                        </span>
                        <span className="font-mono text-primary">
                          {nmapProgress.percent.toFixed(0)}%
                        </span>
                      </div>
                      <Progress value={nmapProgress.percent} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Hosts funnet: {nmapProgress.hostsFound}</span>
                        <span>Mål: {nmapTarget}</span>
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    Kommando: nmap {nmapScanType === 'quick' ? '-sn' : nmapScanType === 'ports' ? '-sT -F' : '-sV -sC'} {nmapTarget}
                  </p>
                </CardContent>
              </Card>

              {/* Per-VLAN Parallel Results */}
              {vlanScanResults.size > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="border-b border-border">
                    <CardTitle className="flex items-center gap-2">
                      <Network className="h-5 w-5 text-primary" />
                      Parallelle VLAN-resultater ({totalParallelHosts} hosts totalt)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="max-h-[500px]">
                      <div className="divide-y divide-border">
                        {[...vlanScanResults.values()].map((result) => (
                          <div key={result.vlan.id} className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="font-mono text-xs">
                                  VLAN {result.vlan.vlanId}
                                </Badge>
                                <span className="font-medium text-foreground">{result.vlan.name}</span>
                                <span className="text-xs font-mono text-muted-foreground">{result.vlan.subnet}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {result.progress.status === 'scanning' && (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                )}
                                {result.progress.status === 'complete' && (
                                  <CheckCircle className="h-4 w-4 text-success" />
                                )}
                                {result.progress.status === 'error' && (
                                  <AlertTriangle className="h-4 w-4 text-destructive" />
                                )}
                                <Badge variant={result.progress.status === 'complete' ? 'default' : 'secondary'}>
                                  {result.hosts.length} hosts
                                </Badge>
                              </div>
                            </div>

                            {result.progress.status === 'scanning' && (
                              <Progress value={result.progress.percent} className="h-1.5 mb-3" />
                            )}

                            {result.hosts.length > 0 && (
                              <div className="space-y-1 ml-4 border-l-2 border-primary/20 pl-4">
                                {result.hosts.map((host) => (
                                  <div key={host.host} className="flex items-center justify-between py-1.5">
                                    <div className="flex items-center gap-2">
                                      <Server className="h-3.5 w-3.5 text-success" />
                                      <span className="font-mono text-sm text-foreground">{host.host}</span>
                                      <span className="text-xs text-muted-foreground">{host.hostname}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {host.ports.length > 0 && (
                                        <div className="flex gap-1">
                                          {host.ports.slice(0, 5).map(port => (
                                            <Badge key={port} variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
                                              {port}
                                            </Badge>
                                          ))}
                                          {host.ports.length > 5 && (
                                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                              +{host.ports.length - 5}
                                            </Badge>
                                          )}
                                        </div>
                                      )}
                                      <Badge variant="outline" className="text-[10px] ml-2">{host.os}</Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Single scan results */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Oppdagede Hosts ({nmapResults.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {nmapResults.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Ingen resultater ennå. Kjør en scan for å oppdage hosts.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="divide-y divide-border">
                        {nmapResults.map((host) => (
                          <div key={host.host} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => { setSelectedNmapHost(host); setNmapDetailOpen(true); }}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div className="rounded-lg p-2 bg-success/10">
                                  {host.connection?.type === "wifi" ? (
                                    <Wifi className="h-4 w-4 text-success" />
                                  ) : (
                                    <Server className="h-4 w-4 text-success" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-mono font-medium text-foreground">{host.host}</p>
                                  <p className="text-xs text-muted-foreground">{host.hostname}</p>
                                </div>
                                {host.connection && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {host.connection.type === "wifi" 
                                      ? `WiFi → ${host.connection.ap}` 
                                      : `${host.connection.switchName} P${host.connection.switchPort}`}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{host.os}</Badge>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                            {host.ports.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {host.ports.map((port) => (
                                  <Badge key={port} variant="secondary" className="font-mono text-xs">
                                    {port}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="wan">
            <div className="space-y-4">
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Wifi className="h-4 w-4 text-primary" />
                      Ekstern WAN Skanning
                    </CardTitle>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Skann din offentlige IP-adresse utenfra for å se hvilke porter og tjenester som er synlige fra internett.
                  </p>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="flex gap-4 items-end">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Din WAN IP</Label>
                      <div className="flex gap-2">
                        <Input
                          value={wanIp}
                          onChange={(e) => setWanIp(e.target.value)}
                          placeholder="Henter WAN IP..."
                          className="font-mono bg-muted border-border"
                          disabled={wanProgress.status === 'scanning'}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={fetchWanIp}
                          disabled={isLoadingWanIp}
                          title="Hent WAN IP automatisk"
                        >
                          {isLoadingWanIp ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Scan type</Label>
                      <Select value={wanScanType} onValueChange={setWanScanType} disabled={wanProgress.status === 'scanning'}>
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ports">Port Scan</SelectItem>
                          <SelectItem value="full">Full Scan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {wanProgress.status === 'scanning' ? (
                      <Button variant="destructive" onClick={handleStopWanScan}>
                        <StopCircle className="h-4 w-4 mr-2" />
                        Stopp
                      </Button>
                    ) : (
                      <Button onClick={handleWanScan} disabled={!wanIp} className="bg-primary text-primary-foreground">
                        <Search className="h-4 w-4 mr-2" />
                        Skann WAN
                      </Button>
                    )}
                  </div>

                  {wanProgress.status === 'scanning' && (
                    <div className="space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Skanner WAN IP...
                        </span>
                        <span className="font-mono text-primary">
                          {wanProgress.percent.toFixed(0)}%
                        </span>
                      </div>
                      <Progress value={wanProgress.percent} className="h-2" />
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Kommando: nmap {wanScanType === 'ports' ? '-sT -F' : '-sV -sC'} {wanIp || '<WAN IP>'}
                  </p>
                </CardContent>
              </Card>

              {/* WAN Results */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    WAN Scan Resultater
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {wanProgress.status === 'complete' && wanResults.length > 0 ? (
                    <div>
                      {/* Summary */}
                      {(() => {
                        const totalPorts = wanResults.reduce((sum, h) => sum + h.ports.length, 0);
                        return (
                          <div className={`p-4 border-b border-border ${totalPorts === 0 ? 'bg-success/5' : 'bg-destructive/5'}`}>
                            {totalPorts === 0 ? (
                              <div className="flex items-center gap-2 text-success">
                                <CheckCircle className="h-5 w-5" />
                                <div>
                                  <p className="font-medium">Ingen åpne porter funnet</p>
                                  <p className="text-xs text-muted-foreground">Din WAN IP ({wanIp}) har ingen synlige porter fra internett.</p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="h-5 w-5" />
                                <div>
                                  <p className="font-medium">{totalPorts} åpne porter funnet!</p>
                                  <p className="text-xs text-muted-foreground">Disse portene er synlige fra internett og bør vurderes for sikkerhet.</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <ScrollArea className="max-h-[400px]">
                        <div className="divide-y divide-border">
                          {wanResults.map((host) => (
                            <div key={host.host} className="p-4 hover:bg-muted/50 transition-colors">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <div className="rounded-lg p-2 bg-primary/10">
                                    <Wifi className="h-4 w-4 text-primary" />
                                  </div>
                                  <div>
                                    <p className="font-mono font-medium text-foreground">{host.host}</p>
                                    <p className="text-xs text-muted-foreground">{host.hostname}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{host.os}</Badge>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(`https://www.shodan.io/host/${host.host}`, '_blank')}
                                    title="Se på Shodan"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              {host.ports.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {host.ports.map((port) => (
                                    <Badge key={port} variant="destructive" className="font-mono text-xs">
                                      {port}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-success mt-1">Ingen åpne porter</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  ) : wanProgress.status === 'complete' && wanResults.length === 0 ? (
                    <div className="p-8 text-center">
                      <CheckCircle className="h-12 w-12 mx-auto mb-3 text-success opacity-70" />
                      <p className="font-medium text-success">Alt ser bra ut!</p>
                      <p className="text-sm text-muted-foreground mt-1">Ingen hosts eller åpne porter synlig fra internett.</p>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      <Wifi className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Kjør en WAN scan for å se hva som er synlig fra internett.</p>
                      <p className="text-xs mt-1">Denne scannen sjekker din offentlige IP ({wanIp || '...'}) for åpne porter.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="ssl">
            <SslCheckPanel />
          </TabsContent>

          <TabsContent value="firewall">
            <FirewallAuditPanel />
          </TabsContent>

          <TabsContent value="dns">
            <DnsLeakPanel />
          </TabsContent>

          <TabsContent value="openvas">
            <div className="grid gap-4">
              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Dialog open={openvasDialogOpen} onOpenChange={setOpenvasDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="default">
                      <Plus className="h-4 w-4 mr-2" />
                      Ny Scan
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Start OpenVAS Scan</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="scan-name">Scan Navn</Label>
                        <Input
                          id="scan-name"
                          placeholder="F.eks. Nettverksscan Q4"
                          value={newScanName}
                          onChange={(e) => setNewScanName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="scan-target">Mål (IP/Hostname/Range)</Label>
                        <Input
                          id="scan-target"
                          placeholder="192.168.1.0/24 eller server.local"
                          value={newScanTarget}
                          onChange={(e) => setNewScanTarget(e.target.value)}
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Scan Konfigurasjon</Label>
                        <Select value={newScanConfig} onValueChange={setNewScanConfig}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="discovery">Host Discovery (rask)</SelectItem>
                            <SelectItem value="system">System Discovery</SelectItem>
                            <SelectItem value="full">Full and Fast (anbefalt)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpenvasDialogOpen(false)}>
                        Avbryt
                      </Button>
                      <Button onClick={handleStartOpenvasScan} disabled={isStartingOpenvasScan}>
                        {isStartingOpenvasScan ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Starter...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Start Scan
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchOpenvasData}
                  disabled={isLoadingOpenvas}
                >
                  {isLoadingOpenvas ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Oppdater
                </Button>
              </div>

              {/* Scan history */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Scan Historikk
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {isLoadingOpenvas ? (
                    <div className="p-8 text-center">
                      <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                      <p className="mt-2 text-muted-foreground">Laster OpenVAS data...</p>
                    </div>
                  ) : openvasScans.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Ingen OpenVAS scans funnet.</p>
                      <p className="text-xs mt-1">Start en ny scan med knappen over.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {openvasScans.map((scan) => (
                        <div 
                          key={scan.id} 
                          className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => fetchScanReport(scan)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-medium text-foreground">{scan.name}</p>
                              {scan.comment && <p className="text-xs text-muted-foreground">{scan.comment}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={
                                scan.status === 'Running' ? 'bg-warning/10 text-warning' 
                                : scan.status === 'Done' ? 'bg-success/10 text-success border-success/20'
                                : 'bg-muted text-muted-foreground'
                              }>
                                {scan.status === 'Running' ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : scan.status === 'Done' ? (
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                ) : null}
                                {scan.status}
                              </Badge>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                          {scan.status === 'Running' && scan.progress > 0 && (
                            <div className="mb-2">
                              <Progress value={scan.progress} className="h-1.5" />
                              <p className="text-[10px] text-muted-foreground mt-0.5">{scan.progress}%</p>
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-xs">
                            <div className="flex gap-2">
                              <Badge variant="destructive" className="text-[10px]">{scan.high} Høy</Badge>
                              <Badge className="bg-warning/80 text-warning-foreground text-[10px]">{scan.medium} Medium</Badge>
                              <Badge className="bg-primary/80 text-primary-foreground text-[10px]">{scan.low} Lav</Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="vulnerabilities">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Oppdagede Sårbarheter
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {vulnerabilities.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Ingen sårbarheter funnet.</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="divide-y divide-border">
                      {vulnerabilities.map((vuln) => (
                        <div key={vuln.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => { setSelectedVuln(vuln); setVulnDetailOpen(true); }}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge className={severityColors[vuln.severity as keyof typeof severityColors]}>
                                {vuln.severity.toUpperCase()}
                              </Badge>
                              <Badge variant="outline" className="font-mono text-xs">
                                CVSS: {vuln.cvss}
                              </Badge>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                          </div>
                          <p className="font-medium text-foreground mb-1">{vuln.name}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="font-mono">{vuln.host}:{vuln.port}</span>
                            {vuln.affectedService && <span>{vuln.affectedService}</span>}
                            {vuln.family && <Badge variant="secondary" className="text-[10px]">{vuln.family}</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="map">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Scan Geolokasjon
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleScanGeoLookup}
                    disabled={isGeoLookingUp}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isGeoLookingUp ? 'animate-spin' : ''}`} />
                    Oppdater GeoIP
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Viser geografisk lokasjon for nmap-hosts, OpenVAS-mål og sårbarheter med eksterne IP-adresser.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <AttackMap attacks={scanGeoLocations} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    Scan-historikk
                  </div>
                  <Badge variant="outline">{scanHistory.length} skanninger</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {isLoadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    <span className="ml-2 text-muted-foreground">Laster historikk...</span>
                  </div>
                ) : scanHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <History className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-muted-foreground">Ingen tidligere skanninger funnet</p>
                    <p className="text-xs text-muted-foreground mt-1">Kjør en Nmap-skanning fra Nmap-fanen for å se historikk her.</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[600px]">
                    <div className="space-y-2">
                      {scanHistory.map((scan) => {
                        const date = scan.timestamp ? new Date(scan.timestamp) : null;
                        const isSelected = selectedHistoryId === scan.id;
                        const parsedHosts = isSelected && scan.result ? parseNmapXML(scan.result) : [];
                        return (
                          <div key={scan.id}>
                            <button
                              onClick={() => setSelectedHistoryId(isSelected ? null : scan.id)}
                              className="w-full flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                            >
                              <div className="rounded-full bg-primary/10 p-2">
                                <Target className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm text-foreground">{scan.target}</span>
                                  <Badge variant="outline" className="text-[10px]">{scan.scanType}</Badge>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {date ? date.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Ukjent dato'}
                                  </span>
                                  {scan.duration && (
                                    <span>{Math.round(scan.duration / 1000)}s</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right flex items-center gap-3">
                                <div>
                                  <p className="text-lg font-mono font-bold text-foreground">{scan.hostsFound}</p>
                                  <p className="text-xs text-muted-foreground">hosts</p>
                                </div>
                                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                              </div>
                            </button>

                            {/* Expanded detail view */}
                            {isSelected && (
                              <div className="mt-2 ml-12 space-y-3 animate-fade-in">
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      if (scan.result) {
                                        const hosts = parseNmapXML(scan.result);
                                        setNmapResults(enrichWithUnifi(hosts));
                                        setNmapTarget(scan.target);
                                        setNmapProgress({ percent: 100, hostsFound: hosts.length, status: 'complete' });
                                        toast.success(`Lastet ${hosts.length} hosts fra historikk`);
                                      }
                                    }}
                                    disabled={!scan.result}
                                  >
                                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                    Last inn i Nmap-fanen
                                  </Button>
                                </div>

                                {parsedHosts.length > 0 ? (
                                  <div className="rounded-lg border border-border overflow-hidden">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-muted/50">
                                          <TableHead className="text-xs">IP</TableHead>
                                          <TableHead className="text-xs">Hostname</TableHead>
                                          <TableHead className="text-xs">Åpne porter</TableHead>
                                          <TableHead className="text-xs">OS</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {parsedHosts.map((host, hi) => (
                                          <TableRow
                                            key={hi}
                                            className="cursor-pointer hover:bg-muted/30"
                                            onClick={() => { setSelectedNmapHost(host); setNmapDetailOpen(true); }}
                                          >
                                            <TableCell className="font-mono text-xs">{host.host}</TableCell>
                                            <TableCell className="text-xs">{host.hostname}</TableCell>
                                            <TableCell className="text-xs">
                                              {host.ports.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                  {host.ports.slice(0, 5).map(p => (
                                                    <Badge key={p} variant="outline" className="text-[10px] font-mono">{p}</Badge>
                                                  ))}
                                                  {host.ports.length > 5 && (
                                                    <Badge variant="outline" className="text-[10px]">+{host.ports.length - 5}</Badge>
                                                  )}
                                                </div>
                                              ) : (
                                                <span className="text-muted-foreground">Ingen</span>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">{host.os}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                ) : !scan.result ? (
                                  <p className="text-xs text-muted-foreground py-2">Ingen detaljdata lagret for denne skanningen.</p>
                                ) : (
                                  <p className="text-xs text-muted-foreground py-2">Ingen hosts funnet i denne skanningen.</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* Scan Report Dialog */}
        <ScanReportDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          scan={selectedScan}
          vulnerabilities={vulnerabilities}
          isLoading={isLoadingReport}
          onVulnClick={(vuln) => { setSelectedVuln(vuln); setVulnDetailOpen(true); }}
        />
        
        {/* Nmap Host Detail Dialog */}
        <NmapHostDetailDialog
          open={nmapDetailOpen}
          onOpenChange={setNmapDetailOpen}
          host={selectedNmapHost}
        />
        
        {/* Vulnerability Detail Dialog */}
        <VulnerabilityDetailDialog
          open={vulnDetailOpen}
          onOpenChange={setVulnDetailOpen}
          vulnerability={selectedVuln}
        />
      </main>
    </div>
  );
}
