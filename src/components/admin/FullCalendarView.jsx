import React, { useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { baseClient } from "@/api/baseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, PencilLine, CheckCircle2, CheckCheck } from "lucide-react";
import { toast } from "sonner";

const SCHEDULE_COLOR = "#2563eb";
const BOOKING_COLORS = {
  pending: "#f59e0b",
  confirmed: "#16a34a",
  completed: "#6b7280",
  cancelled: "#ef4444",
};

const createEmptyForm = (date) => ({
  title: "",
  schedule_date: format(date || new Date(), "yyyy-MM-dd"),
  start_time: "",
  end_time: "",
  location: "",
  description: "",
});

export default function FullCalendarView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const calendarRef = useRef(null);
  const canManage = user?.role === "admin" || user?.role === "super_admin";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [viewingBooking, setViewingBooking] = useState(null);
  const [form, setForm] = useState(createEmptyForm(new Date()));
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const updateBookingStatus = async (bookingId, newStatus) => {
    if (newStatus === "cancelled") {
      toast.error("Owner and staff cannot cancel bookings. Only guests can cancel their own pending bookings before they are marked paid or approved.");
      return;
    }

    const booking = viewingBooking;
    const nextPaymentStatus =
      newStatus === "confirmed" || newStatus === "completed" ? "paid" : booking?.payment_status || "unpaid";
    try {
      await baseClient.entities.Booking.update(bookingId, { status: newStatus, payment_status: nextPaymentStatus });
      await queryClient.invalidateQueries({ queryKey: ["calendar-bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-all-bookings"] });
      toast.success(`Booking marked as ${newStatus}.`);
      setViewingBooking(null);
      setDialogOpen(false);
    } catch (err) {
      toast.error(err?.message || "Unable to update booking.");
    }
  };

  const { data: schedules = [], isLoading: isLoadingSchedules } = useQuery({
    queryKey: ["upcoming-schedules"],
    queryFn: () => baseClient.entities.UpcomingSchedule.list("schedule_date", 500),
  });

  const { data: bookings = [], isLoading: isLoadingBookings } = useQuery({
    queryKey: ["calendar-bookings"],
    queryFn: () =>
      baseClient.entities.Booking.filter(
        { status: ["pending", "confirmed", "completed"] },
        "booking_date",
        500
      ),
  });

  const isLoading = isLoadingSchedules || isLoadingBookings;

  // Convert schedules + bookings to FullCalendar events
  const calendarEvents = [
    ...schedules.map((s) => ({
      id: `schedule-${s.id}`,
      title: s.title,
      start: s.start_time
        ? `${s.schedule_date}T${s.start_time}`
        : s.schedule_date,
      end: s.end_time ? `${s.schedule_date}T${s.end_time}` : undefined,
      allDay: !s.start_time,
      backgroundColor: SCHEDULE_COLOR,
      borderColor: SCHEDULE_COLOR,
      extendedProps: { type: "schedule", raw: s },
    })),
    ...bookings.flatMap((b) => {
      const color = BOOKING_COLORS[b.status] || BOOKING_COLORS.pending;
      const base = {
        id: `booking-${b.id}`,
        title: b.package_name || "Booking",
        backgroundColor: color,
        borderColor: color,
        extendedProps: { type: "booking", raw: b },
      };
      if (b.tour_type === "22_hours") {
        return [{
          ...base,
          start: b.booking_date,
          end: format(addDays(new Date(`${b.booking_date}T00:00:00`), 2), "yyyy-MM-dd"),
          allDay: true,
        }];
      }
      return [{ ...base, start: b.booking_date, allDay: true }];
    }),
  ];

  const handleDateClick = (info) => {
    if (!canManage) return;
    setEditingSchedule(null);
    setForm(createEmptyForm(new Date(info.dateStr)));
    setViewingBooking(null);
    setDialogOpen(true);
  };

  const handleEventClick = (info) => {
    const { type, raw } = info.event.extendedProps;
    if (type === "booking") {
      setViewingBooking(raw);
      setDialogOpen(true);
      setEditingSchedule(null);
      return;
    }
    if (!canManage) return;
    setViewingBooking(null);
    setEditingSchedule(raw);
    setForm({
      title: raw.title || "",
      schedule_date: raw.schedule_date,
      start_time: raw.start_time || "",
      end_time: raw.end_time || "",
      location: raw.location || "",
      description: raw.description || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!canManage) return;
    if (!form.title.trim() || !form.schedule_date) {
      toast.error("Title and date are required.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        schedule_date: form.schedule_date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location.trim() || null,
        description: form.description.trim() || null,
        created_by_name: user?.full_name || null,
        created_by_email: user?.email || null,
      };

      if (editingSchedule) {
        await baseClient.entities.UpcomingSchedule.update(editingSchedule.id, payload);
        await baseClient.entities.ActivityLog.create({
          user_email: user?.email,
          user_name: user?.full_name,
          action: "Updated Upcoming Schedule",
          entity_type: "UpcomingSchedule",
          entity_id: editingSchedule.id,
          details: `Updated schedule "${payload.title}" for ${payload.schedule_date}`,
        });
        toast.success("Schedule updated.");
      } else {
        const created = await baseClient.entities.UpcomingSchedule.create(payload);
        await baseClient.entities.ActivityLog.create({
          user_email: user?.email,
          user_name: user?.full_name,
          action: "Created Upcoming Schedule",
          entity_type: "UpcomingSchedule",
          entity_id: created.id,
          details: `Created schedule "${payload.title}" for ${payload.schedule_date}`,
        });
        toast.success("Schedule added.");
      }

      await queryClient.invalidateQueries({ queryKey: ["upcoming-schedules"] });
      await queryClient.invalidateQueries({ queryKey: ["booking-manual-schedules"] });
      setDialogOpen(false);
    } catch (err) {
      toast.error(err?.message || "Unable to save schedule.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canManage || !editingSchedule) return;
    if (!window.confirm(`Delete "${editingSchedule.title}"?`)) return;
    setDeletingId(editingSchedule.id);
    try {
      await baseClient.entities.UpcomingSchedule.delete(editingSchedule.id);
      await baseClient.entities.ActivityLog.create({
        user_email: user?.email,
        user_name: user?.full_name,
        action: "Deleted Upcoming Schedule",
        entity_type: "UpcomingSchedule",
        entity_id: editingSchedule.id,
        details: `Deleted schedule "${editingSchedule.title}"`,
      });
      await queryClient.invalidateQueries({ queryKey: ["upcoming-schedules"] });
      await queryClient.invalidateQueries({ queryKey: ["booking-manual-schedules"] });
      toast.success("Schedule deleted.");
      setDialogOpen(false);
    } catch (err) {
      toast.error(err?.message || "Unable to delete schedule.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Manage Events</h1>
          <p className="text-muted-foreground mt-1">View and manage resort schedules and reservations.</p>
        </div>
        {canManage && (
          <Button
            className="gap-2 self-start sm:self-auto"
            onClick={() => {
              setEditingSchedule(null);
              setViewingBooking(null);
              setForm(createEmptyForm(new Date()));
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Schedule
          </Button>
        )}
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: SCHEDULE_COLOR }} />
          Manual Schedule
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: BOOKING_COLORS.pending }} />
          Pending Booking
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: BOOKING_COLORS.confirmed }} />
          Confirmed Booking
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: BOOKING_COLORS.completed }} />
          Completed Booking
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm fc-wrapper">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            buttonText={{
              today: "today",
              month: "month",
              week: "week",
              day: "day",
            }}
            events={calendarEvents}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            editable={false}
            selectable={canManage}
            dayMaxEvents={3}
            height="auto"
            eventDisplay="block"
          />
        </div>
      )}

      {/* Schedule create/edit dialog */}
      <Dialog
        open={dialogOpen && !viewingBooking}
        onOpenChange={(open) => {
          if (!open) { setDialogOpen(false); setViewingBooking(null); }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingSchedule ? "Edit Schedule" : "New Schedule"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="fc-title">Title</Label>
              <Input
                id="fc-title"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Event title"
              />
            </div>
            <div>
              <Label htmlFor="fc-date">Date</Label>
              <Input
                id="fc-date"
                type="date"
                value={form.schedule_date}
                onChange={(e) => setForm((p) => ({ ...p, schedule_date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fc-start">Start Time</Label>
                <Input
                  id="fc-start"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="fc-end">End Time</Label>
                <Input
                  id="fc-end"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="fc-location">Location</Label>
              <Input
                id="fc-location"
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label htmlFor="fc-desc">Description</Label>
              <Textarea
                id="fc-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            {editingSchedule && (
              <Button
                type="button"
                variant="destructive"
                className="mr-auto gap-2"
                onClick={handleDelete}
                disabled={!!deletingId}
              >
                {deletingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingSchedule ? "Save Changes" : "Add Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking detail dialog (read-only) */}
      <Dialog
        open={dialogOpen && !!viewingBooking}
        onOpenChange={(open) => { if (!open) { setDialogOpen(false); setViewingBooking(null); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Booking Details</DialogTitle>
          </DialogHeader>
          {viewingBooking && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground">Package</p>
                  <p className="font-medium">{viewingBooking.package_name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{viewingBooking.status}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Check-in</p>
                  <p className="font-medium">{viewingBooking.booking_date}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tour Type</p>
                  <p className="font-medium capitalize">{(viewingBooking.tour_type || "").replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">{viewingBooking.customer_name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Guests</p>
                  <p className="font-medium">{viewingBooking.guest_count || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{viewingBooking.customer_email || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{viewingBooking.customer_phone || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-semibold">{viewingBooking.total_amount ? `₱${Number(viewingBooking.total_amount).toLocaleString()}` : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Reference</p>
                  <p className="font-mono text-xs">{viewingBooking.booking_reference || "—"}</p>
                </div>
              </div>
              {viewingBooking.status === "pending" && canManage && (
                <div className="space-y-3 pt-2">
                  <Button size="sm" className="w-full gap-1" onClick={() => updateBookingStatus(viewingBooking.id, "confirmed")}>
                    <CheckCircle2 className="h-4 w-4" /> Confirm
                  </Button>
                  <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Owner and staff cannot cancel bookings. Guests may only cancel their own pending bookings before they are marked paid or approved.
                  </p>
                </div>
              )}
              {viewingBooking.status === "confirmed" && canManage && (
                <div className="pt-2">
                  <Button size="sm" className="w-full gap-1" onClick={() => updateBookingStatus(viewingBooking.id, "completed")}>
                    <CheckCheck className="h-4 w-4" /> Mark as Completed
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setViewingBooking(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
