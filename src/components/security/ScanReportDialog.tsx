import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Download, FileText, Search, Filter, AlertTriangle, 
  CheckCircle, Info, Server, Clock, Shield, ExternalLink, Loader2
} from "lucide-react";

interface Vulnerability {
  id: string;
  name: string;
  severity: string;
  host: string;
  port: number;
  cvss: number;
  solution: string;
  description?: string;
  cve?: string[];
}

interface ScanReport {
  id: string;
  name: string;
  target: string;
  lastRun: string;
  status: string;
  progress?: number;
  comment?: string;
  high: number;
  medium: number;
  low: number;
  info: number;
  vulnerabilities?: Vulnerability[];
}

interface ScanReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scan: ScanReport | null;
  vulnerabilities: Vulnerability[];
  openvasUrl?: string;
  isLoading?: boolean;
  onVulnClick?: (vuln: Vulnerability) => void;
}

const severityColors = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/80 text-destructive-foreground",
  medium: "bg-warning text-warning-foreground",
  low: "bg-primary/80 text-primary-foreground",
  info: "bg-muted text-muted-foreground",
};

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function ScanReportDialog({ open, onOpenChange, scan, vulnerabilities, openvasUrl, isLoading, onVulnClick }: ScanReportDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("severity");

  // Filter vulnerabilities for this scan's target
  const scanVulnerabilities = useMemo(() => {
    if (!scan) return [];
    const target = scan.target || scan.comment || '';
    return vulnerabilities.filter(v => {
      const host = v.host || '';
      return host.includes(target.split('/')[0]) || target.includes(host);
    });
  }, [scan, vulnerabilities]);

  // Apply filters and sorting
  const filteredVulnerabilities = useMemo(() => {
    let result = [...scanVulnerabilities];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(v => 
        v.name.toLowerCase().includes(query) ||
        v.host.toLowerCase().includes(query) ||
        v.solution?.toLowerCase().includes(query) ||
        (v.cve ? v.cve.join(' ').toLowerCase().includes(query) : false)
      );
    }

    // Severity filter
    if (severityFilter !== "all") {
      result = result.filter(v => v.severity === severityFilter);
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case "severity":
          return (severityOrder[a.severity as keyof typeof severityOrder] || 5) - 
                 (severityOrder[b.severity as keyof typeof severityOrder] || 5);
        case "cvss":
          return b.cvss - a.cvss;
        case "host":
          return a.host.localeCompare(b.host);
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    return result;
  }, [scanVulnerabilities, searchQuery, severityFilter, sortBy]);

  // Export functions
  const exportToCSV = () => {
    if (!scan) return;
    
    const headers = ["Severity", "CVSS", "Name", "Host", "Port", "Solution", "CVE"];
    const rows = filteredVulnerabilities.map(v => [
      v.severity,
      v.cvss.toString(),
      `"${v.name.replace(/"/g, '""')}"`,
      v.host,
      v.port.toString(),
      `"${(v.solution || '').replace(/"/g, '""')}"`,
      v.cve || ""
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadFile(csv, `${scan.name}-report.csv`, "text/csv");
  };

  const exportToJSON = () => {
    if (!scan) return;
    
    const report = {
      scan: {
        id: scan.id,
        name: scan.name,
        target: scan.target,
        lastRun: scan.lastRun,
        status: scan.status,
        summary: {
          high: scan.high,
          medium: scan.medium,
          low: scan.low,
          info: scan.info
        }
      },
      vulnerabilities: filteredVulnerabilities,
      exportDate: new Date().toISOString()
    };

    downloadFile(JSON.stringify(report, null, 2), `${scan.name}-report.json`, "application/json");
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!scan) return null;

  const safeHigh = scan.high || 0;
  const safeMedium = scan.medium || 0;
  const safeLow = scan.low || 0;
  const safeInfo = scan.info || 0;
  const riskScore = Math.max(0, 100 - safeHigh * 10 - safeMedium * 3 - safeLow);

  const stats = {
    high: filteredVulnerabilities.filter(v => v.severity === "high").length,
    medium: filteredVulnerabilities.filter(v => v.severity === "medium").length,
    low: filteredVulnerabilities.filter(v => v.severity === "low").length,
    info: filteredVulnerabilities.filter(v => v.severity === "info").length,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Scan Rapport: {scan.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Oversikt</TabsTrigger>
            <TabsTrigger value="vulnerabilities">Sårbarheter ({filteredVulnerabilities.length})</TabsTrigger>
            <TabsTrigger value="export">Eksporter</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Mål:</span>
                  <span className="font-mono">{scan.target || scan.comment || '–'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="outline" className={
                    scan.status === 'Running' ? 'bg-warning/10 text-warning'
                    : scan.status === 'Done' ? 'bg-success/10 text-success'
                    : 'bg-muted text-muted-foreground'
                  }>
                    {scan.status === 'Running' ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : scan.status === 'Done' ? (
                      <CheckCircle className="h-3 w-3 mr-1" />
                    ) : null}
                    {scan.status}
                  </Badge>
                </div>
                {scan.status === 'Running' && scan.progress !== undefined && scan.progress > 0 && (
                  <div className="text-sm text-muted-foreground">
                    Framdrift: {scan.progress}%
                  </div>
                )}
                {openvasUrl && (
                  <a 
                    href={openvasUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Opne i OpenVAS GSA
                  </a>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-lg bg-destructive/10 text-center">
                  <p className="text-2xl font-bold text-destructive">{safeHigh}</p>
                  <p className="text-xs text-muted-foreground">Høy</p>
                </div>
                <div className="p-3 rounded-lg bg-warning/10 text-center">
                  <p className="text-2xl font-bold text-warning">{safeMedium}</p>
                  <p className="text-xs text-muted-foreground">Medium</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/10 text-center">
                  <p className="text-2xl font-bold text-primary">{safeLow}</p>
                  <p className="text-xs text-muted-foreground">Lav</p>
                </div>
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{safeInfo}</p>
                  <p className="text-xs text-muted-foreground">Info</p>
                </div>
              </div>
            </div>

            {/* Risk Score */}
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Risiko-score</span>
                <span className="text-2xl font-bold text-success">
                  {riskScore}%
                </span>
              </div>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-success transition-all"
                  style={{ width: `${riskScore}%` }}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="vulnerabilities" className="space-y-4">
            {/* Filters */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Søk i sårbarheter..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="high">Høy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Lav</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sorter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="severity">Alvorlighet</SelectItem>
                  <SelectItem value="cvss">CVSS Score</SelectItem>
                  <SelectItem value="host">Host</SelectItem>
                  <SelectItem value="name">Navn</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Stats bar */}
            <div className="flex gap-2 text-xs">
              <Badge variant="destructive">{stats.high} Høy</Badge>
              <Badge className="bg-warning text-warning-foreground">{stats.medium} Medium</Badge>
              <Badge className="bg-primary text-primary-foreground">{stats.low} Lav</Badge>
              <Badge variant="secondary">{stats.info} Info</Badge>
            </div>

            {/* Vulnerability list */}
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                  <p className="mt-2 text-sm text-muted-foreground">Hentar rapport frå OpenVAS...</p>
                </div>
              ) : filteredVulnerabilities.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Info className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Ingen sårbarheter funnet med valgte filtre.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredVulnerabilities.map((vuln) => (
                    <div 
                      key={vuln.id} 
                      className={`p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors ${onVulnClick ? 'cursor-pointer' : ''}`}
                      onClick={() => onVulnClick?.(vuln)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={severityColors[vuln.severity as keyof typeof severityColors]}>
                            {vuln.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="font-mono text-xs">
                            CVSS: {vuln.cvss}
                          </Badge>
                          {vuln.cve && (
                            <Badge variant="secondary" className="font-mono text-xs">
                              {vuln.cve}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          {vuln.host}:{vuln.port}
                        </span>
                      </div>
                      <p className="font-medium text-sm mb-1">{vuln.name}</p>
                      {vuln.solution && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Løsning:</span> {vuln.solution}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="export" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Eksporter rapporten i ønsket format. Aktive filtre vil bli anvendt på eksporten.
            </p>
            
            <div className="grid gap-3">
              <Button onClick={exportToCSV} variant="outline" className="justify-start">
                <Download className="h-4 w-4 mr-2" />
                Eksporter som CSV
                <span className="ml-auto text-xs text-muted-foreground">
                  Åpnes i Excel/regneark
                </span>
              </Button>
              <Button onClick={exportToJSON} variant="outline" className="justify-start">
                <Download className="h-4 w-4 mr-2" />
                Eksporter som JSON
                <span className="ml-auto text-xs text-muted-foreground">
                  Strukturert data-format
                </span>
              </Button>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              {filteredVulnerabilities.length} sårbarheter vil bli inkludert basert på aktive filtre.
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
