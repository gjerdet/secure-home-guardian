import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { 
  Shield, Loader2, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, ArrowRight, Globe, Server, Search, Filter, ArrowUpDown, Eye, EyeOff
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface FirewallRule {
  _id: string;
  name: string;
  enabled: boolean;
  action: string;
  ruleset: string;
  protocol: string;
  protocol_match_excepted?: boolean;
  src_firewallgroup_ids?: string[];
  dst_firewallgroup_ids?: string[];
  src_networkconf_id?: string;
  dst_networkconf_id?: string;
  src_networkconf_type?: string;
  dst_networkconf_type?: string;
  dst_port?: string;
  src_port?: string;
  src_address?: string;
  dst_address?: string;
  src_mac_address?: string;
  rule_index?: number;
  state_established?: boolean;
  state_related?: boolean;
  state_new?: boolean;
  state_invalid?: boolean;
  ipsec?: string;
  logging?: boolean;
  setting_preference?: string;
}

interface PortForward {
  _id: string;
  name: string;
  enabled: boolean;
  proto: string;
  src: string;
  dst_port: string;
  fwd: string;
  fwd_port: string;
  log?: boolean;
  pfwd_interface?: string;
}

interface FirewallGroup {
  _id: string;
  name: string;
  group_type: string;
  group_members: string[];
}

type SortField = 'name' | 'action' | 'ruleset' | 'protocol' | 'rule_index';
type SortDir = 'asc' | 'desc';

export function FirewallAuditPanel() {
  const { token } = useAuth();
  const [firewallRules, setFirewallRules] = useState<FirewallRule[]>([]);
  const [portForwards, setPortForwards] = useState<PortForward[]>([]);
  const [firewallGroups, setFirewallGroups] = useState<FirewallGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [rulesetFilter, setRulesetFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [protocolFilter, setProtocolFilter] = useState<string>("all");
  const [enabledFilter, setEnabledFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("rule_index");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchRules = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/security/firewall-rules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFirewallRules(data.firewallRules || []);
        setPortForwards(data.portForwards || []);
        setFirewallGroups(data.firewallGroups || []);
        if (data.error) setError(data.error);
        toast.success(`Hentet ${(data.firewallRules || []).length} brannmurregler og ${(data.portForwards || []).length} port forwards`);
      } else {
        toast.error("Kunne ikke hente brannmurregler");
      }
    } catch {
      toast.error("Kunne ikke koble til backend");
    } finally {
      setIsLoading(false);
    }
  };

  // Extract unique values for filters
  const uniqueRulesets = useMemo(() => 
    [...new Set(firewallRules.map(r => r.ruleset).filter(Boolean))].sort(),
    [firewallRules]
  );
  const uniqueActions = useMemo(() => 
    [...new Set(firewallRules.map(r => r.action).filter(Boolean))].sort(),
    [firewallRules]
  );
  const uniqueProtocols = useMemo(() => 
    [...new Set(firewallRules.map(r => r.protocol).filter(Boolean))].sort(),
    [firewallRules]
  );

  // Friendly ruleset names
  const rulesetLabels: Record<string, string> = {
    'WAN_IN': 'WAN → LAN',
    'WAN_OUT': 'LAN → WAN',
    'WAN_LOCAL': 'WAN → Gateway',
    'LAN_IN': 'LAN → Alle',
    'LAN_OUT': 'Alle → LAN',
    'LAN_LOCAL': 'LAN → Gateway',
    'GUEST_IN': 'Gjest → Alle',
    'GUEST_OUT': 'Alle → Gjest',
    'GUEST_LOCAL': 'Gjest → Gateway',
  };

  // Filtered and sorted rules
  const filteredRules = useMemo(() => {
    let result = [...firewallRules];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.name?.toLowerCase().includes(q) ||
        r.dst_port?.includes(q) ||
        r.src_port?.includes(q) ||
        r.src_address?.toLowerCase().includes(q) ||
        r.dst_address?.toLowerCase().includes(q) ||
        r.ruleset?.toLowerCase().includes(q)
      );
    }

    if (rulesetFilter !== "all") {
      result = result.filter(r => r.ruleset === rulesetFilter);
    }
    if (actionFilter !== "all") {
      result = result.filter(r => r.action === actionFilter);
    }
    if (protocolFilter !== "all") {
      result = result.filter(r => r.protocol === protocolFilter);
    }
    if (enabledFilter !== "all") {
      result = result.filter(r => enabledFilter === "enabled" ? r.enabled : !r.enabled);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = (a.name || '').localeCompare(b.name || ''); break;
        case 'action': cmp = (a.action || '').localeCompare(b.action || ''); break;
        case 'ruleset': cmp = (a.ruleset || '').localeCompare(b.ruleset || ''); break;
        case 'protocol': cmp = (a.protocol || '').localeCompare(b.protocol || ''); break;
        case 'rule_index': cmp = (a.rule_index || 0) - (b.rule_index || 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [firewallRules, searchQuery, rulesetFilter, actionFilter, protocolFilter, enabledFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead 
      className="cursor-pointer hover:text-foreground select-none"
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-primary' : 'text-muted-foreground/50'}`} />
      </div>
    </TableHead>
  );

  const getGroupName = (id: string) => {
    const group = firewallGroups.find(g => g._id === id);
    return group ? group.name : id;
  };

  // Stats
  const stats = {
    total: firewallRules.length,
    enabled: firewallRules.filter(r => r.enabled).length,
    drop: firewallRules.filter(r => r.action === 'drop' || r.action === 'reject').length,
    accept: firewallRules.filter(r => r.action === 'accept').length,
    forwards: portForwards.length,
    activeForwards: portForwards.filter(pf => pf.enabled).length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Brannmur-oversikt (UDM Pro)
            </CardTitle>
            <Button onClick={fetchRules} disabled={isLoading} className="bg-primary text-primary-foreground" size="sm">
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {isLoading ? "Henter..." : "Hent regler"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Komplett oversikt over brannmurregler og port forwards fra UniFi Dream Machine Pro.
          </p>
        </CardHeader>
      </Card>

      {error && (
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4 flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Kunne ikke hente fra UDM Pro: {error}</span>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {firewallRules.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-mono font-bold text-foreground">{stats.total}</p>
              <p className="text-[10px] text-muted-foreground">Totalt regler</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-mono font-bold text-success">{stats.enabled}</p>
              <p className="text-[10px] text-muted-foreground">Aktive</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-mono font-bold text-destructive">{stats.drop}</p>
              <p className="text-[10px] text-muted-foreground">Blokkering</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-mono font-bold text-success">{stats.accept}</p>
              <p className="text-[10px] text-muted-foreground">Tillat</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-mono font-bold text-warning">{stats.activeForwards}</p>
              <p className="text-[10px] text-muted-foreground">Port forwards</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-mono font-bold text-muted-foreground">{uniqueRulesets.length}</p>
              <p className="text-[10px] text-muted-foreground">Rulesets</p>
            </CardContent>
          </Card>
        </div>
      )}

      {(firewallRules.length > 0 || portForwards.length > 0) && (
        <Tabs defaultValue="rules" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="rules" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4 mr-2" />
              Regler ({filteredRules.length}/{firewallRules.length})
            </TabsTrigger>
            <TabsTrigger value="forwards" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ArrowRight className="h-4 w-4 mr-2" />
              Port Forwards ({portForwards.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules">
            {/* Filters */}
            <Card className="bg-card border-border mb-4">
              <CardContent className="p-3">
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Søk i navn, porter, adresser..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-9 bg-muted border-border"
                    />
                  </div>
                  <Select value={rulesetFilter} onValueChange={setRulesetFilter}>
                    <SelectTrigger className="w-[160px] bg-muted border-border">
                      <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Ruleset" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      <SelectItem value="all">Alle rulesets</SelectItem>
                      {uniqueRulesets.map(rs => (
                        <SelectItem key={rs} value={rs}>
                          {rulesetLabels[rs] || rs}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="w-[130px] bg-muted border-border">
                      <SelectValue placeholder="Handling" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      <SelectItem value="all">Alle handlinger</SelectItem>
                      {uniqueActions.map(a => (
                        <SelectItem key={a} value={a}>{a.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={protocolFilter} onValueChange={setProtocolFilter}>
                    <SelectTrigger className="w-[130px] bg-muted border-border">
                      <SelectValue placeholder="Protokoll" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      <SelectItem value="all">Alle protokoller</SelectItem>
                      {uniqueProtocols.map(p => (
                        <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={enabledFilter} onValueChange={setEnabledFilter}>
                    <SelectTrigger className="w-[120px] bg-muted border-border">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      <SelectItem value="all">Alle</SelectItem>
                      <SelectItem value="enabled">Aktive</SelectItem>
                      <SelectItem value="disabled">Deaktiverte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Rules table */}
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <ScrollArea className="max-h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <SortableHeader field="rule_index">#</SortableHeader>
                        <SortableHeader field="name">Navn</SortableHeader>
                        <TableHead>Status</TableHead>
                        <SortableHeader field="action">Handling</SortableHeader>
                        <SortableHeader field="ruleset">Ruleset</SortableHeader>
                        <SortableHeader field="protocol">Protokoll</SortableHeader>
                        <TableHead>Kilde</TableHead>
                        <TableHead>Destinasjon</TableHead>
                        <TableHead>Port</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRules.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            Ingen regler matcher filtrene
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRules.map(rule => (
                          <TableRow key={rule._id} className={`border-border hover:bg-muted/50 ${!rule.enabled ? 'opacity-50' : ''}`}>
                            <TableCell className="font-mono text-xs text-muted-foreground w-[50px]">
                              {rule.rule_index ?? '-'}
                            </TableCell>
                            <TableCell className="font-medium text-sm max-w-[200px]">
                              <span className="truncate block">{rule.name}</span>
                            </TableCell>
                            <TableCell>
                              {rule.enabled ? (
                                <Eye className="h-4 w-4 text-success" />
                              ) : (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                className={`text-[10px] ${
                                  rule.action === 'drop' || rule.action === 'reject' 
                                    ? 'bg-destructive/10 text-destructive' 
                                    : 'bg-success/10 text-success'
                                }`}
                              >
                                {rule.action?.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {rulesetLabels[rule.ruleset] || rule.ruleset}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs font-mono text-muted-foreground">
                                {rule.protocol === 'all' ? 'Alle' : rule.protocol?.toUpperCase()}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground max-w-[150px]">
                              {rule.src_address || 
                               (rule.src_firewallgroup_ids?.length 
                                 ? rule.src_firewallgroup_ids.map(id => getGroupName(id)).join(', ')
                                 : rule.src_networkconf_type || 'Alle'
                               )}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground max-w-[150px]">
                              {rule.dst_address || 
                               (rule.dst_firewallgroup_ids?.length 
                                 ? rule.dst_firewallgroup_ids.map(id => getGroupName(id)).join(', ')
                                 : rule.dst_networkconf_type || 'Alle'
                               )}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">
                              {rule.dst_port || '-'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forwards">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <ArrowRight className="h-5 w-5 text-warning" />
                  Port Forwards
                  {stats.activeForwards > 0 && (
                    <Badge className="bg-warning/10 text-warning ml-2">{stats.activeForwards} aktive</Badge>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Port forwards eksponerer interne tjenester mot internett. Hver aktiv forward bør ha en god grunn.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {portForwards.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Ingen port forwards konfigurert – bra!</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead>Navn</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ekstern port</TableHead>
                        <TableHead>Intern mål</TableHead>
                        <TableHead>Protokoll</TableHead>
                        <TableHead>Interface</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {portForwards.map(pf => (
                        <TableRow key={pf._id} className={`border-border hover:bg-muted/50 ${!pf.enabled ? 'opacity-50' : ''}`}>
                          <TableCell className="font-medium text-sm">{pf.name}</TableCell>
                          <TableCell>
                            <Badge variant={pf.enabled ? "default" : "secondary"} className="text-[10px]">
                              {pf.enabled ? "Aktiv" : "Deaktivert"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-xs">
                              <Globe className="h-3 w-3 text-muted-foreground" />
                              <span className="font-mono">{pf.dst_port}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-xs">
                              <Server className="h-3 w-3 text-muted-foreground" />
                              <span className="font-mono">{pf.fwd}:{pf.fwd_port}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {pf.proto?.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {pf.pfwd_interface || 'WAN'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Empty state */}
      {firewallRules.length === 0 && portForwards.length === 0 && !isLoading && (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Klikk "Hent regler" for å hente brannmurregler fra UDM Pro.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
