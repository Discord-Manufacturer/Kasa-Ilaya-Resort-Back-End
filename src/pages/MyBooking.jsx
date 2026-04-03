import React, { useState, useEffect, useMemo } from "react";
import { baseClient } from "@/api/baseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CalendarCheck, Clock, Users, Loader2, Package, Hash, Star, Eye, XCircle } from "lucide-react";
import LeaveReviewDialog from "@/components/mybookings/LeaveReviewDialog.jsx";
import { format } from "date-fns";

const statusColors = {
  pending: "bg-accent/20 text-accent-foreground border-accent/30",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-muted text-muted-foreground border-border",
};

const paymentColors = {
  unpaid: "bg-destructive/10 text-destructive",
  pending_verification: "bg-accent/20 text-accent-foreground",
  paid: "bg-primary/10 text-primary",
};

const tourLabels = {
  day_tour: "☀️ Day Tour",
  night_tour: "🌙 Night Tour",
  "22_hours": "⏰ 22 Hours",
};

const getBookingEndTime = (booking) => {
  if (!booking?.booking_date || !booking?.tour_type) {
    return null;
  }

  if (booking.tour_type === "day_tour") {
    return new Date(`${booking.booking_date}T18:00:00`);
  }

  if (booking.tour_type === "night_tour") {
    return new Date(new Date(`${booking.booking_date}T18:00:00`).getTime() + 12 * 60 * 60 * 1000);
  }

  if (booking.tour_type === "22_hours") {
    // 22 hours starts at 6 PM, ends at 4 PM the next day
    return new Date(new Date(`${booking.booking_date}T18:00:00`).getTime() + 22 * 60 * 60 * 1000);
  }

  return null;
};

const canLeaveReview = (booking) => {
  if (!booking || booking.status === "cancelled" || booking.status === "pending") {
    return false;
  }

  const endTime = getBookingEndTime(booking);
  if (!endTime) {
    return false;
  }

  return Date.now() >= endTime.getTime();
};

const getDismissedReviewStorageKey = (email) => `kasa-ilaya-dismissed-reviews:${email || "guest"}`;

const canCancelBooking = (booking) => {
  if (!booking || booking.status !== "pending") {
    return false;
  }

  return (booking.payment_status || "unpaid") !== "paid";
};

const getCancellationLockedReason = (booking) => {
  if (!booking || booking.status === "cancelled" || booking.status === "completed") {
    return "";
  }

  const paymentStatus = booking.payment_status || "unpaid";

  if (paymentStatus === "paid") {
    return "Paid bookings can no longer be cancelled online because the reservation has already been paid.";
  }

  if (booking.status === "confirmed") {
    return "Accepted bookings can no longer be cancelled online because the reservation has already been approved by the resort.";
  }

  return "";
};

