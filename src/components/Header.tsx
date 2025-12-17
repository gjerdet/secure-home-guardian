import { Shield, Bell, Settings, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="rounded-lg bg-primary/10 p-2 animate-glow-pulse">
                <Shield className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
                NetGuard
                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                  v1.0
                </span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Hjemmenettverk Sikkerhetssenter
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Terminal className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
            </Button>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
