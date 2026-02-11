import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Globe, Loader2, CheckCircle, AlertTriangle, Server, Clock, Shield
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || '';

interface DnsTestResult {
  test: string;
  status?: string;
  servers?: string[];
  domain?: string;
  addresses?: string[];
  ip?: string;
  location?: string;
  provider?: string;
  responseTime?: number;
  error?: string;
}

export function DnsLeakPanel() {
  const { token } = useAuth();
  const [results, setResults] = useState<DnsTestResult[]>([]);
  const [resolvers, setResolvers] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runTest = async () => {
    setIsRunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/security/dns-leak`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setResolvers(data.resolvers || []);
        toast.success("DNS-test fullført");
      } else {
        toast.error("Kunne ikke kjøre DNS-test");
      }
    } catch {
      toast.error("Kunne ikke koble til backend");
    } finally {
      setIsRunning(false);
    }
  };

  const configuredDns = results.find(r => r.test === 'configured_dns');
  const externalIp = results.find(r => r.test === 'external_ip_check');
  const dnsResolves = results.filter(r => r.test === 'dns_resolve');
  const providerChecks = results.filter(r => r.test === 'dns_provider_check');

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              DNS-lekkasjetest
            </CardTitle>
            <Button onClick={runTest} disabled={isRunning} className="bg-primary text-primary-foreground" size="sm">
              {isRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
              {isRunning ? "Tester..." : "Kjør test"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Sjekker hvilke DNS-servere som brukes og om forespørsler lekker utenfor forventet infrastruktur. 
            Nyttig for å verifisere at egen DNS-server brukes korrekt.
          </p>
        </CardHeader>
      </Card>

      {results.length > 0 && (
        <>
          {/* Configured DNS */}
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                Konfigurerte DNS-servere
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2">
                {resolvers.map((r, i) => (
                  <Badge key={i} variant="outline" className="font-mono text-sm px-3 py-1">{r}</Badge>
                ))}
              </div>
              {configuredDns?.servers && configuredDns.servers.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Backend-serveren bruker disse DNS-serverne for oppslag.
                </p>
              )}
            </CardContent>
          </Card>

          {/* External IP */}
          {externalIp && externalIp.status === 'ok' && (
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Ekstern IP sett av Cloudflare</p>
                    <div className="flex items-center gap-3 mt-1">
                      <Badge variant="outline" className="font-mono">{externalIp.ip}</Badge>
                      {externalIp.location && (
                        <span className="text-xs text-muted-foreground">Lokasjon: {externalIp.location}</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* DNS Provider Response Times */}
          {providerChecks.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  DNS-provider responstider
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Viser om backend-serveren kan nå ulike DNS-providere. Hvis egen DNS er satt opp, bør kun den svare raskt.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {providerChecks.map((pc, i) => (
                    <div key={i} className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {pc.status === 'ok' ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        )}
                        <div>
                          <span className="text-sm font-medium text-foreground">{pc.provider}</span>
                          <span className="text-xs font-mono text-muted-foreground ml-2">{pc.ip}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {pc.status === 'ok' && pc.responseTime !== undefined ? (
                          <Badge variant="outline" className="font-mono text-xs">
                            {pc.responseTime}ms
                          </Badge>
                        ) : (
                          <Badge className="bg-destructive/10 text-destructive text-xs">Ikke tilgjengelig</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* DNS Resolution Tests */}
          {dnsResolves.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Server className="h-4 w-4 text-primary" />
                  DNS-oppslag
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {dnsResolves.map((dr, i) => (
                    <div key={i} className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {dr.status === 'ok' ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-warning" />
                        )}
                        <span className="font-mono text-sm text-foreground">{dr.domain}</span>
                      </div>
                      {dr.addresses ? (
                        <div className="flex gap-1">
                          {dr.addresses.map((a, j) => (
                            <Badge key={j} variant="outline" className="font-mono text-[10px]">{a}</Badge>
                          ))}
                        </div>
                      ) : (
                        <Badge className="bg-warning/10 text-warning text-xs">{dr.error || 'Feilet'}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {results.length === 0 && !isRunning && (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Kjør en DNS-lekkasjetest for å se hvilke DNS-servere som brukes.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
