import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, Loader2, RefreshCw, Search, ArrowUpDown, AlertTriangle, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE, fetchJsonSafely } from "@/lib/api";

interface IdsAlert {
  id: string;
  timestamp: string;
  severity: string;
  category: string;
  signature: string;
  srcIp: string;
  srcPort: number;
  dstIp: string;
  dstPort: number;
  action: string;
  proto: string;
  appProto: string;
  interface: string;
}

type SortField = 'timestamp' | 'severity' | 'category' | 'srcIp' | 'dstIp' | 'dstPort';
type SortDir = 'asc' | 'desc';

const severityBadge: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-warning/10 text-warning",
  low: "bg-primary/10 text-primary",
  info: "bg-muted text-muted-foreground",
};

export function IdsIpsPanel() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [alerts, setAlerts] = useState<IdsAlert[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      const res = await fetchJsonSafely(`${API_BASE}/api/unifi/ids-alerts`, { headers: authHeaders });
      if (res.ok && res.data) {
        const data = res.data as any;
        setAlerts(data.alerts || []);
        setTotal(data.total || 0);
        toast.success(`Hentet ${(data.alerts || []).length} IDS/IPS-varsler`);
      } else {
        toast.error(res.error || "Kunne ikke hente IDS/IPS-varsler");
      }
    } catch {
      toast.error("Kunne ikke koble til backend");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAlerts(); }, []);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    let result = [...alerts];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.signature?.toLowerCase().includes(q) ||
        a.category?.toLowerCase().includes(q) ||
        a.srcIp?.includes(q) ||
        a.dstIp?.includes(q)
      );
    }
    if (severityFilter !== "all") {
      result = result.filter(a => a.severity === severityFilter);
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'timestamp': cmp = (a.timestamp || '').localeCompare(b.timestamp || ''); break;
        case 'severity': {
          const order: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
          cmp = (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
          break;
        }
        case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break;
        case 'srcIp': cmp = (a.srcIp || '').localeCompare(b.srcIp || ''); break;
        case 'dstIp': cmp = (a.dstIp || '').localeCompare(b.dstIp || ''); break;
        case 'dstPort': cmp = (a.dstPort || 0) - (b.dstPort || 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [alerts, searchQuery, severityFilter, sortField, sortDir]);

  const stats = {
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    low: alerts.filter(a => a.severity === 'low').length,
    info: alerts.filter(a => a.severity === 'info').length,
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-primary' : 'text-muted-foreground/50'}`} />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">IDS/IPS Varsler</CardTitle>
              <Badge variant="outline" className="text-[10px]">{total} totalt</Badge>
            </div>
            <Button onClick={fetchAlerts} disabled={isLoading} className="bg-primary text-primary-foreground" size="sm">
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {isLoading ? "Henter..." : "Oppdater"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Stats */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-mono font-bold text-destructive">{stats.high}</p>
              <p className="text-[10px] text-muted-foreground">Høy</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-mono font-bold text-warning">{stats.medium}</p>
              <p className="text-[10px] text-muted-foreground">Medium</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-mono font-bold text-primary">{stats.low}</p>
              <p className="text-[10px] text-muted-foreground">Lav</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-mono font-bold text-muted-foreground">{stats.info}</p>
              <p className="text-[10px] text-muted-foreground">Info</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Søk i signatur, IP, kategori..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[140px] h-8 text-sm">
                <SelectValue placeholder="Alvorlighet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="high">Høy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Lav</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-card border-border">
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <SortableHeader field="timestamp">Tidspunkt</SortableHeader>
                <SortableHeader field="severity">Alvorlighet</SortableHeader>
                <SortableHeader field="category">Kategori</SortableHeader>
                <TableHead>Signatur</TableHead>
                <SortableHeader field="srcIp">Kilde IP</SortableHeader>
                <SortableHeader field="dstIp">Mål IP</SortableHeader>
                <SortableHeader field="dstPort">Port</SortableHeader>
                <TableHead>Proto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    {isLoading ? "Henter varsler..." : alerts.length === 0 ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle className="h-8 w-8 text-success" />
                        <p>Ingen IDS/IPS-varsler funnet</p>
                        <p className="text-xs">Dette kan bety at IDS/IPS ikke er aktivert, eller at det ikke er noen hendelser</p>
                      </div>
                    ) : "Ingen treff for filteret"}
                  </TableCell>
                </TableRow>
              ) : filtered.map(alert => (
                <TableRow key={alert.id} className="border-border hover:bg-muted/30">
                  <TableCell className="text-xs font-mono whitespace-nowrap">
                    {alert.timestamp ? new Date(alert.timestamp).toLocaleString('nb-NO') : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={severityBadge[alert.severity] || severityBadge.info}>
                      {alert.severity === 'high' && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {alert.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[120px] truncate">{alert.category}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate" title={alert.signature}>{alert.signature}</TableCell>
                  <TableCell className="text-xs font-mono">{alert.srcIp}{alert.srcPort ? `:${alert.srcPort}` : ''}</TableCell>
                  <TableCell className="text-xs font-mono">{alert.dstIp}</TableCell>
                  <TableCell className="text-xs font-mono">{alert.dstPort || '—'}</TableCell>
                  <TableCell className="text-xs">{alert.proto}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
}
