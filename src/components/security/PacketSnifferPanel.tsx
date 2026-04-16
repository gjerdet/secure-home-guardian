import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Play, StopCircle, Loader2, Download, Trash2, Eye, Activity, ArrowUpDown, Filter, X } from "lucide-react";
import { API_BASE, fetchJsonSafely } from "@/lib/api";

interface Packet {
  id: number;
  timestamp: string;
  src: string;
  dst: string;
  proto: string;
  length: number;
  info: string;
  srcPort?: number;
  dstPort?: number;
}

interface SnifferSummary {
  totalPackets: number;
  totalBytes: number;
  duration: number;
  topSources: { ip: string; count: number }[];
  topDestinations: { ip: string; count: number }[];
  topProtocols: { proto: string; count: number }[];
  topPorts: { port: number; count: number }[];
}

type SortField = "id" | "timestamp" | "src" | "dst" | "proto" | "length" | "info";
type SortDir = "asc" | "desc";

const ALL_PROTOCOLS = ["TCP", "UDP", "DNS", "HTTP", "TLS", "ICMP", "ARP", "DHCP", "NTP", "OTHER"] as const;

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function protoColor(proto: string) {
  const p = proto?.toUpperCase();
  if (p === "TCP") return "bg-primary/20 text-primary border-primary/30";
  if (p === "UDP") return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
  if (p === "ICMP") return "bg-warning/20 text-warning border-warning/30";
  if (p === "ARP") return "bg-purple-500/20 text-purple-400 border-purple-500/30";
  if (p === "DNS") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (p === "HTTP") return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (p === "TLS") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (p === "DHCP") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  if (p === "NTP") return "bg-indigo-500/20 text-indigo-400 border-indigo-500/30";
  return "bg-muted text-muted-foreground";
}

