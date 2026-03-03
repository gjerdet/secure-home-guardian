import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ShieldAlert, Search, Loader2, ExternalLink, RefreshCw,
  AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp
} from "lucide-react";
import type { NmapHostDetail } from "./NmapHostDetailDialog";

interface CveEntry {
  id: string;
  description: string;
  cvssV3?: number;
  cvssV2?: number;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
  published: string;
  modified: string;
  references: string[];
}

interface ServiceCveResult {
  host: string;
  hostname: string;
  port: number;
  service: string;
  version: string;
  query: string;
  cves: CveEntry[];
  loading: boolean;
  error?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "text-destructive",
  HIGH:     "text-destructive",
  MEDIUM:   "text-warning",
  LOW:      "text-primary",
  NONE:     "text-muted-foreground",
};

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: "bg-destructive/20 text-destructive border-destructive/30",
  HIGH:     "bg-destructive/10 text-destructive border-destructive/20",
  MEDIUM:   "bg-warning/20 text-warning border-warning/30",
  LOW:      "bg-primary/10 text-primary border-primary/20",
  NONE:     "bg-muted text-muted-foreground border-border",
};

function cvssToSeverity(score?: number): CveEntry["severity"] {
  if (!score) return "NONE";
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  if (score > 0)   return "LOW";
  return "NONE";
}

async function fetchCvesForKeyword(keyword: string): Promise<CveEntry[]> {
  const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(keyword)}&resultsPerPage=10`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NVD API ${res.status}`);
  const data = await res.json();
  const items: any[] = data.vulnerabilities || [];

  return items.map((item: any) => {
    const cve = item.cve;
    const desc = cve.descriptions?.find((d: any) => d.lang === "en")?.value || "—";
    const metrics = cve.metrics;
    let cvssV3: number | undefined;
    let cvssV2: number | undefined;

    const v31 = metrics?.cvssMetricV31?.[0]?.cvssData;
    const v30 = metrics?.cvssMetricV30?.[0]?.cvssData;
    const v2  = metrics?.cvssMetricV2?.[0]?.cvssData;

    if (v31) cvssV3 = v31.baseScore;
    else if (v30) cvssV3 = v30.baseScore;
    if (v2) cvssV2 = v2.baseScore;

    const score = cvssV3 ?? cvssV2;
    const severity = cvssToSeverity(score);

    const refs = (cve.references || []).slice(0, 3).map((r: any) => r.url);

    return {
      id: cve.id,
      description: desc,
      cvssV3,
      cvssV2,
      severity,
      published: cve.published?.split("T")[0] || "",
      modified: cve.lastModified?.split("T")[0] || "",
      references: refs,
    };
  });
}

interface Props {
  hosts: NmapHostDetail[];
}

