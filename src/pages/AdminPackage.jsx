import React, { useState, useEffect } from "react";
import { baseClient } from "@/api/baseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Archive, Loader2 } from "lucide-react";
import PackageFormDialog from "@/components/admin/PackageFormDialog";
import { toast } from "sonner";

const sortPackagesForDisplay = (packages) =>
  [...packages].sort((left, right) => left.name.localeCompare(right.name));

export default function AdminPackages() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editPkg, setEditPkg] = useState(null);
  const [archiveId, setArchiveId] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    baseClient.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: () => baseClient.entities.Package.filter({ is_active: true }, "name"),
  });

  const handleSave = async (data) => {
    if (editPkg) {
      const updated = await baseClient.entities.Package.update(editPkg.id, data);
      await baseClient.entities.ActivityLog.create({
        user_email: user?.email,
        user_name: user?.full_name,
        action: "Updated Package",
        entity_type: "Package",
        entity_id: editPkg.id,
        details: `Updated package: ${data.name}`,
      });

      queryClient.setQueryData(["admin-packages"], (current = []) =>
        sortPackagesForDisplay(current.map((entry) => (entry.id === updated.id ? updated : entry)))
      );
    } else {
      const created = await baseClient.entities.Package.create(data);
      await baseClient.entities.ActivityLog.create({
        user_email: user?.email,
        user_name: user?.full_name,
        action: "Created Package",
        entity_type: "Package",
        entity_id: created.id,
        details: `Created package: ${data.name}`,
      });

      queryClient.setQueryData(["admin-packages"], (current = []) => sortPackagesForDisplay([created, ...current]));
    }
    queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
    queryClient.invalidateQueries({ queryKey: ["packages"] });
    setEditPkg(null);
  };

  const handleArchive = async () => {
    const pkg = packages.find((p) => p.id === archiveId);

    try {
      await baseClient.entities.Package.update(archiveId, { is_active: false });
      await baseClient.entities.ActivityLog.create({
        user_email: user?.email,
        user_name: user?.full_name,
        action: "Archived Package",
        entity_type: "Package",
        entity_id: archiveId,
        details: `Archived package backup: ${pkg?.name}`,
      });
      toast.success("Package archived and moved to Archive.");

      queryClient.setQueryData(["admin-packages"], (current = []) =>
        current.filter((entry) => entry.id !== archiveId)
      );

      queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
      queryClient.invalidateQueries({ queryKey: ["admin-packages-archived"] });
      queryClient.invalidateQueries({ queryKey: ["packages"] });
    } catch (error) {
      toast.error(error?.message || "Unable to archive the package.");
    } finally {
      setArchiveId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Manage Packages</h1>
          <p className="text-muted-foreground mt-1">Create, edit, and manage resort packages</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { setEditPkg(null); setFormOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Add Package
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
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
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortPackagesForDisplay(packages).map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell className="font-medium">{pkg.name}</TableCell>
                    <TableCell className="font-semibold text-secondary">₱{pkg.day_tour_price?.toLocaleString() || 0}</TableCell>
                    <TableCell className="font-semibold text-secondary">₱{pkg.night_tour_price?.toLocaleString() || 0}</TableCell>
                    <TableCell className="font-semibold text-secondary">₱{pkg.twenty_two_hour_price?.toLocaleString() || 0}</TableCell>
                    <TableCell>{pkg.max_guests}</TableCell>
                    <TableCell>
                      <Badge className={pkg.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}>
                        {pkg.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditPkg(pkg); setFormOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-amber-600" onClick={() => setArchiveId(pkg.id)}>
                          <Archive className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <PackageFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditPkg(null); }}
        pkg={editPkg}
        onSave={handleSave}
      />

      <AlertDialog open={!!archiveId} onOpenChange={(open) => !open && setArchiveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Package?</AlertDialogTitle>
            <AlertDialogDescription>
              This package data will be preserved as backup in Archive. You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} className="bg-amber-600 text-white hover:bg-amber-700">
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}