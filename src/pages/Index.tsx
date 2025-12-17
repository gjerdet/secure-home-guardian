import { Header } from "@/components/Header";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

const Index = () => {
  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />

      <main className="container mx-auto px-4 py-6">
        <DashboardLayout />
      </main>
    </div>
  );
};

export default Index;
