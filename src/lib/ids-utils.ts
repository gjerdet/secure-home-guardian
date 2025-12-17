interface IdsAlert {
  id: string;
  timestamp: string;
  severity: string;
  category: string;
  signature: string;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  action: string;
  country?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  isp?: string;
}

export function exportToCSV(alerts: IdsAlert[], filename: string = "ids-alerts.csv") {
  const headers = [
    "ID",
    "Timestamp",
    "Severity",
    "Category",
    "Signature",
    "Source IP",
    "Source Port",
    "Destination IP",
    "Destination Port",
    "Action",
    "Country",
    "City",
    "ISP",
    "Latitude",
    "Longitude"
  ];

  const csvContent = [
    headers.join(","),
    ...alerts.map(alert => [
      alert.id,
      `"${alert.timestamp}"`,
      alert.severity,
      `"${alert.category}"`,
      `"${alert.signature.replace(/"/g, '""')}"`,
      alert.srcIp,
      alert.srcPort,
      alert.dstIp,
      alert.dstPort,
      alert.action,
      alert.country || "",
      alert.city || "",
      alert.isp || "",
      alert.lat || "",
      alert.lng || ""
    ].join(","))
  ].join("\n");

  downloadFile(csvContent, filename, "text/csv;charset=utf-8;");
}

export function exportToJSON(alerts: IdsAlert[], filename: string = "ids-alerts.json") {
  const jsonContent = JSON.stringify(alerts, null, 2);
  downloadFile(jsonContent, filename, "application/json");
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// GeoIP lookup using free ip-api.com (no API key needed, 45 requests/minute limit)
// For production, consider running a local MaxMind GeoLite2 database
export async function lookupGeoIP(ip: string): Promise<{
  country: string;
  countryCode: string;
  city: string;
  lat: number;
  lng: number;
  isp: string;
} | null> {
  // Skip private/internal IPs
  if (isPrivateIP(ip)) {
    return null;
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,lat,lon,isp`);
    const data = await response.json();
    
    if (data.status === "success") {
      return {
        country: data.country,
        countryCode: data.countryCode,
        city: data.city,
        lat: data.lat,
        lng: data.lon,
        isp: data.isp
      };
    }
    return null;
  } catch (error) {
    console.error("GeoIP lookup failed:", error);
    return null;
  }
}

// Batch lookup with rate limiting (max 15 per batch to stay under limit)
export async function batchLookupGeoIP(ips: string[]): Promise<Map<string, {
  country: string;
  countryCode: string;
  city: string;
  lat: number;
  lng: number;
  isp: string;
}>> {
  const uniqueIps = [...new Set(ips.filter(ip => !isPrivateIP(ip)))];
  const results = new Map();

  // Process in batches of 15 with 1 second delay between batches
  for (let i = 0; i < uniqueIps.length; i += 15) {
    const batch = uniqueIps.slice(i, i + 15);
    
    try {
      const response = await fetch("http://ip-api.com/batch?fields=status,query,country,countryCode,city,lat,lon,isp", {
        method: "POST",
        body: JSON.stringify(batch)
      });
      const data = await response.json();
      
      data.forEach((result: any) => {
        if (result.status === "success") {
          results.set(result.query, {
            country: result.country,
            countryCode: result.countryCode,
            city: result.city,
            lat: result.lat,
            lng: result.lon,
            isp: result.isp
          });
        }
      });
    } catch (error) {
      console.error("Batch GeoIP lookup failed:", error);
    }

    // Wait 1 second between batches to respect rate limits
    if (i + 15 < uniqueIps.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

function isPrivateIP(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true;
  
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 127.0.0.0/8 (localhost)
  if (parts[0] === 127) return true;
  
  return false;
}
