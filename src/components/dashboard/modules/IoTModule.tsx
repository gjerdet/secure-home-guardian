import { IoTDeviceList } from "@/components/IoTDeviceList";

export function IoTModule() {
  return (
    <IoTDeviceList 
      devices={[]} 
      className="animate-fade-in [animation-delay:700ms]" 
    />
  );
}