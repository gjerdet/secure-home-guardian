import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Network, Plus, Trash2, Wifi, Server, Shield, Monitor, Pencil, Activity, CheckCircle2, XCircle, AlertCircle, Loader2, ScanSearch } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export interface VlanSubnet {
  id: string;
  name: string;
  vlanId: number;
  subnet: string;
  description: string;
  icon: "network" | "wifi" | "server" | "shield" | "monitor";
}

const STORAGE_KEY = 'netguard_vlans';

function loadStoredVlans(): VlanSubnet[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveVlans(vlans: VlanSubnet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vlans));
}

const defaultVlans: VlanSubnet[] = loadStoredVlans();

const iconMap = {
  network: Network,
  wifi: Wifi,
  server: Server,
  shield: Shield,
  monitor: Monitor,
};

interface ProbeResult {
  subnet: string;
  gateway: { ip: string; reachable: boolean; latency: number | null; loss: number };
  hosts: Array<{ ip: string; reachable: boolean; latency: number | null; loss: number }>;
  summary: {
    total: number;
    reachable: number;
    avgLatency: number | null;
    status: "up" | "gateway-only" | "down";
  };
}

interface VlanProbeState {
  loading: boolean;
  result?: ProbeResult;
  error?: string;
}

interface VlanSubnetManagerProps {
  selectedVlans: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  onScanTargetChange: (target: string) => void;
  onVlansChange?: (vlans: VlanSubnet[]) => void;
}

