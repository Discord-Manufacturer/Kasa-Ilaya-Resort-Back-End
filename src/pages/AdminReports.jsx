import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { Loader2, TrendingUp, CalendarCheck2, Wallet, Clock3, Download, Printer } from "lucide-react";
import { baseClient } from "@/api/baseClient";
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

const REPORT_PERIODS = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annually" },
];

const parseDateValue = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = typeof value === "string" ? parseISO(value) : new Date(value);
  return isValid(parsedDate) ? parsedDate : null;
};

const getBookingDate = (booking) => parseDateValue(booking.booking_date || booking.created_date);

const getPeriodMeta = (period) => {
  const today = new Date();

  if (period === "monthly") {
    const start = startOfMonth(today);
    const end = endOfMonth(today);

    return {
      key: period,
      label: "Monthly",
      heading: "Monthly Report",
      rangeLabel: `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`,
      seriesTitle: "Bookings By Day (This Month)",
      start,
      end,
    };
  }

  if (period === "annual") {
    const start = startOfYear(today);
    const end = endOfYear(today);

    return {
      key: period,
      label: "Annual",
      heading: "Annual Report",
      rangeLabel: `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`,
      seriesTitle: "Bookings By Month (This Year)",
      start,
      end,
    };
  }

  const start = startOfWeek(today, { weekStartsOn: 1 });
  const end = endOfWeek(today, { weekStartsOn: 1 });

  return {
    key: "weekly",
    label: "Weekly",
    heading: "Weekly Report",
    rangeLabel: `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`,
    seriesTitle: "Bookings By Day (This Week)",
    start,
    end,
  };
};

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

