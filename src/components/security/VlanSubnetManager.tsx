import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Network, Plus, Trash2, Wifi, Server, Shield, Monitor, Pencil } from "lucide-react";

export interface VlanSubnet {
  id: string;
  name: string;
  vlanId: number;
  subnet: string;
  description: string;
  icon: "network" | "wifi" | "server" | "shield" | "monitor";
}

const defaultVlans: VlanSubnet[] = [];

const iconMap = {
  network: Network,
  wifi: Wifi,
  server: Server,
  shield: Shield,
  monitor: Monitor,
};

interface VlanSubnetManagerProps {
  selectedVlans: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  onScanTargetChange: (target: string) => void;
  onVlansChange?: (vlans: VlanSubnet[]) => void;
}

export function VlanSubnetManager({ selectedVlans, onSelectionChange, onScanTargetChange, onVlansChange }: VlanSubnetManagerProps) {
  const [vlans, setVlans] = useState<VlanSubnet[]>(defaultVlans);

  // Notify parent of vlan changes
  const updateVlans = (newVlans: VlanSubnet[]) => {
    setVlans(newVlans);
    onVlansChange?.(newVlans);
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVlan, setEditingVlan] = useState<VlanSubnet | null>(null);
  const [newName, setNewName] = useState("");
  const [newVlanId, setNewVlanId] = useState("");
  const [newSubnet, setNewSubnet] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIcon, setNewIcon] = useState<VlanSubnet["icon"]>("network");

  // Emit initial vlans on mount
  useEffect(() => {
    onVlansChange?.(vlans);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVlan = (id: string) => {
    const updated = selectedVlans.includes(id)
      ? selectedVlans.filter(v => v !== id)
      : [...selectedVlans, id];
    onSelectionChange(updated);

    // Update scan target to combined subnets
    const selectedSubnets = vlans
      .filter(v => updated.includes(v.id))
      .map(v => v.subnet);
    if (selectedSubnets.length === 1) {
      onScanTargetChange(selectedSubnets[0]);
    } else if (selectedSubnets.length > 1) {
      onScanTargetChange(selectedSubnets.join(" "));
    }
  };

  const selectAll = () => {
    const allIds = vlans.map(v => v.id);
    onSelectionChange(allIds);
    onScanTargetChange(vlans.map(v => v.subnet).join(" "));
  };

  const selectNone = () => {
    onSelectionChange([]);
  };

  const openAddDialog = () => {
    setEditingVlan(null);
    setNewName("");
    setNewVlanId("");
    setNewSubnet("");
    setNewDescription("");
    setNewIcon("network");
    setDialogOpen(true);
  };

  const openEditDialog = (vlan: VlanSubnet) => {
    setEditingVlan(vlan);
    setNewName(vlan.name);
    setNewVlanId(String(vlan.vlanId));
    setNewSubnet(vlan.subnet);
    setNewDescription(vlan.description);
    setNewIcon(vlan.icon);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!newName || !newVlanId || !newSubnet) return;

    if (editingVlan) {
      const updated = vlans.map(v => v.id === editingVlan.id ? {
        ...v,
        name: newName,
        vlanId: parseInt(newVlanId),
        subnet: newSubnet,
        description: newDescription,
        icon: newIcon,
      } : v);
      updateVlans(updated);
    } else {
      const newVlan: VlanSubnet = {
        id: Date.now().toString(),
        name: newName,
        vlanId: parseInt(newVlanId),
        subnet: newSubnet,
        description: newDescription,
        icon: newIcon,
      };
      updateVlans([...vlans, newVlan]);
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    updateVlans(vlans.filter(v => v.id !== id));
    onSelectionChange(selectedVlans.filter(v => v !== id));
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="border-b border-border py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            VLAN / Subnet
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectAll}>
              Velg alle
            </Button>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectNone}>
              Fjern alle
            </Button>
            <Button variant="outline" size="sm" className="h-7" onClick={openAddDialog}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Legg til
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <ScrollArea className="max-h-[280px]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {vlans.map((vlan) => {
              const IconComp = iconMap[vlan.icon];
              const isSelected = selectedVlans.includes(vlan.id);
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
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleVlan(vlan.id)}
                    className="pointer-events-none"
                  />
                  <div className={`rounded-md p-1.5 ${isSelected ? "bg-primary/10" : "bg-muted"}`}>
                    <IconComp className={`h-3.5 w-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{vlan.name}</span>
                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4">
                        VLAN {vlan.vlanId}
                      </Badge>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground">{vlan.subnet}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => { e.stopPropagation(); openEditDialog(vlan); }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(vlan.id); }}
                    >
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
                <Label>Navn</Label>
                <Input
                  placeholder="F.eks. IoT-nettverk"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>VLAN ID</Label>
                <Input
                  type="number"
                  placeholder="F.eks. 20"
                  value={newVlanId}
                  onChange={(e) => setNewVlanId(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subnet (CIDR)</Label>
              <Input
                placeholder="F.eks. 192.168.20.0/24"
                value={newSubnet}
                onChange={(e) => setNewSubnet(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Beskrivelse</Label>
              <Input
                placeholder="Kort beskrivelse av nettverket"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ikon</Label>
              <Select value={newIcon} onValueChange={(v) => setNewIcon(v as VlanSubnet["icon"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="network">Nettverk</SelectItem>
                  <SelectItem value="wifi">WiFi</SelectItem>
                  <SelectItem value="server">Server</SelectItem>
                  <SelectItem value="shield">Sikkerhet</SelectItem>
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
    </Card>
  );
}
