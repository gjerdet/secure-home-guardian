import { useState } from "react";
import { ScanPanel } from "@/components/ScanPanel";

const mockScanResults = [
  { type: "vulnerability" as const, severity: "medium" as const, description: "Utdatert SSL-sertifikat på webserver", target: "192.168.1.10:443" },
  { type: "port" as const, severity: "low" as const, description: "Åpen port 22 (SSH) eksponert", target: "192.168.1.1:22" },
  { type: "host" as const, severity: "info" as const, description: "Ny enhet oppdaget på nettverket", target: "192.168.1.99" },
];

export function ScanModule() {
  const [isScanning, setIsScanning] = useState(false);

  const handleStartScan = () => {
    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 5000);
  };

  return (
    <ScanPanel 
      lastScan="12. des 2024, 03:00" 
      nextScan="19. des 2024, 03:00" 
      isScanning={isScanning} 
      results={mockScanResults} 
      onStartScan={handleStartScan} 
      className="animate-fade-in [animation-delay:600ms]" 
    />
  );
}