export function PacketSnifferPanel() {
  const [iface, setIface] = useState("any");
  const [interfaces, setInterfaces] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [maxPackets, setMaxPackets] = useState(500);
  const [isCapturing, setIsCapturing] = useState(false);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [summary, setSummary] = useState<SnifferSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [activeProtoFilters, setActiveProtoFilters] = useState<Set<string>>(new Set());
  const [quickFilter, setQuickFilter] = useState<{ field: string; value: string } | null>(null);
  const [sortField, setSortField] = useState<SortField>("id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const packetIdRef = useRef(0);
  const authHeaders = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  // Live protocol counts for distribution bar
  const [protoCounts, setProtoCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchJsonSafely(`${API_BASE}/api/sniffer/interfaces`, { headers: authHeaders })
      .then((res) => {
        if (res.ok && Array.isArray(res.data)) setInterfaces(res.data);
      });
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [packets, autoScroll]);

  const startCapture = useCallback(() => {
    setPackets([]);
    setSummary(null);
    setShowSummary(false);
    setIsCapturing(true);
    setProtoCounts({});
    packetIdRef.current = 0;

    const params = new URLSearchParams({
      iface,
      max: String(maxPackets),
      token: localStorage.getItem("token") || "",
    });
    if (filter) params.set("filter", filter);

    const es = new EventSource(`${API_BASE}/api/sniffer/capture?${params}`);
    eventSourceRef.current = es;

    es.addEventListener("packet", (e) => {
      try {
        const pkt = JSON.parse(e.data);
        packetIdRef.current++;
        const newPkt = { ...pkt, id: packetIdRef.current };
        setPackets((prev) => {
          const next = [...prev, newPkt];
          return next.length > maxPackets ? next.slice(-maxPackets) : next;
        });
        setProtoCounts((prev) => ({
          ...prev,
          [pkt.proto]: (prev[pkt.proto] || 0) + 1,
        }));
      } catch {}
    });

    es.addEventListener("summary", (e) => {
      try {
        setSummary(JSON.parse(e.data));
        setShowSummary(true);
      } catch {}
    });

    es.addEventListener("error_msg", (e) => {
      toast.error(e.data || "Fangstfeil");
    });

    es.addEventListener("done", () => {
      setIsCapturing(false);
      es.close();
    });

    es.onerror = () => {
      setIsCapturing(false);
      es.close();
    };
  }, [iface, filter, maxPackets]);

  const stopCapture = async () => {
    eventSourceRef.current?.close();
    await fetchJsonSafely(`${API_BASE}/api/sniffer/stop`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
    });
    setIsCapturing(false);
  };

  const downloadPcap = () => {
    const blob = new Blob(
      [packets.map((p) => `${p.timestamp} ${p.src}${p.srcPort ? ':' + p.srcPort : ''} -> ${p.dst}${p.dstPort ? ':' + p.dstPort : ''} ${p.proto} ${p.length} ${p.info}`).join("\n")],
      { type: "text/plain" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `capture-${new Date().toISOString().slice(0, 19)}.txt`;
    a.click();
  };

  const toggleProtoFilter = (proto: string) => {
    setActiveProtoFilters((prev) => {
      const next = new Set(prev);
      if (next.has(proto)) next.delete(proto);
      else next.add(proto);
      return next;
    });
  };

  const applyQuickFilter = (field: string, value: string) => {
    if (quickFilter?.field === field && quickFilter?.value === value) {
      setQuickFilter(null);
    } else {
      setQuickFilter({ field, value });
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = packets;

    // Protocol filter
    if (activeProtoFilters.size > 0) {
      result = result.filter((p) => activeProtoFilters.has(p.proto));
    }

    // Quick filter (click-to-filter)
    if (quickFilter) {
      result = result.filter((p) => {
        if (quickFilter.field === "src") return p.src === quickFilter.value;
        if (quickFilter.field === "dst") return p.dst === quickFilter.value;
        if (quickFilter.field === "proto") return p.proto === quickFilter.value;
        if (quickFilter.field === "srcPort") return String(p.srcPort) === quickFilter.value;
        if (quickFilter.field === "dstPort") return String(p.dstPort) === quickFilter.value;
        return true;
      });
    }

    // Text search
    if (searchFilter) {
      const s = searchFilter.toLowerCase();
      result = result.filter(
        (p) =>
          p.src?.toLowerCase().includes(s) ||
          p.dst?.toLowerCase().includes(s) ||
          p.proto?.toLowerCase().includes(s) ||
          p.info?.toLowerCase().includes(s) ||
          String(p.srcPort).includes(s) ||
          String(p.dstPort).includes(s)
      );
    }

    // Sort
    const dir = sortDir === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });

    return result;
  }, [packets, activeProtoFilters, quickFilter, searchFilter, sortField, sortDir]);

  // Protocol distribution for bar
  const totalProtoCount = useMemo(() => Object.values(protoCounts).reduce((s, c) => s + c, 0), [protoCounts]);
  const protoDistribution = useMemo(() => {
    if (totalProtoCount === 0) return [];
    return Object.entries(protoCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([proto, count]) => ({
        proto,
        count,
        pct: (count / totalProtoCount) * 100,
      }));
  }, [protoCounts, totalProtoCount]);

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="text-xs cursor-pointer hover:text-foreground select-none"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortField === field ? "text-primary" : "text-muted-foreground/40"}`} />
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      {/* Config */}
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Packet Sniffer (tcpdump)
            {isCapturing && (
              <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px] animate-pulse">
                FANGST AKTIV
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Interface</Label>
              <Select value={iface} onValueChange={setIface} disabled={isCapturing}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">any (alle)</SelectItem>
                  {interfaces.map((i) => (
                    <SelectItem key={i} value={i}>{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">BPF-filter</Label>
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="t.d. port 80 or icmp"
                className="h-8 text-xs"
                disabled={isCapturing}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Maks pakker</Label>
              <Input
                type="number"
                value={maxPackets}
                onChange={(e) => setMaxPackets(Number(e.target.value) || 500)}
                className="h-8 text-xs"
                disabled={isCapturing}
              />
            </div>
            <div className="flex items-end gap-2">
              {!isCapturing ? (
                <Button size="sm" onClick={startCapture} className="h-8">
                  <Play className="h-3.5 w-3.5 mr-1" /> Start fangst
                </Button>
              ) : (
                <Button size="sm" variant="destructive" onClick={stopCapture} className="h-8">
                  <StopCircle className="h-3.5 w-3.5 mr-1" /> Stopp
                </Button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Bruker <code className="bg-muted px-1 rounded">tcpdump -v</code> på serveren. Krev root/sudo-tilgang. BPF-filter er valfritt (t.d. <code className="bg-muted px-1 rounded">host 192.168.1.1</code>, <code className="bg-muted px-1 rounded">port 443</code>).
          </p>
        </CardContent>
      </Card>

      {/* Protocol quick-filter buttons */}
      {packets.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
          {ALL_PROTOCOLS.map((proto) => {
            const count = protoCounts[proto] || 0;
            if (count === 0 && !activeProtoFilters.has(proto)) return null;
            const isActive = activeProtoFilters.has(proto);
            return (
              <Button
                key={proto}
                size="sm"
                variant={isActive ? "default" : "outline"}
                className={`h-6 text-[10px] px-2 ${!isActive ? protoColor(proto) : ""}`}
                onClick={() => toggleProtoFilter(proto)}
              >
                {proto} ({count})
              </Button>
            );
          })}
          {activeProtoFilters.size > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2"
              onClick={() => setActiveProtoFilters(new Set())}
            >
              <X className="h-3 w-3 mr-0.5" /> Nullstill
            </Button>
          )}
        </div>
      )}

      {/* Active quick-filter indicator */}
      {quickFilter && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            <Filter className="h-3 w-3 mr-1" />
            Filtrer: {quickFilter.field} = {quickFilter.value}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-2"
            onClick={() => setQuickFilter(null)}
          >
            <X className="h-3 w-3 mr-0.5" /> Fjern
          </Button>
        </div>
      )}

      {/* Protocol distribution bar */}
      {packets.length > 0 && protoDistribution.length > 0 && (
        <div className="space-y-1">
          <div className="flex h-3 rounded-sm overflow-hidden border border-border">
            {protoDistribution.map(({ proto, pct }) => (
              <div
                key={proto}
                className={`${protoColor(proto)} transition-all duration-300`}
                style={{ width: `${pct}%` }}
                title={`${proto}: ${pct.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="flex gap-3 flex-wrap">
            {protoDistribution.map(({ proto, count, pct }) => (
              <span key={proto} className="text-[10px] text-muted-foreground">
                <span className={`inline-block w-2 h-2 rounded-full ${protoColor(proto).split(" ")[0]} mr-1`} />
                {proto} {pct.toFixed(0)}% ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats bar */}
      {packets.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs">
              <Activity className="h-3 w-3 mr-1" /> {packets.length} pakker
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {formatBytes(packets.reduce((s, p) => s + (p.length || 0), 0))}
            </Badge>
            {filteredAndSorted.length !== packets.length && (
              <Badge variant="outline" className="text-xs">
                Viser {filteredAndSorted.length} av {packets.length}
              </Badge>
            )}
            {isCapturing && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Søk i pakker..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="h-7 text-xs w-48"
            />
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={downloadPcap}>
              <Download className="h-3 w-3 mr-1" /> Eksporter
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setPackets([]);
                setSummary(null);
                setShowSummary(false);
                setProtoCounts({});
                setQuickFilter(null);
                setActiveProtoFilters(new Set());
              }}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Tøm
            </Button>
            <Button
              size="sm"
              variant={autoScroll ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setAutoScroll(!autoScroll)}
            >
              Auto-scroll {autoScroll ? "på" : "av"}
            </Button>
            {summary && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setShowSummary(!showSummary)}
              >
                {showSummary ? "Vis pakker" : "Vis oppsummering"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Summary view */}
      {showSummary && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-mono font-bold text-primary">{summary.totalPackets.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Totalt pakker</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-mono font-bold text-foreground">{formatBytes(summary.totalBytes)}</p>
              <p className="text-xs text-muted-foreground">Totalt data</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-mono font-bold text-foreground">{summary.duration.toFixed(1)}s</p>
              <p className="text-xs text-muted-foreground">Varigheit</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-mono font-bold text-foreground">{summary.topProtocols.length}</p>
              <p className="text-xs text-muted-foreground">Protokollar</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="py-2 border-b border-border">
              <CardTitle className="text-xs text-muted-foreground">Topp kjelder</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {summary.topSources.map((s, i) => (
                <div
                  key={i}
                  className="flex justify-between py-1 text-xs cursor-pointer hover:bg-muted/30 px-1 rounded"
                  onClick={() => applyQuickFilter("src", s.ip)}
                >
                  <span className="font-mono truncate">{s.ip}</span>
                  <Badge variant="secondary" className="text-[10px]">{s.count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="py-2 border-b border-border">
              <CardTitle className="text-xs text-muted-foreground">Topp mål</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {summary.topDestinations.map((d, i) => (
                <div
                  key={i}
                  className="flex justify-between py-1 text-xs cursor-pointer hover:bg-muted/30 px-1 rounded"
                  onClick={() => applyQuickFilter("dst", d.ip)}
                >
                  <span className="font-mono truncate">{d.ip}</span>
                  <Badge variant="secondary" className="text-[10px]">{d.count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="py-2 border-b border-border">
              <CardTitle className="text-xs text-muted-foreground">Topp protokollar</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {summary.topProtocols.map((p, i) => (
                <div
                  key={i}
                  className="flex justify-between py-1 text-xs cursor-pointer hover:bg-muted/30 px-1 rounded"
                  onClick={() => toggleProtoFilter(p.proto)}
                >
                  <Badge className={`${protoColor(p.proto)} text-[10px]`}>{p.proto}</Badge>
                  <span className="font-mono">{p.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="py-2 border-b border-border">
              <CardTitle className="text-xs text-muted-foreground">Topp portar</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {summary.topPorts.map((p, i) => (
                <div key={i} className="flex justify-between py-1 text-xs">
                  <span className="font-mono">{p.port}</span>
                  <Badge variant="secondary" className="text-[10px]">{p.count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Packet table */}
      {!showSummary && packets.length > 0 && (
        <Card className="bg-card border-border">
          <div ref={scrollRef} className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <SortHeader field="id">#</SortHeader>
                  <SortHeader field="timestamp">Tid</SortHeader>
                  <SortHeader field="src">Kjelde</SortHeader>
                  <SortHeader field="dst">Mål</SortHeader>
                  <SortHeader field="proto">Proto</SortHeader>
                  <SortHeader field="length">Storleik</SortHeader>
                  <SortHeader field="info">Info</SortHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSorted.map((p) => (
                  <TableRow key={p.id} className="border-border hover:bg-muted/30 h-7">
                    <TableCell className="font-mono text-[10px] text-muted-foreground py-1">{p.id}</TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground py-1 whitespace-nowrap">
                      {p.timestamp}
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs py-1 cursor-pointer hover:text-primary hover:underline"
                      onClick={() => applyQuickFilter("src", p.src)}
                      title={`Filtrer på kjelde: ${p.src}`}
                    >
                      {p.src}{p.srcPort ? `:${p.srcPort}` : ""}
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs py-1 cursor-pointer hover:text-primary hover:underline"
                      onClick={() => applyQuickFilter("dst", p.dst)}
                      title={`Filtrer på mål: ${p.dst}`}
                    >
                      {p.dst}{p.dstPort ? `:${p.dstPort}` : ""}
                    </TableCell>
                    <TableCell className="py-1">
                      <Badge
                        className={`${protoColor(p.proto)} text-[10px] cursor-pointer`}
                        onClick={() => toggleProtoFilter(p.proto)}
                        title={`Filtrer på ${p.proto}`}
                      >
                        {p.proto}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] py-1">{p.length}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground py-1 truncate max-w-[400px]" title={p.info}>
                      {p.info}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {packets.length === 0 && !isCapturing && (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <Eye className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-sm text-muted-foreground">Trykk «Start fangst» for å fange pakker</p>
            <p className="text-xs text-muted-foreground mt-1">
              Brukar tcpdump — krev at backend køyrer med tilstrekkelege rettar
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
