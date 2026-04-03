import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Mail, MapPin, Phone, Clock3, ArrowRight, Send, Loader2, MessageSquareMore } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { RESORT_CONTACT } from "@/lib/resortContact";
import { createPageUrl } from "@/utils";
import { baseClient } from "@/api/baseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const isValidEmail = (value) => /^(?:[^\s@]+)@(?:[^\s@]+)\.[^\s@]+$/.test(value);
const INQUIRY_STORAGE_KEY = "kasa-ilaya-inquiry-access";

const inquiryStatusClasses = {
  open: "bg-accent/20 text-accent-foreground border-accent/30",
  in_progress: "bg-primary/10 text-primary border-primary/20",
  resolved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  closed: "bg-muted text-muted-foreground border-border",
};

const loadStoredInquiryAccess = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(INQUIRY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry) => typeof entry?.id === "string" && typeof entry?.token === "string")
      : [];
  } catch {
    return [];
  }
};

const storeInquiryAccess = (entries) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(INQUIRY_STORAGE_KEY, JSON.stringify(entries));
};

const mergeInquiryAccess = (entries, nextEntry) => {
  const nextEntries = [nextEntry, ...entries.filter((entry) => entry.id !== nextEntry.id)];
  storeInquiryAccess(nextEntries);
  return nextEntries;
};

