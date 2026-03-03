import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ZoomIn, ZoomOut, Maximize2, Network } from "lucide-react";
import type { NmapHostDetail } from "./NmapHostDetailDialog";

interface TopoNode {
  id: string;
  label: string;
  type: "gateway" | "server" | "client" | "ap" | "switch" | "unknown";
  ip: string;
  ports: number[];
  os?: string;
  x: number;
  y: number;
  vlan?: string;
  isSelected?: boolean;
}

interface TopoEdge {
  from: string;
  to: string;
  type: "ethernet" | "wifi" | "gateway";
}

const NODE_COLORS: Record<string, string> = {
  gateway: "hsl(var(--primary))",
  server:  "hsl(var(--destructive))",
  ap:      "hsl(var(--warning))",
  switch:  "hsl(var(--primary))",
  client:  "hsl(var(--muted-foreground))",
  unknown: "hsl(var(--muted-foreground))",
};

const NODE_RADIUS = 22;

function guessType(host: NmapHostDetail): TopoNode["type"] {
  const ports = host.ports || [];
  const os = (host.os || "").toLowerCase();
  const name = (host.hostname || "").toLowerCase();

  if (name.includes("gateway") || name.includes("router") || name.includes("udm")) return "gateway";
  if (os.includes("router") || os.includes("firewall")) return "gateway";
  if (ports.includes(80) && ports.includes(443) && ports.length <= 5) return "gateway";
  if (name.includes("ap-") || name.includes("unifi") || os.includes("openwrt")) return "ap";
  if (name.includes("switch") || name.includes("sw-")) return "switch";
  if (ports.some(p => [22, 80, 443, 8080, 3306, 5432, 6379, 27017].includes(p))) return "server";
  return "client";
}