export default function AdminReports() {
  const [reportPeriod, setReportPeriod] = useState("weekly");

  const { data: bookings = [], isLoading: isLoadingBookings } = useQuery({
    queryKey: ["admin-reports-bookings"],
    queryFn: () => baseClient.entities.Booking.list("-created_date", 1000),
  });

  const { data: packages = [], isLoading: isLoadingPackages } = useQuery({
    queryKey: ["admin-reports-packages"],
    queryFn: () => baseClient.entities.Package.list("name", 300),
  });

  const { data: logs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ["admin-reports-logs"],
    queryFn: () => baseClient.entities.ActivityLog.list("-created_date", 200),
  });

  const isLoading = isLoadingBookings || isLoadingPackages || isLoadingLogs;

  const periodMeta = useMemo(() => getPeriodMeta(reportPeriod), [reportPeriod]);

  const filteredBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        const bookingDate = getBookingDate(booking);

        return bookingDate && bookingDate >= periodMeta.start && bookingDate <= periodMeta.end;
      }),
    [bookings, periodMeta]
  );

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        const createdDate = parseDateValue(log.created_date);

        return createdDate && createdDate >= periodMeta.start && createdDate <= periodMeta.end;
      }),
    [logs, periodMeta]
  );

  const report = useMemo(() => {
    const activeBookings = filteredBookings.filter((booking) => booking.status !== "cancelled");
    const paidBookings = filteredBookings.filter((booking) => booking.payment_status === "paid");
    const confirmedOrCompleted = filteredBookings.filter((booking) => ["confirmed", "completed"].includes(booking.status));

    const totalRevenue = confirmedOrCompleted.reduce((sum, booking) => sum + safeNumber(booking.total_amount), 0);
    const totalPaidRevenue = paidBookings.reduce((sum, booking) => sum + safeNumber(booking.total_amount), 0);

    const byStatus = {
      pending: filteredBookings.filter((booking) => booking.status === "pending").length,
      confirmed: filteredBookings.filter((booking) => booking.status === "confirmed").length,
      completed: filteredBookings.filter((booking) => booking.status === "completed").length,
      cancelled: filteredBookings.filter((booking) => booking.status === "cancelled").length,
    };

    const packageStats = packages
      .map((pkg) => {
        const packageBookings = filteredBookings.filter((booking) => booking.package_name === pkg.name);
        const packageRevenue = packageBookings
          .filter((booking) => ["confirmed", "completed"].includes(booking.status))
          .reduce((sum, booking) => sum + safeNumber(booking.total_amount), 0);

        return {
          id: pkg.id,
          name: pkg.name,
          bookingCount: packageBookings.length,
          revenue: packageRevenue,
        };
      })
      .sort((left, right) => right.bookingCount - left.bookingCount)
      .slice(0, 5);

    const seriesDates =
      reportPeriod === "annual"
        ? eachMonthOfInterval({ start: periodMeta.start, end: periodMeta.end })
        : eachDayOfInterval({ start: periodMeta.start, end: periodMeta.end });

    const series = seriesDates.map((dateValue) => {
      const key = format(dateValue, reportPeriod === "annual" ? "yyyy-MM" : "yyyy-MM-dd");
      const label = format(dateValue, reportPeriod === "annual" ? "MMM yyyy" : "MMM d");

      const periodBookings = filteredBookings.filter((booking) => {
        const bookingDate = getBookingDate(booking);

        if (!bookingDate) {
          return false;
        }

        return format(bookingDate, reportPeriod === "annual" ? "yyyy-MM" : "yyyy-MM-dd") === key;
      });

      const periodRevenue = periodBookings
        .filter((booking) => ["confirmed", "completed"].includes(booking.status))
        .reduce((sum, booking) => sum + safeNumber(booking.total_amount), 0);

      return {
        key,
        label,
        bookings: periodBookings.length,
        revenue: periodRevenue,
      };
    });

    const maxBookingsPerPeriod = Math.max(...series.map((entry) => entry.bookings), 1);

    const pendingCount = byStatus.pending || 0;
    const paidCount = paidBookings.length;
    const totalBookingCount = filteredBookings.length;
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
      totalBookings: filteredBookings.length,
      activeBookings: activeBookings.length,
      totalRevenue,
      totalPaidRevenue,
      byStatus,
      packageStats,
      series,
      maxBookingsPerPeriod,
      revenueCircle,
      periodLabel: periodMeta.label,
      periodHeading: periodMeta.heading,
      periodRangeLabel: periodMeta.rangeLabel,
      seriesTitle: periodMeta.seriesTitle,
    };
  }, [filteredBookings, packages, periodMeta, reportPeriod]);

  const handleExportExcel = () => {
    const rows = [
      [`Kasa Ilaya Resort - ${report.periodHeading}`],
      [`Generated At`, format(new Date(), "MMM d, yyyy h:mm a")],
      ["Report Period", report.periodRangeLabel],
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
      [
        "Collection Rate",
        `${currency.format(report.totalPaidRevenue)} of ${currency.format(report.totalRevenue)}`,
        `${Math.round(report.revenueCircle.collectionRatePct)}%`,
      ],
      [
        "Paid Bookings Share",
        `${formatNumber(report.revenueCircle.paidCount)} / ${formatNumber(report.revenueCircle.totalBookingCount)} bookings`,
        `${Math.round(report.revenueCircle.paidBookingsPct)}%`,
      ],
      [
        "Pending Bookings Share",
        `${formatNumber(report.revenueCircle.pendingCount)} / ${formatNumber(report.revenueCircle.totalBookingCount)} bookings`,
        `${Math.round(report.revenueCircle.pendingBookingsPct)}%`,
      ],
      [],
      ["Booking Status Breakdown"],
      ["Status", "Count"],
      ...Object.entries(report.byStatus).map(([status, count]) => [status, count]),
      [],
      [report.seriesTitle],
      [report.periodLabel === "Annual" ? "Month" : "Date", "Bookings", "Revenue"],
      ...report.series.map((entry) => [entry.label, entry.bookings, entry.revenue]),
      [],
      ["Top Packages By Booking Count"],
      ["Package", "Bookings", "Revenue"],
      ...report.packageStats.map((pkg) => [pkg.name, pkg.bookingCount, pkg.revenue]),
      [],
      ["Recent Activity Logs"],
      ["Date", "Action", "User", "Details"],
      ...filteredLogs.map((log) => [
        log.created_date ? format(new Date(log.created_date), "MMM d, yyyy h:mm a") : "No date",
        log.action || "",
        log.user_name || log.user_email || "System",
        log.details || "",
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => escapeCsvValue(cell)).join(","))
      .join("\r\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `admin-reports-${periodMeta.key}-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintReport = () => {
    const printWindow = window.open("", "_blank", "width=1000,height=800");
    if (!printWindow) {
      return;
    }

    const statusRows = Object.entries(report.byStatus)
      .map(
        ([status, count]) =>
          `<tr><td>${escapeHtml(status)}</td><td class=\"num\">${escapeHtml(formatNumber(count))}</td></tr>`
      )
      .join("");

    const seriesRows = report.series
      .map(
        (entry) =>
          `<tr><td>${escapeHtml(entry.label)}</td><td class=\"num\">${escapeHtml(
            formatNumber(entry.bookings)
          )}</td><td class=\"num\">${escapeHtml(currency.format(entry.revenue))}</td></tr>`
      )
      .join("");

    const circleCards = [
      {
        title: "Collection Rate",
        subtitle: `${currency.format(report.totalPaidRevenue)} of ${currency.format(report.totalRevenue)}`,
        pct: Math.round(report.revenueCircle.collectionRatePct),
      },
      {
        title: "Paid Bookings",
        subtitle: `${formatNumber(report.revenueCircle.paidCount)} of ${formatNumber(report.revenueCircle.totalBookingCount)} bookings`,
        pct: Math.round(report.revenueCircle.paidBookingsPct),
      },
      {
        title: "Pending Bookings",
        subtitle: `${formatNumber(report.revenueCircle.pendingCount)} of ${formatNumber(report.revenueCircle.totalBookingCount)} bookings`,
        pct: Math.round(report.revenueCircle.pendingBookingsPct),
      },
    ]
      .map(
        (item) => `<div class=\"circle-card\">
          <div class=\"ring\" style=\"--pct:${Math.min(100, Math.max(0, item.pct))};\">
            <span>${escapeHtml(toPercent(item.pct))}</span>
          </div>
          <div class=\"ring-title\">${escapeHtml(item.title)}</div>
          <div class=\"ring-subtitle\">${escapeHtml(item.subtitle)}</div>
        </div>`
      )
      .join("");

    const packageRows = (report.packageStats.length ? report.packageStats : [{ name: "No data", bookingCount: 0, revenue: 0 }])
      .map(
        (pkg) =>
          `<tr><td>${escapeHtml(pkg.name)}</td><td class=\"num\">${escapeHtml(
            formatNumber(pkg.bookingCount)
          )}</td><td class=\"num\">${escapeHtml(currency.format(pkg.revenue))}</td></tr>`
      )
      .join("");

    const activityRows = (
      filteredLogs.length
        ? filteredLogs
        : [{ created_date: null, action: "No activity logs for this period", user_name: "", user_email: "", details: "" }]
    )
      .map((log) => {
        const dateLabel = log.created_date ? format(new Date(log.created_date), "MMM d, yyyy h:mm a") : "No date";
        return `<tr><td>${escapeHtml(dateLabel)}</td><td>${escapeHtml(log.action || "")}</td><td>${escapeHtml(
          log.user_name || log.user_email || "System"
        )}</td><td>${escapeHtml(log.details || "")}</td></tr>`;
      })
      .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\" />
  <title>${escapeHtml(report.periodHeading)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    h1 { margin: 0 0 4px; font-size: 24px; }
    .meta { color: #6b7280; margin-bottom: 20px; font-size: 12px; }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 18px; }
    .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
    .label { color: #6b7280; font-size: 12px; margin-bottom: 4px; }
    .value { font-size: 18px; font-weight: 700; }
    .circle-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 8px 0 18px; }
    .circle-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
    .ring {
      --pct: 0;
      width: 90px;
      height: 90px;
      border-radius: 999px;
      margin: 0 auto 8px;
      background: conic-gradient(#2563eb calc(var(--pct) * 1%), #e5e7eb 0);
      display: grid;
      place-items: center;
      position: relative;
      font-weight: 700;
      font-size: 14px;
      color: #111827;
    }
    .ring::before {
      content: "";
      width: 66px;
      height: 66px;
      border-radius: 999px;
      background: #fff;
      position: absolute;
      inset: 0;
      margin: auto;
    }
    .ring span { position: relative; z-index: 1; }
    .ring-title { font-size: 12px; font-weight: 700; color: #111827; }
    .ring-subtitle { font-size: 11px; color: #6b7280; margin-top: 3px; line-height: 1.3; }
    h2 { font-size: 16px; margin: 18px 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid #e5e7eb; padding: 7px 8px; font-size: 12px; text-align: left; vertical-align: top; }
    th { background: #f9fafb; }
    .num { text-align: right; }
    @media (max-width: 700px) {
      .cards, .circle-grid { grid-template-columns: 1fr; }
    }
    @media print {
      body { margin: 10mm; }
    }
  </style>
</head>
<body>
  <h1>Kasa Ilaya Resort - ${escapeHtml(report.periodHeading)}</h1>
  <div class=\"meta\">Generated ${escapeHtml(format(new Date(), "MMM d, yyyy h:mm a"))} | Coverage ${escapeHtml(
      report.periodRangeLabel
    )}</div>

  <div class=\"cards\">
    <div class=\"card\"><div class=\"label\">Total Bookings</div><div class=\"value\">${escapeHtml(
      formatNumber(report.totalBookings)
    )}</div></div>
    <div class=\"card\"><div class=\"label\">Active Reservations</div><div class=\"value\">${escapeHtml(
      formatNumber(report.activeBookings)
    )}</div></div>
    <div class=\"card\"><div class=\"label\">Revenue (Confirmed/Completed)</div><div class=\"value\">${escapeHtml(
      currency.format(report.totalRevenue)
    )}</div></div>
    <div class=\"card\"><div class=\"label\">Paid Revenue</div><div class=\"value\">${escapeHtml(
      currency.format(report.totalPaidRevenue)
    )}</div></div>
  </div>

  <h2>Revenue Circle Snapshot</h2>
  <div class=\"circle-grid\">${circleCards}</div>

  <h2>Booking Status Breakdown</h2>
  <table>
    <thead><tr><th>Status</th><th class=\"num\">Count</th></tr></thead>
    <tbody>${statusRows}</tbody>
  </table>

  <h2>${escapeHtml(report.seriesTitle)}</h2>
  <table>
    <thead><tr><th>${escapeHtml(report.periodLabel === "Annual" ? "Month" : "Date")}</th><th class=\"num\">Bookings</th><th class=\"num\">Revenue</th></tr></thead>
    <tbody>${seriesRows}</tbody>
  </table>

  <h2>Top Packages By Booking Count</h2>
  <table>
    <thead><tr><th>Package</th><th class=\"num\">Bookings</th><th class=\"num\">Revenue</th></tr></thead>
    <tbody>${packageRows}</tbody>
  </table>

  <h2>Recent Activity Logs</h2>
  <table>
    <thead><tr><th>Date</th><th>Action</th><th>User</th><th>Details</th></tr></thead>
    <tbody>${activityRows}</tbody>
  </table>

  <script>
    setTimeout(function () {
      window.focus();
      window.print();
    }, 250);
  </script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-28">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">
            {report.periodHeading} covering {report.periodRangeLabel}.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {REPORT_PERIODS.map((period) => (
              <Button
                key={period.value}
                type="button"
                variant={reportPeriod === period.value ? "default" : "outline"}
                onClick={() => setReportPeriod(period.value)}
              >
                {period.label}
              </Button>
            ))}
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
      </div>

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
            <CardTitle className="font-display text-xl">{report.seriesTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.series.map((entry) => {
              const width = `${Math.max((entry.bookings / report.maxBookingsPerPeriod) * 100, 6)}%`;

              return (
                <div key={entry.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{entry.label}</span>
                    <span className="text-muted-foreground">
                      {entry.bookings} bookings · {currency.format(entry.revenue)}
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
                <Badge variant="outline" className={statusColors[status]}>
                  {status}
                </Badge>
                <span className="text-sm font-medium text-foreground">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
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

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Activity Logs For This Period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity logs for this period.</p>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{log.action}</p>
                    <span className="text-xs text-muted-foreground">
                      {log.created_date ? format(new Date(log.created_date), "MMM d, yyyy h:mm a") : "No date"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{log.user_name || log.user_email || "System"}</p>
                  {log.details ? <p className="text-sm mt-2 text-muted-foreground">{log.details}</p> : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