export function CveLookupPanel({ hosts }: Props) {
  const [results, setResults] = useState<ServiceCveResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<CveEntry[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Gather services with version info from nmap results
  const servicesWithVersions = hosts.flatMap(h =>
    (h.services || [])
      .filter(s => s.version && s.version.trim() && s.version !== "—")
      .map(s => ({
        host: h.host,
        hostname: h.hostname,
        port: s.port,
        service: s.service,
        version: s.version!,
        query: `${s.service} ${s.version}`.trim(),
      }))
  );

  const handleScanAll = useCallback(async () => {
    if (servicesWithVersions.length === 0) {
      toast.error("Ingen tenester med versjonsinformasjon funne. Køyr Nmap med -sV (service version detection) fyrst.");
      return;
    }

    setIsRunning(true);
    setProgress(0);
    const newResults: ServiceCveResult[] = servicesWithVersions.map(s => ({
      ...s,
      cves: [],
      loading: true,
    }));
    setResults(newResults);

    for (let i = 0; i < servicesWithVersions.length; i++) {
      const svc = servicesWithVersions[i];
      try {
        // Rate limit: NVD allows ~5 req/s without API key
        if (i > 0) await new Promise(r => setTimeout(r, 700));
        const cves = await fetchCvesForKeyword(svc.query);
        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, cves, loading: false } : r
        ));
      } catch (err) {
        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, loading: false, error: "NVD-feil" } : r
        ));
      }
      setProgress(Math.round(((i + 1) / servicesWithVersions.length) * 100));
    }

    setIsRunning(false);
    toast.success("CVE-oppslag fullført");
  }, [servicesWithVersions]);

  const handleManualSearch = async () => {
    if (!manualQuery.trim()) return;
    setManualLoading(true);
    setManualResults([]);
    try {
      const cves = await fetchCvesForKeyword(manualQuery.trim());
      setManualResults(cves);
      if (cves.length === 0) toast.info("Ingen CVE-ar funne for dette søket");
    } catch {
      toast.error("Kunne ikkje kontakte NVD API. Prøv igjen.");
    }
    setManualLoading(false);
  };

  const toggleExpand = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalCves = results.reduce((sum, r) => sum + r.cves.length, 0);
  const criticalCount = results.reduce((sum, r) =>
    sum + r.cves.filter(c => c.severity === "CRITICAL" || c.severity === "HIGH").length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              CVE-database-oppslag
              <Badge variant="secondary" className="text-[10px]">NVD / NIST</Badge>
            </CardTitle>
            <Button
              size="sm"
              onClick={handleScanAll}
              disabled={isRunning || servicesWithVersions.length === 0}
            >
              {isRunning ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Slår opp... ({progress}%)</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-1" />Sjekk {servicesWithVersions.length} tenester</>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Kryssjekkar versjonsinformasjon frå Nmap-skanningar mot{" "}
            <span className="text-foreground font-medium">NVD (National Vulnerability Database)</span> for å
            finne kjende CVE-ar. Krev Nmap med <code className="bg-muted px-1 rounded text-[10px]">-sV</code> service version detection.
          </p>

          {isRunning && (
            <div className="space-y-1">
              <Progress value={progress} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground text-right">{progress}% fullført</p>
            </div>
          )}

          {servicesWithVersions.length === 0 && (
            <Alert className="border-warning/30 bg-warning/5">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-xs">
                Ingen Nmap-resultat med versjonsinformasjon funne. Køyr ein <strong>Deep scan</strong> (med -sV) for å oppdage tenestversjonar.
              </AlertDescription>
            </Alert>
          )}

          {/* Summary stats */}
          {results.length > 0 && !isRunning && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xl font-mono font-bold text-foreground">{totalCves}</p>
                <p className="text-[10px] text-muted-foreground">CVE-ar funne</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xl font-mono font-bold text-destructive">{criticalCount}</p>
                <p className="text-[10px] text-muted-foreground">Kritisk/Høg</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xl font-mono font-bold text-primary">{results.filter(r => r.cves.length > 0).length}</p>
                <p className="text-[10px] text-muted-foreground">Sårbare tenester</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results table */}
      {results.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border py-3">
            <CardTitle className="text-xs text-muted-foreground">Resultat per teneste</CardTitle>
          </CardHeader>
          <ScrollArea className="h-96">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-xs">Host</TableHead>
                  <TableHead className="text-xs">Teneste / Versjon</TableHead>
                  <TableHead className="text-xs">Port</TableHead>
                  <TableHead className="text-xs">CVE-ar</TableHead>
                  <TableHead className="text-xs">Høgaste CVSS</TableHead>
                  <TableHead className="text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r, i) => {
                  const key = `${r.host}-${r.port}`;
                  const isExpanded = expandedRows.has(key);
                  const maxCvss = r.cves.reduce((max, c) => Math.max(max, c.cvssV3 ?? c.cvssV2 ?? 0), 0);
                  const maxSev = cvssToSeverity(maxCvss || undefined);

                  return [
                    <TableRow
                      key={key}
                      className="border-border hover:bg-muted/30 cursor-pointer"
                      onClick={() => r.cves.length > 0 && toggleExpand(key)}
                    >
                      <TableCell className="font-mono text-xs">
                        {r.hostname !== "unknown" ? r.hostname : r.host}
                        <br />
                        <span className="text-muted-foreground">{r.host}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <p className="font-medium">{r.service}</p>
                        <p className="text-muted-foreground text-[10px]">{r.version}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-[10px]">{r.port}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.loading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : r.error ? (
                          <span className="text-destructive text-xs">{r.error}</span>
                        ) : r.cves.length === 0 ? (
                          <span className="flex items-center gap-1 text-success text-xs">
                            <CheckCircle className="h-3.5 w-3.5" /> Ingen
                          </span>
                        ) : (
                          <span className={`font-mono font-bold text-sm ${SEVERITY_COLOR[maxSev]}`}>
                            {r.cves.length}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!r.loading && maxCvss > 0 && (
                          <Badge className={`text-[10px] border ${SEVERITY_BADGE[maxSev]}`}>
                            {maxCvss.toFixed(1)} {maxSev}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.cves.length > 0 && (
                          isExpanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                    </TableRow>,

                    // Expanded CVE list
                    isExpanded && (
                      <TableRow key={`${key}-expanded`} className="bg-muted/20">
                        <TableCell colSpan={6} className="p-0">
                          <div className="p-3 space-y-2">
                            {r.cves.map(cve => (
                              <div key={cve.id} className="border border-border rounded-lg p-3 space-y-1 bg-background">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <a
                                    href={`https://nvd.nist.gov/vuln/detail/${cve.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {cve.id}
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                  <Badge className={`text-[10px] border ${SEVERITY_BADGE[cve.severity]}`}>
                                    {cve.severity}
                                  </Badge>
                                  {(cve.cvssV3 || cve.cvssV2) && (
                                    <span className="text-xs text-muted-foreground font-mono">
                                      CVSS {cve.cvssV3?.toFixed(1) ?? cve.cvssV2?.toFixed(1)}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground ml-auto">
                                    Publisert: {cve.published}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">{cve.description}</p>
                                {cve.references.length > 0 && (
                                  <div className="flex gap-2 flex-wrap">
                                    {cve.references.map((ref, ri) => (
                                      <a
                                        key={ri}
                                        href={ref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        Referanse {ri + 1} <ExternalLink className="h-2.5 w-2.5" />
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ),
                  ];
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      )}

      {/* Manual search */}
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Manuelt CVE-søk
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="t.d. 'Apache 2.4.49' eller 'OpenSSH 8.2'"
              value={manualQuery}
              onChange={e => setManualQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleManualSearch()}
              className="text-xs h-8"
            />
            <Button size="sm" onClick={handleManualSearch} disabled={manualLoading}>
              {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {manualResults.length > 0 && (
            <ScrollArea className="h-72">
              <div className="space-y-2">
                {manualResults.map(cve => (
                  <div key={cve.id} className="border border-border rounded-lg p-3 space-y-1.5 hover:bg-muted/20">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${cve.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        {cve.id} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      <Badge className={`text-[10px] border ${SEVERITY_BADGE[cve.severity]}`}>
                        {cve.severity}
                      </Badge>
                      {(cve.cvssV3 || cve.cvssV2) && (
                        <span className="text-xs text-muted-foreground font-mono">
                          CVSS {cve.cvssV3?.toFixed(1) ?? cve.cvssV2?.toFixed(1)}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">{cve.published}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{cve.description}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