export default function Contact() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: user?.full_name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    subject: "",
    message: "",
  });
  const [guestInquiryAccess, setGuestInquiryAccess] = useState(() => loadStoredInquiryAccess());
  const [selectedInquiryId, setSelectedInquiryId] = useState(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReplying, setIsReplying] = useState(false);

  const packagesUrl = createPageUrl("Packages");
  const selectedInquiryToken = useMemo(
    () => guestInquiryAccess.find((entry) => entry.id === selectedInquiryId)?.token,
    [guestInquiryAccess, selectedInquiryId]
  );

  const { data: inquiries = [], isLoading: isLoadingInquiries } = useQuery({
    queryKey: ["contact-inquiries", user?.id, user?.email, guestInquiryAccess],
    queryFn: () => baseClient.inquiries.mine(guestInquiryAccess),
    enabled: Boolean(user) || guestInquiryAccess.length > 0,
  });

  const { data: inquiryThread, isLoading: isLoadingThread } = useQuery({
    queryKey: ["contact-inquiry-thread", selectedInquiryId, selectedInquiryToken, user?.id],
    queryFn: () => baseClient.inquiries.thread(selectedInquiryId, selectedInquiryToken),
    enabled: Boolean(selectedInquiryId),
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: user?.full_name || prev.name,
      email: user?.email || prev.email,
      phone: user?.phone || prev.phone,
    }));
  }, [user?.email, user?.full_name, user?.phone]);

  useEffect(() => {
    if (!inquiries.length) {
      setSelectedInquiryId(null);
      return;
    }

    const exists = inquiries.some((entry) => entry.id === selectedInquiryId);
    if (!exists) {
      setSelectedInquiryId(inquiries[0].id);
    }
  }, [inquiries, selectedInquiryId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!form.name.trim()) {
      toast.error("Please enter your name.");
      return;
    }

    if (!isValidEmail(form.email.trim())) {
      toast.error("Please enter a valid email address.");
      return;
    }

    if (!form.subject.trim()) {
      toast.error("Please enter an inquiry subject.");
      return;
    }

    if (!form.message.trim()) {
      toast.error("Please enter your message.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await baseClient.inquiries.create({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      });

      if (response?.inquiry?.id && response?.guest_access_token) {
        setGuestInquiryAccess((prev) =>
          mergeInquiryAccess(prev, { id: response.inquiry.id, token: response.guest_access_token })
        );
      }

      await queryClient.invalidateQueries({ queryKey: ["contact-inquiries"] });
      setSelectedInquiryId(response?.inquiry?.id || null);
      setForm((prev) => ({ ...prev, subject: "", message: "" }));
      toast.success("Your inquiry has been sent. You can continue the conversation below.");
    } catch (error) {
      toast.error(error?.message || "Unable to send your inquiry right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReply = async (event) => {
    event.preventDefault();

    if (!selectedInquiryId) {
      return;
    }

    if (!replyMessage.trim()) {
      toast.error("Please enter your reply.");
      return;
    }

    try {
      setIsReplying(true);
      await baseClient.inquiries.reply(selectedInquiryId, {
        message: replyMessage.trim(),
        token: selectedInquiryToken,
      });

      setReplyMessage("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contact-inquiries"] }),
        queryClient.invalidateQueries({ queryKey: ["contact-inquiry-thread", selectedInquiryId] }),
      ]);
      toast.success("Your message has been sent.");
    } catch (error) {
      toast.error(error?.message || "Unable to send your reply right now.");
    } finally {
      setIsReplying(false);
    }
  };

  const isInquiryClosed = (inquiryThread?.inquiry?.status || "open") === "closed";

  return (
    <div className="bg-gradient-to-b from-background via-muted/20 to-background">
      <section className="relative overflow-hidden py-24 sm:py-28 lg:py-32">
        <div className="absolute inset-0 opacity-50">
          <div className="absolute left-[-5rem] top-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-0 right-[-3rem] h-56 w-56 rounded-full bg-secondary/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
          <div className="max-w-3xl space-y-6">
            <span className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              Contact Us
            </span>
            <h1 className="font-display text-4xl font-bold leading-tight text-foreground sm:text-5xl lg:text-6xl">
              Reach out for bookings, event inquiries, and guest support.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Whether you are planning a stay, asking about resort amenities, or checking package availability, our team
              is ready to help you take the next step.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="grid gap-4">
              {[
                { icon: Phone, label: "Phone", value: RESORT_CONTACT.phoneDisplay, href: `tel:${RESORT_CONTACT.phoneLink}` },
                { icon: Mail, label: "Email", value: RESORT_CONTACT.email, href: `mailto:${RESORT_CONTACT.email}` },
                { icon: MapPin, label: "Location", value: RESORT_CONTACT.address },
                { icon: Clock3, label: "Support Hours", value: RESORT_CONTACT.hours },
              ].map((item) => (
                <Card key={item.label} className="border-border/80 shadow-sm">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                      {item.href ? (
                        <a href={item.href} className="mt-2 block text-base font-medium text-foreground hover:text-primary">
                          {item.value}
                        </a>
                      ) : (
                        <p className="mt-2 text-base font-medium text-foreground">{item.value}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Quick Actions</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild variant="outline" className="gap-2">
                    <Link to={packagesUrl}>
                      View Packages
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild className="gap-2">
                    <a href={`tel:${RESORT_CONTACT.phoneLink}`}>
                      Call Now
                      <Phone className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>

            </div>

            <div className="grid gap-6">
              <Card className="border-border/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="font-display text-3xl">Send an Inquiry</CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="contact-name">Full Name</Label>
                        <Input
                          id="contact-name"
                          value={form.name}
                          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                          placeholder="Your full name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contact-email">Email Address</Label>
                        <Input
                          id="contact-email"
                          type="email"
                          value={form.email}
                          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                          placeholder="your@email.com"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="contact-phone">Phone Number</Label>
                      <Input
                        id="contact-phone"
                        value={form.phone}
                        onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                        placeholder="Optional contact number"
                      />
                    </div>

                    <div>
                      <Label htmlFor="contact-subject">Subject</Label>
                      <Input
                        id="contact-subject"
                        value={form.subject}
                        onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
                        placeholder="Booking question, event inquiry, package availability"
                      />
                    </div>

                    <div>
                      <Label htmlFor="contact-message">Message</Label>
                      <Textarea
                        id="contact-message"
                        rows={7}
                        value={form.message}
                        onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
                        placeholder="Tell us about your preferred dates, event plans, or questions."
                      />
                    </div>

                    <Button type="submit" className="gap-2" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send Inquiry
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <Card className="overflow-hidden border-border/80 shadow-sm lg:col-span-2">
              <CardHeader className="space-y-2 pb-4">
                <CardTitle className="font-display text-2xl">Find Us on the Map</CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  Visit Kasa Ilaya Resort & Events Place with directions directly from Google Maps.
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/20">
                  <iframe
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1990.2607237347663!2d120.9992428775908!3d14.24133309901719!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33bd7dccae896b1d%3A0x1a027c4f0dfdc38!2sKasa%20Ilaya%20Resort%20%26%20Events%20Place!5e0!3m2!1sen!2sph!4v1775063071661!5m2!1sen!2sph"
                    title="Kasa Ilaya Resort and Events Place location"
                    className="h-[320px] w-full border-0 sm:h-[420px] lg:h-[460px]"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
            <Card className="border-border/80 shadow-sm">
              <CardHeader className="space-y-2">
                <CardTitle className="font-display text-2xl">Your Inquiry Messages</CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  Continue conversations with resort staff here. Guest inquiries stay available on this browser, while logged-in users can access their threads anytime.
                </p>
              </CardHeader>
              <CardContent>
                {isLoadingInquiries ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : inquiries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-8 text-sm leading-6 text-muted-foreground">
                    No inquiry thread yet. Send a message above and it will appear here.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {inquiries.map((inquiry) => {
                      const isSelected = inquiry.id === selectedInquiryId;

                      return (
                        <button
                          key={inquiry.id}
                          type="button"
                          onClick={() => setSelectedInquiryId(inquiry.id)}
                          className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border/70 bg-background hover:border-primary/40 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-foreground">{inquiry.subject}</p>
                              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{inquiry.last_message_preview || "No message yet."}</p>
                            </div>
                            <Badge className={inquiryStatusClasses[inquiry.status] || inquiryStatusClasses.open}>
                              {(inquiry.status || "open").replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{inquiry.message_count || 0} messages</span>
                            <span>
                              {inquiry.last_message_at
                                ? formatDistanceToNow(new Date(inquiry.last_message_at), { addSuffix: true })
                                : "just now"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/80 shadow-sm">
              <CardHeader className="space-y-2">
                <CardTitle className="font-display text-2xl">Conversation</CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  Reply to your selected inquiry and wait for an admin or super admin to respond.
                </p>
              </CardHeader>
              <CardContent>
                {!selectedInquiryId ? (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-10 text-center text-sm leading-6 text-muted-foreground">
                    Select an inquiry from the left after sending your first message.
                  </div>
                ) : isLoadingThread ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                      <div>
                        <p className="text-base font-semibold text-foreground">{inquiryThread?.inquiry?.subject}</p>
                        <p className="text-sm text-muted-foreground">{inquiryThread?.inquiry?.guest_email}</p>
                      </div>
                      <Badge className={inquiryStatusClasses[inquiryThread?.inquiry?.status] || inquiryStatusClasses.open}>
                        {(inquiryThread?.inquiry?.status || "open").replace(/_/g, " ")}
                      </Badge>
                    </div>

                    <div className="max-h-[480px] space-y-3 overflow-y-auto rounded-2xl border border-border/70 bg-muted/10 p-4">
                      {(inquiryThread?.messages || []).map((message) => {
                        const isGuest = message.sender_type === "guest";

                        return (
                          <div key={message.id} className={`flex ${isGuest ? "justify-start" : "justify-end"}`}>
                            <div
                              className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                isGuest
                                  ? "border border-border/70 bg-background text-foreground"
                                  : "bg-primary text-primary-foreground"
                              }`}
                            >
                              <div className="flex items-center gap-2 text-xs opacity-80">
                                <MessageSquareMore className="h-3.5 w-3.5" />
                                <span>{message.sender_name}</span>
                                <span>
                                  {message.created_date
                                    ? formatDistanceToNow(new Date(message.created_date), { addSuffix: true })
                                    : "just now"}
                                </span>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap leading-6">{message.message}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <form className="space-y-3" onSubmit={handleReply}>
                      {isInquiryClosed ? (
                        <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                          This inquiry is closed. Messaging is no longer available because the conversation is done.
                        </div>
                      ) : null}

                      <div>
                        <Label htmlFor="contact-reply">Reply</Label>
                        <Textarea
                          id="contact-reply"
                          rows={5}
                          value={replyMessage}
                          onChange={(event) => setReplyMessage(event.target.value)}
                          placeholder="Type your follow-up message here."
                          disabled={isInquiryClosed || isReplying}
                        />
                      </div>
                      <Button type="submit" className="gap-2" disabled={isInquiryClosed || isReplying}>
                        {isReplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {isInquiryClosed ? "Inquiry Closed" : "Send Reply"}
                      </Button>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
