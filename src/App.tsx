import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import UniFi from "./pages/UniFi";
import TrueNAS from "./pages/TrueNAS";
import Proxmox from "./pages/Proxmox";
import Security from "./pages/Security";
import Status from "./pages/Status";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/unifi" element={<ProtectedRoute><UniFi /></ProtectedRoute>} />
            <Route path="/truenas" element={<ProtectedRoute><TrueNAS /></ProtectedRoute>} />
            <Route path="/proxmox" element={<ProtectedRoute><Proxmox /></ProtectedRoute>} />
            <Route path="/security" element={<ProtectedRoute><Security /></ProtectedRoute>} />
            <Route path="/status" element={<ProtectedRoute><Status /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