export function VlanSubnetManager({ selectedVlans, onSelectionChange, onScanTargetChange, onVlansChange }: VlanSubnetManagerProps) {
  const { token } = useAuth();
  const [vlans, setVlans] = useState<VlanSubnet[]>(defaultVlans);
  const [probeStates, setProbeStates] = useState<Record<string, VlanProbeState>>({});
  const [probeDialogVlan, setProbeDialogVlan] = useState<VlanSubnet | null>(null);

  const updateVlans = (newVlans: VlanSubnet[]) => {
    setVlans(newVlans);
    saveVlans(newVlans);
    onVlansChange?.(newVlans);
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVlan, setEditingVlan] = useState<VlanSubnet | null>(null);
  const [newName, setNewName] = useState("");
  const [newVlanId, setNewVlanId] = useState("");
  const [newSubnet, setNewSubnet] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIcon, setNewIcon] = useState<VlanSubnet["icon"]>("network");

  useEffect(() => {
    onVlansChange?.(vlans);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVlan = (id: string) => {
    const updated = selectedVlans.includes(id)
      ? selectedVlans.filter(v => v !== id)
      : [...selectedVlans, id];
    onSelectionChange(updated);
    const selectedSubnets = vlans.filter(v => updated.includes(v.id)).map(v => v.subnet);
    if (selectedSubnets.length === 1) onScanTargetChange(selectedSubnets[0]);
    else if (selectedSubnets.length > 1) onScanTargetChange(selectedSubnets.join(" "));
  };

  const selectAll = () => {
    onSelectionChange(vlans.map(v => v.id));
    onScanTargetChange(vlans.map(v => v.subnet).join(" "));
  };

  const selectNone = () => onSelectionChange([]);

  const openAddDialog = () => {
    setEditingVlan(null);
    setNewName(""); setNewVlanId(""); setNewSubnet(""); setNewDescription(""); setNewIcon("network");
    setDialogOpen(true);
  };

  const openEditDialog = (vlan: VlanSubnet) => {
    setEditingVlan(vlan);
    setNewName(vlan.name); setNewVlanId(String(vlan.vlanId)); setNewSubnet(vlan.subnet);
    setNewDescription(vlan.description); setNewIcon(vlan.icon);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!newName || !newVlanId || !newSubnet) return;
    if (editingVlan) {
      updateVlans(vlans.map(v => v.id === editingVlan.id
        ? { ...v, name: newName, vlanId: parseInt(newVlanId), subnet: newSubnet, description: newDescription, icon: newIcon }
        : v
      ));
    } else {
      updateVlans([...vlans, { id: Date.now().toString(), name: newName, vlanId: parseInt(newVlanId), subnet: newSubnet, description: newDescription, icon: newIcon }]);
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    updateVlans(vlans.filter(v => v.id !== id));
    onSelectionChange(selectedVlans.filter(v => v !== id));
  };

  // --- Probe logic ---
  const runProbe = async (vlan: VlanSubnet) => {
    setProbeStates(prev => ({ ...prev, [vlan.id]: { loading: true } }));
    try {
      const resp = await fetch(`${API_BASE}/api/vlan/probe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subnet: vlan.subnet }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data: ProbeResult = await resp.json();
      setProbeStates(prev => ({ ...prev, [vlan.id]: { loading: false, result: data } }));
    } catch (err) {
      setProbeStates(prev => ({ ...prev, [vlan.id]: { loading: false, error: (err as Error).message } }));
    }
  };

  const probeStatusIcon = (id: string) => {
    const ps = probeStates[id];
    if (!ps) return null;
    if (ps.loading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
    if (ps.error) return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    const s = ps.result?.summary.status;
    if (s === "up") return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
    if (s === "gateway-only") return <AlertCircle className="h-3.5 w-3.5 text-warning" />;
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  };

  const probeLatencyBadge = (id: string) => {
    const ps = probeStates[id];
    if (!ps || ps.loading || ps.error || !ps.result) return null;
    const { avgLatency, reachable, total } = ps.result.summary;
    return (
      <span className="text-[10px] font-mono text-muted-foreground">
        {reachable}/{total} · {avgLatency != null ? `${avgLatency}ms` : "—"}
      </span>
    );
  };

  return (
    <TooltipProvider>
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Network className="h-4 w-4 text-primary" />
              VLAN / Subnet
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectAll}>Velg alle</Button>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectNone}>Fjern alle</Button>
              <Button variant="outline" size="sm" className="h-7" onClick={openAddDialog}>
                <Plus className="h-3.5 w-3.5 mr-1" />Legg til
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          <ScrollArea className="max-h-[320px]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {vlans.map((vlan) => {
                const IconComp = iconMap[vlan.icon];
                const isSelected = selectedVlans.includes(vlan.id);
                const ps = probeStates[vlan.id];
                return (
                  <div
                    key={vlan.id}
                    className={`group flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30 bg-muted/20"
                    }`}
                    onClick={() => toggleVlan(vlan.id)}
                  >
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleVlan(vlan.id)} className="pointer-events-none" />
                    <div className={`rounded-md p-1.5 ${isSelected ? "bg-primary/10" : "bg-muted"}`}>
                      <IconComp className={`h-3.5 w-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{vlan.name}</span>
                        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4">VLAN {vlan.vlanId}</Badge>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground">{vlan.subnet}</p>
                      {/* Probe inline status */}
                      {ps && !ps.loading && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {probeStatusIcon(vlan.id)}
                          {probeLatencyBadge(vlan.id)}
                          {ps.error && <span className="text-[10px] text-destructive truncate max-w-[120px]">{ps.error}</span>}
                        </div>
                      )}
                      {ps?.loading && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">Prober...</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => { runProbe(vlan); setProbeDialogVlan(vlan); }}
                            disabled={ps?.loading}
                          >
                            {ps?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Probe VLAN</TooltipContent>
                      </Tooltip>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditDialog(vlan)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDelete(vlan.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {selectedVlans.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                <span className="text-primary font-medium">{selectedVlans.length}</span> VLAN(s) valgt — Scan-mål:{" "}
                <span className="font-mono text-foreground">
                  {vlans.filter(v => selectedVlans.includes(v.id)).map(v => v.subnet).join(", ")}
                </span>
              </p>
            </div>
          )}
        </CardContent>

        {/* Add/Edit VLAN Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingVlan ? "Rediger VLAN" : "Legg til VLAN / Subnet"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Namn</Label>
                  <Input placeholder="F.eks. IoT-nettverk" value={newName} onChange={e => setNewName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>VLAN ID</Label>
                  <Input type="number" placeholder="F.eks. 20" value={newVlanId} onChange={e => setNewVlanId(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subnet (CIDR)</Label>
                <Input placeholder="F.eks. 192.168.20.0/24" value={newSubnet} onChange={e => setNewSubnet(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Beskriving</Label>
                <Input placeholder="Kort beskriving av nettverket" value={newDescription} onChange={e => setNewDescription(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Ikon</Label>
                <Select value={newIcon} onValueChange={v => setNewIcon(v as VlanSubnet["icon"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="network">Nettverk</SelectItem>
                    <SelectItem value="wifi">WiFi</SelectItem>
                    <SelectItem value="server">Server</SelectItem>
                    <SelectItem value="shield">Sikkerheit</SelectItem>
                    <SelectItem value="monitor">Klient</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
              <Button onClick={handleSave} disabled={!newName || !newVlanId || !newSubnet}>
                {editingVlan ? "Lagre" : "Legg til"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Probe result dialog */}
        <Dialog open={!!probeDialogVlan} onOpenChange={open => !open && setProbeDialogVlan(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Probe — {probeDialogVlan?.name} ({probeDialogVlan?.subnet})
              </DialogTitle>
            </DialogHeader>
            {probeDialogVlan && (() => {
              const ps = probeStates[probeDialogVlan.id];
              if (!ps || ps.loading) return (
                <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Prober nettverket...</span>
                </div>
              );
              if (ps.error) return <p className="text-destructive text-sm py-4">{ps.error}</p>;
              const r = ps.result!;
              const statusColors: Record<string, string> = {
                up: "text-success bg-success/10 border-success/20",
                "gateway-only": "text-warning bg-warning/10 border-warning/20",
                down: "text-destructive bg-destructive/10 border-destructive/20",
              };
              const statusLabel: Record<string, string> = {
                up: "Oppe",
                "gateway-only": "Kun gateway",
                down: "Nede",
              };
              return (
                <div className="space-y-4 py-2">
                  {/* Summary */}
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium ${statusColors[r.summary.status]}`}>
                    <span>{statusLabel[r.summary.status]}</span>
                    <span className="font-mono text-xs">
                      {r.summary.reachable}/{r.summary.total} einheiter nådd · {r.summary.avgLatency != null ? `${r.summary.avgLatency}ms snitt` : "—"}
                    </span>
                  </div>

                  {/* Host list */}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Einheiter</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      {r.hosts.map((h, i) => (
                        <div key={h.ip} className={`flex items-center justify-between px-3 py-2 text-sm ${i > 0 ? "border-t border-border" : ""}`}>
                          <div className="flex items-center gap-2">
                            {h.reachable
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                              : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                            }
                            <span className="font-mono text-foreground">{h.ip}</span>
                            {h.ip === r.gateway.ip && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">Gateway</Badge>
                            )}
                          </div>
                          <span className="font-mono text-xs text-muted-foreground">
                            {h.reachable ? (h.latency != null ? `${h.latency}ms` : "OK") : `${h.loss}% loss`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <Button variant="outline" size="sm" onClick={() => runProbe(probeDialogVlan)}>
                      <Activity className="h-3.5 w-3.5 mr-1.5" />
                      Prøv igjen
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setProbeDialogVlan(null)}>Lukk</Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </Card>
    </TooltipProvider>
  );
}
