import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Shield, Loader2, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, ArrowRight, ArrowDown, Globe, Server
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
  src_firewallgroup_ids?: string[];
  dst_firewallgroup_ids?: string[];
  dst_port?: string;
  src_address?: string;
  dst_address?: string;
  rule_index?: number;
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
}

export function FirewallAuditPanel() {
  const { token } = useAuth();
  const [firewallRules, setFirewallRules] = useState<FirewallRule[]>([]);
  const [portForwards, setPortForwards] = useState<PortForward[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const enabledForwards = portForwards.filter(pf => pf.enabled);
  const disabledForwards = portForwards.filter(pf => !pf.enabled);

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Brannmur-audit (UDM Pro)
            </CardTitle>
            <Button onClick={fetchRules} disabled={isLoading} className="bg-primary text-primary-foreground" size="sm">
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {isLoading ? "Henter..." : "Hent regler"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Henter brannmurregler og port forwards fra UniFi Dream Machine Pro for sikkerhetsgjennomgang.
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

      {/* Port Forwards - Security Risk */}
      {portForwards.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border">
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-warning" />
              Port Forwards ({portForwards.length})
              {enabledForwards.length > 0 && (
                <Badge className="bg-warning/10 text-warning ml-2">{enabledForwards.length} aktive</Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Port forwards eksponerer interne tjenester mot internett. Hver aktiv forward bør ha en god grunn.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[300px]">
              <div className="divide-y divide-border">
                {portForwards.map((pf) => (
                  <div key={pf._id} className={`p-3 flex items-center gap-3 ${!pf.enabled ? 'opacity-50' : ''}`}>
                    {pf.enabled ? (
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-sm">{pf.name}</span>
                        <Badge variant={pf.enabled ? "default" : "secondary"} className="text-[10px]">
                          {pf.enabled ? "Aktiv" : "Deaktivert"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Globe className="h-3 w-3" />
                        <span className="font-mono">:{pf.dst_port}</span>
                        <ArrowRight className="h-3 w-3 mx-1" />
                        <Server className="h-3 w-3" />
                        <span className="font-mono">{pf.fwd}:{pf.fwd_port}</span>
                        <Badge variant="outline" className="text-[10px] ml-1">{pf.proto?.toUpperCase()}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Firewall Rules */}
      {firewallRules.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Brannmurregler ({firewallRules.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[400px]">
              <div className="divide-y divide-border">
                {firewallRules.map((rule) => (
                  <div key={rule._id} className={`p-3 flex items-center gap-3 ${!rule.enabled ? 'opacity-50' : ''}`}>
                    {rule.action === 'drop' || rule.action === 'reject' ? (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-success shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground text-sm">{rule.name}</span>
                        <Badge variant={rule.enabled ? "default" : "secondary"} className="text-[10px]">
                          {rule.enabled ? "Aktiv" : "Deaktivert"}
                        </Badge>
                        <Badge 
                          className={`text-[10px] ${rule.action === 'drop' || rule.action === 'reject' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}
                        >
                          {rule.action?.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-mono">{rule.ruleset}</Badge>
                        {rule.protocol && rule.protocol !== 'all' && (
                          <Badge variant="outline" className="text-[10px] font-mono">{rule.protocol?.toUpperCase()}</Badge>
                        )}
                        {rule.dst_port && (
                          <span className="text-[10px] font-mono text-muted-foreground">Port: {rule.dst_port}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
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
