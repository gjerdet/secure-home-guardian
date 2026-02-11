import { useState, useEffect, useMemo } from "react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { 
  Shield, Loader2, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, ArrowRight, Globe, Server, Search, Filter, ArrowUpDown, Eye, EyeOff, Info
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || '';

interface FirewallRule {
  _id: string;
  name: string;
  enabled: boolean;
  action: string; // drop | accept | reject
  ruleset: string;
  rule_index?: number;
  // Policy type
  policy_type?: string; // firewall | route | qos | nat | dns | acl | port_forwarding
  description?: string;
  // Source
  src_zone?: string; // internal | external | dmz | vpn
  src_type?: string; // any | device | network | ip | mac
  src_address?: string;
  src_mac_address?: string;
  src_port?: string;
  src_port_type?: string; // any | specific | list
  src_firewallgroup_ids?: string[];
  src_networkconf_id?: string;
  src_networkconf_type?: string;
  // Destination
  dst_zone?: string; // internal | external | dmz | vpn
  dst_type?: string; // any | app | ip | domain | region
  dst_address?: string;
  dst_port?: string;
  dst_port_type?: string; // any | specific | list
  dst_firewallgroup_ids?: string[];
  dst_networkconf_id?: string;
  dst_networkconf_type?: string;
  dst_app_id?: string;
  dst_domain?: string;
  dst_region?: string;
  // Protocol & IP
  protocol: string;
  protocol_match_excepted?: boolean;
  ip_version?: string; // both | ipv4 | ipv6
  // Connection state
  state_established?: boolean;
  state_related?: boolean;
  state_new?: boolean;
  state_invalid?: boolean;
  // Options
  ipsec?: string;
  logging?: boolean;
  // Schedule
  schedule?: string; // always | daily | weekly | one_time | custom
  schedule_start?: string;
  schedule_end?: string;
  schedule_days?: string[];
  // Meta
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

type SortField = 'name' | 'action' | 'ruleset' | 'protocol' | 'rule_index' | 'enabled' | 'dst_port' | 'src_zone' | 'dst_zone';
type SortDir = 'asc' | 'desc';

const emptyFirewallGroups: FirewallGroup[] = [];
const emptyFirewallRules: FirewallRule[] = [];
const emptyPortForwards: PortForward[] = [];

export function FirewallAuditPanel() {
  const { token } = useAuth();
  const [firewallRules, setFirewallRules] = useState<FirewallRule[]>(emptyFirewallRules);
  const [portForwards, setPortForwards] = useState<PortForward[]>(emptyPortForwards);
  const [firewallGroups, setFirewallGroups] = useState<FirewallGroup[]>(emptyFirewallGroups);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [rulesetFilter, setRulesetFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [protocolFilter, setProtocolFilter] = useState<string>("all");
  const [enabledFilter, setEnabledFilter] = useState<string>("all");
  const [portFilter, setPortFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [destinationFilter, setDestinationFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("rule_index");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedRule, setSelectedRule] = useState<FirewallRule | null>(null);

  const processFirewallData = (data: any) => {
    let rules: FirewallRule[] = [];
    if (data.isZoneBased && data.firewallPolicies?.length > 0) {
      rules = data.firewallPolicies.map((p: any) => ({
        _id: p._id || p.id || Math.random().toString(),
        name: p.name || p.description || 'Unnamed Policy',
        enabled: p.enabled !== false,
        action: p.action || p.predefined_matching_target || 'accept',
        ruleset: p.source?.zone?.name && p.destination?.zone?.name 
          ? `${p.source.zone.name} → ${p.destination.zone.name}` 
          : p.ruleset || 'zone-policy',
        rule_index: p.index ?? p.rule_index ?? 0,
        protocol: p.protocol || p.matching_target?.protocol || 'all',
        src_zone: p.source?.zone?.name || '',
        dst_zone: p.destination?.zone?.name || '',
        src_address: p.source?.address || '',
        dst_address: p.destination?.address || '',
        dst_port: p.destination?.port || p.matching_target?.port || '',
        src_port: p.source?.port || '',
        description: p.description || '',
        logging: p.logging || false,
        ip_version: p.ip_version || 'both',
        schedule: p.schedule?.mode || '',
      }));
    } else {
      rules = data.firewallRules || [];
    }
    
    setFirewallRules(rules);
    setPortForwards(data.portForwards || []);
    setFirewallGroups(data.firewallGroups || []);
    setLastUpdated(data.lastUpdated || null);
    setFromCache(!!data.fromCache);
    if (data.error) setError(data.error);
    return rules;
  };

  // Auto-load cached rules on mount
  useEffect(() => {
    const loadCached = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/security/firewall-rules/cached`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!data.empty) {
            const rules = processFirewallData(data);
            if (rules.length > 0) {
              console.log(`Loaded ${rules.length} cached firewall rules`);
            }
          }
        }
      } catch { /* silent */ }
    };
    loadCached();
  }, [token]);

  const fetchRules = async () => {
    setIsLoading(true);
    setError(null);
    setFromCache(false);
    try {
      const res = await fetch(`${API_BASE}/api/security/firewall-rules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const rules = processFirewallData(data);
        toast.success(`Hentet ${rules.length} brannmurregler og ${(data.portForwards || []).length} port forwards`);
      } else {
        toast.error("Kunne ikke hente brannmurregler");
      }
    } catch {
      toast.error("Kunne ikke koble til backend");
    } finally {
      setIsLoading(false);
    }
  };

  const getGroupName = (id: string) => {
    const group = firewallGroups.find(g => g._id === id);
    return group ? group.name : id;
  };

  // Helper to resolve source/destination display text
  const getSourceDisplay = (rule: FirewallRule) => {
    return rule.src_address || 
      (rule.src_firewallgroup_ids?.length 
        ? rule.src_firewallgroup_ids.map(id => getGroupName(id)).join(', ')
        : rule.src_networkconf_type || 'Alle');
  };
  const getDestDisplay = (rule: FirewallRule) => {
    return rule.dst_address || 
      (rule.dst_firewallgroup_ids?.length 
        ? rule.dst_firewallgroup_ids.map(id => getGroupName(id)).join(', ')
        : rule.dst_networkconf_type || 'Alle');
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
  const uniquePorts = useMemo(() => 
    [...new Set(firewallRules.map(r => r.dst_port).filter(Boolean))].sort(),
    [firewallRules]
  );
  const uniqueSources = useMemo(() => 
    [...new Set(firewallRules.map(r => getSourceDisplay(r)).filter(v => v && v !== 'Alle'))].sort(),
    [firewallRules, firewallGroups]
  );
  const uniqueDestinations = useMemo(() => 
    [...new Set(firewallRules.map(r => getDestDisplay(r)).filter(v => v && v !== 'Alle'))].sort(),
    [firewallRules, firewallGroups]
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
    if (portFilter !== "all") {
      result = result.filter(r => r.dst_port === portFilter);
    }
    if (sourceFilter !== "all") {
      result = result.filter(r => getSourceDisplay(r) === sourceFilter);
    }
    if (destinationFilter !== "all") {
      result = result.filter(r => getDestDisplay(r) === destinationFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = (a.name || '').localeCompare(b.name || ''); break;
        case 'action': cmp = (a.action || '').localeCompare(b.action || ''); break;
        case 'ruleset': cmp = (a.ruleset || '').localeCompare(b.ruleset || ''); break;
        case 'protocol': cmp = (a.protocol || '').localeCompare(b.protocol || ''); break;
        case 'rule_index': cmp = (a.rule_index || 0) - (b.rule_index || 0); break;
        case 'enabled': cmp = (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1); break;
        case 'dst_port': cmp = (a.dst_port || '').localeCompare(b.dst_port || '', undefined, { numeric: true }); break;
        case 'src_zone': cmp = (a.src_zone || '').localeCompare(b.src_zone || ''); break;
        case 'dst_zone': cmp = (a.dst_zone || '').localeCompare(b.dst_zone || ''); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [firewallRules, searchQuery, rulesetFilter, actionFilter, protocolFilter, enabledFilter, portFilter, sourceFilter, destinationFilter, sortField, sortDir]);

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
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Brannmur-oversikt (UDM Pro)</CardTitle>
              {fromCache && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Cache</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="text-[10px] text-muted-foreground">
                  Sist: {new Date(lastUpdated).toLocaleString('nb-NO')}
                </span>
              )}
              <Button onClick={fetchRules} disabled={isLoading} className="bg-primary text-primary-foreground" size="sm">
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {isLoading ? "Henter..." : "Oppdater"}
              </Button>
            </div>
          </div>
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
                  <Select value={portFilter} onValueChange={setPortFilter}>
                    <SelectTrigger className="w-[140px] bg-muted border-border">
                      <SelectValue placeholder="Port" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      <SelectItem value="all">Alle porter</SelectItem>
                      {uniquePorts.map(p => (
                        <SelectItem key={p} value={p!}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-[160px] bg-muted border-border">
                      <SelectValue placeholder="Kilde" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      <SelectItem value="all">Alle kilder</SelectItem>
                      {uniqueSources.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={destinationFilter} onValueChange={setDestinationFilter}>
                    <SelectTrigger className="w-[160px] bg-muted border-border">
                      <SelectValue placeholder="Destinasjon" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50">
                      <SelectItem value="all">Alle destinasjoner</SelectItem>
                      {uniqueDestinations.map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Rules table */}
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <div className="max-h-[600px] overflow-auto">
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
                          <TableRow 
                            key={rule._id} 
                            className={`border-border hover:bg-muted/50 cursor-pointer ${!rule.enabled ? 'opacity-50' : ''}`}
                            onClick={() => setSelectedRule(rule)}
                          >
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
                              {getSourceDisplay(rule)}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground max-w-[150px]">
                              {getDestDisplay(rule)}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">
                              {rule.dst_port || '-'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
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

      {/* Rule Detail Dialog */}
      <Dialog open={!!selectedRule} onOpenChange={(open) => !open && setSelectedRule(null)}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              {selectedRule?.name}
            </DialogTitle>
            <DialogDescription>
              Regeldetaljer fra UDM Pro
            </DialogDescription>
          </DialogHeader>
          {selectedRule && (() => {
            const srcLabel = getSourceDisplay(selectedRule);
            const dstLabel = getDestDisplay(selectedRule);
            const proto = selectedRule.protocol === 'all' ? 'Alle' : selectedRule.protocol?.toUpperCase();
            const port = selectedRule.dst_port || 'Alle';
            const actionLabel = selectedRule.action?.toUpperCase();
            const isBlock = selectedRule.action === 'drop' || selectedRule.action === 'reject';
            const rulesetLabel = rulesetLabels[selectedRule.ruleset] || selectedRule.ruleset;

            return (
            <div className="space-y-4">
              {/* Visual Flow Chart */}
              <div className="bg-muted rounded-lg p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Trafikkflyt</p>
                <div className="flex items-center justify-between gap-2">
                  {/* Source */}
                  <div className="flex-1 bg-card rounded-lg p-3 border border-border text-center min-w-0">
                    <Server className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <p className="text-[10px] text-muted-foreground">Kilde</p>
                    <p className="text-xs font-mono font-medium text-foreground truncate" title={srcLabel}>{srcLabel}</p>
                    {selectedRule.src_port && (
                      <p className="text-[10px] font-mono text-muted-foreground">:{selectedRule.src_port}</p>
                    )}
                  </div>

                  {/* Arrow + Protocol */}
                  <div className="flex flex-col items-center gap-1 shrink-0 px-1">
                    <Badge variant="outline" className="text-[9px] font-mono">{proto}</Badge>
                    <div className="flex items-center gap-0.5">
                      <div className="w-6 h-px bg-muted-foreground" />
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <Badge variant="outline" className="text-[9px] font-mono">{rulesetLabel}</Badge>
                  </div>

                  {/* Action */}
                  <div className={`shrink-0 rounded-lg p-3 border text-center ${
                    isBlock 
                      ? 'bg-destructive/10 border-destructive/30' 
                      : 'bg-success/10 border-success/30'
                  }`}>
                    {isBlock ? (
                      <XCircle className="h-5 w-5 mx-auto mb-1 text-destructive" />
                    ) : (
                      <CheckCircle className="h-5 w-5 mx-auto mb-1 text-success" />
                    )}
                    <p className={`text-xs font-bold ${isBlock ? 'text-destructive' : 'text-success'}`}>
                      {actionLabel}
                    </p>
                  </div>

                  {/* Arrow to dest (only if accept) */}
                  {!isBlock && (
                    <>
                      <div className="flex items-center gap-0.5 shrink-0 px-1">
                        <div className="w-6 h-px bg-muted-foreground" />
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 bg-card rounded-lg p-3 border border-border text-center min-w-0">
                        <Globe className="h-5 w-5 mx-auto mb-1 text-primary" />
                        <p className="text-[10px] text-muted-foreground">Destinasjon</p>
                        <p className="text-xs font-mono font-medium text-foreground truncate" title={dstLabel}>{dstLabel}</p>
                        {selectedRule.dst_port && (
                          <p className="text-[10px] font-mono text-muted-foreground">:{selectedRule.dst_port}</p>
                        )}
                      </div>
                    </>
                  )}
                  {isBlock && (
                    <>
                      <div className="flex items-center gap-0.5 shrink-0 px-1">
                        <div className="w-6 h-px bg-muted-foreground/30 border-dashed" />
                        <XCircle className="h-3 w-3 text-muted-foreground/40" />
                      </div>
                      <div className="flex-1 bg-card rounded-lg p-3 border border-border text-center min-w-0 opacity-40">
                        <Globe className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                        <p className="text-[10px] text-muted-foreground">Destinasjon</p>
                        <p className="text-xs font-mono font-medium text-muted-foreground truncate" title={dstLabel}>{dstLabel}</p>
                        {selectedRule.dst_port && (
                          <p className="text-[10px] font-mono text-muted-foreground">:{selectedRule.dst_port}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Status row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                  <Badge className={selectedRule.enabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}>
                    {selectedRule.enabled ? 'Aktiv' : 'Deaktivert'}
                  </Badge>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Handling</p>
                  <Badge className={isBlock ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}>
                    {actionLabel}
                  </Badge>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">IP-versjon</p>
                  <span className="text-sm font-mono text-foreground">{selectedRule.ip_version?.toUpperCase() || 'Both'}</span>
                </div>
              </div>

              {/* Description */}
              {selectedRule.description && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Beskrivelse</p>
                  <p className="text-sm text-foreground">{selectedRule.description}</p>
                </div>
              )}

              {/* Source Zone section */}
              <div className="bg-muted rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Kilde (Source Zone)</p>
                <div className="space-y-1.5">
                  {[
                    { label: 'Sone', value: selectedRule.src_zone ? selectedRule.src_zone.charAt(0).toUpperCase() + selectedRule.src_zone.slice(1) : '-' },
                    { label: 'Type', value: selectedRule.src_type ? selectedRule.src_type.charAt(0).toUpperCase() + selectedRule.src_type.slice(1) : 'Any' },
                    { label: 'Adresse/Gruppe', value: srcLabel },
                    { label: 'MAC', value: selectedRule.src_mac_address || '-' },
                    { label: 'Port', value: selectedRule.src_port || 'Any' },
                    { label: 'Port-type', value: selectedRule.src_port_type ? selectedRule.src_port_type.charAt(0).toUpperCase() + selectedRule.src_port_type.slice(1) : '-' },
                    { label: 'Nettverkskonfig', value: selectedRule.src_networkconf_id || '-' },
                    { label: 'Nettverkstype', value: selectedRule.src_networkconf_type || '-' },
                  ].filter(item => item.value !== '-').map(item => (
                    <div key={item.label} className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <span className="text-xs font-mono text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Destination Zone section */}
              <div className="bg-muted rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Destinasjon (Destination Zone)</p>
                <div className="space-y-1.5">
                  {[
                    { label: 'Sone', value: selectedRule.dst_zone ? selectedRule.dst_zone.charAt(0).toUpperCase() + selectedRule.dst_zone.slice(1) : '-' },
                    { label: 'Type', value: selectedRule.dst_type ? selectedRule.dst_type.charAt(0).toUpperCase() + selectedRule.dst_type.slice(1) : 'Any' },
                    { label: 'Adresse/Gruppe', value: dstLabel },
                    { label: 'App', value: selectedRule.dst_app_id || '-' },
                    { label: 'Domene', value: selectedRule.dst_domain || '-' },
                    { label: 'Region', value: selectedRule.dst_region || '-' },
                    { label: 'Port', value: selectedRule.dst_port || 'Any' },
                    { label: 'Port-type', value: selectedRule.dst_port_type ? selectedRule.dst_port_type.charAt(0).toUpperCase() + selectedRule.dst_port_type.slice(1) : '-' },
                    { label: 'Nettverkskonfig', value: selectedRule.dst_networkconf_id || '-' },
                    { label: 'Nettverkstype', value: selectedRule.dst_networkconf_type || '-' },
                  ].filter(item => item.value !== '-').map(item => (
                    <div key={item.label} className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <span className="text-xs font-mono text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Protocol & Rule details */}
              <div className="bg-muted rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Protokoll & Regel</p>
                <div className="space-y-1.5">
                  {[
                    { label: 'Regel-indeks', value: selectedRule.rule_index?.toString() ?? '-' },
                    { label: 'Ruleset', value: rulesetLabel },
                    { label: 'Protokoll', value: proto },
                    { label: 'Protokoll-unntak', value: selectedRule.protocol_match_excepted ? 'Ja' : '-' },
                    { label: 'Policy-type', value: selectedRule.policy_type ? selectedRule.policy_type.charAt(0).toUpperCase() + selectedRule.policy_type.slice(1) : '-' },
                    { label: 'Preferanse', value: selectedRule.setting_preference || '-' },
                    { label: 'ID', value: selectedRule._id },
                  ].filter(item => item.value !== '-').map(item => (
                    <div key={item.label} className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <span className="text-xs font-mono text-foreground max-w-[60%] text-right truncate" title={item.value}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Connection state */}
              {(selectedRule.state_established || selectedRule.state_related || selectedRule.state_new || selectedRule.state_invalid) && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Connection State</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRule.state_established && <Badge variant="outline" className="text-[10px]">Established</Badge>}
                    {selectedRule.state_related && <Badge variant="outline" className="text-[10px]">Related</Badge>}
                    {selectedRule.state_new && <Badge variant="outline" className="text-[10px]">New</Badge>}
                    {selectedRule.state_invalid && <Badge variant="outline" className="text-[10px]">Invalid</Badge>}
                  </div>
                </div>
              )}

              {/* Options: IPsec, Logging, Schedule */}
              <div className="bg-muted rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Alternativer</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  <Badge variant="outline" className={`text-[10px] ${selectedRule.ipsec && selectedRule.ipsec !== 'not-set' ? 'bg-primary/10 text-primary' : ''}`}>
                    IPsec: {selectedRule.ipsec && selectedRule.ipsec !== 'not-set' ? selectedRule.ipsec : 'Av'}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] ${selectedRule.logging ? 'bg-primary/10 text-primary' : ''}`}>
                    Syslog: {selectedRule.logging ? 'Aktiv' : 'Av'}
                  </Badge>
                </div>
                {selectedRule.schedule && (
                  <div className="space-y-1 mt-2 pt-2 border-t border-border/50">
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Tidsplan</span>
                      <span className="text-xs font-mono text-foreground">{selectedRule.schedule.charAt(0).toUpperCase() + selectedRule.schedule.slice(1)}</span>
                    </div>
                    {selectedRule.schedule_start && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">Tidsrom</span>
                        <span className="text-xs font-mono text-foreground">{selectedRule.schedule_start} – {selectedRule.schedule_end || '∞'}</span>
                      </div>
                    )}
                    {selectedRule.schedule_days?.length && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">Dager</span>
                        <span className="text-xs font-mono text-foreground">{selectedRule.schedule_days.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Firewall groups with members */}
              {(selectedRule.src_firewallgroup_ids?.length || selectedRule.dst_firewallgroup_ids?.length) ? (
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Brannmurgrupper</p>
                  <div className="space-y-1.5">
                    {selectedRule.src_firewallgroup_ids?.map(id => {
                      const group = firewallGroups.find(g => g._id === id);
                      return (
                        <div key={id} className="text-xs">
                          <span className="text-muted-foreground">Kilde: </span>
                          <span className="font-mono text-foreground">{group?.name || id}</span>
                          {group && <span className="text-muted-foreground ml-1">({group.group_members.join(', ')})</span>}
                        </div>
                      );
                    })}
                    {selectedRule.dst_firewallgroup_ids?.map(id => {
                      const group = firewallGroups.find(g => g._id === id);
                      return (
                        <div key={id} className="text-xs">
                          <span className="text-muted-foreground">Dest: </span>
                          <span className="font-mono text-foreground">{group?.name || id}</span>
                          {group && <span className="text-muted-foreground ml-1">({group.group_members.join(', ')})</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
