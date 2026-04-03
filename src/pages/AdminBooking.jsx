import React, { useState, useEffect } from "react";
import { baseClient } from "@/api/baseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Loader2, Eye, CheckCircle2, CheckCheck, LayoutList, CalendarDays } from "lucide-react";
import { format, addDays } from "date-fns";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

const statusColors = {
  pending: "bg-accent/20 text-accent-foreground",
  confirmed: "bg-primary/10 text-primary",
  cancelled: "bg-destructive/10 text-destructive",
  completed: "bg-muted text-muted-foreground",
};

const paymentColors = {
  unpaid: "bg-destructive/10 text-destructive",
  pending_verification: "bg-accent/20 text-accent-foreground",
  paid: "bg-primary/10 text-primary",
};

const BOOKING_COLORS = {
  pending: "#f59e0b",
  confirmed: "#16a34a",
  completed: "#6b7280",
  cancelled: "#ef4444",
};

const tourLabels = {
  day_tour: "Day Tour",
  night_tour: "Night Tour",
  "22_hours": "22 Hours",
};

const formatBookingDate = (bookingDate) => {
  if (!bookingDate) {
    return "your selected date";
  }

  try {
    return format(new Date(bookingDate), "MMMM d, yyyy");
  } catch {
    return bookingDate;
  }
};

const buildBookingStatusEmail = (booking, newStatus) => {
  const bookingDate = formatBookingDate(booking?.booking_date);
  const customerName = booking?.customer_name || "Guest";
  const bookingReference = booking?.booking_reference || "your reservation";
  const packageName = booking?.package_name || "your selected package";
  const tourType = tourLabels[booking?.tour_type] || booking?.tour_type || "Selected Tour";

  if (newStatus === "confirmed") {
    return {
      subject: `Booking Confirmed - ${bookingReference} | Kasa Ilaya`,
      body: `
        <h2>Your booking has been confirmed</h2>
        <p>Dear ${customerName},</p>
        <p>Your reservation <strong>${bookingReference}</strong> has been approved.</p>
        <p><strong>Package:</strong> ${packageName}<br />
        <strong>Tour Type:</strong> ${tourType}<br />
        <strong>Date:</strong> ${bookingDate}</p>
        <p>Your payment has been verified and your booking is now confirmed. Please keep your booking reference for check-in.</p>
        <p>We look forward to welcoming you to Kasa Ilaya Resort.</p>
      `,
    };
  }

  if (newStatus === "cancelled") {
    return {
      subject: `Booking Declined - ${bookingReference} | Kasa Ilaya`,
      body: `
        <h2>Your booking was not approved</h2>
        <p>Dear ${customerName},</p>
        <p>We regret to inform you that your reservation <strong>${bookingReference}</strong> for ${packageName} on ${bookingDate} was declined.</p>
        <p>If you believe this was a mistake or you need clarification, please contact the resort directly so our team can assist you.</p>
        <p>Thank you for considering Kasa Ilaya Resort.</p>
      `,
    };
  }

  return null;
};

