import React, { useState, useRef, useEffect } from "react";
import { baseClient } from "@/api/baseClient";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, X, Send, Loader2, TreePalm } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";
import { RESORT_CONTACT } from "@/lib/resortContact";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const QUICK_QUESTIONS = [
  "What is Kasa Ilaya?",
  "Show me the packages",
  "How do I book?",
  "How do inquiries work?",
  "How can I contact the resort?",
  "What can I see on this website?",
];

const groupPackagesByName = (packages) => {
  const grouped = new Map();

  packages.forEach((pkg) => {
    if (!grouped.has(pkg.name)) {
      grouped.set(pkg.name, []);
    }

    grouped.get(pkg.name).push(pkg);
  });

  return [...grouped.entries()].map(([name, packageOptions]) => ({
    name,
    options: packageOptions.sort((left, right) => {
      const order = { day_tour: 0, night_tour: 1, "22_hours": 2 };
      return (order[left.tour_type] ?? 99) - (order[right.tour_type] ?? 99);
    }),
  }));
};

const buildLocalResponse = (message, packages, siteSettings) => {
  const prompt = message.toLowerCase();
  const groupedPackages = groupPackagesByName(packages || []);
  const siteName = siteSettings?.site_name?.trim() || "Kasa Ilaya";
  const termsSummary = siteSettings?.terms_summary?.trim() || "Bookings are subject to availability and admin confirmation.";

  if (prompt.includes("what is") || prompt.includes("about") || prompt.includes("who are") || prompt.includes("website")) {
    return `${siteName} Resort & Event Place is a booking website for resort stays, private gatherings, and event planning. The public site includes Home, About, Contact, Packages, Amenities, upcoming schedules, reviews, and resort rules. Guests can also send inquiries through the Contact page and continue the conversation there.`;
  }

  if (prompt.includes("package") || prompt.includes("price") || prompt.includes("tour")) {
    if (groupedPackages.length === 0) {
      return "No packages are available right now. Please check the Packages page again later.";
    }

    const lines = groupedPackages.map(({ name, options }) => {
      const variants = options
        .map((pkg) => {
          const label = pkg.tour_type === "day_tour" ? "Day Tour" : pkg.tour_type === "night_tour" ? "Night Tour" : "22 Hours";
          return `${label}: PHP ${Number(pkg.price || 0).toLocaleString()} for up to ${pkg.max_guests} guests`;
        })
        .join(" | ");

      return `- ${name}: ${variants}`;
    });

    return `Here are the available resort packages:\n${lines.join("\n")}\n\nYou can open the Packages page to compare them and proceed to booking.`;
  }

  if (prompt.includes("book") || prompt.includes("reservation")) {
    return `To book the resort, sign in first, open the Packages page, choose your preferred package, select the date and tour type, fill in the guest details, and upload your reservation payment receipt. Because this is a private resort, only one active reservation is allowed for a package date and tour type.`;
  }

  if (prompt.includes("payment") || prompt.includes("receipt") || prompt.includes("gcash") || prompt.includes("maya")) {
    return `The booking flow includes a payment step where you upload your receipt for verification. Admin reviews the reservation payment before the booking is confirmed, and the payment status changes after verification.`;
  }

  if (prompt.includes("available") || prompt.includes("availability") || prompt.includes("date")) {
    return "The calendar uses live reservation availability. Reserved dates cannot be booked, and the package cards also show whether a package is available or reserved today.";
  }

  if (prompt.includes("inquiry") || prompt.includes("message") || prompt.includes("chat with admin") || prompt.includes("contact form")) {
    return "You can send an inquiry on the Contact page by filling out your name, email, subject, and message. The site now saves your inquiry in the database, and you can continue the conversation on the same Contact page. Admin and super admin can read and reply to inquiries from their inbox.";
  }

  if (prompt.includes("contact") || prompt.includes("location") || prompt.includes("where") || prompt.includes("map") || prompt.includes("phone") || prompt.includes("email")) {
    return `You can contact the resort through the Contact page or directly using these details:\n- Phone: ${RESORT_CONTACT.phoneDisplay}\n- Email: ${RESORT_CONTACT.email}\n- Address: ${RESORT_CONTACT.address}\n- Hours: ${RESORT_CONTACT.hours}\nThe Contact page also includes a Google Map and inquiry messaging.`;
  }

  if (prompt.includes("schedule") || prompt.includes("calendar") || prompt.includes("event")) {
    return "The website shows upcoming schedules and reserved dates so guests can see planned events and current availability. Admin can also manage schedules from the calendar tools in the admin area.";
  }

  if (prompt.includes("review") || prompt.includes("testimonial") || prompt.includes("feedback")) {
    return "The home page shows verified guest reviews so visitors can read real feedback from previous stays and resort experiences.";
  }

  if (prompt.includes("rule") || prompt.includes("terms") || prompt.includes("policy")) {
    return `The website includes resort rules and booking terms. Summary: ${termsSummary}`;
  }

  if (prompt.includes("admin") || prompt.includes("super admin") || prompt.includes("staff")) {
    return "Admin tools are separate from the public site. Staff can manage bookings, schedules, and inquiries, while super admin has broader access such as user permissions, system settings, security settings, and activity logs.";
  }

  if (prompt.includes("lost") || prompt.includes("found")) {
    return "This website does not currently include a Lost and Found section. I can still help with packages, booking, contact inquiries, schedules, reviews, and resort information.";
  }

  return null;
};

