import { useState } from "react";
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
  Settings as SettingsIcon, Server, Wifi, HardDrive, Shield,
  Save, TestTube, CheckCircle, XCircle, Users, UserPlus, Pencil, Trash2, User, Loader2, RefreshCw
} from "lucide-react";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type UserRole = "admin" | "moderator" | "user";

interface SystemUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  lastLogin: string;
  status: "active" | "inactive";
}

interface ConnectionStatus {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
  responseTime?: number;
}

const initialUsers: SystemUser[] = [
  { id: "1", username: "admin", email: "admin@netguard.local", role: "admin", lastLogin: "2024-01-15 10:30", status: "active" },
  { id: "2", username: "operator", email: "operator@netguard.local", role: "moderator", lastLogin: "2024-01-15 09:15", status: "active" },
  { id: "3", username: "viewer", email: "viewer@netguard.local", role: "user", lastLogin: "2024-01-14 16:45", status: "active" },
  { id: "4", username: "backup_admin", email: "backup@netguard.local", role: "admin", lastLogin: "2024-01-10 08:00", status: "inactive" },
];

const roleLabels: Record<UserRole, string> = {
  admin: "Administrator",
  moderator: "Operatør",
  user: "Leser",
};

const roleBadgeClass: Record<UserRole, string> = {
  admin: "bg-destructive/10 text-destructive",
  moderator: "bg-warning/10 text-warning",
  user: "bg-primary/10 text-primary",
};

