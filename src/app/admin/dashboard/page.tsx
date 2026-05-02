"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Truck, CheckCircle, XCircle, Users, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

interface DashboardStats {
  totalOrders: number;
  bozze: number;
  inLavorazione: number;
  spediti: number;
  consegnati: number;
  annullati: number;
  totalCustomers: number;
  thisMonthOrders: number;
}

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role === "admin") {
      fetchStats();
    }
  }, [user]);

  async function fetchStats() {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to load dashboard stats", error);
    } finally {
      setLoadingStats(false);
    }
  }

  if (loading || loadingStats) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Caricamento dashboard...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return <div className="px-4 py-8 sm:px-6">Errore nel caricamento delle statistiche.</div>;
  }

  const statCards = [
    {
      title: "Totale Ordini",
      value: stats.totalOrders,
      icon: Package,
      color: "text-blue-600",
    },
    {
      title: "In Lavorazione",
      value: stats.inLavorazione,
      icon: Truck,
      color: "text-purple-600",
    },
    {
      title: "Spediti",
      value: stats.spediti,
      icon: Truck,
      color: "text-indigo-600",
    },
    {
      title: "Consegnati",
      value: stats.consegnati,
      icon: CheckCircle,
      color: "text-emerald-600",
    },
    {
      title: "Annullati",
      value: stats.annullati,
      icon: XCircle,
      color: "text-red-600",
    },
    {
      title: "Clienti",
      value: stats.totalCustomers,
      icon: Users,
      color: "text-amber-600",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-6 space-y-5 sm:space-y-6 lg:space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Panoramica dell&apos;attivita commerciale
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl sm:text-4xl font-bold">{stat.value}</div>
              {stat.title === "Totale Ordini" && (
                <p className="text-xs text-emerald-600 flex items-center gap-1 mt-2">
                  <TrendingUp className="h-3 w-3" />
                  +12% rispetto al mese scorso
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ordini recenti</CardTitle>
          <CardDescription>Ultimi 5 ordini inseriti</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            (Implementazione completa dei dati recenti in fase di sviluppo)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
