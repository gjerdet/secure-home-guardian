import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Shield, Loader2, CheckCircle, AlertTriangle, XCircle, 
  Plus, Lock, Clock, RefreshCw, Trash2
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface SslResult {
  name: string;
  host: string;
  port: number;
  status: string;
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  daysLeft?: number;
  isExpired?: boolean;
  isSelfSigned?: boolean;
  authorized?: boolean;
  protocol?: string;
  fingerprint?: string;
  error?: string;
}

interface SslTarget {
  name: string;
  host: string;
  port: number;
}

const defaultTargets: SslTarget[] = [
  { name: "Proxmox VE", host: "", port: 8006 },
  { name: "TrueNAS", host: "", port: 443 },
  { name: "UniFi Controller", host: "", port: 443 },
];

export function SslCheckPanel() {
  const { token } = useAuth();
  const [targets, setTargets] = useState<SslTarget[]>([
    { name: "Proxmox VE", host: "192.168.10.10", port: 8006 },
    { name: "TrueNAS", host: "192.168.10.11", port: 443 },
    { name: "UniFi Controller", host: "192.168.1.1", port: 443 },
    { name: "Home Assistant", host: "192.168.40.10", port: 8123 },
    { name: "Plex Media Server", host: "192.168.10.11", port: 32400 },
  ]);
  const [results, setResults] = useState<SslResult[]>([
    {
      name: "Proxmox VE", host: "192.168.10.10", port: 8006, status: "ok",
      subject: "CN=proxmox.local", issuer: "CN=Proxmox Virtual Environment",
      validFrom: "2024-08-15T00:00:00Z", validTo: "2026-08-15T00:00:00Z",
      daysLeft: 553, isExpired: false, isSelfSigned: true, authorized: false,
      protocol: "TLSv1.3", fingerprint: "A1:B2:C3:D4:E5:F6:78:90:AB:CD"
    },
    {
      name: "TrueNAS", host: "192.168.10.11", port: 443, status: "ok",
      subject: "CN=truenas.local", issuer: "CN=iXsystems TrueNAS",
      validFrom: "2024-11-01T00:00:00Z", validTo: "2025-11-01T00:00:00Z",
      daysLeft: 263, isExpired: false, isSelfSigned: true, authorized: false,
      protocol: "TLSv1.3", fingerprint: "F1:E2:D3:C4:B5:A6:09:87:65:43"
    },
    {
      name: "UniFi Controller", host: "192.168.1.1", port: 443, status: "ok",
      subject: "CN=UniFi", issuer: "CN=UniFi",
      validFrom: "2025-01-10T00:00:00Z", validTo: "2027-01-10T00:00:00Z",
      daysLeft: 699, isExpired: false, isSelfSigned: true, authorized: false,
      protocol: "TLSv1.2", fingerprint: "11:22:33:44:55:66:77:88:99:AA"
    },
    {
      name: "Home Assistant", host: "192.168.40.10", port: 8123, status: "ok",
      subject: "CN=homeassistant.local", issuer: "CN=Let's Encrypt Authority X3",
      validFrom: "2025-12-01T00:00:00Z", validTo: "2026-03-01T00:00:00Z",
      daysLeft: 18, isExpired: false, isSelfSigned: false, authorized: true,
      protocol: "TLSv1.3", fingerprint: "BB:CC:DD:EE:FF:00:11:22:33:44"
    },
    {
      name: "Plex Media Server", host: "192.168.10.11", port: 32400, status: "ok",
      subject: "CN=*.plex.direct", issuer: "CN=DigiCert SHA2 Extended Validation Server CA",
      validFrom: "2025-06-01T00:00:00Z", validTo: "2026-06-01T00:00:00Z",
      daysLeft: 110, isExpired: false, isSelfSigned: false, authorized: true,
      protocol: "TLSv1.3", fingerprint: "DD:EE:FF:11:22:33:44:55:66:77"
    },
  ]);
  const [isChecking, setIsChecking] = useState(false);
  const [newTarget, setNewTarget] = useState({ name: "", host: "", port: "443" });

  const addTarget = () => {
    if (!newTarget.host) { toast.error("Host er påkrevd"); return; }
    setTargets(prev => [...prev, { name: newTarget.name || newTarget.host, host: newTarget.host, port: parseInt(newTarget.port) || 443 }]);
    setNewTarget({ name: "", host: "", port: "443" });
  };

  const removeTarget = (index: number) => {
    setTargets(prev => prev.filter((_, i) => i !== index));
  };

  const runCheck = async () => {
    const validTargets = targets.filter(t => t.host);
    if (validTargets.length === 0) {
      toast.error("Legg til minst én tjeneste med host-adresse");
      return;
    }

    setIsChecking(true);
    try {
      const res = await fetch(`${API_BASE}/api/security/ssl-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targets: validTargets }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
        const expired = data.results.filter((r: SslResult) => r.isExpired).length;
        const expiringSoon = data.results.filter((r: SslResult) => r.daysLeft !== undefined && r.daysLeft > 0 && r.daysLeft < 30).length;
        if (expired > 0) toast.error(`${expired} sertifikat(er) er utløpt!`);
        else if (expiringSoon > 0) toast.warning(`${expiringSoon} sertifikat(er) utløper snart`);
        else toast.success("SSL-sjekk fullført");
      } else {
        toast.error("Kunne ikke kjøre SSL-sjekk");
      }
    } catch {
      toast.error("Kunne ikke koble til backend");
    } finally {
      setIsChecking(false);
    }
  };

  const getSeverity = (result: SslResult) => {
    if (result.status === 'error') return 'error';
    if (result.isExpired) return 'critical';
    if (result.daysLeft !== undefined && result.daysLeft < 14) return 'high';
    if (result.daysLeft !== undefined && result.daysLeft < 30) return 'medium';
    if (result.isSelfSigned) return 'info'; // Self-signed is ok for internal
    return 'ok';
  };

  const severityConfig: Record<string, { badge: string; icon: React.ReactNode }> = {
    ok: { badge: "bg-success/10 text-success", icon: <CheckCircle className="h-5 w-5 text-success" /> },
    info: { badge: "bg-primary/10 text-primary", icon: <Lock className="h-5 w-5 text-primary" /> },
    medium: { badge: "bg-warning/10 text-warning", icon: <Clock className="h-5 w-5 text-warning" /> },
    high: { badge: "bg-destructive/10 text-destructive", icon: <AlertTriangle className="h-5 w-5 text-destructive" /> },
    critical: { badge: "bg-destructive text-destructive-foreground", icon: <XCircle className="h-5 w-5 text-destructive" /> },
    error: { badge: "bg-muted text-muted-foreground", icon: <XCircle className="h-5 w-5 text-muted-foreground" /> },
  };

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              SSL/TLS Sertifikatsjekk
            </CardTitle>
            <Button onClick={runCheck} disabled={isChecking} className="bg-primary text-primary-foreground" size="sm">
              {isChecking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
              {isChecking ? "Sjekker..." : "Kjør sjekk"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Sjekker SSL-sertifikater på interne tjenester. Self-signed sertifikater (som Proxmox/TrueNAS standard) vises som info, ikke feil.
          </p>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {/* Target list */}
          <div className="space-y-2">
            {targets.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={t.name}
                  onChange={e => setTargets(prev => prev.map((tt, ii) => ii === i ? { ...tt, name: e.target.value } : tt))}
                  placeholder="Navn"
                  className="bg-muted border-border w-[150px]"
                />
                <Input
                  value={t.host}
                  onChange={e => setTargets(prev => prev.map((tt, ii) => ii === i ? { ...tt, host: e.target.value } : tt))}
                  placeholder="IP/hostname"
                  className="bg-muted border-border font-mono flex-1"
                />
                <Input
                  value={t.port.toString()}
                  onChange={e => setTargets(prev => prev.map((tt, ii) => ii === i ? { ...tt, port: parseInt(e.target.value) || 443 } : tt))}
                  placeholder="Port"
                  className="bg-muted border-border font-mono w-[80px]"
                />
                <Button variant="ghost" size="icon" onClick={() => removeTarget(i)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          
          {/* Add new target */}
          <div className="flex items-center gap-2">
            <Input value={newTarget.name} onChange={e => setNewTarget(p => ({ ...p, name: e.target.value }))} placeholder="Navn" className="bg-muted border-border w-[150px]" />
            <Input value={newTarget.host} onChange={e => setNewTarget(p => ({ ...p, host: e.target.value }))} placeholder="IP/hostname" className="bg-muted border-border font-mono flex-1" />
            <Input value={newTarget.port} onChange={e => setNewTarget(p => ({ ...p, port: e.target.value }))} placeholder="Port" className="bg-muted border-border font-mono w-[80px]" />
            <Button variant="outline" size="icon" onClick={addTarget}><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Resultater ({results.length} tjenester)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[500px]">
              <div className="divide-y divide-border">
                {results.map((r, i) => {
                  const severity = getSeverity(r);
                  const config = severityConfig[severity];
                  return (
                    <div key={i} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start gap-3">
                        {config.icon}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-foreground">{r.name}</span>
                            <span className="text-xs font-mono text-muted-foreground">{r.host}:{r.port}</span>
                            {r.isSelfSigned && (
                              <Badge variant="outline" className="text-[10px]">Self-signed</Badge>
                            )}
                            {r.protocol && (
                              <Badge variant="secondary" className="text-[10px] font-mono">{r.protocol}</Badge>
                            )}
                          </div>
                          
                          {r.status === 'ok' ? (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              <div>
                                <span className="text-muted-foreground">Utsteder: </span>
                                <span className="text-foreground">{r.issuer}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Subject: </span>
                                <span className="text-foreground">{r.subject}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Gyldig fra: </span>
                                <span className="font-mono text-foreground">{r.validFrom ? new Date(r.validFrom).toLocaleDateString('nb-NO') : '-'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Utløper: </span>
                                <span className={`font-mono ${r.isExpired ? 'text-destructive font-bold' : r.daysLeft && r.daysLeft < 30 ? 'text-warning' : 'text-foreground'}`}>
                                  {r.validTo ? new Date(r.validTo).toLocaleDateString('nb-NO') : '-'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-destructive">{r.error}</p>
                          )}
                        </div>
                        
                        <div className="text-right">
                          {r.daysLeft !== undefined && (
                            <Badge className={config.badge}>
                              {r.isExpired ? 'Utløpt!' : `${r.daysLeft}d igjen`}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
