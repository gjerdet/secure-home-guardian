import { IoTDeviceList } from "@/components/IoTDeviceList";

const mockDevices = [
  { id: "1", name: "Philips Hue Bridge", ip: "192.168.1.50", mac: "EC:B5:FA:12:34:56", status: "online" as const, trusted: true, lastSeen: "Nå", vendor: "Philips", model: "Hue Bridge v2", network: "IoT", vlan: 10, rxBytes: 1200000000, txBytes: 340000000, connectedTo: "USW-Lite-8-POE Port 2", connection: "Ethernet", txRate: 100, rxRate: 100 },
  { id: "2", name: "Sonos Speaker", ip: "192.168.1.51", mac: "94:9F:3E:78:90:AB", status: "online" as const, trusted: true, lastSeen: "Nå", vendor: "Sonos", model: "One SL", network: "IoT", vlan: 10, rxBytes: 34000000000, txBytes: 500000000, signalStrength: -48, connectedTo: "U6-Pro Stue", connection: "5GHz", channel: "36/80", txRate: 780, rxRate: 780 },
  { id: "3", name: "Samsung TV", ip: "192.168.1.52", mac: "F4:7B:09:CD:EF:12", status: "online" as const, trusted: true, lastSeen: "Nå", vendor: "Samsung", model: "QN85B 65\"", network: "IoT", vlan: 10, rxBytes: 89000000000, txBytes: 1200000000, signalStrength: -62, connectedTo: "U6-Lite Kontor", connection: "2.4GHz", channel: "6", txRate: 72, rxRate: 72 },
  { id: "4", name: "Ukjent Enhet", ip: "192.168.1.99", mac: "00:1A:2B:3C:4D:5E", status: "online" as const, trusted: false, lastSeen: "2 min", network: "LAN", vlan: 1, signalStrength: -75, connectedTo: "U6-Mesh Garasje", connection: "2.4GHz", channel: "6", txRate: 54, rxRate: 54 },
  { id: "5", name: "Ring Doorbell", ip: "192.168.1.53", mac: "A0:B1:C2:D3:E4:F5", status: "offline" as const, trusted: true, lastSeen: "3t siden", vendor: "Ring", model: "Video Doorbell 4", network: "IoT", vlan: 10, rxBytes: 67000000000, txBytes: 2300000000, connectedTo: "U6-Mesh Garasje", connection: "2.4GHz", channel: "6" },
  { id: "6", name: "Xiaomi Vacuum", ip: "192.168.1.54", mac: "28:6C:07:AB:CD:EF", status: "online" as const, trusted: true, lastSeen: "Nå", vendor: "Xiaomi", model: "Roborock S7", firmware: "v4.1.2_1234", network: "IoT", vlan: 10, rxBytes: 450000000, txBytes: 120000000, signalStrength: -55, connectedTo: "U6-Pro Stue", connection: "2.4GHz", channel: "6", txRate: 72, rxRate: 72 },
];

export function IoTModule() {
  return (
    <IoTDeviceList 
      devices={mockDevices} 
      className="animate-fade-in [animation-delay:700ms]" 
    />
  );
}
