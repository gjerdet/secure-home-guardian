import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  Shield, CheckCircle, AlertTriangle, XCircle, RefreshCw, Loader2,
  Lock, Globe, Server, Wifi, Activity
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ScoreCategory {
  name: string;
  icon: React.ReactNode;
  score: number;
  maxScore: number;
  items: { label: string; status: 'pass' | 'warn' | 'fail' | 'info'; detail: string }[];
}

export function SecurityScorePanel() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<ScoreCategory[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const calculateScore = async () => {
    setIsCalculating(true);
    const cats: ScoreCategory[] = [];

    try {
      // 1. Check WAN exposure
      const wanCategory: ScoreCategory = {
        name: "WAN-eksponering",
        icon: <Globe className="h-5 w-5" />,
        score: 0,
        maxScore: 25,
        items: [],
      };

      try {
        const wanRes = await fetch(`${API_BASE}/api/network/wan-ip`);
        if (wanRes.ok) {
          const { ip } = await wanRes.json();
          wanCategory.items.push({ label: "WAN IP oppdaget", status: "pass", detail: ip });
          wanCategory.score += 5;
          
          // Quick port check via nmap
          try {
            const scanRes = await fetch(`${API_BASE}/api/nmap/scan`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ target: ip, scanType: "ports" }),
            });
            if (scanRes.ok) {
              const scanData = await scanRes.json();
              const openPorts = (scanData.result?.match(/state="open"/g) || []).length;
              if (openPorts === 0) {
                wanCategory.score += 20;
                wanCategory.items.push({ label: "Ingen åpne porter", status: "pass", detail: "WAN IP er godt beskyttet" });
              } else if (openPorts <= 3) {
                wanCategory.score += 10;
                wanCategory.items.push({ label: `${openPorts} åpne porter`, status: "warn", detail: "Bør vurderes" });
              } else {
                wanCategory.items.push({ label: `${openPorts} åpne porter`, status: "fail", detail: "For mange eksponerte porter" });
              }
            }
          } catch {
            wanCategory.items.push({ label: "WAN scan", status: "info", detail: "Kunne ikke kjøre scan" });
          }
        }
      } catch {
        wanCategory.items.push({ label: "WAN IP", status: "info", detail: "Backend ikke tilgjengelig" });
      }
      cats.push(wanCategory);

      // 2. Check firewall rules
      const fwCategory: ScoreCategory = {
        name: "Brannmur",
        icon: <Shield className="h-5 w-5" />,
        score: 0,
        maxScore: 25,
        items: [],
      };

      try {
        const fwRes = await fetch(`${API_BASE}/api/security/firewall-rules`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fwRes.ok) {
          const fwData = await fwRes.json();
          const rules = fwData.firewallRules || [];
          const forwards = fwData.portForwards || [];
          const activeForwards = forwards.filter((f: any) => f.enabled);

          if (rules.length > 0) {
            fwCategory.score += 10;
            fwCategory.items.push({ label: `${rules.length} brannmurregler`, status: "pass", detail: "Regler er konfigurert" });
          } else {
            fwCategory.items.push({ label: "Ingen brannmurregler", status: "warn", detail: "Vurder å konfigurere regler" });
          }

          if (activeForwards.length === 0) {
            fwCategory.score += 15;
            fwCategory.items.push({ label: "Ingen port forwards", status: "pass", detail: "Ingen tjenester eksponert" });
          } else if (activeForwards.length <= 2) {
            fwCategory.score += 8;
            fwCategory.items.push({ label: `${activeForwards.length} port forwards`, status: "warn", detail: "Bør gjennomgås" });
          } else {
            fwCategory.items.push({ label: `${activeForwards.length} port forwards`, status: "fail", detail: "Mange eksponerte tjenester" });
          }
        }
      } catch {
        fwCategory.items.push({ label: "UDM Pro", status: "info", detail: "Ikke tilkoblet" });
      }
      cats.push(fwCategory);

      // 3. Check IDS/IPS
      const idsCategory: ScoreCategory = {
        name: "IDS/IPS",
        icon: <Activity className="h-5 w-5" />,
        score: 0,
        maxScore: 25,
        items: [],
      };

      try {
        const idsRes = await fetch(`${API_BASE}/api/unifi/ids-alerts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (idsRes.ok) {
          idsCategory.score += 10;
          idsCategory.items.push({ label: "IDS/IPS aktiv", status: "pass", detail: "Overvåking kjører" });
          
          const idsData = await idsRes.json();
          const alerts = idsData.alerts || idsData.data || [];
          const recentHigh = alerts.filter((a: any) => a.severity === 'high' || a.severity === 'critical').length;
          
          if (recentHigh === 0) {
            idsCategory.score += 15;
            idsCategory.items.push({ label: "Ingen kritiske varsler", status: "pass", detail: "Alt ser rolig ut" });
          } else if (recentHigh <= 5) {
            idsCategory.score += 8;
            idsCategory.items.push({ label: `${recentHigh} kritiske varsler`, status: "warn", detail: "Bør undersøkes" });
          } else {
            idsCategory.items.push({ label: `${recentHigh} kritiske varsler`, status: "fail", detail: "Mange høy-risiko hendelser" });
          }
        } else {
          idsCategory.items.push({ label: "IDS/IPS", status: "info", detail: "Ikke tilgjengelig" });
        }
      } catch {
        idsCategory.items.push({ label: "IDS/IPS", status: "info", detail: "Ikke tilkoblet" });
      }
      cats.push(idsCategory);

      // 4. Vulnerability scanning
      const vulnCategory: ScoreCategory = {
        name: "Sårbarheter",
        icon: <AlertTriangle className="h-5 w-5" />,
        score: 0,
        maxScore: 25,
        items: [],
      };

      try {
        const vulnRes = await fetch(`${API_BASE}/api/openvas/vulnerabilities`);
        if (vulnRes.ok) {
          vulnCategory.score += 5;
          vulnCategory.items.push({ label: "OpenVAS tilkoblet", status: "pass", detail: "Sårbarhetsskanning aktiv" });

          const vulnData = await vulnRes.json();
          const vulns = vulnData.results || vulnData.data || [];
          const highVulns = vulns.filter((v: any) => v.severity === 'high' || v.severity === 'critical').length;
          
          if (vulns.length === 0) {
            vulnCategory.score += 20;
            vulnCategory.items.push({ label: "Ingen sårbarheter", status: "pass", detail: "Rent resultat" });
          } else if (highVulns === 0) {
            vulnCategory.score += 15;
            vulnCategory.items.push({ label: `${vulns.length} funn, ingen kritiske`, status: "warn", detail: "Kun lavrisiko" });
          } else {
            vulnCategory.score += 5;
            vulnCategory.items.push({ label: `${highVulns} kritiske sårbarheter`, status: "fail", detail: "Krever oppmerksomhet" });
          }
        } else {
          vulnCategory.items.push({ label: "OpenVAS", status: "info", detail: "Ikke tilkoblet" });
        }
      } catch {
        vulnCategory.items.push({ label: "OpenVAS", status: "info", detail: "Ikke tilgjengelig" });
      }
      cats.push(vulnCategory);

      setCategories(cats);
      setLastRun(new Date().toLocaleTimeString('nb-NO'));
      toast.success("Sikkerhets-score beregnet");
    } catch {
      toast.error("Feil ved beregning av score");
    } finally {
      setIsCalculating(false);
    }
  };

  const totalScore = categories.reduce((sum, c) => sum + c.score, 0);
  const maxScore = categories.reduce((sum, c) => sum + c.maxScore, 0);
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  const getScoreColor = (pct: number) => {
    if (pct >= 80) return "text-success";
    if (pct >= 60) return "text-warning";
    return "text-destructive";
  };

  const getScoreLabel = (pct: number) => {
    if (pct >= 90) return "Utmerket";
    if (pct >= 80) return "Bra";
    if (pct >= 60) return "Akseptabelt";
    if (pct >= 40) return "Bør forbedres";
    return "Kritisk";
  };

  const statusIcon = {
    pass: <CheckCircle className="h-3.5 w-3.5 text-success" />,
    warn: <AlertTriangle className="h-3.5 w-3.5 text-warning" />,
    fail: <XCircle className="h-3.5 w-3.5 text-destructive" />,
    info: <Shield className="h-3.5 w-3.5 text-muted-foreground" />,
  };

  return (
    <div className="space-y-4">
      {/* Main score card */}
      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Samlet sikkerhets-score
            </CardTitle>
            <div className="flex items-center gap-2">
              {lastRun && <span className="text-xs text-muted-foreground">Sist: {lastRun}</span>}
              <Button onClick={calculateScore} disabled={isCalculating} className="bg-primary text-primary-foreground" size="sm">
                {isCalculating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {isCalculating ? "Beregner..." : "Beregn score"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Aggregert sikkerhetspoeng basert på WAN-eksponering, brannmur, IDS/IPS og sårbarhetsskanning.
          </p>
        </CardHeader>

        {categories.length > 0 && (
          <CardContent className="p-6">
            <div className="flex items-center justify-center mb-6">
              <div className="text-center">
                <p className={`text-6xl font-mono font-bold ${getScoreColor(percentage)}`}>
                  {percentage}
                </p>
                <p className="text-sm text-muted-foreground mt-1">av 100 poeng</p>
                <Badge className={`mt-2 ${percentage >= 80 ? 'bg-success/10 text-success' : percentage >= 60 ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'}`}>
                  {getScoreLabel(percentage)}
                </Badge>
              </div>
            </div>
            <Progress 
              value={percentage} 
              className="h-3 mb-6"
            />
          </CardContent>
        )}
      </Card>

      {/* Category breakdowns */}
      {categories.map((cat, i) => {
        const catPct = cat.maxScore > 0 ? Math.round((cat.score / cat.maxScore) * 100) : 0;
        return (
          <Card key={i} className="bg-card border-border">
            <CardHeader className="border-b border-border py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  {cat.icon}
                  {cat.name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-bold ${getScoreColor(catPct)}`}>{cat.score}/{cat.maxScore}</span>
                </div>
              </div>
              <Progress value={catPct} className="h-1.5 mt-2" />
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {cat.items.map((item, j) => (
                  <div key={j} className="px-4 py-2.5 flex items-center gap-3">
                    {statusIcon[item.status]}
                    <span className="text-sm text-foreground flex-1">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.detail}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {categories.length === 0 && !isCalculating && (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Klikk "Beregn score" for å kjøre en full sikkerhetsanalyse.</p>
            <p className="text-xs mt-1">Testen sjekker WAN-eksponering, brannmur, IDS/IPS og sårbarheter.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
