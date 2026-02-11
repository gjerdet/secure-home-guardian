import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface AttackLocation {
  lat: number;
  lng: number;
  severity: string;
  country: string;
}

interface AttackMapProps {
  attacks: AttackLocation[];
}

const severityColors: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22d3ee",
};

export function AttackMap({ attacks }: AttackMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = L.map(mapContainer.current, {
      center: [30, 10],
      zoom: 2,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: true,
      attributionControl: false,
    });

    // Dark tile layer (free, no API key)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
    }).addTo(map.current);

    markersLayer.current = L.layerGroup().addTo(map.current);

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update markers when attacks change
  useEffect(() => {
    if (!map.current || !markersLayer.current) return;

    markersLayer.current.clearLayers();

    const homeCoords: L.LatLngExpression = [59.91, 10.75]; // Oslo

    // Home marker
    const homeIcon = L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;background:#22d3ee;border-radius:50%;border:3px solid #fff;box-shadow:0 0 15px #22d3ee;"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    L.marker(homeCoords, { icon: homeIcon })
      .bindPopup(`<div style="background:#1a1a2e;color:#fff;padding:8px;border-radius:4px;"><strong style="color:#22d3ee">DITT NETTVERK</strong><br/><span style="color:#888;">Oslo, Norge</span></div>`, { className: "dark-popup" })
      .addTo(markersLayer.current);

    // Attack markers + lines
    attacks.forEach((attack) => {
      const color = severityColors[attack.severity] || severityColors.medium;

      const icon = L.divIcon({
        className: "",
        html: `<div style="width:12px;height:12px;background:${color};border-radius:50%;border:2px solid rgba(255,255,255,0.5);box-shadow:0 0 8px ${color};cursor:pointer;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      L.marker([attack.lat, attack.lng], { icon })
        .bindPopup(`<div style="background:#1a1a2e;color:#fff;padding:8px;border-radius:4px;"><strong style="color:${color}">${attack.severity.toUpperCase()}</strong><br/><span style="color:#888;">Land:</span> ${attack.country}</div>`, { className: "dark-popup" })
        .addTo(markersLayer.current!);

      // Line from attack to home
      L.polyline([[attack.lat, attack.lng], homeCoords as [number, number]], {
        color,
        weight: 1,
        opacity: 0.4,
      }).addTo(markersLayer.current!);
    });

    // Fit bounds if attacks exist
    if (attacks.length > 0) {
      const allPoints: L.LatLngExpression[] = [
        homeCoords,
        ...attacks.map(a => [a.lat, a.lng] as L.LatLngExpression),
      ];
      map.current.fitBounds(L.latLngBounds(allPoints), { padding: [30, 30], maxZoom: 5 });
    }
  }, [attacks]);

  return (
    <div className="relative">
      <div ref={mapContainer} className="h-[500px] rounded-b-lg" />
      {attacks.length > 0 && (
        <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm rounded-lg p-3 text-xs z-[1000]">
          <p className="font-semibold text-foreground mb-2">Angreps Statistikk</p>
          <div className="space-y-1">
            {Object.entries(
              attacks.reduce((acc, a) => {
                acc[a.country] = (acc[a.country] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([country, count]) => (
              <div key={country} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{country}</span>
                <span className="font-mono text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