export default function AdminBookings() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [user, setUser] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "list" | "calendar"

  useEffect(() => {
    baseClient.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["admin-all-bookings"],
    queryFn: () => baseClient.entities.Booking.list("-created_date", 500),
  });

  const filtered = statusFilter === "all"
    ? bookings
    : bookings.filter(b => b.status === statusFilter);

  const getNextPaymentStatus = (booking, newStatus) => {
    if (newStatus === "confirmed" || newStatus === "completed") {
      return "paid";
    }

    if (newStatus === "cancelled") {
      return booking.payment_status || "unpaid";
    }

    return booking.payment_status || "unpaid";
  };

  const updateStatus = async (bookingId, newStatus) => {
    if (newStatus === "cancelled") {
      toast.error("Owner and staff cannot cancel bookings. Only guests can cancel their own pending bookings before they are marked paid or approved.");
      return;
    }

    const booking = bookings.find(b => b.id === bookingId);
    const nextPaymentStatus = getNextPaymentStatus(booking, newStatus);

    await baseClient.entities.Booking.update(bookingId, {
      status: newStatus,
      payment_status: nextPaymentStatus,
    });

    await baseClient.entities.ActivityLog.create({
      user_email: user?.email,
      user_name: user?.full_name,
      action: `Booking ${newStatus}`,
      entity_type: "Booking",
      entity_id: bookingId,
      details: `Updated booking ${booking?.booking_reference} to ${newStatus} with payment status ${nextPaymentStatus}`,
    });

    const emailPayload = buildBookingStatusEmail(booking, newStatus);

    if (emailPayload && booking?.customer_email) {
      try {
        const emailResult = await baseClient.integrations.Core.SendEmail({
          to: booking.customer_email,
          subject: emailPayload.subject,
          body: emailPayload.body,
        });

        if (!emailResult?.sent) {
          toast.warning(emailResult?.error || "Booking updated, but the guest notification email was not delivered.");
        }
      } catch (emailError) {
        toast.warning(emailError?.message || "Booking updated, but the guest notification email was not delivered.");
      }
    }

    if (newStatus === "confirmed") {
      toast.success("Reservation approved and guest notification queued.");
    } else if (newStatus === "cancelled") {
      toast.success("Reservation declined and guest notification queued.");
    }

    queryClient.invalidateQueries({ queryKey: ["admin-all-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    setSelectedBooking(null);
  };

  // Build FullCalendar events from bookings
  const calendarEvents = bookings
    .filter(b => b.status !== "cancelled")
    .flatMap(b => {
      const color = BOOKING_COLORS[b.status] || BOOKING_COLORS.pending;
      const base = {
        id: `booking-${b.id}`,
        title: `${b.package_name || "Booking"} \u2013 ${b.customer_name || ""}`,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { booking: b },
      };
      if (b.tour_type === "22_hours") {
        // Span check-in + checkout day visually
        return [{
          ...base,
          start: b.booking_date,
          end: format(addDays(new Date(`${b.booking_date}T00:00:00`), 2), "yyyy-MM-dd"),
          allDay: true,
        }];
      }
      return [{ ...base, start: b.booking_date, allDay: true }];
    });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Manage Reservation</h1>
          <p className="text-muted-foreground mt-1">Review and manage customer reservations</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-none gap-1.5 px-3"
              onClick={() => setViewMode("list")}
            >
              <LayoutList className="h-4 w-4" /> List
            </Button>
            <Button
              variant={viewMode === "calendar" ? "default" : "ghost"}
              size="sm"
              className="rounded-none gap-1.5 px-3"
              onClick={() => setViewMode("calendar")}
            >
              <CalendarDays className="h-4 w-4" /> Calendar
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : viewMode === "calendar" ? (
        <>
          {/* Calendar Legend */}
          <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {Object.entries(BOOKING_COLORS).map(([status, color]) => (
              <span key={status} className="flex items-center gap-1.5 capitalize">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                {status}
              </span>
            ))}
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm fc-wrapper">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay",
              }}
              buttonText={{ today: "today", month: "month", week: "week", day: "day" }}
              events={calendarEvents}
              eventClick={(info) => setSelectedBooking(info.event.extendedProps.booking)}
              editable={false}
              dayMaxEvents={4}
              height="auto"
              eventDisplay="block"
            />
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reservation Fee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell className="font-mono text-sm">{booking.booking_reference}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{booking.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{booking.customer_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{booking.package_name}</TableCell>
                    <TableCell>{booking.booking_date && format(new Date(booking.booking_date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-semibold text-secondary">₱{booking.total_amount?.toLocaleString()}</TableCell>
                    <TableCell className="font-medium text-primary">₱{Number(booking.reservation_fee_amount || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[booking.status]}>{booking.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={paymentColors[booking.payment_status] || paymentColors.unpaid}>
                        {(booking.payment_status || "unpaid").replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setSelectedBooking(booking)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {booking.status === "confirmed" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-emerald-600"
                            title="Mark as completed"
                            onClick={() => updateStatus(booking.id, "completed")}
                          >
                            <CheckCheck className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Booking Detail Dialog */}
      <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Booking Details</DialogTitle>
          </DialogHeader>
          {selectedBooking && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Reference</span><p className="font-mono font-bold">{selectedBooking.booking_reference}</p></div>
                <div><span className="text-muted-foreground">Status</span><p><Badge className={statusColors[selectedBooking.status]}>{selectedBooking.status}</Badge></p></div>
                <div><span className="text-muted-foreground">Payment</span><p><Badge className={paymentColors[selectedBooking.payment_status] || paymentColors.unpaid}>{(selectedBooking.payment_status || "unpaid").replace(/_/g, " ")}</Badge></p></div>
                <div><span className="text-muted-foreground">Customer</span><p className="font-medium">{selectedBooking.customer_name}</p></div>
                <div><span className="text-muted-foreground">Email</span><p>{selectedBooking.customer_email}</p></div>
                <div><span className="text-muted-foreground">Phone</span><p>{selectedBooking.customer_phone}</p></div>
                <div><span className="text-muted-foreground">Guests</span><p>{selectedBooking.guest_count}</p></div>
                <div><span className="text-muted-foreground">Package</span><p className="font-medium">{selectedBooking.package_name}</p></div>
                <div><span className="text-muted-foreground">Tour</span><p>{tourLabels[selectedBooking.tour_type]}</p></div>
                <div><span className="text-muted-foreground">Date</span><p>{selectedBooking.booking_date && format(new Date(selectedBooking.booking_date), "MMM d, yyyy")}</p></div>
                <div><span className="text-muted-foreground">Total</span><p className="font-bold text-secondary">₱{selectedBooking.total_amount?.toLocaleString()}</p></div>
                <div><span className="text-muted-foreground">Reservation Fee</span><p className="font-bold text-primary">₱{Number(selectedBooking.reservation_fee_amount || 0).toLocaleString()}</p></div>
                <div><span className="text-muted-foreground">QR Payment</span><p>{selectedBooking.payment_qr_code_label || "Not selected"}</p></div>
              </div>
              {selectedBooking.receipt_url && (
                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">Payment Proof</span>
                  <a href={selectedBooking.receipt_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border bg-muted/20">
                    <img src={selectedBooking.receipt_url} alt="Payment proof" className="max-h-72 w-full object-contain bg-white" />
                  </a>
                  <a href={selectedBooking.receipt_url} target="_blank" rel="noreferrer" className="inline-flex text-sm text-primary underline-offset-4 hover:underline">
                    Open uploaded payment proof
                  </a>
                </div>
              )}
              {selectedBooking.special_requests && (
                <div><span className="text-sm text-muted-foreground">Special Requests</span><p className="text-sm mt-1 bg-muted p-2 rounded-lg">{selectedBooking.special_requests}</p></div>
              )}
              {selectedBooking.status === "pending" && (
                <div className="space-y-3 pt-2">
                  <Button className="w-full" onClick={() => updateStatus(selectedBooking.id, "confirmed")}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Confirm
                  </Button>
                  <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Owner and staff cannot cancel bookings. Guests may only cancel their own pending bookings before they are marked paid or approved.
                  </p>
                </div>
              )}
              {selectedBooking.status === "confirmed" && (
                <div className="pt-2">
                  <Button className="w-full" onClick={() => updateStatus(selectedBooking.id, "completed")}>
                    <CheckCheck className="h-4 w-4 mr-2" /> Mark as Completed
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}