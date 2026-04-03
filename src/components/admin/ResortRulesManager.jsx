import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilLine, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { baseClient } from "@/api/baseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const createDefaultForm = () => ({
  title: "",
  description: "",
  sort_order: 1,
  is_active: true,
});

export default function ResortRulesManager({ user }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [deleteRule, setDeleteRule] = useState(null);
  const [form, setForm] = useState(createDefaultForm());
  const [saving, setSaving] = useState(false);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["admin-resort-rules"],
    queryFn: () => baseClient.entities.ResortRule.list("sort_order", 100),
  });

  const sortedRules = useMemo(
    () => [...rules].sort((left, right) => (left.sort_order ?? 999) - (right.sort_order ?? 999)),
    [rules]
  );

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }

    setForm(editingRule ? {
      ...createDefaultForm(),
      ...editingRule,
    } : {
      ...createDefaultForm(),
      sort_order: sortedRules.length + 1,
    });
  }, [dialogOpen, editingRule, sortedRules.length]);

  const handleSave = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error("Rule title and description are required.");
      return;
    }

    setSaving(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      sort_order: Number(form.sort_order) || 1,
      is_active: Boolean(form.is_active),
    };

    try {
      if (editingRule) {
        const updated = await baseClient.entities.ResortRule.update(editingRule.id, payload);
        await baseClient.entities.ActivityLog.create({
          user_email: user?.email,
          user_name: user?.full_name,
          action: "Updated Resort Rule",
          entity_type: "ResortRule",
          entity_id: updated.id,
          details: `Updated resort rule: ${updated.title}`,
        });
        toast.success("Rule updated.");
      } else {
        const created = await baseClient.entities.ResortRule.create(payload);
        await baseClient.entities.ActivityLog.create({
          user_email: user?.email,
          user_name: user?.full_name,
          action: "Created Resort Rule",
          entity_type: "ResortRule",
          entity_id: created.id,
          details: `Created resort rule: ${created.title}`,
        });
        toast.success("Rule added.");
      }

      await queryClient.invalidateQueries({ queryKey: ["admin-resort-rules"] });
      setDialogOpen(false);
      setEditingRule(null);
    } catch (error) {
      toast.error(error?.message || "Unable to save resort rule.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRule) {
      return;
    }

    try {
      await baseClient.entities.ResortRule.delete(deleteRule.id);
      await baseClient.entities.ActivityLog.create({
        user_email: user?.email,
        user_name: user?.full_name,
        action: "Deleted Resort Rule",
        entity_type: "ResortRule",
        entity_id: deleteRule.id,
        details: `Deleted resort rule: ${deleteRule.title}`,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-resort-rules"] });
      toast.success("Rule deleted.");
    } catch (error) {
      toast.error(error?.message || "Unable to delete resort rule.");
    } finally {
      setDeleteRule(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="font-display text-2xl">Resort Rules</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Edit the rules shown on the home page and booking flow.</p>
        </div>
        <Button onClick={() => { setEditingRule(null); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add Rule
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-sm text-muted-foreground">Loading rules...</div>
        ) : sortedRules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No resort rules found yet.
          </div>
        ) : (
          <div className="space-y-4">
            {sortedRules.map((rule) => (
              <div key={rule.id} className="rounded-2xl border border-border bg-background p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">{rule.title}</h3>
                        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">Order {rule.sort_order}</span>
                        <span className={`rounded-full px-2 py-1 text-xs ${rule.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {rule.is_active ? "Active" : "Hidden"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">{rule.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <Button variant="outline" size="icon" onClick={() => { setEditingRule(rule); setDialogOpen(true); }}>
                      <PencilLine className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="text-destructive" onClick={() => setDeleteRule(rule)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingRule(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display">{editingRule ? "Edit Resort Rule" : "Add Resort Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rule Title</Label>
              <Input className="mt-1" value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea className="mt-1" rows={4} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Sort Order</Label>
                <Input className="mt-1" type="number" min="1" value={form.sort_order} onChange={(event) => setForm((prev) => ({ ...prev, sort_order: Number(event.target.value) || 1 }))} />
              </div>
              <div className="flex items-end gap-3 pb-2">
                <Switch checked={form.is_active} onCheckedChange={(value) => setForm((prev) => ({ ...prev, is_active: value }))} />
                <Label>Visible on site</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : editingRule ? "Save Changes" : "Add Rule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRule} onOpenChange={(open) => !open && setDeleteRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the rule from the home page and booking flow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}