function layoutNodes(nodes: Omit<TopoNode, "x" | "y">[], width: number, height: number): TopoNode[] {
  const cx = width / 2;
  const cy = height / 2;

  // Group by type
  const gateway = nodes.filter(n => n.type === "gateway");
  const servers  = nodes.filter(n => n.type === "server");
  const aps      = nodes.filter(n => n.type === "ap" || n.type === "switch");
  const clients  = nodes.filter(n => n.type === "client" || n.type === "unknown");

  const placed: TopoNode[] = [];
  const placeRing = (group: typeof nodes, radius: number, startAngle = 0) => {
    group.forEach((n, i) => {
      const angle = startAngle + (i / Math.max(group.length, 1)) * Math.PI * 2;
      placed.push({ ...n, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    });
  };

  // Gateway at center
  gateway.forEach(n => placed.push({ ...n, x: cx, y: cy }));
  placeRing(aps,     80,  -Math.PI / 2);
  placeRing(servers, 160, -Math.PI / 4);
  placeRing(clients, 240, 0);

  return placed;
}

interface Props {
  hosts: NmapHostDetail[];
  unifiClients?: any[];
}

export function NetworkTopologyMap({ hosts, unifiClients = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<TopoNode[]>([]);
  const [edges, setEdges] = useState<TopoEdge[]>([]);
  const [selected, setSelected] = useState<TopoNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const draggingNode = useRef<string | null>(null);
  const [, forceRender] = useState(0);

  const W = 800;
  const H = 500;

  // Build graph from nmap hosts + UniFi data
  const buildGraph = useCallback(() => {
    if (hosts.length === 0) return;

    const rawNodes: Omit<TopoNode, "x" | "y">[] = hosts.map(h => ({
      id: h.host,
      label: h.hostname !== "unknown" ? h.hostname : h.host,
      type: guessType(h),
      ip: h.host,
      ports: h.ports,
      os: h.os,
      vlan: h.vlan,
    }));

    // Add AP nodes from UniFi clients
    const apNodes = new Map<string, Omit<TopoNode, "x" | "y">>();
    unifiClients.forEach(c => {
      if (c.ap_mac && !rawNodes.find(n => n.ip === c.ap_mac)) {
        const apId = c.ap_mac;
        if (!apNodes.has(apId)) {
          apNodes.set(apId, {
            id: apId,
            label: c.ap_name || c.ap_mac,
            type: "ap",
            ip: c.ap_mac,
            ports: [],
          });
        }
      }
    });
    const allNodes = [...rawNodes, ...apNodes.values()];
    const laidOut = layoutNodes(allNodes, W, H);
    setNodes(laidOut);

    // Build edges — connect all clients to the gateway node
    const gw = laidOut.find(n => n.type === "gateway");
    const newEdges: TopoEdge[] = [];

    laidOut.forEach(n => {
      if (n.type === "gateway") return;
      // Try to find an AP/switch between client and gateway
      const uc = unifiClients.find(c => c.ip === n.ip || c.mac === n.id);
      if (uc) {
        if (uc.is_wired) {
          // Wired: client → (switch) → gateway
          if (uc.sw_mac) {
            const sw = laidOut.find(x => x.id === uc.sw_mac);
            if (sw) {
              newEdges.push({ from: n.id, to: sw.id, type: "ethernet" });
              if (gw) newEdges.push({ from: sw.id, to: gw.id, type: "ethernet" });
              return;
            }
          }
          if (gw) newEdges.push({ from: n.id, to: gw.id, type: "ethernet" });
        } else if (uc.ap_mac) {
          // WiFi: client → AP → gateway
          const ap = laidOut.find(x => x.id === uc.ap_mac);
          if (ap) {
            newEdges.push({ from: n.id, to: ap.id, type: "wifi" });
            if (gw) newEdges.push({ from: ap.id, to: gw.id, type: "ethernet" });
            return;
          }
        }
      }
      // Fallback: connect to gateway
      if (gw) {
        newEdges.push({ from: n.id, to: gw.id, type: "ethernet" });
      }
    });

    // Deduplicate edges
    const seen = new Set<string>();
    const dedupedEdges = newEdges.filter(e => {
      const key = [e.from, e.to].sort().join("--");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    setEdges(dedupedEdges);
  }, [hosts, unifiClients]);

  useEffect(() => { buildGraph(); }, [buildGraph]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw edges
    edges.forEach(edge => {
      const fromNode = nodes.find(n => n.id === edge.from);
      const toNode   = nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;

      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.lineTo(toNode.x, toNode.y);

      if (edge.type === "wifi") {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "hsla(var(--warning) / 0.5)";
        ctx.lineWidth = 1.5;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = "hsla(var(--border) / 1)";
        ctx.lineWidth = 1.5;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw nodes
    nodes.forEach(node => {
      const color = NODE_COLORS[node.type];
      const isSelected = selected?.id === node.id;

      // Glow for selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, NODE_RADIUS + 6, 0, Math.PI * 2);
        ctx.fillStyle = `${color}33`;
        ctx.fill();
      }

      // Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? color : `${color}88`;
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.fill();
      ctx.stroke();

      // Icon letter
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const letter = node.type === "gateway" ? "GW" :
                     node.type === "server"  ? "SV" :
                     node.type === "ap"      ? "AP" :
                     node.type === "switch"  ? "SW" : "CL";
      ctx.fillText(letter, node.x, node.y);

      // Label below
      ctx.fillStyle = isSelected ? "#fff" : "hsla(var(--foreground) / 0.8)";
      ctx.font = "10px sans-serif";
      ctx.fillText(
        node.label.length > 14 ? node.label.slice(0, 13) + "…" : node.label,
        node.x,
        node.y + NODE_RADIUS + 12
      );
    });

    ctx.restore();
  }, [nodes, edges, selected, zoom, pan, forceRender]);

  // Mouse interactions
  const getNodeAt = (canvasX: number, canvasY: number) => {
    const wx = (canvasX - pan.x) / zoom;
    const wy = (canvasY - pan.y) / zoom;
    return nodes.find(n => Math.hypot(n.x - wx, n.y - wy) <= NODE_RADIUS);
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const hit = getNodeAt(cx, cy);
    if (hit) {
      draggingNode.current = hit.id;
      setSelected(hit);
    } else {
      isDragging.current = true;
      lastMouse.current = { x: cx, y: cy };
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (draggingNode.current) {
      const wx = (cx - pan.x) / zoom;
      const wy = (cy - pan.y) / zoom;
      setNodes(prev => prev.map(n =>
        n.id === draggingNode.current ? { ...n, x: wx, y: wy } : n
      ));
    } else if (isDragging.current) {
      const dx = cx - lastMouse.current.x;
      const dy = cy - lastMouse.current.y;
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      lastMouse.current = { x: cx, y: cy };
    }
  };

  const onMouseUp = () => {
    isDragging.current = false;
    draggingNode.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(3, Math.max(0.3, z - e.deltaY * 0.001)));
  };

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); setSelected(null); };

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Network className="h-4 w-4 text-primary" />
              Nettverkstopologi
              <Badge variant="secondary" className="text-[10px]">{nodes.length} noder</Badge>
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setZoom(z => Math.min(3, z + 0.2))}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.3, z - 0.2))}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={reset}>
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={buildGraph}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Oppdater
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {hosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Network className="h-10 w-10 opacity-30 mb-3" />
              <p className="text-sm">Køyr ein Nmap-skanning fyrst</p>
              <p className="text-xs mt-1">Topologikartet byggast automatisk frå skanresultat</p>
            </div>
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={W}
                height={H}
                className="w-full cursor-grab active:cursor-grabbing rounded-b-lg"
                style={{ background: "hsl(var(--muted) / 0.3)" }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onWheel={onWheel}
              />
              {/* Legend */}
              <div className="absolute bottom-3 left-3 bg-background/80 backdrop-blur border border-border rounded-lg p-2 space-y-1">
                {[
                  { type: "gateway", label: "Gateway / Router" },
                  { type: "server",  label: "Server" },
                  { type: "ap",      label: "Access Point / Switch" },
                  { type: "client",  label: "Klient" },
                ].map(({ type, label }) => (
                  <div key={type} className="flex items-center gap-2 text-[10px]">
                    <span className="w-3 h-3 rounded-full block" style={{ background: NODE_COLORS[type] }} />
                    {label}
                  </div>
                ))}
                <div className="border-t border-border pt-1 mt-1">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="w-4 border-t-2 border-dashed" style={{ borderColor: "hsl(var(--warning))" }} />
                    WiFi
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="w-4 border-t-2" style={{ borderColor: "hsl(var(--muted-foreground))" }} />
                    Kabel
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected node detail */}
      {selected && (
        <Card className="bg-card border-border animate-fade-in">
          <CardHeader className="border-b border-border py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: NODE_COLORS[selected.type] }} />
                {selected.label}
                <Badge variant="secondary" className="text-[10px]">{selected.type}</Badge>
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>✕</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-[10px] text-muted-foreground">IP-adresse</p>
                <p className="font-mono text-xs">{selected.ip}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">OS</p>
                <p className="text-xs">{selected.os || "Ukjend"}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Opne portar</p>
                <p className="font-mono text-xs">{selected.ports.length > 0 ? selected.ports.slice(0, 8).join(", ") + (selected.ports.length > 8 ? "…" : "") : "—"}</p>
              </div>
              {selected.vlan && (
                <div>
                  <p className="text-[10px] text-muted-foreground">VLAN</p>
                  <p className="text-xs">{selected.vlan}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
