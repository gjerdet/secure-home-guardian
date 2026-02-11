import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { 
  Settings as SettingsIcon, Server, Wifi, HardDrive, Shield, ShieldAlert,
  Save, TestTube, CheckCircle, XCircle, Users, UserPlus, Trash2, User, Loader2, RefreshCw, Pencil, KeyRound,
  Download, GitBranch, ArrowUpCircle, Clock, AlertTriangle
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

import { API_BASE, fetchJsonSafely } from '@/lib/api';

type UserRole = "admin" | "user";

interface SystemUser {
  id: string;
  username: string;
  role: UserRole;
  createdAt?: string;
}

interface ConnectionStatus {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
  responseTime?: number;
}

interface ServiceConfigs {
  unifi: { url: string; username: string; password: string; site: string };
  truenas: { url: string; apiKey: string };
  proxmox: { url: string; user: string; tokenId: string; tokenSecret: string };
  openvas: { url: string; username: string; password: string };
  abuseipdb: { apiKey: string };
}

const roleLabels: Record<UserRole, string> = {
  admin: "Administrator",
  user: "Bruker",
};

const roleBadgeClass: Record<UserRole, string> = {
  admin: "bg-destructive/10 text-destructive",
  user: "bg-primary/10 text-primary",
};

const defaultConfigs: ServiceConfigs = {
  unifi: { url: '', username: '', password: '', site: 'default' },
  truenas: { url: '', apiKey: '' },
  proxmox: { url: '', user: 'root@pam', tokenId: '', tokenSecret: '' },
  openvas: { url: '', username: 'admin', password: '' },
  abuseipdb: { apiKey: '' },
};

export default function Settings() {
  const { user: currentUser, token } = useAuth();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "user" as UserRole });
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<string | null>(null);

  // Edit user dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [editRole, setEditRole] = useState<UserRole>("user");
  const [editPassword, setEditPassword] = useState("");
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  
  // Service configurations (controlled state)
  const [configs, setConfigs] = useState<ServiceConfigs>(defaultConfigs);
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState<Record<string, ConnectionStatus>>({
    unifi: { status: 'idle' },
    truenas: { status: 'idle' },
    proxmox: { status: 'idle' },
    openvas: { status: 'idle' },
    abuseipdb: { status: 'idle' },
    backend: { status: 'idle' },
  });

  // Update state
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    latestVersion: string;
    currentHash: string;
    currentMessage: string;
    currentDate: string;
    branch: string;
    behind: number;
    updateAvailable: boolean;
    newCommits: { hash: string; message: string; date: string; author: string }[];
  } | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ step: number; message: string; status: string }[]>([]);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  // Fetch service configs from backend
  const fetchConfigs = useCallback(async () => {
    if (!token || !isAdmin) return;
    setIsLoadingConfigs(true);
    try {
      const res = await fetch(`${API_BASE}/api/config/services`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data);
      }
    } catch {
      // Silent fail - configs stay at defaults
    } finally {
      setIsLoadingConfigs(false);
    }
  }, [token, isAdmin]);

  const fetchUsers = useCallback(async () => {
    if (!token || !isAdmin) return;
    setIsLoadingUsers(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      } else {
        const error = await res.json();
        toast.error(error.error || 'Kunne ikke hente brukere');
      }
    } catch {
      toast.error('Kunne ikke koble til server');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [token, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchConfigs();
    }
  }, [isAdmin, fetchUsers, fetchConfigs]);

  // Save service config
  const saveServiceConfig = async (service: keyof ServiceConfigs) => {
    setIsSaving(service);
    try {
      const res = await fetch(`${API_BASE}/api/config/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ service, config: configs[service] }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || `${service} lagret`);
      } else {
        toast.error(data.error || 'Lagring feilet');
      }
    } catch {
      toast.error('Kunne ikke koble til server');
    } finally {
      setIsSaving(null);
    }
  };

  const updateConfig = <S extends keyof ServiceConfigs>(
    service: S,
    field: keyof ServiceConfigs[S],
    value: string
  ) => {
    setConfigs(prev => ({
      ...prev,
      [service]: { ...prev[service], [field]: value },
    }));
  };

  // Test connection
  const testConnection = async (service: string) => {
    setConnectionStatus(prev => ({ ...prev, [service]: { status: 'testing' } }));
    try {
      const start = Date.now();
      const result = await fetchJsonSafely(`${API_BASE}/api/health/test/${service}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const responseTime = Date.now() - start;

      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Tilkoblingsfeil');
      }

      setConnectionStatus(prev => ({
        ...prev,
        [service]: {
          status: result.data.success ? 'success' : 'error',
          message: result.data.message,
          responseTime,
        }
      }));
      if (result.data.success) toast.success(`${service} tilkobling OK (${responseTime}ms)`);
      else toast.error(`${service}: ${result.data.message}`);
    } catch (error) {
      setConnectionStatus(prev => ({
        ...prev,
        [service]: { status: 'error', message: error instanceof Error ? error.message : 'Ukjent feil' }
      }));
      toast.error(`Kunne ikke teste ${service}`);
    }
  };

  const testAllConnections = async () => {
    for (const service of ['backend', 'unifi', 'truenas', 'proxmox', 'openvas', 'abuseipdb']) {
      await testConnection(service);
    }
  };

  const getStatusBadge = (service: string) => {
    const status = connectionStatus[service];
    if (status.status === 'testing') return <Badge className="bg-primary/10 text-primary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Tester...</Badge>;
    if (status.status === 'success') return <Badge className="bg-success/10 text-success"><CheckCircle className="h-3 w-3 mr-1" />Tilkoblet {status.responseTime && `(${status.responseTime}ms)`}</Badge>;
    if (status.status === 'error') return <Badge className="bg-destructive/10 text-destructive"><XCircle className="h-3 w-3 mr-1" />Feil</Badge>;
    return <Badge className="bg-muted text-muted-foreground">Ikke testet</Badge>;
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password) { toast.error("Brukernavn og passord er påkrevd"); return; }
    if (newUser.password.length < 6) { toast.error("Passord må være minst 6 tegn"); return; }
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Bruker "${newUser.username}" ble opprettet`);
        setNewUser({ username: "", password: "", role: "user" });
        setIsAddDialogOpen(false);
        fetchUsers();
      } else {
        toast.error(data.error || 'Kunne ikke opprette bruker');
      }
    } catch { toast.error('Kunne ikke koble til server'); }
    finally { setIsCreating(false); }
  };

  const handleDeleteUser = async (user: SystemUser) => {
    if (user.id === currentUser?.id) { toast.error("Du kan ikke slette din egen bruker"); return; }
    setIsDeleting(user.id);
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/${user.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) { toast.success(`Bruker "${user.username}" ble slettet`); fetchUsers(); }
      else { const data = await res.json(); toast.error(data.error || 'Kunne ikke slette bruker'); }
    } catch { toast.error('Kunne ikke koble til server'); }
    finally { setIsDeleting(null); }
  };

  const openEditDialog = (user: SystemUser) => {
    setEditingUser(user);
    setEditRole(user.role);
    setEditPassword("");
    setEditDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    const body: Record<string, string> = {};
    if (editRole !== editingUser.role) body.role = editRole;
    if (editPassword) body.newPassword = editPassword;
    if (Object.keys(body).length === 0) { toast.info("Ingen endringer å lagre"); return; }

    setIsUpdatingUser(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Bruker "${editingUser.username}" ble oppdatert`);
        setEditDialogOpen(false);
        fetchUsers();
      } else {
        toast.error(data.error || 'Kunne ikke oppdatere bruker');
      }
    } catch { toast.error('Kunne ikke koble til server'); }
    finally { setIsUpdatingUser(false); }
  };

  // System update functions
  const checkForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    try {
      const result = await fetchJsonSafely(`${API_BASE}/api/system/update/check`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result.ok && result.data) {
        setUpdateInfo(result.data);
        if (result.data.updateAvailable) {
          toast.info(`${result.data.behind} nye oppdatering${result.data.behind > 1 ? 'er' : ''} tilgjengelig`);
        } else {
          toast.success('Systemet er oppdatert!');
        }
      } else {
        const errMsg = result.error || 'Kunne ikke sjekke oppdateringer';
        setUpdateError(errMsg);
        toast.error(errMsg);
      }
    } catch {
      setUpdateError('Kunne ikke koble til server');
      toast.error('Kunne ikke koble til server');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const applyUpdate = async () => {
    setIsUpdating(true);
    setUpdateProgress([]);
    setUpdateError(null);
    try {
      const res = await fetch(`${API_BASE}/api/system/update/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ branch: updateInfo?.branch || 'main' }),
      });

      // Check if we got HTML instead of SSE stream
      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('text/event-stream') && !contentType?.includes('application/json')) {
        const text = await res.text();
        if (text.trim().startsWith('<!') || text.includes('<html')) {
          setUpdateError('Backend er ikke tilgjengelig (fikk HTML i stedet for SSE-strøm)');
          setIsUpdating(false);
          return;
        }
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let completed = false;

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value);
            const lines = text.split('\n').filter(l => l.startsWith('data: '));
            for (const line of lines) {
              try {
                const data = JSON.parse(line.substring(6));
                setUpdateProgress(prev => [...prev, data]);
                if (data.status === 'complete') {
                  completed = true;
                }
                if (data.status === 'error') {
                  setUpdateError(data.message);
                }
              } catch {}
            }
          }
        } catch {
          // Connection lost during update — expected when backend restarts
          if (!completed) {
            setUpdateProgress(prev => [...prev, { step: 6, message: 'Backend restarter... venter på at den kommer tilbake', status: 'running' }]);
          }
        }
      }

      // Wait for backend to come back online after restart
      if (!updateError) {
        setUpdateProgress(prev => [...prev, { step: 7, message: 'Venter på at backend starter opp igjen...', status: 'running' }]);
        let retries = 0;
        const maxRetries = 20;
        while (retries < maxRetries) {
          await new Promise(r => setTimeout(r, 3000));
          try {
            const healthResult = await fetchJsonSafely(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
            if (healthResult.ok) {
              setUpdateProgress(prev => [...prev, { step: 7, message: 'Backend er tilbake online!', status: 'done' }]);
              toast.success('Oppdatering fullført! Laster siden på nytt...');
              setTimeout(() => window.location.reload(), 2000);
              return;
            }
          } catch { /* still restarting */ }
          retries++;
        }
        setUpdateError('Backend startet ikke opp igjen innen 60 sekunder');
      }
    } catch (err) {
      setUpdateError('Oppdatering feilet - sjekk serveren');
    } finally {
      setIsUpdating(false);
    }
  };

  const renderSaveButton = (service: keyof ServiceConfigs) => (
    <Button
      className="bg-primary text-primary-foreground"
      onClick={() => saveServiceConfig(service)}
      disabled={isSaving === service}
    >
      {isSaving === service ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
      Lagre
    </Button>
  );

  const renderTestButton = (service: string) => (
    <Button
      variant="outline"
      onClick={() => testConnection(service)}
      disabled={connectionStatus[service]?.status === 'testing'}
    >
      {connectionStatus[service]?.status === 'testing'
        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        : <TestTube className="h-4 w-4 mr-2" />}
      Test Tilkobling
    </Button>
  );

  const renderStatusMessage = (service: string) => {
    const s = connectionStatus[service];
    if (!s?.message) return null;
    return <p className={`text-xs ${s.status === 'error' ? 'text-destructive' : 'text-success'}`}>{s.message}</p>;
  };

  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-primary/10 p-3"><SettingsIcon className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Innstillinger</h1>
            <p className="text-sm text-muted-foreground">Konfigurer API-endepunkter og tilkoblinger</p>
          </div>
        </div>

        <Tabs defaultValue="endpoints" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="endpoints" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Server className="h-4 w-4 mr-2" />API Endepunkter
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-4 w-4 mr-2" />Brukere
            </TabsTrigger>
            <TabsTrigger value="backend" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />Backend Setup
            </TabsTrigger>
            <TabsTrigger value="update" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Download className="h-4 w-4 mr-2" />Oppdatering
            </TabsTrigger>
          </TabsList>

          <TabsContent value="endpoints">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="outline" onClick={testAllConnections}>
                  <RefreshCw className="h-4 w-4 mr-2" />Test alle tilkoblinger
                </Button>
              </div>

              {/* UniFi */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><Wifi className="h-5 w-5 text-primary" />UniFi Controller</div>
                    {getStatusBadge('unifi')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Controller URL</Label>
                      <Input value={configs.unifi.url} onChange={e => updateConfig('unifi', 'url', e.target.value)} placeholder="https://192.168.1.1:8443" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Site Name</Label>
                      <Input value={configs.unifi.site} onChange={e => updateConfig('unifi', 'site', e.target.value)} placeholder="default" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Brukernavn</Label>
                      <Input value={configs.unifi.username} onChange={e => updateConfig('unifi', 'username', e.target.value)} placeholder="admin" className="bg-muted border-border mt-1" />
                    </div>
                    <div>
                      <Label>Passord</Label>
                      <Input type="password" value={configs.unifi.password} onChange={e => updateConfig('unifi', 'password', e.target.value)} className="bg-muted border-border mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {renderTestButton('unifi')}
                    {renderSaveButton('unifi')}
                  </div>
                  {renderStatusMessage('unifi')}
                </CardContent>
              </Card>

              {/* TrueNAS */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><HardDrive className="h-5 w-5 text-primary" />TrueNAS Scale</div>
                    {getStatusBadge('truenas')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>API URL</Label>
                      <Input value={configs.truenas.url} onChange={e => updateConfig('truenas', 'url', e.target.value)} placeholder="http://192.168.1.20" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>API Key</Label>
                      <Input type="password" value={configs.truenas.apiKey} onChange={e => updateConfig('truenas', 'apiKey', e.target.value)} className="bg-muted border-border font-mono mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {renderTestButton('truenas')}
                    {renderSaveButton('truenas')}
                  </div>
                  {renderStatusMessage('truenas')}
                </CardContent>
              </Card>

              {/* Proxmox */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><Server className="h-5 w-5 text-primary" />Proxmox VE</div>
                    {getStatusBadge('proxmox')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>API URL</Label>
                      <Input value={configs.proxmox.url} onChange={e => updateConfig('proxmox', 'url', e.target.value)} placeholder="https://192.168.1.30:8006" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Bruker</Label>
                      <Input value={configs.proxmox.user} onChange={e => updateConfig('proxmox', 'user', e.target.value)} placeholder="root@pam" className="bg-muted border-border mt-1" />
                    </div>
                    <div>
                      <Label>Token ID (bare token-navnet, uten bruker)</Label>
                      <Input value={configs.proxmox.tokenId} onChange={e => updateConfig('proxmox', 'tokenId', e.target.value)} placeholder="f.eks. test (IKKE root@pam!test)" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Token Secret</Label>
                      <Input type="password" value={configs.proxmox.tokenSecret} onChange={e => updateConfig('proxmox', 'tokenSecret', e.target.value)} className="bg-muted border-border font-mono mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {renderTestButton('proxmox')}
                    {renderSaveButton('proxmox')}
                  </div>
                  {renderStatusMessage('proxmox')}
                </CardContent>
              </Card>

              {/* OpenVAS */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" />OpenVAS / Greenbone</div>
                    {getStatusBadge('openvas')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>GMP URL</Label>
                      <Input value={configs.openvas.url} onChange={e => updateConfig('openvas', 'url', e.target.value)} placeholder="http://192.168.1.40:9392" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Brukernavn</Label>
                      <Input value={configs.openvas.username} onChange={e => updateConfig('openvas', 'username', e.target.value)} placeholder="admin" className="bg-muted border-border mt-1" />
                    </div>
                    <div>
                      <Label>Passord</Label>
                      <Input type="password" value={configs.openvas.password} onChange={e => updateConfig('openvas', 'password', e.target.value)} className="bg-muted border-border mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {renderTestButton('openvas')}
                    {renderSaveButton('openvas')}
                  </div>
                  {renderStatusMessage('openvas')}
                </CardContent>
              </Card>

              {/* AbuseIPDB */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" />AbuseIPDB</div>
                    {getStatusBadge('abuseipdb')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Brukes for IP-reputasjonsoppslag i IDS/IPS-varsler. Gratis plan gir 1000 oppslag/dag.{' '}
                    <a href="https://www.abuseipdb.com/account/plans" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Registrer deg her
                    </a>
                  </p>
                  <div>
                    <Label>API-nøkkel</Label>
                    <Input type="password" value={configs.abuseipdb.apiKey} onChange={e => updateConfig('abuseipdb', 'apiKey', e.target.value)} placeholder="Din AbuseIPDB API-nøkkel" className="bg-muted border-border font-mono mt-1" />
                  </div>
                  <div className="flex gap-2">
                    {renderTestButton('abuseipdb')}
                    {renderSaveButton('abuseipdb')}
                  </div>
                  {renderStatusMessage('abuseipdb')}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users">
            {!isAdmin ? (
              <Card className="bg-card border-border">
                <CardContent className="p-8 text-center">
                  <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Begrenset tilgang</h3>
                  <p className="text-muted-foreground">Du må være administrator for å administrere brukere.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="bg-card border-border">
                  <CardHeader className="border-b border-border">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Brukeradministrasjon</div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={fetchUsers} disabled={isLoadingUsers}>
                          <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingUsers ? 'animate-spin' : ''}`} />Oppdater
                        </Button>
                        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                          <DialogTrigger asChild>
                            <Button className="bg-primary text-primary-foreground"><UserPlus className="h-4 w-4 mr-2" />Legg til bruker</Button>
                          </DialogTrigger>
                          <DialogContent className="bg-card border-border">
                            <DialogHeader><DialogTitle>Legg til ny bruker</DialogTitle></DialogHeader>
                            <div className="space-y-4 py-4">
                              <div>
                                <Label>Brukernavn</Label>
                                <Input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} className="bg-muted border-border mt-1" placeholder="bruker123" />
                              </div>
                              <div>
                                <Label>Passord</Label>
                                <Input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} className="bg-muted border-border mt-1" placeholder="Minst 6 tegn" />
                              </div>
                              <div>
                                <Label>Rolle</Label>
                                <Select value={newUser.role} onValueChange={(v: UserRole) => setNewUser({ ...newUser, role: v })}>
                                  <SelectTrigger className="bg-muted border-border mt-1"><SelectValue /></SelectTrigger>
                                  <SelectContent className="bg-card border-border">
                                    <SelectItem value="admin">Administrator</SelectItem>
                                    <SelectItem value="user">Bruker</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Avbryt</Button>
                              <Button className="bg-primary text-primary-foreground" onClick={handleAddUser} disabled={isCreating}>
                                {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Opprett bruker
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {isLoadingUsers ? (
                      <div className="p-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                        <p className="text-muted-foreground mt-2">Laster brukere...</p>
                      </div>
                    ) : users.length === 0 ? (
                      <div className="p-8 text-center">
                        <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">Ingen brukere funnet</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border hover:bg-muted/50">
                            <TableHead>Bruker</TableHead>
                            <TableHead>Rolle</TableHead>
                            <TableHead>Opprettet</TableHead>
                            <TableHead className="text-right">Handlinger</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.map(user => (
                            <TableRow key={user.id} className="border-border hover:bg-muted/50">
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <div className="rounded-full bg-primary/10 p-1.5"><User className="h-4 w-4 text-primary" /></div>
                                  <span>{user.username}</span>
                                  {user.id === currentUser?.id && <Badge variant="outline" className="text-xs">Du</Badge>}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={roleBadgeClass[user.role] || roleBadgeClass.user}>
                                  {roleLabels[user.role] || user.role}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {user.createdAt ? new Date(user.createdAt).toLocaleDateString('nb-NO') : '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="outline" size="sm" onClick={() => openEditDialog(user)} title="Rediger bruker">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => { if (confirm(`Er du sikker på at du vil slette "${user.username}"?`)) handleDeleteUser(user); }} disabled={user.id === currentUser?.id || isDeleting === user.id} title="Slett bruker">
                                    {isDeleting === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-card border-border mt-4">
                  <CardHeader className="border-b border-border"><CardTitle className="text-base">Rollebeskrivelser</CardTitle></CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Badge className="bg-destructive/10 text-destructive">Administrator</Badge>
                        <p className="text-sm text-muted-foreground">Full tilgang til alle systemer, kan administrere brukere og innstillinger.</p>
                      </div>
                      <div className="space-y-2">
                        <Badge className="bg-primary/10 text-primary">Bruker</Badge>
                        <p className="text-sm text-muted-foreground">Standard tilgang til dashboards og funksjoner.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="backend">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border"><CardTitle>Lokal Backend Setup</CardTitle></CardHeader>
              <CardContent className="p-4">
                <div className="prose prose-invert max-w-none text-sm">
                  <p className="text-muted-foreground mb-4">
                    For å koble denne frontend-appen til dine lokale systemer, må du sette opp en lokal backend API-server på Ubuntu-serveren din.
                  </p>
                  <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs overflow-x-auto mb-4">
                    <p className="text-primary mb-2"># Installer og start backend</p>
                    <p className="text-foreground">cd backend && npm install && node server.js</p>
                  </div>
                  <p className="text-muted-foreground mb-2">Backend API-en fungerer som proxy mellom denne appen og:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
                    <li>UniFi Controller API</li>
                    <li>TrueNAS REST API</li>
                    <li>Proxmox VE API</li>
                    <li>OpenVAS GMP</li>
                    <li>Nmap</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="update">
            <div className="space-y-4">
              {/* Current version info */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-primary" />
                      Systemversjon
                    </div>
                    <Button
                      variant="outline"
                      onClick={checkForUpdates}
                      disabled={isCheckingUpdate}
                    >
                      {isCheckingUpdate
                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        : <RefreshCw className="h-4 w-4 mr-2" />}
                      Sjekk for oppdateringer
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {updateInfo ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">Nåværende versjon</p>
                          <p className="text-lg font-mono font-bold text-foreground">{updateInfo.currentVersion}</p>
                          <p className="text-xs text-muted-foreground mt-1">{updateInfo.currentMessage}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">Branch</p>
                          <p className="text-lg font-mono font-bold text-primary">{updateInfo.branch}</p>
                          <p className="text-xs text-muted-foreground mt-1">{updateInfo.currentDate}</p>
                        </div>
                        <div className={`rounded-lg p-3 ${updateInfo.updateAvailable ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'}`}>
                          <p className="text-xs text-muted-foreground">Status</p>
                          {updateInfo.updateAvailable ? (
                            <>
                              <p className="text-lg font-bold text-primary flex items-center gap-2">
                                <ArrowUpCircle className="h-5 w-5" />
                                {updateInfo.behind} oppdatering{updateInfo.behind > 1 ? 'er' : ''}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Ny versjon: {updateInfo.latestVersion}</p>
                            </>
                          ) : (
                            <p className="text-lg font-bold text-success flex items-center gap-2">
                              <CheckCircle className="h-5 w-5" />
                              Oppdatert
                            </p>
                          )}
                        </div>
                      </div>

                      {/* New commits */}
                      {updateInfo.newCommits.length > 0 && (
                        <div>
                          <h3 className="text-sm font-medium text-foreground mb-2">Nye endringer:</h3>
                          <div className="space-y-1 max-h-60 overflow-y-auto">
                            {updateInfo.newCommits.map((commit, i) => (
                              <div key={i} className="flex items-start gap-3 bg-muted/30 rounded p-2 text-sm">
                                <code className="text-primary font-mono text-xs mt-0.5">{commit.hash}</code>
                                <div className="flex-1 min-w-0">
                                  <p className="text-foreground truncate">{commit.message}</p>
                                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                                    <Clock className="h-3 w-3" />
                                    {commit.date} — {commit.author}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Update button */}
                      {updateInfo.updateAvailable && !isUpdating && (
                        <Button
                          className="bg-primary text-primary-foreground w-full"
                          onClick={applyUpdate}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Installer oppdatering ({updateInfo.behind} commit{updateInfo.behind > 1 ? 's' : ''})
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Download className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                      <p className="text-muted-foreground">Trykk «Sjekk for oppdateringer» for å se om det finnes en ny versjon.</p>
                    </div>
                  )}

                  {updateError && (
                    <div className="mt-4 bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                      <p className="text-sm text-destructive">{updateError}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Update progress with step-by-step bar */}
              {(isUpdating || updateProgress.length > 0) && (
                <Card className="bg-card border-border">
                  <CardHeader className="border-b border-border">
                    <CardTitle className="flex items-center gap-2">
                      {isUpdating ? <Loader2 className="h-5 w-5 text-primary animate-spin" /> : <CheckCircle className="h-5 w-5 text-success" />}
                      Oppdateringsfremdrift
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-6">
                    {/* Visual step progress bar */}
                    {(() => {
                      const steps = [
                        { label: 'Git Pull', icon: GitBranch },
                        { label: 'npm install', icon: Download },
                        { label: 'Build', icon: ArrowUpCircle },
                        { label: 'Restart', icon: RefreshCw },
                      ];
                      const completedSteps = updateProgress.filter(p => p.status === 'done').length;
                      const hasError = updateProgress.some(p => p.status === 'error');
                      const currentStep = hasError ? -1 : Math.min(completedSteps, steps.length - 1);
                      const progressPercent = hasError ? 0 : Math.min((completedSteps / steps.length) * 100, 100);

                      return (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            {steps.map((step, i) => {
                              const StepIcon = step.icon;
                              const isDone = i < completedSteps;
                              const isActive = i === currentStep && isUpdating && !hasError;
                              const isErrorStep = hasError && i === completedSteps;
                              return (
                                <div key={i} className="flex flex-col items-center flex-1">
                                  <div className={`rounded-full p-2 mb-1 transition-all ${
                                    isDone ? 'bg-success/20 text-success' :
                                    isActive ? 'bg-primary/20 text-primary animate-pulse' :
                                    isErrorStep ? 'bg-destructive/20 text-destructive' :
                                    'bg-muted text-muted-foreground'
                                  }`}>
                                    {isDone ? <CheckCircle className="h-5 w-5" /> :
                                     isActive ? <Loader2 className="h-5 w-5 animate-spin" /> :
                                     isErrorStep ? <XCircle className="h-5 w-5" /> :
                                     <StepIcon className="h-5 w-5" />}
                                  </div>
                                  <span className={`text-xs font-medium ${
                                    isDone ? 'text-success' :
                                    isActive ? 'text-primary' :
                                    isErrorStep ? 'text-destructive' :
                                    'text-muted-foreground'
                                  }`}>{step.label}</span>
                                </div>
                              );
                            })}
                          </div>
                          <Progress className="mt-2" value={progressPercent} />
                        </div>
                      );
                    })()}

                    {/* Detailed log */}
                    <div className="space-y-2">
                      {updateProgress.map((p, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          {p.status === 'done' && <CheckCircle className="h-4 w-4 text-success shrink-0" />}
                          {p.status === 'running' && <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />}
                          {p.status === 'error' && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                          {p.status === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />}
                          {p.status === 'complete' && <CheckCircle className="h-4 w-4 text-success shrink-0" />}
                          <span className={`${p.status === 'error' ? 'text-destructive' : p.status === 'complete' ? 'text-success font-medium' : 'text-foreground'}`}>
                            {p.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Edit User Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary" />
                Rediger bruker: {editingUser?.username}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Rolle</Label>
                <Select value={editRole} onValueChange={(v: UserRole) => setEditRole(v)}>
                  <SelectTrigger className="bg-muted border-border mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="admin">Administrator</SelectItem>
                    <SelectItem value="user">Bruker</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Nytt passord (la stå tomt for å beholde)
                </Label>
                <Input
                  type="password"
                  value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                  className="bg-muted border-border mt-1"
                  placeholder="Minst 8 tegn"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Avbryt</Button>
              <Button className="bg-primary text-primary-foreground" onClick={handleUpdateUser} disabled={isUpdatingUser}>
                {isUpdatingUser && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Lagre endringer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
