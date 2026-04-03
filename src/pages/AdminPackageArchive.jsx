import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { baseClient } from "@/api/baseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const sortPackagesForDisplay = (packages) =>
  [...packages].sort((left, right) => left.name.localeCompare(right.name));

const sortQrCodesForDisplay = (codes) =>
  [...codes].sort((left, right) => (left.display_order ?? 99) - (right.display_order ?? 99));

const sortUsersForDisplay = (users) =>
  [...users].sort((left, right) => String(left.full_name || "").localeCompare(String(right.full_name || "")));

const roleBadgeClass = {
  super_admin: "bg-primary/10 text-primary border-primary/30",
  admin: "bg-accent/20 text-accent-foreground border-accent/30",
  guest: "bg-muted text-muted-foreground border-border",
};

const roleLabel = {
  super_admin: "Super Admin",
  admin: "Admin",
  guest: "Guest",
};

export default function AdminPackageArchive() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [restorePackageId, setRestorePackageId] = useState(null);
  const [restoreQrId, setRestoreQrId] = useState(null);
  const [restoreUserId, setRestoreUserId] = useState(null);

  useEffect(() => {
    baseClient.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const { data: archivedPackages = [], isLoading: isLoadingPackages } = useQuery({
    queryKey: ["admin-packages-archived"],
    queryFn: () => baseClient.entities.Package.filter({ is_active: false }, "name"),
  });

  const { data: qrCodes = [], isLoading: isLoadingQrCodes } = useQuery({
    queryKey: ["admin-payment-qr-codes"],
    queryFn: () => baseClient.entities.PaymentQrCode.list("display_order", 50),
  });

  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ["admin-user-permissions"],
    queryFn: () => baseClient.entities.User.list("full_name", 1000),
  });

  const archivedQrCodes = useMemo(
    () => sortQrCodesForDisplay(qrCodes.filter((entry) => entry.is_active === false || entry.is_active === 0 || entry.is_active === "0")),
    [qrCodes]
  );

  const archivedUsers = useMemo(
    () => sortUsersForDisplay(users.filter((entry) => Boolean(entry.disabled))),
    [users]
  );

  const isLoading = isLoadingPackages || isLoadingQrCodes || isLoadingUsers;

  const handleRestorePackage = async () => {
    const pkg = archivedPackages.find((entry) => entry.id === restorePackageId);

    try {
      await baseClient.entities.Package.update(restorePackageId, { is_active: true });
      await baseClient.entities.ActivityLog.create({
        user_email: user?.email,
        user_name: user?.full_name,
        action: "Restored Package",
        entity_type: "Package",
        entity_id: restorePackageId,
        details: `Restored archived package: ${pkg?.name}`,
      });

      toast.success("Package restored successfully.");
      queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
      queryClient.invalidateQueries({ queryKey: ["admin-packages-archived"] });
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      queryClient.invalidateQueries({ queryKey: ["admin-activity-logs"] });
    } catch (error) {
      toast.error(error?.message || "Unable to restore package.");
    } finally {
      setRestorePackageId(null);
    }
  };

  const handleRestoreQrCode = async () => {
    const target = archivedQrCodes.find((entry) => entry.id === restoreQrId);

    try {
      await baseClient.entities.PaymentQrCode.update(restoreQrId, { is_active: true });
      await baseClient.entities.ActivityLog.create({
        user_email: user?.email,
        user_name: user?.full_name,
        action: "Restored Payment QR Code",
        entity_type: "PaymentQrCode",
        entity_id: restoreQrId,
        details: `Restored QR code: ${target?.label || restoreQrId}`,
      });

      toast.success("QR code restored.");
      queryClient.invalidateQueries({ queryKey: ["admin-payment-qr-codes"] });
      queryClient.invalidateQueries({ queryKey: ["booking-payment-qr-codes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-activity-logs"] });
    } catch (error) {
      toast.error(error?.message || "Unable to restore QR code.");
    } finally {
      setRestoreQrId(null);
    }
  };

  const handleRestoreUser = async () => {
    const target = archivedUsers.find((entry) => entry.id === restoreUserId);

    try {
      await baseClient.entities.User.update(restoreUserId, { disabled: false });
      await baseClient.entities.ActivityLog.create({
        user_email: user?.email,
        user_name: user?.full_name,
        action: "Restored User Account",
        entity_type: "User",
        entity_id: restoreUserId,
        details: `Restored account for ${target?.email || restoreUserId}`,
      });

      toast.success("User account restored.");
      queryClient.invalidateQueries({ queryKey: ["admin-user-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-activity-logs"] });
    } catch (error) {
      toast.error(error?.message || "Unable to restore user account.");
    } finally {
      setRestoreUserId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Archive</h1>
          <p className="mt-1 text-muted-foreground">
            Restore archived packages, QR codes, and user accounts from one page.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <div className="mb-4">
              <h2 className="font-display text-2xl font-bold text-foreground">Archived Packages</h2>
              <p className="mt-1 text-sm text-muted-foreground">Restore package offers back into the public package list.</p>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Day Tour</TableHead>
                      <TableHead>Night Tour</TableHead>
                      <TableHead>22 Hours</TableHead>
                      <TableHead>Max Guests</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortPackagesForDisplay(archivedPackages).length ? (
                      sortPackagesForDisplay(archivedPackages).map((pkg) => (
                        <TableRow key={pkg.id}>
                          <TableCell className="font-medium">{pkg.name}</TableCell>
                          <TableCell className="font-semibold text-secondary">₱{pkg.day_tour_price?.toLocaleString() || 0}</TableCell>
                          <TableCell className="font-semibold text-secondary">₱{pkg.night_tour_price?.toLocaleString() || 0}</TableCell>
                          <TableCell className="font-semibold text-secondary">₱{pkg.twenty_two_hour_price?.toLocaleString() || 0}</TableCell>
                          <TableCell>{pkg.max_guests}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => setRestorePackageId(pkg.id)}>
                              <RotateCcw className="h-4 w-4" />
                              Restore
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                          No archived packages.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="font-display text-2xl font-bold text-foreground">Archived QR Codes</h2>
              <p className="mt-1 text-sm text-muted-foreground">Restore payment QR options when they should appear again in booking.</p>
            </div>
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>QR Code</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {archivedQrCodes.length ? (
                      archivedQrCodes.map((code) => (
                        <TableRow key={code.id}>
                          <TableCell>
                            <img src={code.image_url} alt={code.label} className="h-16 w-16 rounded-lg border border-border object-cover" />
                          </TableCell>
                          <TableCell className="font-medium">{code.label}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <p>{code.account_name || "No account name"}</p>
                              <p className="text-muted-foreground">{code.account_number || "No account number"}</p>
                            </div>
                          </TableCell>
                          <TableCell>{code.display_order}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => setRestoreQrId(code.id)}>
                              <RotateCcw className="h-4 w-4" />
                              Restore
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                          No archived QR codes.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="font-display text-2xl font-bold text-foreground">Archived User Accounts</h2>
              <p className="mt-1 text-sm text-muted-foreground">Restore archived accounts so they can sign in and appear in active user management again.</p>
            </div>
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {archivedUsers.length ? (
                      archivedUsers.map((targetUser) => (
                        <TableRow key={targetUser.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm text-foreground">{targetUser.full_name || "Unnamed"}</p>
                              <p className="text-xs font-mono text-muted-foreground">{targetUser.id}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{targetUser.email}</p>
                              <p className="text-xs text-muted-foreground">{targetUser.phone || "No phone"}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={roleBadgeClass[targetUser.role] || roleBadgeClass.guest}>
                              {roleLabel[targetUser.role] || targetUser.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {targetUser.created_date ? format(new Date(targetUser.created_date), "MMM d, yyyy") : "Unknown"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => setRestoreUserId(targetUser.id)}>
                              <RotateCcw className="h-4 w-4" />
                              Restore
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                          No archived user accounts.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        </div>
      )}

      <AlertDialog open={!!restorePackageId} onOpenChange={(open) => !open && setRestorePackageId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Package?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the package back to Manage Packages and make it available again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestorePackage}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!restoreQrId} onOpenChange={(open) => !open && setRestoreQrId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore QR Code?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make the QR code available again for future reservation payments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreQrCode}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!restoreUserId} onOpenChange={(open) => !open && setRestoreUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore User Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reactivate the archived account and allow the user to sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreUser}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
