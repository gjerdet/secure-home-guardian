import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import UniFi from "./pages/UniFi";
import TrueNAS from "./pages/TrueNAS";
import Proxmox from "./pages/Proxmox";
import Security from "./pages/Security";
import Status from "./pages/Status";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/unifi" element={<UniFi />} />
          <Route path="/truenas" element={<TrueNAS />} />
          <Route path="/proxmox" element={<Proxmox />} />
          <Route path="/security" element={<Security />} />
          <Route path="/status" element={<Status />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
