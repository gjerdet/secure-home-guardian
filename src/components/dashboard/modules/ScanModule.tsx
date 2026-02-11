import { useState } from "react";
import { ScanPanel } from "@/components/ScanPanel";

export function ScanModule() {
  const [isScanning, setIsScanning] = useState(false);

  const handleStartScan = () => {
    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 5000);
  };

  return (
    <ScanPanel 
      lastScan="—" 
      nextScan="—" 
      isScanning={isScanning} 
      results={[]} 
      onStartScan={handleStartScan} 
      className="animate-fade-in [animation-delay:600ms]" 
    />
  );
}