export default function Settings() {
  const [users, setUsers] = useState<SystemUser[]>(initialUsers);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [newUser, setNewUser] = useState({ username: "", email: "", password: "", role: "user" as UserRole });
  
  // Connection testing state
  const [connectionStatus, setConnectionStatus] = useState<Record<string, ConnectionStatus>>({
    unifi: { status: 'idle' },
    truenas: { status: 'idle' },
    proxmox: { status: 'idle' },
    openvas: { status: 'idle' },
    backend: { status: 'idle' },
  });

  // Test individual connection
  const testConnection = async (service: string) => {
    setConnectionStatus(prev => ({
      ...prev,
      [service]: { status: 'testing' }
    }));

    try {
      const start = Date.now();
      const response = await fetch(`${API_BASE}/api/health/test/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const responseTime = Date.now() - start;

      if (response.ok) {
        const data = await response.json();
        setConnectionStatus(prev => ({
          ...prev,
          [service]: { 
            status: data.success ? 'success' : 'error',
            message: data.message,
            responseTime
          }
        }));
        if (data.success) {
          toast.success(`${service} tilkobling OK (${responseTime}ms)`);
        } else {
          toast.error(`${service}: ${data.message}`);
        }
      } else {
        throw new Error('Tilkoblingsfeil');
      }
    } catch (error) {
      setConnectionStatus(prev => ({
        ...prev,
        [service]: { 
          status: 'error',
          message: error instanceof Error ? error.message : 'Ukjent feil'
        }
      }));
      toast.error(`Kunne ikke teste ${service}: ${error instanceof Error ? error.message : 'Ukjent feil'}`);
    }
  };

  // Test all connections
  const testAllConnections = async () => {
    const services = ['backend', 'unifi', 'truenas', 'proxmox', 'openvas'];
    for (const service of services) {
      await testConnection(service);
    }
  };

  const getStatusBadge = (service: string) => {
    const status = connectionStatus[service];
    if (status.status === 'testing') {
      return (
        <Badge className="bg-primary/10 text-primary">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Tester...
        </Badge>
      );
    }
    if (status.status === 'success') {
      return (
        <Badge className="bg-success/10 text-success">
          <CheckCircle className="h-3 w-3 mr-1" />
          Tilkoblet {status.responseTime && `(${status.responseTime}ms)`}
        </Badge>
      );
    }
    if (status.status === 'error') {
      return (
        <Badge className="bg-destructive/10 text-destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Feil
        </Badge>
      );
    }
    return (
      <Badge className="bg-muted text-muted-foreground">
        Ikke testet
      </Badge>
    );
  };

  const handleAddUser = () => {
    if (!newUser.username || !newUser.email || !newUser.password) {
      toast.error("Alle felt må fylles ut");
      return;
    }
    const user: SystemUser = {
      id: Date.now().toString(),
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      lastLogin: "Aldri",
      status: "active",
    };
    setUsers([...users, user]);
    setNewUser({ username: "", email: "", password: "", role: "user" });
    setIsAddDialogOpen(false);
    toast.success(`Bruker "${user.username}" ble opprettet`);
  };

  const handleEditUser = () => {
    if (!editingUser) return;
    setUsers(users.map(u => u.id === editingUser.id ? editingUser : u));
    setIsEditDialogOpen(false);
    setEditingUser(null);
    toast.success("Bruker oppdatert");
  };

  const handleDeleteUser = (user: SystemUser) => {
    if (user.username === "admin") {
      toast.error("Kan ikke slette hovedadmin");
      return;
    }
    setUsers(users.filter(u => u.id !== user.id));
    toast.success(`Bruker "${user.username}" ble slettet`);
  };

  const handleToggleStatus = (user: SystemUser) => {
    setUsers(users.map(u => 
      u.id === user.id 
        ? { ...u, status: u.status === "active" ? "inactive" : "active" }
        : u
    ));
    toast.success(`Bruker "${user.username}" er nå ${user.status === "active" ? "deaktivert" : "aktivert"}`);
  };

  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-primary/10 p-3">
            <SettingsIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Innstillinger</h1>
            <p className="text-sm text-muted-foreground">Konfigurer API-endepunkter og tilkoblinger</p>
          </div>
        </div>

        <Tabs defaultValue="endpoints" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="endpoints" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Server className="h-4 w-4 mr-2" />
              API Endepunkter
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-4 w-4 mr-2" />
              Brukere
            </TabsTrigger>
            <TabsTrigger value="backend" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              Backend Setup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="endpoints">
            <div className="space-y-4">
              {/* Test All Button */}
              <div className="flex justify-end">
                <Button variant="outline" onClick={testAllConnections}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Test alle tilkoblinger
                </Button>
              </div>

              {/* UniFi */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wifi className="h-5 w-5 text-primary" />
                      UniFi Controller
                    </div>
                    {getStatusBadge('unifi')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Controller URL</Label>
                      <Input defaultValue="https://192.168.1.1:8443" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Site Name</Label>
                      <Input defaultValue="default" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Brukernavn</Label>
                      <Input defaultValue="admin" className="bg-muted border-border mt-1" />
                    </div>
                    <div>
                      <Label>Passord</Label>
                      <Input type="password" defaultValue="********" className="bg-muted border-border mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => testConnection('unifi')}
                      disabled={connectionStatus.unifi.status === 'testing'}
                    >
                      {connectionStatus.unifi.status === 'testing' ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4 mr-2" />
                      )}
                      Test Tilkobling
                    </Button>
                    <Button className="bg-primary text-primary-foreground"><Save className="h-4 w-4 mr-2" />Lagre</Button>
                  </div>
                  {connectionStatus.unifi.message && (
                    <p className={`text-xs ${connectionStatus.unifi.status === 'error' ? 'text-destructive' : 'text-success'}`}>
                      {connectionStatus.unifi.message}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* TrueNAS */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-5 w-5 text-primary" />
                      TrueNAS Scale
                    </div>
                    {getStatusBadge('truenas')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>API URL</Label>
                      <Input defaultValue="http://192.168.1.20/api/v2.0" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>API Key</Label>
                      <Input type="password" defaultValue="********" className="bg-muted border-border font-mono mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => testConnection('truenas')}
                      disabled={connectionStatus.truenas.status === 'testing'}
                    >
                      {connectionStatus.truenas.status === 'testing' ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4 mr-2" />
                      )}
                      Test Tilkobling
                    </Button>
                    <Button className="bg-primary text-primary-foreground"><Save className="h-4 w-4 mr-2" />Lagre</Button>
                  </div>
                  {connectionStatus.truenas.message && (
                    <p className={`text-xs ${connectionStatus.truenas.status === 'error' ? 'text-destructive' : 'text-success'}`}>
                      {connectionStatus.truenas.message}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Proxmox */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-primary" />
                      Proxmox VE
                    </div>
                    {getStatusBadge('proxmox')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>API URL</Label>
                      <Input defaultValue="https://192.168.1.30:8006" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Node Name</Label>
                      <Input defaultValue="proxmox-01" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Brukernavn</Label>
                      <Input defaultValue="root@pam" className="bg-muted border-border mt-1" />
                    </div>
                    <div>
                      <Label>API Token</Label>
                      <Input type="password" defaultValue="********" className="bg-muted border-border font-mono mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => testConnection('proxmox')}
                      disabled={connectionStatus.proxmox.status === 'testing'}
                    >
                      {connectionStatus.proxmox.status === 'testing' ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4 mr-2" />
                      )}
                      Test Tilkobling
                    </Button>
                    <Button className="bg-primary text-primary-foreground"><Save className="h-4 w-4 mr-2" />Lagre</Button>
                  </div>
                  {connectionStatus.proxmox.message && (
                    <p className={`text-xs ${connectionStatus.proxmox.status === 'error' ? 'text-destructive' : 'text-success'}`}>
                      {connectionStatus.proxmox.message}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* OpenVAS */}
              <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      OpenVAS / Greenbone
                    </div>
                    {getStatusBadge('openvas')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>GMP URL</Label>
                      <Input defaultValue="http://192.168.1.40:9392" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <div>
                      <Label>Brukernavn</Label>
                      <Input defaultValue="admin" className="bg-muted border-border mt-1" />
                    </div>
                    <div>
                      <Label>Passord</Label>
                      <Input type="password" className="bg-muted border-border mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => testConnection('openvas')}
                      disabled={connectionStatus.openvas.status === 'testing'}
                    >
                      {connectionStatus.openvas.status === 'testing' ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4 mr-2" />
                      )}
                      Test Tilkobling
                    </Button>
                    <Button className="bg-primary text-primary-foreground"><Save className="h-4 w-4 mr-2" />Lagre</Button>
                  </div>
                  {connectionStatus.openvas.message && (
                    <p className={`text-xs ${connectionStatus.openvas.status === 'error' ? 'text-destructive' : 'text-success'}`}>
                      {connectionStatus.openvas.message}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Brukeradministrasjon
                  </div>
                  <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-primary text-primary-foreground">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Legg til bruker
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border">
                      <DialogHeader>
                        <DialogTitle>Legg til ny bruker</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label>Brukernavn</Label>
                          <Input 
                            value={newUser.username}
                            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                            className="bg-muted border-border mt-1" 
                          />
                        </div>
                        <div>
                          <Label>E-post</Label>
                          <Input 
                            type="email"
                            value={newUser.email}
                            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                            className="bg-muted border-border mt-1" 
                          />
                        </div>
                        <div>
                          <Label>Passord</Label>
                          <Input 
                            type="password"
                            value={newUser.password}
                            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                            className="bg-muted border-border mt-1" 
                          />
                        </div>
                        <div>
                          <Label>Rolle</Label>
                          <Select value={newUser.role} onValueChange={(v: UserRole) => setNewUser({ ...newUser, role: v })}>
                            <SelectTrigger className="bg-muted border-border mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                              <SelectItem value="admin">Administrator</SelectItem>
                              <SelectItem value="moderator">Operatør</SelectItem>
                              <SelectItem value="user">Leser</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Avbryt</Button>
                        <Button className="bg-primary text-primary-foreground" onClick={handleAddUser}>Opprett bruker</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-muted/50">
                      <TableHead>Bruker</TableHead>
                      <TableHead>E-post</TableHead>
                      <TableHead>Rolle</TableHead>
                      <TableHead>Siste innlogging</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Handlinger</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="rounded-full bg-primary/10 p-1.5">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            {user.username}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <Badge className={roleBadgeClass[user.role]}>
                            {roleLabels[user.role]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.lastLogin}</TableCell>
                        <TableCell>
                          <Badge 
                            className={user.status === "active" ? "bg-success/10 text-success cursor-pointer" : "bg-muted text-muted-foreground cursor-pointer"}
                            onClick={() => handleToggleStatus(user)}
                          >
                            {user.status === "active" ? "Aktiv" : "Inaktiv"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setEditingUser(user);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteUser(user)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Edit User Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle>Rediger bruker</DialogTitle>
                </DialogHeader>
                {editingUser && (
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Brukernavn</Label>
                      <Input 
                        value={editingUser.username}
                        onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                        className="bg-muted border-border mt-1" 
                      />
                    </div>
                    <div>
                      <Label>E-post</Label>
                      <Input 
                        type="email"
                        value={editingUser.email}
                        onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                        className="bg-muted border-border mt-1" 
                      />
                    </div>
                    <div>
                      <Label>Nytt passord (la stå tomt for å beholde)</Label>
                      <Input 
                        type="password"
                        placeholder="••••••••"
                        className="bg-muted border-border mt-1" 
                      />
                    </div>
                    <div>
                      <Label>Rolle</Label>
                      <Select 
                        value={editingUser.role} 
                        onValueChange={(v: UserRole) => setEditingUser({ ...editingUser, role: v })}
                      >
                        <SelectTrigger className="bg-muted border-border mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="admin">Administrator</SelectItem>
                          <SelectItem value="moderator">Operatør</SelectItem>
                          <SelectItem value="user">Leser</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Avbryt</Button>
                  <Button className="bg-primary text-primary-foreground" onClick={handleEditUser}>Lagre endringer</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Role descriptions */}
            <Card className="bg-card border-border mt-4">
              <CardHeader className="border-b border-border">
                <CardTitle className="text-base">Rollebeskrivelser</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Badge className="bg-destructive/10 text-destructive">Administrator</Badge>
                    <p className="text-sm text-muted-foreground">Full tilgang til alle systemer, kan administrere brukere og innstillinger.</p>
                  </div>
                  <div className="space-y-2">
                    <Badge className="bg-warning/10 text-warning">Operatør</Badge>
                    <p className="text-sm text-muted-foreground">Kan starte/stoppe VM-er, kjøre skanninger og håndtere alerts.</p>
                  </div>
                  <div className="space-y-2">
                    <Badge className="bg-primary/10 text-primary">Leser</Badge>
                    <p className="text-sm text-muted-foreground">Kun lesetilgang til dashboards og rapporter.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backend">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle>Lokal Backend Setup</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="prose prose-invert max-w-none text-sm">
                  <p className="text-muted-foreground mb-4">
                    For å koble denne frontend-appen til dine lokale systemer, må du sette opp en lokal backend API-server på Ubuntu-serveren din.
                  </p>
                  
                  <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs overflow-x-auto mb-4">
                    <p className="text-primary mb-2"># Installer Node.js og npm</p>
                    <p className="text-foreground">sudo apt update && sudo apt install nodejs npm</p>
                    <p className="text-foreground mt-2">cd /opt && mkdir netguard-api && cd netguard-api</p>
                    <p className="text-foreground">npm init -y</p>
                    <p className="text-foreground">npm install express cors axios python-shell</p>
                  </div>

                  <p className="text-muted-foreground mb-2">Backend API-en vil fungere som en proxy mellom denne appen og:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
                    <li>UniFi Controller API (for IDS/IPS data og enheter)</li>
                    <li>TrueNAS REST API (for pool og dataset info)</li>
                    <li>Proxmox VE API (for VM/container status)</li>
                    <li>OpenVAS GMP (for sikkerhetsscanning)</li>
                    <li>Nmap (via python-nmap eller shell commands)</li>
                  </ul>

                  <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs mb-4">
                    <p className="text-primary mb-2"># Eksempel API endpoint for UniFi</p>
                    <p className="text-foreground">GET /api/unifi/alerts → Hent IDS/IPS alerts</p>
                    <p className="text-foreground">GET /api/unifi/clients → Hent tilkoblede enheter</p>
                    <p className="text-foreground">GET /api/truenas/pools → Hent storage pools</p>
                    <p className="text-foreground">GET /api/proxmox/vms → Hent VM liste</p>
                    <p className="text-foreground">POST /api/nmap/scan → Start nmap scan</p>
                  </div>

                  <div className="flex gap-2">
                    <div>
                      <Label>Backend API URL</Label>
                      <Input defaultValue="http://localhost:3001" className="bg-muted border-border font-mono mt-1" />
                    </div>
                    <Button className="bg-primary text-primary-foreground self-end">
                      <Save className="h-4 w-4 mr-2" />Lagre
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