export default function MyBookings() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [reviewBooking, setReviewBooking] = useState(null);
  const [dismissedReviewBookingIds, setDismissedReviewBookingIds] = useState([]);
  const [submittedReviewBookingIds, setSubmittedReviewBookingIds] = useState([]);
  const [hasLoadedDismissedReviewState, setHasLoadedDismissedReviewState] = useState(false);

  useEffect(() => {
    baseClient.auth.me().then(setUser).catch(() => {
      baseClient.auth.redirectToLogin(window.location.href);
    });
  }, []);

  useEffect(() => {
    if (!user?.email || typeof window === "undefined") {
      setDismissedReviewBookingIds([]);
      setHasLoadedDismissedReviewState(false);
      return;
    }

    try {
      const stored = window.sessionStorage.getItem(getDismissedReviewStorageKey(user.email));
      const parsed = stored ? JSON.parse(stored) : [];
      setDismissedReviewBookingIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDismissedReviewBookingIds([]);
    } finally {
      setHasLoadedDismissedReviewState(true);
    }
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email || typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(
      getDismissedReviewStorageKey(user.email),
      JSON.stringify(dismissedReviewBookingIds)
    );
  }, [dismissedReviewBookingIds, user?.email]);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["my-bookings", user?.email],
    queryFn: () => baseClient.entities.Booking.filter({ customer_email: user.email }, "-created_date"),
    enabled: !!user?.email,
  });

  const { data: reviews = [], isLoading: isLoadingReviews } = useQuery({
    queryKey: ["my-booking-reviews", user?.email],
    queryFn: () => baseClient.entities.Review.filter({ guest_email: user.email }, "-created_date"),
    enabled: !!user?.email,
  });

  const reviewedBookingIds = new Set(reviews.map((review) => review.booking_id));
  const blockedReviewBookingIds = new Set([...submittedReviewBookingIds, ...reviews.map((review) => review.booking_id)]);

  const eligibleReviewBookings = useMemo(
    () => bookings.filter(
      (booking) =>
        canLeaveReview(booking) &&
        !blockedReviewBookingIds.has(booking.id) &&
        !dismissedReviewBookingIds.includes(booking.id)
    ),
    [bookings, blockedReviewBookingIds, dismissedReviewBookingIds]
  );

  useEffect(() => {
    if (isLoadingReviews || !hasLoadedDismissedReviewState || !eligibleReviewBookings.length || reviewBooking) {
      return;
    }

    setReviewBooking(eligibleReviewBookings[0]);
  }, [eligibleReviewBookings, hasLoadedDismissedReviewState, isLoadingReviews, reviewBooking]);

  useEffect(() => {
    if (!reviewBooking?.id || isLoadingReviews) {
      return;
    }

    if (blockedReviewBookingIds.has(reviewBooking.id)) {
      setReviewBooking(null);
    }
  }, [blockedReviewBookingIds, isLoadingReviews, reviewBooking]);

  const handleReviewDismiss = () => {
    if (reviewBooking?.id) {
      setDismissedReviewBookingIds((prev) => (
        prev.includes(reviewBooking.id) ? prev : [...prev, reviewBooking.id]
      ));
    }

    setReviewBooking(null);
  };

  const handleReviewOpen = (booking) => {
    setDismissedReviewBookingIds((prev) => prev.filter((id) => id !== booking.id));
    setReviewBooking(booking);
  };

  const handleReviewSubmitted = () => {
    if (!reviewBooking?.id) {
      setReviewBooking(null);
      return;
    }

    const submittedBookingId = reviewBooking.id;

    setDismissedReviewBookingIds((prev) => prev.filter((id) => id !== submittedBookingId));
    setSubmittedReviewBookingIds((prev) => (
      prev.includes(submittedBookingId) ? prev : [...prev, submittedBookingId]
    ));

    queryClient.setQueryData(["my-booking-reviews", user?.email], (currentReviews = []) => {
      if (currentReviews.some((review) => review.booking_id === submittedBookingId)) {
        return currentReviews;
      }

      return [
        {
          id: `submitted-${submittedBookingId}`,
          booking_id: submittedBookingId,
          guest_email: user?.email,
        },
        ...currentReviews,
      ];
    });

    setReviewBooking(null);
    queryClient.invalidateQueries({ queryKey: ["my-booking-reviews"] });
    queryClient.invalidateQueries({ queryKey: ["public-reviews"] });
  };

  const handleCancelBooking = async (booking) => {
    if (!canCancelBooking(booking)) {
      toast.error(getCancellationLockedReason(booking) || "This booking can no longer be cancelled.");
      return;
    }

    const confirmed = window.confirm("Are you sure you want to cancel your booking?");
    if (!confirmed) {
      return;
    }

    try {
      await baseClient.entities.Booking.update(booking.id, { status: "cancelled" });

      await baseClient.entities.ActivityLog.create({
        user_email: user?.email,
        user_name: user?.full_name,
        action: "User Cancelled Booking",
        entity_type: "Booking",
        entity_id: booking.id,
        details: `User cancelled booking ${booking.booking_reference}`,
      });

      toast.success("Booking cancelled successfully.");
      setSelectedBooking(null);
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    } catch (error) {
      toast.error(error?.message || "Unable to cancel booking.");
    }
  };

  if (!user) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-foreground">My Bookings</h1>
        <p className="text-muted-foreground mt-1">Track and manage your reservations</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : bookings.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-display text-xl font-bold mb-2">No Bookings Yet</h3>
            <p className="text-muted-foreground">You haven't made any reservations yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <Card key={booking.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-foreground">{booking.package_name}</h3>
                      <Badge className={statusColors[booking.status]} variant="outline">
                        {booking.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Hash className="h-3.5 w-3.5" />
                        {booking.booking_reference}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarCheck className="h-3.5 w-3.5" />
                        {booking.booking_date && format(new Date(booking.booking_date), "MMM d, yyyy")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {tourLabels[booking.tour_type]}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {booking.guest_count} guests
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-2">
                    <p className="font-bold text-lg text-secondary">₱{booking.total_amount?.toLocaleString()}</p>
                    <Badge className={paymentColors[booking.payment_status]}>
                      {booking.payment_status?.replace(/_/g, " ")}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => setSelectedBooking(booking)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Details
                      </Button>
                      {canCancelBooking(booking) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1"
                          onClick={() => handleCancelBooking(booking)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      )}
                    </div>
                    {!isLoadingReviews && canLeaveReview(booking) && !blockedReviewBookingIds.has(booking.id) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-secondary border-secondary/40 hover:bg-secondary/10"
                        onClick={() => handleReviewOpen(booking)}
                      >
                        <Star className="h-3.5 w-3.5 mr-1" />
                        Leave a Review
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {reviewBooking && (
        <LeaveReviewDialog
          booking={reviewBooking}
          open={!!reviewBooking}
          onClose={handleReviewDismiss}
          onSubmitted={handleReviewSubmitted}
        />
      )}

      <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Booking Details</DialogTitle>
          </DialogHeader>
          {selectedBooking ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Reference</span><p className="font-mono font-bold">{selectedBooking.booking_reference}</p></div>
                <div><span className="text-muted-foreground">Status</span><p><Badge className={statusColors[selectedBooking.status]} variant="outline">{selectedBooking.status}</Badge></p></div>
                <div><span className="text-muted-foreground">Payment</span><p><Badge className={paymentColors[selectedBooking.payment_status]}>{selectedBooking.payment_status?.replace(/_/g, " ")}</Badge></p></div>
                <div><span className="text-muted-foreground">Package</span><p className="font-medium">{selectedBooking.package_name}</p></div>
                <div><span className="text-muted-foreground">Date</span><p>{selectedBooking.booking_date && format(new Date(selectedBooking.booking_date), "MMM d, yyyy")}</p></div>
                <div><span className="text-muted-foreground">Tour</span><p>{tourLabels[selectedBooking.tour_type]}</p></div>
                <div><span className="text-muted-foreground">Guests</span><p>{selectedBooking.guest_count}</p></div>
                <div><span className="text-muted-foreground">Total Amount</span><p className="font-bold text-secondary">₱{selectedBooking.total_amount?.toLocaleString()}</p></div>
                <div><span className="text-muted-foreground">Reservation Fee</span><p className="font-bold text-primary">₱{Number(selectedBooking.reservation_fee_amount || 0).toLocaleString()}</p></div>
                <div><span className="text-muted-foreground">Payment QR</span><p>{selectedBooking.payment_qr_code_label || "Not selected"}</p></div>
              </div>

              {selectedBooking.receipt_url ? (
                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">Payment Proof</span>
                  <a href={selectedBooking.receipt_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border bg-muted/20">
                    <img src={selectedBooking.receipt_url} alt="Payment proof" className="max-h-72 w-full object-contain bg-white" />
                  </a>
                </div>
              ) : null}

              {selectedBooking.special_requests ? (
                <div>
                  <span className="text-sm text-muted-foreground">Special Requests</span>
                  <p className="mt-1 rounded-lg bg-muted p-2 text-sm">{selectedBooking.special_requests}</p>
                </div>
              ) : null}

              {getCancellationLockedReason(selectedBooking) ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900">
                  {getCancellationLockedReason(selectedBooking)}
                </div>
              ) : null}

              {canCancelBooking(selectedBooking) ? (
                <DialogFooter>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => handleCancelBooking(selectedBooking)}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel Booking
                  </Button>
                </DialogFooter>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}