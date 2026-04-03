import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageSquareMore, Send } from "lucide-react";
import { toast } from "sonner";
import { baseClient } from "@/api/baseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const statusOptions = [
  { value: "all", label: "All Inquiries" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const statusClasses = {
  open: "bg-accent/20 text-accent-foreground border-accent/30",
  in_progress: "bg-primary/10 text-primary border-primary/20",
  resolved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  closed: "bg-muted text-muted-foreground border-border",
};

export default function AdminInquiries() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInquiryId, setSelectedInquiryId] = useState(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [statusValue, setStatusValue] = useState("open");
  const [isReplying, setIsReplying] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    baseClient.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const { data: inquiries = [], isLoading } = useQuery({
    queryKey: ["admin-inquiries", statusFilter],
    queryFn: () => baseClient.inquiries.list(statusFilter === "all" ? undefined : statusFilter),
  });

  const { data: selectedThread, isLoading: isLoadingThread } = useQuery({
    queryKey: ["admin-inquiry-thread", selectedInquiryId],
    queryFn: () => baseClient.inquiries.thread(selectedInquiryId),
    enabled: Boolean(selectedInquiryId),
  });

  useEffect(() => {
    if (!inquiries.length) {
      setSelectedInquiryId(null);
      return;
    }

    if (!inquiries.some((entry) => entry.id === selectedInquiryId)) {
      setSelectedInquiryId(inquiries[0].id);
    }
  }, [inquiries, selectedInquiryId]);

  useEffect(() => {
    setStatusValue(selectedThread?.inquiry?.status || "open");
  }, [selectedThread?.inquiry?.status]);

  const counters = useMemo(() => ({
    total: inquiries.length,
    open: inquiries.filter((entry) => entry.status === "open").length,
    in_progress: inquiries.filter((entry) => entry.status === "in_progress").length,
    resolved: inquiries.filter((entry) => entry.status === "resolved").length,
  }), [inquiries]);

  const refreshQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-inquiries"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-inquiry-thread"] }),
      queryClient.invalidateQueries({ queryKey: ["contact-inquiries"] }),
      queryClient.invalidateQueries({ queryKey: ["contact-inquiry-thread"] }),
    ]);
  };

  const handleSendReply = async (event) => {
    event.preventDefault();

    if (!selectedInquiryId || !replyMessage.trim()) {
      toast.error("Please enter a reply message.");
      return;
    }

    try {
      setIsReplying(true);
      await baseClient.inquiries.reply(selectedInquiryId, { message: replyMessage.trim() });
      setReplyMessage("");
      await refreshQueries();
      toast.success("Reply sent to the inquiry thread.");
    } catch (error) {
      toast.error(error?.message || "Unable to send the reply.");
    } finally {
      setIsReplying(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!selectedInquiryId) {
      return;
    }

    try {
      setIsUpdatingStatus(true);
      await baseClient.inquiries.updateStatus(selectedInquiryId, statusValue);
      await refreshQueries();
      toast.success("Inquiry status updated.");
    } catch (error) {
      toast.error(error?.message || "Unable to update the inquiry status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const isSelectedInquiryClosed = (selectedThread?.inquiry?.status || "open") === "closed";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Inquiry Inbox</h1>
          <p className="mt-1 text-muted-foreground">Review guest questions, reply from staff, and track resolution progress.</p>
        </div>
        <div className="w-full md:w-56">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        {[
          { label: "Total", value: counters.total },
          { label: "Open", value: counters.open },
          { label: "In Progress", value: counters.in_progress },
          { label: "Resolved", value: counters.resolved },
        ].map((item) => (
          <Card key={item.label} className="border-border/80 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Inquiry List</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : inquiries.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">No inquiries found for this filter.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inquiries.map((inquiry) => (
                    <TableRow
                      key={inquiry.id}
                      className={`cursor-pointer ${selectedInquiryId === inquiry.id ? "bg-muted/50" : ""}`}
                      onClick={() => setSelectedInquiryId(inquiry.id)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm text-foreground">{inquiry.guest_name}</p>
                          <p className="text-xs text-muted-foreground">{inquiry.guest_email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm text-foreground">{inquiry.subject}</p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{inquiry.last_message_preview}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusClasses[inquiry.status] || statusClasses.open}>
                          {(inquiry.status || "open").replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {inquiry.last_message_at
                          ? formatDistanceToNow(new Date(inquiry.last_message_at), { addSuffix: true })
                          : "just now"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Conversation Detail</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedInquiryId ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-14 text-center text-sm text-muted-foreground">
                Select an inquiry to review and reply.
              </div>
            ) : isLoadingThread ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-foreground">{selectedThread?.inquiry?.subject}</p>
                      <p className="text-sm text-muted-foreground">{selectedThread?.inquiry?.guest_name} • {selectedThread?.inquiry?.guest_email}</p>
                      <p className="text-sm text-muted-foreground">{selectedThread?.inquiry?.guest_phone || "No phone number provided"}</p>
                    </div>
                    <Badge className={statusClasses[selectedThread?.inquiry?.status] || statusClasses.open}>
                      {(selectedThread?.inquiry?.status || "open").replace(/_/g, " ")}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div>
                      <Label htmlFor="inquiry-status">Inquiry Status</Label>
                      <Select value={statusValue} onValueChange={setStatusValue}>
                        <SelectTrigger id="inquiry-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.filter((option) => option.value !== "all").map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleStatusUpdate} disabled={isUpdatingStatus} className="gap-2">
                      {isUpdatingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Update Status
                    </Button>
                  </div>

                  <div className="mt-3 text-xs text-muted-foreground">
                    Assigned to: {selectedThread?.inquiry?.assigned_admin_name || user?.full_name || "Not assigned yet"}
                  </div>
                </div>

                <div className="max-h-[460px] space-y-3 overflow-y-auto rounded-2xl border border-border/70 bg-muted/10 p-4">
                  {(selectedThread?.messages || []).map((message) => {
                    const isGuest = message.sender_type === "guest";

                    return (
                      <div key={message.id} className={`flex ${isGuest ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
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

                <form className="space-y-3" onSubmit={handleSendReply}>
                  {isSelectedInquiryClosed ? (
                    <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                      This inquiry is closed. Messaging is disabled because the conversation is already done.
                    </div>
                  ) : null}

                  <div>
                    <Label htmlFor="admin-inquiry-reply">Reply to Guest</Label>
                    <Textarea
                      id="admin-inquiry-reply"
                      rows={5}
                      value={replyMessage}
                      onChange={(event) => setReplyMessage(event.target.value)}
                      placeholder="Type your reply to the guest here."
                      disabled={isSelectedInquiryClosed || isReplying}
                    />
                  </div>
                  <Button type="submit" className="gap-2" disabled={isSelectedInquiryClosed || isReplying}>
                    {isReplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {isSelectedInquiryClosed ? "Inquiry Closed" : "Send Reply"}
                  </Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}