export default function Chatbot() {
  const { settings: siteSettings } = useSiteSettings();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Welcome to Kasa Ilaya Resort. I can help with packages, booking steps, contact inquiries, resort details, schedules, reviews, and resort rules."
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const { data: packages = [] } = useQuery({
    queryKey: ["chatbot-packages"],
    queryFn: () => baseClient.entities.Package.filter({ is_active: true }, "name"),
    staleTime: 60000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const processMessage = async (rawMessage) => {
    if (!rawMessage.trim() || loading) return;
    const userMsg = { role: "user", content: rawMessage.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const localResponse = buildLocalResponse(rawMessage, packages, siteSettings);
      if (localResponse) {
        setMessages(prev => [...prev, { role: "assistant", content: localResponse }]);
        return;
      }

      const chatHistory = [...messages, userMsg].map(m => `${m.role}: ${m.content}`).join("\n");
      const activePackageSummary = groupPackagesByName(packages || [])
        .map(({ name, options }) => `${name}: ${options.map((pkg) => pkg.tour_type).join(", ")}`)
        .join(" | ");
      const siteName = siteSettings?.site_name?.trim() || "Kasa Ilaya";
      const heroDescription = siteSettings?.hero_description?.trim() || "A resort and event place for stays and celebrations.";
      const termsSummary = siteSettings?.terms_summary?.trim() || "Bookings are subject to availability and admin confirmation.";

      const response = await baseClient.integrations.Core.InvokeLLM({
        prompt: `You are the website assistant for ${siteName} Resort & Event Place.
Answer clearly, briefly, and accurately based on the website.
Prefer practical guidance about:
- About page content and what the resort offers
- Packages, booking flow, receipt verification, and availability
- Contact page details, Google Map, and inquiry messaging
- Upcoming schedules, guest reviews, and resort rules
- Admin and super admin inquiry handling only when asked at a high level
If the question is not specific enough, ask one short follow-up question.
Do not invent unavailable resort details, prices, schedules, contact details, or policies.

Current website facts:
- Site name: ${siteName}
- Hero summary: ${heroDescription}
- Public pages: Home, About, Contact, Packages, Amenities
- Guest features: booking form, my bookings, profile settings, contact inquiry threads
- Staff features: admin dashboard, booking management, calendar management, inquiry inbox, payment QR management
- Super admin has broader access including user permissions, security settings, system settings, and activity logs
- Contact details: phone ${RESORT_CONTACT.phoneDisplay}, email ${RESORT_CONTACT.email}, address ${RESORT_CONTACT.address}, hours ${RESORT_CONTACT.hours}
- Inquiry system: guests can send inquiries on the Contact page and continue the message thread there; admin and super admin can reply from the admin inbox
- Package variants currently loaded: ${activePackageSummary || "No active packages loaded"}
- Terms summary: ${termsSummary}

Chat history:
${chatHistory}

Respond to the latest user message.`,
      });

      setMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "I can help with resort details, packages, booking, contact inquiries, schedules, reviews, and resort rules. Try one of the quick questions below."
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    await processMessage(input);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:bottom-6 sm:right-6 sm:h-14 sm:w-14"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed inset-x-3 bottom-20 z-50 flex h-[min(70vh,520px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[360px] sm:max-w-[calc(100vw-48px)] sm:h-[480px]">
          {/* Header */}
          <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
            <TreePalm className="h-5 w-5" />
            <div>
              <p className="font-semibold text-sm">Kasa Ilaya Assistant</p>
              <p className="text-xs opacity-80">Online • Ready to help</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  }`}
                >
                  <ReactMarkdown className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            {!loading && (
              <div className="flex flex-wrap gap-2 pt-2">
                {QUICK_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                    onClick={() => processMessage(question)}
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message..."
              className="flex-1 text-sm"
            />
            <Button size="icon" onClick={handleSend} disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}