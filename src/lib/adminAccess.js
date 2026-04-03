const ADMIN_ALLOWED_PAGES = new Set([
  "AdminDashboard",
  "AdminBookings",
  "AdminCalendar",
  "AdminInquiries",
  "AdminProfileSettings",
]);

export const isAdminUser = (user) => user?.role === "admin" || user?.role === "super_admin";

export const isSuperAdmin = (user) =>
  isAdminUser(user) && (user?._app_role === "super_admin" || user?.app_role === "super_admin" || user?.role === "super_admin");

export const canAccessAdminPage = (user, pageName) => {
  if (!isAdminUser(user) || !pageName?.startsWith("Admin")) {
    return false;
  }

  if (isSuperAdmin(user)) {
    return true;
  }

  return ADMIN_ALLOWED_PAGES.has(pageName);
};
