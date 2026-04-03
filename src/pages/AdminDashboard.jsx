import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subMonths } from "date-fns";
import { Loader2, TrendingUp, CalendarCheck2, Wallet, Clock3, Download, Printer } from "lucide-react";
import { baseClient } from "@/api/baseClient";
import ActivityLogSummaryCards from "@/components/admin/ActivityLogSummaryCards";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdmin } from "@/lib/adminAccess";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import RevenueCards from "@/components/admin/RevenueCards";
import RevenueChart from "@/components/admin/RevenueChart";

const currency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const statusColors = {
  pending: "bg-accent/20 text-accent-foreground border-accent/30",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

const safeNumber = (value) => Number(value || 0);
const formatNumber = (value) => new Intl.NumberFormat("en-PH").format(Number(value || 0));
const toPercent = (value) => `${Math.round(Number(value || 0))}%`;

const escapeCsvValue = (value) => {
  const normalized = String(value ?? "").replace(/\r?\n|\r/g, " ").trim();
  return `"${normalized.replace(/"/g, '""')}"`;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export default function AdminDashboard() {
  const { user } = useAuth();
  const canViewLogAnalytics = isSuperAdmin(user);

  const { data: bookings = [], isLoading: isLoadingBookings } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: () => baseClient.entities.Booking.list("-created_date", 1000),
  });

  const { data: packages = [], isLoading: isLoadingPackages } = useQuery({
    queryKey: ["admin-reports-packages"],
    queryFn: () => baseClient.entities.Package.list("name", 300),
  });

  const { data: logs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ["admin-activity-logs"],
    queryFn: () => baseClient.entities.ActivityLog.list("-created_date", 400),
  });

  const isLoading = isLoadingBookings || isLoadingPackages || isLoadingLogs;

  const report = useMemo(() => {
    const activeBookings = bookings.filter((b) => b.status !== "cancelled");
    const paidBookings = bookings.filter((b) => b.payment_status === "paid");
    const confirmedOrCompleted = bookings.filter((b) => ["confirmed", "completed"].includes(b.status));

    const totalRevenue = confirmedOrCompleted.reduce((sum, b) => sum + safeNumber(b.total_amount), 0);
    const totalPaidRevenue = paidBookings.reduce((sum, b) => sum + safeNumber(b.total_amount), 0);

    const byStatus = {
      pending: bookings.filter((b) => b.status === "pending").length,
      confirmed: bookings.filter((b) => b.status === "confirmed").length,
      completed: bookings.filter((b) => b.status === "completed").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
    };

    const packageStats = packages
      .map((pkg) => {
        const pkgBookings = bookings.filter((b) => b.package_name === pkg.name);
        const pkgRevenue = pkgBookings
          .filter((b) => ["confirmed", "completed"].includes(b.status))
          .reduce((sum, b) => sum + safeNumber(b.total_amount), 0);
        return { id: pkg.id, name: pkg.name, bookingCount: pkgBookings.length, revenue: pkgRevenue };
      })
      .sort((a, b) => b.bookingCount - a.bookingCount)
      .slice(0, 5);

    const monthlySeries = Array.from({ length: 6 }, (_, i) => {
      const monthDate = subMonths(new Date(), 5 - i);
      const key = format(monthDate, "yyyy-MM");
      const label = format(monthDate, "MMM yyyy");
      const monthBookings = bookings.filter(
        (b) => b.booking_date && format(parseISO(b.booking_date), "yyyy-MM") === key
      );
      const monthRevenue = monthBookings
        .filter((b) => ["confirmed", "completed"].includes(b.status))
        .reduce((sum, b) => sum + safeNumber(b.total_amount), 0);
      return { key, label, bookings: monthBookings.length, revenue: monthRevenue };
    });

    const maxBookingsPerMonth = Math.max(...monthlySeries.map((m) => m.bookings), 1);
    const pendingCount = byStatus.pending || 0;
    const paidCount = paidBookings.length;
    const totalBookingCount = bookings.length;
    const totalRevenueBase = Math.max(totalRevenue, 0);

    const revenueCircle = {
      collectionRatePct: totalRevenueBase > 0 ? (totalPaidRevenue / totalRevenueBase) * 100 : 0,
      paidBookingsPct: totalBookingCount > 0 ? (paidCount / totalBookingCount) * 100 : 0,
      pendingBookingsPct: totalBookingCount > 0 ? (pendingCount / totalBookingCount) * 100 : 0,
      paidCount,
      pendingCount,
      totalBookingCount,
    };

    return {
      totalBookings: bookings.length,
      activeBookings: activeBookings.length,
      totalRevenue,
      totalPaidRevenue,
      byStatus,
      packageStats,
      monthlySeries,
      maxBookingsPerMonth,
      revenueCircle,
    };
  }, [bookings, packages]);

  const handleExportExcel = () => {
    const rows = [
      ["Kasa Ilaya Resort - Admin Reports"],
      [`Generated At`, format(new Date(), "MMM d, yyyy h:mm a")],
      [],
      ["Summary"],
      ["Total Bookings", report.totalBookings],
      ["Active Reservations", report.activeBookings],
      ["Revenue (Confirmed/Completed)", report.totalRevenue],
      ["Paid Revenue", report.totalPaidRevenue],
      ["Collection Rate", `${Math.round(report.revenueCircle.collectionRatePct)}%`],
      [],
      ["Revenue Circle Breakdown"],
      ["Metric", "Value", "Percent"],
      ["Collection Rate", `${currency.format(report.totalPaidRevenue)} of ${currency.format(report.totalRevenue)}`, `${Math.round(report.revenueCircle.collectionRatePct)}%`],
      ["Paid Bookings Share", `${formatNumber(report.revenueCircle.paidCount)} / ${formatNumber(report.revenueCircle.totalBookingCount)} bookings`, `${Math.round(report.revenueCircle.paidBookingsPct)}%`],
      ["Pending Bookings Share", `${formatNumber(report.revenueCircle.pendingCount)} / ${formatNumber(report.revenueCircle.totalBookingCount)} bookings`, `${Math.round(report.revenueCircle.pendingBookingsPct)}%`],
      [],
      ["Booking Status Breakdown"],
      ["Status", "Count"],
      ...Object.entries(report.byStatus).map(([s, c]) => [s, c]),
      [],
      ["Bookings By Month"],
      ["Month", "Bookings", "Revenue"],
      ...report.monthlySeries.map((m) => [m.label, m.bookings, m.revenue]),
      [],
      ["Top Packages By Booking Count"],
      ["Package", "Bookings", "Revenue"],
      ...report.packageStats.map((p) => [p.name, p.bookingCount, p.revenue]),
    ];

    const csv = rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `admin-reports-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintReport = () => {
    const printWindow = window.open("", "_blank", "width=1000,height=800");
    if (!printWindow) return;

    const statusRows = Object.entries(report.byStatus)
      .map(([s, c]) => `<tr><td>${escapeHtml(s)}</td><td class="num">${escapeHtml(formatNumber(c))}</td></tr>`)
      .join("");

    const monthRows = report.monthlySeries
      .map((m) => `<tr><td>${escapeHtml(m.label)}</td><td class="num">${escapeHtml(formatNumber(m.bookings))}</td><td class="num">${escapeHtml(currency.format(m.revenue))}</td></tr>`)
      .join("");

    const circleCards = [
      { title: "Collection Rate", subtitle: `${currency.format(report.totalPaidRevenue)} of ${currency.format(report.totalRevenue)}`, pct: Math.round(report.revenueCircle.collectionRatePct) },
      { title: "Paid Bookings", subtitle: `${formatNumber(report.revenueCircle.paidCount)} of ${formatNumber(report.revenueCircle.totalBookingCount)} bookings`, pct: Math.round(report.revenueCircle.paidBookingsPct) },
      { title: "Pending Bookings", subtitle: `${formatNumber(report.revenueCircle.pendingCount)} of ${formatNumber(report.revenueCircle.totalBookingCount)} bookings`, pct: Math.round(report.revenueCircle.pendingBookingsPct) },
    ]
      .map((item) => `<div class="circle-card"><div class="ring" style="--pct:${Math.min(100, Math.max(0, item.pct))};"><span>${escapeHtml(toPercent(item.pct))}</span></div><div class="ring-title">${escapeHtml(item.title)}</div><div class="ring-subtitle">${escapeHtml(item.subtitle)}</div></div>`)
      .join("");

    const packageRows = (report.packageStats.length ? report.packageStats : [{ name: "No data", bookingCount: 0, revenue: 0 }])
      .map((p) => `<tr><td>${escapeHtml(p.name)}</td><td class="num">${escapeHtml(formatNumber(p.bookingCount))}</td><td class="num">${escapeHtml(currency.format(p.revenue))}</td></tr>`)
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Admin Reports</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111827}h1{margin:0 0 4px;font-size:24px}.meta{color:#6b7280;margin-bottom:20px;font-size:12px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:18px}.card{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px}.label{color:#6b7280;font-size:12px;margin-bottom:4px}.value{font-size:18px;font-weight:700}.circle-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:8px 0 18px}.circle-card{border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center}.ring{--pct:0;width:90px;height:90px;border-radius:999px;margin:0 auto 8px;background:conic-gradient(#2563eb calc(var(--pct)*1%),#e5e7eb 0);display:grid;place-items:center;position:relative;font-weight:700;font-size:14px;color:#111827}.ring::before{content:"";width:66px;height:66px;border-radius:999px;background:#fff;position:absolute;inset:0;margin:auto}.ring span{position:relative;z-index:1}.ring-title{font-size:12px;font-weight:700;color:#111827}.ring-subtitle{font-size:11px;color:#6b7280;margin-top:3px;line-height:1.3}h2{font-size:16px;margin:18px 0 8px}table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{border:1px solid #e5e7eb;padding:7px 8px;font-size:12px;text-align:left;vertical-align:top}th{background:#f9fafb}.num{text-align:right}@media print{body{margin:10mm}}</style></head><body>
<h1>Kasa Ilaya Resort - Admin Reports</h1>
<div class="meta">Generated ${escapeHtml(format(new Date(), "MMM d, yyyy h:mm a"))}</div>
<div class="cards"><div class="card"><div class="label">Total Bookings</div><div class="value">${escapeHtml(formatNumber(report.totalBookings))}</div></div><div class="card"><div class="label">Active Reservations</div><div class="value">${escapeHtml(formatNumber(report.activeBookings))}</div></div><div class="card"><div class="label">Revenue (Confirmed/Completed)</div><div class="value">${escapeHtml(currency.format(report.totalRevenue))}</div></div><div class="card"><div class="label">Paid Revenue</div><div class="value">${escapeHtml(currency.format(report.totalPaidRevenue))}</div></div></div>
<h2>Revenue Circle Snapshot</h2><div class="circle-grid">${circleCards}</div>
<h2>Booking Status Breakdown</h2><table><thead><tr><th>Status</th><th class="num">Count</th></tr></thead><tbody>${statusRows}</tbody></table>
<h2>Bookings By Month (Last 6 Months)</h2><table><thead><tr><th>Month</th><th class="num">Bookings</th><th class="num">Revenue</th></tr></thead><tbody>${monthRows}</tbody></table>
<h2>Top Packages By Booking Count</h2><table><thead><tr><th>Package</th><th class="num">Bookings</th><th class="num">Revenue</th></tr></thead><tbody>${packageRows}</tbody></table>
<script>setTimeout(function(){window.focus();window.print();},250);</script></body></html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of resort bookings, revenue, and activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={handleExportExcel}>
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Button type="button" className="gap-2" onClick={handlePrintReport}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <RevenueCards bookings={bookings} />
      {canViewLogAnalytics ? <ActivityLogSummaryCards logs={logs} /> : null}
      <RevenueChart bookings={bookings} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Bookings</p>
                <p className="text-3xl font-bold">{report.totalBookings}</p>
              </div>
              <CalendarCheck2 className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Reservations</p>
                <p className="text-3xl font-bold">{report.activeBookings}</p>
              </div>
              <Clock3 className="h-8 w-8 text-secondary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Revenue (Confirmed/Completed)</p>
                <p className="text-2xl font-bold">{currency.format(report.totalRevenue)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Paid Revenue</p>
                <p className="text-2xl font-bold">{currency.format(report.totalPaidRevenue)}</p>
              </div>
              <Wallet className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Bookings By Month (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.monthlySeries.map((month) => {
              const width = `${Math.max((month.bookings / report.maxBookingsPerMonth) * 100, 6)}%`;
              return (
                <div key={month.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{month.label}</span>
                    <span className="text-muted-foreground">
                      {month.bookings} bookings · {currency.format(month.revenue)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted">
                    <div className="h-2.5 rounded-full bg-primary" style={{ width }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Booking Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(report.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
                <Badge variant="outline" className={statusColors[status]}>{status}</Badge>
                <span className="text-sm font-medium text-foreground">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Top Packages By Booking Count</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.packageStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      No package data available.
                    </TableCell>
                  </TableRow>
                ) : (
                  report.packageStats.map((pkg) => (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium">{pkg.name}</TableCell>
                      <TableCell className="text-right">{pkg.bookingCount}</TableCell>
                      <TableCell className="text-right">{currency.format(pkg.revenue)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
