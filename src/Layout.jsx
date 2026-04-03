import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { baseClient } from "@/api/baseClient";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Home, Package, CalendarCheck, LayoutDashboard, LogOut,
  Menu, X, User, ChevronDown, TreePalm, Settings, QrCode, CalendarDays, Archive, SlidersHorizontal, ShieldCheck, Shield,
  Sun, Moon, Monitor, Bell, CheckCheck, MessageSquareMore
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import Chatbot from "@/components/Chatbot";
import { FONT_STYLE_OPTIONS, useSiteSettings } from "@/hooks/useSiteSettings";
import { canAccessAdminPage } from "@/lib/adminAccess";
import { useTheme } from "@/hooks/useTheme";

const userNav = [
  { name: "Home", icon: Home, page: "Home" },
  { name: "About", icon: Sun, page: "About" },
  { name: "Contact", icon: Bell, page: "Contact" },
  { name: "Packages", icon: Package, page: "Packages" },
  { name: "Amenities", icon: TreePalm, page: "Amenities" },
  { name: "My Bookings", icon: CalendarCheck, page: "MyBookings" },
];

const adminNav = [
  { name: "Dashboard", icon: LayoutDashboard, page: "AdminDashboard" },
  { name: "Manage Events", icon: CalendarDays, page: "AdminCalendar" },
  { name: "Manage Packages", icon: Package, page: "AdminPackages" },
  { name: "Archive", icon: Archive, page: "AdminPackageArchive" },
  { name: "Manage Bookings", icon: CalendarCheck, page: "AdminBookings" },
  { name: "Inquiries", icon: MessageSquareMore, page: "AdminInquiries" },
  { name: "Payment QR Codes", icon: QrCode, page: "AdminPaymentQRCodes" },
  { name: "User Permissions", icon: ShieldCheck, page: "AdminUserPermissions" },
  { name: "Security Settings", icon: Shield, page: "AdminSecuritySettings" },
  { name: "System Settings", icon: SlidersHorizontal, page: "AdminSystemSettings" },
  { name: "Activity Logs", icon: User, page: "AdminActivityLogs" },
];

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationSeenAt, setNotificationSeenAt] = useState(0);
  const { settings: siteSettings } = useSiteSettings();
  const { theme, setTheme } = useTheme();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdminUser = Boolean(
    user && (user?.role === "super_admin" || user?.app_role === "super_admin" || user?._app_role === "super_admin")
  );
  const isRegularAdmin = Boolean(isAdmin && !isSuperAdminUser);
  const isAdminPage = Boolean(
    currentPageName?.startsWith("Admin") ||
    ((currentPageName === "ForgotPassword" || currentPageName === "ResetPassword") && isAdmin)
  );

  useEffect(() => {
    const syncUser = () => {
      // attempt to load current user; mark auth as loaded after attempt
      baseClient.auth.me().then(setUser).catch(() => setUser(null)).finally(() => setAuthLoaded(true));
    };

    syncUser();
    window.addEventListener('local-auth-changed', syncUser);
    window.addEventListener('storage', syncUser);

    return () => {
      window.removeEventListener('local-auth-changed', syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, []);

  const isAdminMode = Boolean(isAdmin && isAdminPage);
  const allowedAdminNav = adminNav.filter((item) => canAccessAdminPage(user, item.page));
  const guestNav = userNav.filter((item) => {
    if (item.page === "MyBookings") {
      return Boolean(user) && !isAdmin;
    }

    if (item.page === "Contact") {
      return !isAdmin;
    }

    return true;
  });
  const navItems = isAdminMode ? allowedAdminNav : guestNav;
  const profilePageTarget = isAdminMode && canAccessAdminPage(user, "AdminProfileSettings")
    ? "AdminProfileSettings"
    : "ProfileSettings";
  const siteName = siteSettings?.site_name?.trim() || "Kasa Ilaya";

  const bodyFontFamily = FONT_STYLE_OPTIONS[siteSettings?.body_font_style]?.cssFamily || FONT_STYLE_OPTIONS.inter.cssFamily;
  const headingFontFamily = FONT_STYLE_OPTIONS[siteSettings?.heading_font_style]?.cssFamily || FONT_STYLE_OPTIONS.playfair.cssFamily;

  useEffect(() => {
    document.documentElement.style.setProperty("--font-body", bodyFontFamily);
    document.documentElement.style.setProperty("--font-heading", headingFontFamily);
  }, [bodyFontFamily, headingFontFamily]);

  useEffect(() => {
    if (!user) {
      setNotificationSeenAt(0);
      return;
    }

    const key = `ki-notifications-seen-at:${user.id || user.email}`;
    const stored = Number(localStorage.getItem(key) || 0);
    setNotificationSeenAt(Number.isFinite(stored) ? stored : 0);
  }, [user]);

  useEffect(() => {
    // Previously: auto-redirect unverified guest users to verification page.
    // Removed to avoid forcing the verification UI to show automatically.
  }, [authLoaded, user, currentPageName]);

  const { data: notificationBookings = [] } = useQuery({
    queryKey: ["user-notification-bookings", user?.email, isRegularAdmin, isSuperAdminUser],
    queryFn: () => {
      if (isRegularAdmin || isSuperAdminUser) {
        return baseClient.entities.Booking.filter(
          { status: ["pending", "confirmed", "completed", "cancelled"] },
          "-updated_date",
          80
        );
      }

      return baseClient.entities.Booking.filter({ customer_email: user?.email }, "-updated_date", 50);
    },
    enabled: Boolean(user),
    refetchInterval: 30000,
  });

  const { data: notificationLogs = [] } = useQuery({
    queryKey: ["user-notification-logs", user?.email, isRegularAdmin, isSuperAdminUser],
    queryFn: () => {
      if (isSuperAdminUser) {
        return baseClient.entities.ActivityLog.list("-created_date", 120);
      }

      return baseClient.entities.ActivityLog.filter({ user_email: user?.email }, "-created_date", 30);
    },
    enabled: Boolean(user?.email) && !isRegularAdmin,
    refetchInterval: 30000,
  });

  const accountNotifications = [];
  if (user?.disabled) {
    accountNotifications.push({
      id: "account-disabled",
      title: "Account access restricted",
      description: "Your account is currently disabled. Please contact resort admin support.",
      createdAt: user?.updated_date || user?.created_date || new Date().toISOString(),
      link: createPageUrl("ProfileSettings"),
    });
  }

  if (user?.updated_date) {
    accountNotifications.push({
      id: "account-updated",
      title: "Account details updated",
      description: "Your profile or account settings were recently updated.",
      createdAt: user.updated_date,
      link: createPageUrl("ProfileSettings"),
    });
  }

  const bookingNotifications = notificationBookings.flatMap((booking) => {
    const createdAt = booking.updated_date || booking.created_date || booking.booking_date;
    const result = [];
    const bookingTargetPage = (isRegularAdmin || isSuperAdminUser) ? "AdminBookings" : "MyBookings";

    if (booking.status) {
      const statusLabel = booking.status.replace(/_/g, " ");
      result.push({
        id: `booking-status-${booking.id}`,
        title: isRegularAdmin || isSuperAdminUser ? `Booking ${statusLabel}` : `Booking ${statusLabel}`,
        description: `${booking.package_name || "Reservation"} on ${booking.booking_date || "selected date"}.`,
        createdAt,
        link: createPageUrl(bookingTargetPage),
      });
    }

    if (booking.payment_status) {
      const paymentLabel = booking.payment_status.replace(/_/g, " ");
      result.push({
        id: `booking-payment-${booking.id}`,
        title: `Payment ${paymentLabel}`,
        description: `${booking.package_name || "Booking"} payment update was recorded.`,
        createdAt,
        link: createPageUrl(bookingTargetPage),
      });
    }

    return result;
  });

  const activityNotifications = notificationLogs
    .filter((entry) => {
      if (isSuperAdminUser) {
        return true;
      }

      const action = (entry.action || "").toLowerCase();
      return action.includes("booking") || action.includes("profile") || action.includes("password") || action.includes("account");
    })
    .map((entry) => ({
      id: `activity-${entry.id}`,
      title: entry.action || "Account update",
      description: entry.details || "An update was recorded for your account.",
      createdAt: entry.created_date || entry.updated_date || new Date().toISOString(),
      link:
        entry.entity_type === "Booking"
          ? createPageUrl((isRegularAdmin || isSuperAdminUser) ? "AdminBookings" : "MyBookings")
          : createPageUrl(isRegularAdmin || isSuperAdminUser ? "AdminActivityLogs" : "ProfileSettings"),
    }));

  const notifications = (isRegularAdmin
    ? [...bookingNotifications]
    : isSuperAdminUser
      ? [...bookingNotifications, ...activityNotifications]
      : [...bookingNotifications, ...activityNotifications, ...accountNotifications]
  )
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 12);

  const unreadCount = notifications.filter((item) => new Date(item.createdAt).getTime() > notificationSeenAt).length;

  const markNotificationsAsRead = () => {
    if (!user) {
      return;
    }

    const seenAt = Date.now();
    const key = `ki-notifications-seen-at:${user.id || user.email}`;
    localStorage.setItem(key, String(seenAt));
    setNotificationSeenAt(seenAt);
  };

  const notificationSubtitle = isSuperAdminUser
    ? "Bookings, audit logs, archive actions, and system events"
    : isRegularAdmin
      ? "Booking updates only"
      : "Account and booking updates";

  const renderNotificationMenu = ({ compact = false } = {}) => {
    if (!user) {
      return null;
    }

    return (
      <DropdownMenu
        open={notificationOpen}
        onOpenChange={(open) => {
          setNotificationOpen(open);
          if (open) {
            markNotificationsAsRead();
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          {compact ? (
            <Button variant="outline" size="icon" className="relative h-8 w-8" aria-label="Notifications">
              <Bell className="h-3.5 w-3.5" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-[1rem] rounded-full bg-destructive px-1 text-[9px] font-semibold leading-3.5 text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="relative h-7 w-7" aria-label="Notifications">
              <Bell className="h-3 w-3" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-[1rem] rounded-full bg-destructive px-1 text-[9px] font-semibold leading-3.5 text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(92vw,28rem)] p-0">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <p className="text-xs text-muted-foreground">{notificationSubtitle}</p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={markNotificationsAsRead}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark read
            </Button>
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</div>
            ) : (
              notifications.map((item) => {
                const eventTime = new Date(item.createdAt);
                const isUnread = eventTime.getTime() > notificationSeenAt;
                return (
                  <DropdownMenuItem key={item.id} asChild>
                    <Link
                      to={item.link || createPageUrl("MyBookings")}
                      className={`flex flex-col items-start gap-1 border-b border-border/60 px-3 py-3 ${isUnread ? "bg-primary/5" : ""}`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{item.title}</span>
                        {isUnread ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                      </div>
                      <span className="text-xs text-muted-foreground">{item.description}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {Number.isNaN(eventTime.getTime())
                          ? "Just now"
                          : `${formatDistanceToNow(eventTime, { addSuffix: true })}`}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                );
              })
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const ThemeToggle = () => (
    <div className="px-2 py-1.5">
      <div className="flex items-center rounded-lg border border-border overflow-hidden">
        {[{ id: "light", Icon: Sun, label: "Light" }, { id: "system", Icon: Monitor, label: "System" }, { id: "dark", Icon: Moon, label: "Dark" }].map(({ id, Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            title={label}
            aria-label={label}
            className={`flex flex-1 items-center justify-center px-2.5 py-1.5 text-xs font-medium transition-colors ${
              theme === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );

  const NavbarThemeToggle = () => (
    <div className="hidden items-center rounded-xl border border-border bg-background/70 p-1 sm:flex">
      {[
        { id: "light", Icon: Sun, label: "Light" },
        { id: "system", Icon: Monitor, label: "System" },
        { id: "dark", Icon: Moon, label: "Dark" },
      ].map(({ id, Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => setTheme(id)}
          title={label}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
            theme === id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          aria-label={label}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );

  const handleLogout = () => {
    baseClient.auth.logout();
  };

  const adminToggleTarget = createPageUrl(isAdminMode ? "Home" : "AdminDashboard");

  const renderUserMenu = () => {
    if (user) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="flex items-center gap-2 px-1.5 sm:px-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <span className="text-xs font-semibold text-primary">
                  {user.full_name?.[0]?.toUpperCase() || "U"}
                </span>
              </div>
              <span className="hidden lg:inline max-w-32 truncate text-sm text-foreground">{user.full_name}</span>
              <ChevronDown className="hidden lg:block h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{user.email}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(profilePageTarget)}>
                <Settings className="mr-2 h-4 w-4" />
                Profile Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return (
      <Button size="sm" onClick={() => baseClient.auth.redirectToLogin(window.location.href)}>
        Sign In
      </Button>
    );
  };

  const BrandMark = ({ compact = false }) => (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 sm:h-11 sm:w-11">
        {siteSettings?.logo_url ? (
          <img src={siteSettings.logo_url} alt="Site logo" className="h-full w-full object-contain" />
        ) : (
          <TreePalm className="h-6 w-6 text-primary" />
        )}
      </div>
      {!compact ? (
        <div>
          <span className="block font-display text-lg font-bold text-foreground tracking-tight">
            {siteName}
          </span>
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {isAdminMode ? "Resort Admin" : "Resort Navigation"}
          </span>
        </div>
      ) : (
        <span className="hidden font-display text-lg font-bold text-foreground tracking-tight sm:inline">
          {siteName}
        </span>
      )}
    </div>
  );

  if (!authLoaded) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-primary border-border" />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${isAdminMode ? "md:pl-72" : ""}`}>
      {isAdminMode ? (
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-border bg-card md:flex md:flex-col">
        <div className="border-b border-border px-6 py-6">
          <Link to={createPageUrl("Home")} className="flex items-center gap-3">
            <BrandMark />
          </Link>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-5">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.page || item.href}
                to={item.href || createPageUrl(item.page)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  currentPageName === item.page
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        <div className="border-t border-border px-4 py-4 space-y-3">
          {user ? (
            <>
              {/* User info */}
              <div className="flex items-center gap-3 px-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-sm font-semibold text-primary">
                    {user.full_name?.[0]?.toUpperCase() || "U"}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{user.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>

              {/* Theme toggle */}
              <ThemeToggle />

              {/* Profile Settings */}
              <Link
                to={createPageUrl(profilePageTarget)}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
                Profile Settings
              </Link>

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </>
          ) : (
            <Button className="w-full" onClick={() => baseClient.auth.redirectToLogin(window.location.href)}>
              Sign In
            </Button>
          )}
        </div>
      </aside>
      ) : null}

      <div className="min-h-screen">
        {isAdminMode && user ? (
          <div className="fixed right-3 top-3 z-50 hidden md:block lg:right-4 lg:top-4">
            {renderNotificationMenu({ compact: true })}
          </div>
        ) : null}

        <header className={`sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-xl ${isAdminMode ? "md:hidden" : ""}`}>
          <div className={`min-h-16 px-4 sm:px-6 lg:px-10 xl:px-14 ${isAdminMode ? "flex items-center justify-between" : "flex items-center justify-between py-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-6 xl:gap-10"}`}>
            <Link to={createPageUrl("Home")} className="flex items-center gap-3">
              <BrandMark compact />
            </Link>

            {!isAdminMode ? (
              <nav className="hidden lg:flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-background/70 px-2 py-1.5 justify-self-center shadow-sm xl:gap-2 xl:px-3">
                {navItems.map((item) => (
                  <Link
                    key={item.page || item.href}
                    to={item.href || createPageUrl(item.page)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors xl:gap-2.5 xl:px-5 xl:py-2.5 ${
                      currentPageName === item.page
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                ))}
              </nav>
            ) : null}

            <div className={`flex items-center gap-2 sm:gap-3 ${isAdminMode ? "" : "lg:justify-self-end"}`}>
              {!isAdminMode ? <NavbarThemeToggle /> : null}
              {!isAdminMode ? renderNotificationMenu({ compact: true }) : null}
              {renderUserMenu()}

              <Button
                variant="ghost"
                size="icon"
                className={isAdminMode ? "" : "lg:hidden"}
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {mobileOpen && (
            <div className="border-t border-border bg-card px-4 py-3 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.page || item.href}
                  to={item.href || createPageUrl(item.page)}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                    currentPageName === item.page
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              ))}

            </div>
          )}
        </header>

        <main className="min-h-screen">{children}</main>

        {!isAdminMode ? (
          <footer className="border-t border-border bg-card/80">
            <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-5 text-center text-sm text-muted-foreground sm:px-6 lg:px-10 xl:px-14">
              <p>
                {siteName} Resort & Event Place. All guest reservations are subject to resort policies and confirmation. @2026 All rights reserved.
              </p>
            </div>
          </footer>
        ) : null}
      </div>

      {/* Chatbot */}
      {!isAdminMode ? <Chatbot /> : null}
    </div>
  );
}