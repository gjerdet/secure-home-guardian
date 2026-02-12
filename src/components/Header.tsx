import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Shield, Bell, Settings, Terminal, Home, Wifi, HardDrive, Server, Radar, Activity, LogOut, User, Download, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/unifi", label: "UniFi", icon: Wifi },
  { href: "/truenas", label: "TrueNAS", icon: HardDrive },
  { href: "/proxmox", label: "Proxmox", icon: Server },
  { href: "/security", label: "Sikkerhet", icon: Radar },
  { href: "/status", label: "Status", icon: Activity },
  { href: "/installer", label: "Installer", icon: Download },
];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-6">
            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-muted-foreground h-8 w-8"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            <Link to="/" className="flex items-center gap-2 sm:gap-3">
              <div className="relative">
                <div className="rounded-lg bg-primary/10 p-1.5 sm:p-2 animate-glow-pulse">
                  <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                </div>
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                  NetGuard
                  <span className="text-[10px] sm:text-xs font-mono text-primary bg-primary/10 px-1.5 sm:px-2 py-0.5 rounded">
                    v1.0
                  </span>
                </h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                  Lokal Sikkerhetssenter
                </p>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Link to="/status" className="hidden sm:inline-flex">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Terminal / Status">
                <Terminal className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/security">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground relative h-8 w-8 sm:h-9 sm:w-9" title="Sikkerhetsvarsler">
                <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </Link>
            <Link to="/settings" className="hidden sm:inline-flex">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Innstillinger">
                <Settings className="h-5 w-5" />
              </Button>
            </Link>
            
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 sm:gap-2 text-muted-foreground hover:text-foreground h-8 px-2 sm:px-3">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">{user.username}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                    {user.role === 'admin' ? 'Administrator' : 'Bruker'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logg ut
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-border bg-card/95 backdrop-blur-sm px-3 py-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <div className="flex gap-2 pt-1 border-t border-border mt-1">
            <Link to="/status" onClick={() => setMobileOpen(false)} className="flex-1">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
                <Terminal className="h-4 w-4" /> Terminal
              </Button>
            </Link>
            <Link to="/settings" onClick={() => setMobileOpen(false)} className="flex-1">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
                <Settings className="h-4 w-4" /> Innstillinger
              </Button>
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
