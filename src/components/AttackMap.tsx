import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Key, MapPin } from "lucide-react";

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
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>(() => 
    localStorage.getItem("mapbox_token") || ""
  );
  const [tokenInput, setTokenInput] = useState("");
  const [isMapReady, setIsMapReady] = useState(false);

  const saveToken = () => {
    localStorage.setItem("mapbox_token", tokenInput);
    setMapboxToken(tokenInput);
  };

  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/dark-v11",
        projection: "globe",
        zoom: 1.5,
        center: [10, 30],
        pitch: 20,
      });

      map.current.addControl(
        new mapboxgl.NavigationControl({ visualizePitch: true }),
        "top-right"
      );

      map.current.scrollZoom.disable();

      map.current.on("style.load", () => {
        map.current?.setFog({
          color: "rgb(10, 20, 30)",
          "high-color": "rgb(20, 40, 60)",
          "horizon-blend": 0.1,
        });
        setIsMapReady(true);
      });

      // Slow rotation
      const secondsPerRevolution = 360;
      let userInteracting = false;

      function spinGlobe() {
        if (!map.current) return;
        const zoom = map.current.getZoom();
        if (!userInteracting && zoom < 3) {
          const center = map.current.getCenter();
          center.lng -= 360 / secondsPerRevolution;
          map.current.easeTo({ center, duration: 1000, easing: (n) => n });
        }
      }

      map.current.on("mousedown", () => { userInteracting = true; });
      map.current.on("mouseup", () => { userInteracting = false; spinGlobe(); });
      map.current.on("touchend", () => { userInteracting = false; spinGlobe(); });
      map.current.on("moveend", spinGlobe);

      spinGlobe();

      return () => {
        map.current?.remove();
      };
    } catch (error) {
      console.error("Map initialization error:", error);
    }
  }, [mapboxToken]);

  // Add markers when map is ready
  useEffect(() => {
    if (!map.current || !isMapReady) return;

    // Remove existing markers
    const existingMarkers = document.querySelectorAll(".attack-marker");
    existingMarkers.forEach((m) => m.remove());

    // Add attack markers
    attacks.forEach((attack) => {
      const el = document.createElement("div");
      el.className = "attack-marker";
      el.style.cssText = `
        width: 16px;
        height: 16px;
        background: ${severityColors[attack.severity] || severityColors.medium};
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.5);
        box-shadow: 0 0 10px ${severityColors[attack.severity] || severityColors.medium};
        cursor: pointer;
      `;

      new mapboxgl.Marker(el)
        .setLngLat([attack.lng, attack.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25, className: "attack-popup" }).setHTML(`
            <div style="background: #1a1a2e; color: #fff; padding: 8px; border-radius: 4px;">
              <strong style="color: ${severityColors[attack.severity]}">${attack.severity.toUpperCase()}</strong>
              <br/>
              <span style="color: #888;">Land:</span> ${attack.country}
            </div>
          `)
        )
        .addTo(map.current!);
    });

    // Add line from attack to home (Norway)
    const homeCoords: [number, number] = [10.75, 59.91]; // Oslo
    
    attacks.forEach((attack) => {
      const lineId = `line-${attack.lat}-${attack.lng}`;
      
      if (!map.current?.getSource(lineId)) {
        map.current?.addSource(lineId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                [attack.lng, attack.lat],
                homeCoords,
              ],
            },
          },
        });

        map.current?.addLayer({
          id: lineId,
          type: "line",
          source: lineId,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": severityColors[attack.severity] || severityColors.medium,
            "line-width": 1,
            "line-opacity": 0.4,
          },
        });
      }
    });

    // Add home marker
    const homeEl = document.createElement("div");
    homeEl.className = "attack-marker";
    homeEl.style.cssText = `
      width: 20px;
      height: 20px;
      background: #22d3ee;
      border-radius: 50%;
      border: 3px solid #fff;
      box-shadow: 0 0 15px #22d3ee;
    `;

    new mapboxgl.Marker(homeEl)
      .setLngLat(homeCoords)
      .setPopup(
        new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div style="background: #1a1a2e; color: #fff; padding: 8px; border-radius: 4px;">
            <strong style="color: #22d3ee">DITT NETTVERK</strong>
            <br/>
            <span style="color: #888;">Oslo, Norge</span>
          </div>
        `)
      )
      .addTo(map.current);
  }, [attacks, isMapReady]);

  if (!mapboxToken) {
    return (
      <div className="h-[500px] flex items-center justify-center bg-muted/30">
        <div className="text-center max-w-md p-6">
          <div className="rounded-lg bg-primary/10 p-4 w-fit mx-auto mb-4">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Mapbox Token Påkrevd</h3>
          <p className="text-sm text-muted-foreground mb-4">
            For å vise angreps-kartet trenger du en Mapbox public token. 
            Gå til <a href="https://mapbox.com/" target="_blank" rel="noopener" className="text-primary underline">mapbox.com</a> og kopier din public token.
          </p>
          <div className="space-y-3">
            <div>
              <Label className="text-left block mb-1">Mapbox Public Token</Label>
              <Input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="pk.eyJ1Ijo..."
                className="bg-muted border-border font-mono text-xs"
              />
            </div>
            <Button onClick={saveToken} className="w-full bg-primary text-primary-foreground">
              <Key className="h-4 w-4 mr-2" />
              Lagre Token
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[500px]">
      <div ref={mapContainer} className="absolute inset-0" />
      <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm rounded-lg p-3 text-xs">
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
    </div>
  );
}
