import { IoTDeviceList } from "@/components/IoTDeviceList";

const mockDevices = [
  { id: "1", name: "Philips Hue Bridge", ip: "192.168.1.50", mac: "EC:B5:FA:12:34:56", status: "online" as const, trusted: true, lastSeen: "Nå" },
  { id: "2", name: "Sonos Speaker", ip: "192.168.1.51", mac: "94:9F:3E:78:90:AB", status: "online" as const, trusted: true, lastSeen: "Nå" },
  { id: "3", name: "Samsung TV", ip: "192.168.1.52", mac: "F4:7B:09:CD:EF:12", status: "online" as const, trusted: true, lastSeen: "Nå" },
  { id: "4", name: "Ukjent Enhet", ip: "192.168.1.99", mac: "00:1A:2B:3C:4D:5E", status: "online" as const, trusted: false, lastSeen: "2 min" },
  { id: "5", name: "Ring Doorbell", ip: "192.168.1.53", mac: "A0:B1:C2:D3:E4:F5", status: "offline" as const, trusted: true, lastSeen: "3t siden" },
  { id: "6", name: "Xiaomi Vacuum", ip: "192.168.1.54", mac: "28:6C:07:AB:CD:EF", status: "online" as const, trusted: true, lastSeen: "Nå" },
];

export function IoTModule() {
  return (
    <IoTDeviceList 
      devices={mockDevices} 
      className="animate-fade-in [animation-delay:700ms]" 
    />
  );
}
