import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Loader2, AlertCircle, Check, ArrowRight, ArrowLeft, Server, Key, User } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || '';

interface SetupConfig {
  // Admin
  adminUsername: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  // UniFi
  unifiUrl: string;
  unifiApiKey: string;
  unifiUsername: string;
  unifiPassword: string;
  unifiSite: string;
  // TrueNAS
  truenasUrl: string;
  truenasApiKey: string;
  // Proxmox
  proxmoxUrl: string;
  proxmoxUser: string;
  proxmoxTokenId: string;
  proxmoxTokenSecret: string;
  // OpenVAS
  openvasUrl: string;
  openvasUsername: string;
  openvasPassword: string;
}

export default function Setup() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { checkSetupStatus } = useAuth();
  const navigate = useNavigate();
  
  const [config, setConfig] = useState<SetupConfig>({
    adminUsername: 'admin',
    adminPassword: '',
    adminPasswordConfirm: '',
    unifiUrl: '',
    unifiApiKey: '',
    unifiUsername: '',
    unifiPassword: '',
    unifiSite: 'default',
    truenasUrl: '',
    truenasApiKey: '',
    proxmoxUrl: '',
    proxmoxUser: 'root@pam',
    proxmoxTokenId: '',
    proxmoxTokenSecret: '',
    openvasUrl: '',
    openvasUsername: 'admin',
    openvasPassword: '',
  });

  const updateConfig = (field: keyof SetupConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const validateStep = (currentStep: number): boolean => {
    setError('');
    
    if (currentStep === 1) {
      if (!config.adminUsername.trim()) {
        setError('Brukernavn er påkrevd');
        return false;
      }
      if (config.adminPassword.length < 8) {
        setError('Passord må være minst 8 tegn');
        return false;
      }
      if (config.adminPassword !== config.adminPasswordConfirm) {
        setError('Passordene stemmer ikke overens');
        return false;
      }
    }
    
    return true;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    setError('');
    setStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin: {
            username: config.adminUsername,
            password: config.adminPassword,
          },
          services: {
            unifi: {
              url: config.unifiUrl,
              apiKey: config.unifiApiKey,
              username: config.unifiUsername,
              password: config.unifiPassword,
              site: config.unifiSite,
            },
            truenas: {
              url: config.truenasUrl,
              apiKey: config.truenasApiKey,
            },
            proxmox: {
              url: config.proxmoxUrl,
              user: config.proxmoxUser,
              tokenId: config.proxmoxTokenId,
              tokenSecret: config.proxmoxTokenSecret,
            },
            openvas: {
              url: config.openvasUrl,
              username: config.openvasUsername,
              password: config.openvasPassword,
            },
          },
        }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        toast.success('Oppsett fullført!');
        await checkSetupStatus();
        navigate('/login');
      } else {
        setError(data.error || 'Oppsett feilet');
      }
    } catch (err) {
      setError('Kunne ikke koble til server');
    }
    
    setIsLoading(false);
  };

  const steps = [
    { number: 1, title: 'Admin-konto', icon: User },
    { number: 2, title: 'UniFi', icon: Server },
    { number: 3, title: 'TrueNAS', icon: Server },
    { number: 4, title: 'Proxmox', icon: Server },
    { number: 5, title: 'OpenVAS', icon: Key },
  ];

  return (
    <div className="min-h-screen bg-background cyber-grid flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl border-primary/20 bg-card/80 backdrop-blur">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">NetGuard Oppsett</CardTitle>
          <CardDescription>Konfigurer systemet for første gang</CardDescription>
          
          {/* Step indicators */}
          <div className="flex justify-center gap-2 pt-4">
            {steps.map((s) => (
              <div
                key={s.number}
                className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                  s.number < step
                    ? 'bg-primary text-primary-foreground'
                    : s.number === step
                    ? 'bg-primary/20 text-primary border-2 border-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {s.number < step ? <Check className="h-4 w-4" /> : s.number}
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{steps[step - 1].title}</p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {/* Step 1: Admin Account */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Opprett en administrator-konto for å få tilgang til dashboardet.
              </p>
              <div className="space-y-2">
                <Label htmlFor="adminUsername">Brukernavn</Label>
                <Input
                  id="adminUsername"
                  value={config.adminUsername}
                  onChange={(e) => updateConfig('adminUsername', e.target.value)}
                  placeholder="admin"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminPassword">Passord</Label>
                <Input
                  id="adminPassword"
                  type="password"
                  value={config.adminPassword}
                  onChange={(e) => updateConfig('adminPassword', e.target.value)}
                  placeholder="Minst 8 tegn"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminPasswordConfirm">Bekreft passord</Label>
                <Input
                  id="adminPasswordConfirm"
                  type="password"
                  value={config.adminPasswordConfirm}
                  onChange={(e) => updateConfig('adminPasswordConfirm', e.target.value)}
                  placeholder="Gjenta passordet"
                />
              </div>
            </div>
          )}
          
          {/* Step 2: UniFi */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Koble til UniFi Controller for nettverksovervåkning. La feltene stå tomme for å hoppe over.
              </p>
              <div className="space-y-2">
                <Label htmlFor="unifiUrl">Controller URL</Label>
                <Input
                  id="unifiUrl"
                  value={config.unifiUrl}
                  onChange={(e) => updateConfig('unifiUrl', e.target.value)}
                  placeholder="https://192.168.1.1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unifiApiKey" className="flex items-center gap-2">
                  API-nøkkel (anbefalt)
                </Label>
                <Input
                  id="unifiApiKey"
                  type="password"
                  value={config.unifiApiKey}
                  onChange={(e) => updateConfig('unifiApiKey', e.target.value)}
                  placeholder="Opprett i UDM > Network > Settings > System > Integrations"
                />
                <p className="text-xs text-muted-foreground">Sikrere og mer stabilt enn brukernavn/passord</p>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-3">Alternativt: brukernavn/passord (legacy)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="unifiUsername">Brukernavn</Label>
                    <Input
                      id="unifiUsername"
                      value={config.unifiUsername}
                      onChange={(e) => updateConfig('unifiUsername', e.target.value)}
                      placeholder="admin"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unifiPassword">Passord</Label>
                    <Input
                      id="unifiPassword"
                      type="password"
                      value={config.unifiPassword}
                      onChange={(e) => updateConfig('unifiPassword', e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unifiSite">Site</Label>
                <Input
                  id="unifiSite"
                  value={config.unifiSite}
                  onChange={(e) => updateConfig('unifiSite', e.target.value)}
                  placeholder="default"
                />
              </div>
            </div>
          )}
          
          {/* Step 3: TrueNAS */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Koble til TrueNAS for lagringsovervåkning. La feltene stå tomme for å hoppe over.
              </p>
              <div className="space-y-2">
                <Label htmlFor="truenasUrl">TrueNAS URL</Label>
                <Input
                  id="truenasUrl"
                  value={config.truenasUrl}
                  onChange={(e) => updateConfig('truenasUrl', e.target.value)}
                  placeholder="http://192.168.1.20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="truenasApiKey">API-nøkkel</Label>
                <Input
                  id="truenasApiKey"
                  type="password"
                  value={config.truenasApiKey}
                  onChange={(e) => updateConfig('truenasApiKey', e.target.value)}
                  placeholder="Din TrueNAS API-nøkkel"
                />
              </div>
            </div>
          )}
          
          {/* Step 4: Proxmox */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Koble til Proxmox VE for VM/container-overvåkning. La feltene stå tomme for å hoppe over.
              </p>
              <div className="space-y-2">
                <Label htmlFor="proxmoxUrl">Proxmox URL</Label>
                <Input
                  id="proxmoxUrl"
                  value={config.proxmoxUrl}
                  onChange={(e) => updateConfig('proxmoxUrl', e.target.value)}
                  placeholder="https://192.168.1.30:8006"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proxmoxUser">Bruker</Label>
                <Input
                  id="proxmoxUser"
                  value={config.proxmoxUser}
                  onChange={(e) => updateConfig('proxmoxUser', e.target.value)}
                  placeholder="root@pam"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="proxmoxTokenId">Token ID (bare token-navnet)</Label>
                  <Input
                    id="proxmoxTokenId"
                    value={config.proxmoxTokenId}
                    onChange={(e) => updateConfig('proxmoxTokenId', e.target.value)}
                    placeholder="f.eks. test (IKKE root@pam!test)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proxmoxTokenSecret">Token Secret</Label>
                  <Input
                    id="proxmoxTokenSecret"
                    type="password"
                    value={config.proxmoxTokenSecret}
                    onChange={(e) => updateConfig('proxmoxTokenSecret', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Step 5: OpenVAS */}
          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Koble til OpenVAS/Greenbone for sårbarhetsskanning. La feltene stå tomme for å hoppe over.
              </p>
              <div className="space-y-2">
                <Label htmlFor="openvasUrl">OpenVAS URL</Label>
                <Input
                  id="openvasUrl"
                  value={config.openvasUrl}
                  onChange={(e) => updateConfig('openvasUrl', e.target.value)}
                  placeholder="http://192.168.1.40:9392"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="openvasUsername">Brukernavn</Label>
                  <Input
                    id="openvasUsername"
                    value={config.openvasUsername}
                    onChange={(e) => updateConfig('openvasUsername', e.target.value)}
                    placeholder="admin"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openvasPassword">Passord</Label>
                  <Input
                    id="openvasPassword"
                    type="password"
                    value={config.openvasPassword}
                    onChange={(e) => updateConfig('openvasPassword', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Navigation */}
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={step === 1}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tilbake
            </Button>
            
            {step < 5 ? (
              <Button onClick={nextStep}>
                Neste
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Lagrer...
                  </>
                ) : (
                  <>
                    Fullfør oppsett
                    <Check className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
