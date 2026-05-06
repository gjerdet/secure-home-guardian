import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Network, Server, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE, fetchJsonSafely } from "@/lib/api";

interface UnifiNeighbor {
  source_device: string;
  source_model?: string;
  source_mac: string;
  port_idx: number;
  port_name: string;
  neighbor_name?: string | null;
  neighbor_chassis_id?: string | null;
  neighbor_port_id?: string | null;
  neighbor_port_desc?: string | null;
  neighbor_mgmt_ip?: string | null;
  neighbor_capabilities?: string | null;
  speed?: number;
  up?: boolean;
}

interface LocalNeighbor {
  local_iface: string;
  neighbor_name?: string | null;
  neighbor_descr?: string | null;
  neighbor_mgmt_ip?: string | null;
  neighbor_capabilities?: string | null;
  port_id?: string | null;
  port_descr?: string | null;
  vlan?: string | number | null;
}

interface LldpResponse {
  unifi: UnifiNeighbor[];
  local: LocalNeighbor[];
  errors: { unifi?: string; local?: string };
}

export function LldpNeighborsPanel() {
  const { token } = useAuth();
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [data, setData] = useState<LldpResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await fetchJsonSafely<LldpResponse>(`${API_BASE}/api/lldp/neighbors`, {
      headers: authHeaders,
    });
    if (res.ok && res.data) {
      setData(res.data);
    } else {
      setError(res.error || "Klarte ikkje hente LLDP-data");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedUnifi = useMemo(() => {
    const map = new Map<string, UnifiNeighbor[]>();
    (data?.unifi || []).forEach((n) => {
      const key = n.source_device || n.source_mac;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    });
    return Array.from(map.entries());
  }, [data]);

  return (
    <Card className="border-primary/20 bg-card/80 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            LLDP-naboar
          </CardTitle>
          <CardDescription>
            Oppdaga naboar via LLDP/CDP frå UniFi-switchar og lokal lldpd
          </CardDescription>
        </div>
        <Button onClick={load} disabled={loading} size="sm" variant="outline">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Oppdater</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* UniFi */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">UniFi-switchar</h3>
            <Badge variant="secondary">{data?.unifi?.length ?? 0} naboar</Badge>
          </div>
          {data?.errors?.unifi && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                UniFi-feil: {data.errors.unifi}
              </AlertDescription>
            </Alert>
          )}
          {groupedUnifi.length === 0 && !loading && !data?.errors?.unifi && (
            <p className="text-sm text-muted-foreground">
              Ingen LLDP-naboar funne på UniFi-utstyr.
            </p>
          )}
          {groupedUnifi.map(([deviceName, ports]) => (
            <div key={deviceName} className="rounded-lg border border-border/50 overflow-auto">
              <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b border-border/50">
                {deviceName}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({ports.length} {ports.length === 1 ? "nabo" : "naboar"})
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/20 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Port</th>
                    <th className="text-left px-3 py-2">Nabo</th>
                    <th className="text-left px-3 py-2">Mgmt IP</th>
                    <th className="text-left px-3 py-2">Nabo-port</th>
                    <th className="text-left px-3 py-2">Capabilities</th>
                    <th className="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ports.map((p, i) => (
                    <tr key={i} className="border-t border-border/30 hover:bg-muted/10">
                      <td className="px-3 py-2 font-mono text-xs">
                        {p.port_idx} ({p.port_name})
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.neighbor_name || "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {p.neighbor_chassis_id}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {p.neighbor_mgmt_ip || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="font-mono">{p.neighbor_port_id || "—"}</div>
                        {p.neighbor_port_desc && (
                          <div className="text-muted-foreground">{p.neighbor_port_desc}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {p.neighbor_capabilities || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={p.up ? "default" : "secondary"} className="text-xs">
                          {p.up ? `${p.speed || ""} Mbps` : "ned"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        {/* Local */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Lokal server (lldpctl)</h3>
            <Badge variant="secondary">{data?.local?.length ?? 0} naboar</Badge>
          </div>
          {data?.errors?.local && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                Lokal lldpctl feila: {data.errors.local}. Installer med{" "}
                <code className="font-mono">sudo apt install lldpd</code> og start med{" "}
                <code className="font-mono">sudo systemctl enable --now lldpd</code>.
              </AlertDescription>
            </Alert>
          )}
          {(data?.local?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-border/50 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/20 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Lokalt iface</th>
                    <th className="text-left px-3 py-2">Nabo</th>
                    <th className="text-left px-3 py-2">Mgmt IP</th>
                    <th className="text-left px-3 py-2">Nabo-port</th>
                    <th className="text-left px-3 py-2">VLAN</th>
                    <th className="text-left px-3 py-2">Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.local.map((n, i) => (
                    <tr key={i} className="border-t border-border/30 hover:bg-muted/10">
                      <td className="px-3 py-2 font-mono text-xs">{n.local_iface}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{n.neighbor_name || "—"}</div>
                        {n.neighbor_descr && (
                          <div className="text-xs text-muted-foreground line-clamp-2">
                            {n.neighbor_descr}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {n.neighbor_mgmt_ip || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="font-mono">{n.port_id || "—"}</div>
                        {n.port_descr && (
                          <div className="text-muted-foreground">{n.port_descr}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{n.vlan ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {n.neighbor_capabilities || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
