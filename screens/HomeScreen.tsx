import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronUp, Home as HomeIcon, PlusCircle, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * HomeManager – screen for managing "Zu Hause" (homes) & their zones/sub‑zones.
 *
 * Requirements:
 * 1. List all homes for current user (GraphQL `homes` query).
 * 2. Expandable card → shows zones + add-zone button.
 * 3. Dialog to create/edit home & zone.
 * 4. Delete actions with confirmation (soft‑delete for now).
 * 5. Tailwind styling + shadcn/ui components.
 */

interface Zone {
  id: string;
  name: string;
  type: "room" | "balcony" | "garden" | "greenhouse";
}

interface Home {
  id: string;
  name: string;
  address?: string | null;
  zones: Zone[];
}

export default function HomeManager() {
  const [homes, setHomes] = useState<Home[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openDialog, setOpenDialog] = useState<"home" | "zone" | null>(null);
  const [editTarget, setEditTarget] = useState<{ homeId?: string; zone?: Zone } | null>(null);
  const [form, setForm] = useState<{ name: string; address?: string; type?: Zone["type"] }>({ name: "" });

  // -- 1. Fetch homes ------------------------------------------------------
  useEffect(() => {
    (async () => {
      // NOTE: replace with real GraphQL client (urql/apollo). This is a stub.
      const resp = await fetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{
          homes { id name address zones { id name type } }
        }` }),
      });
      const json = await resp.json();
      setHomes(json.data.homes as Home[]);
    })();
  }, []);

  // -- 2. Helpers ----------------------------------------------------------
  const toggleExpand = (homeId: string) =>
    setExpanded((prev) => ({ ...prev, [homeId]: !prev[homeId] }));

  const openHomeDialog = (home?: Home) => {
    setEditTarget(home ? { homeId: home.id } : null);
    setForm({ name: home?.name || "", address: home?.address || "" });
    setOpenDialog("home");
  };

  const openZoneDialog = (homeId: string, zone?: Zone) => {
    setEditTarget({ homeId, zone });
    setForm({ name: zone?.name || "", type: zone?.type || "room" });
    setOpenDialog("zone");
  };

  const closeDialog = () => {
    setOpenDialog(null);
    setForm({ name: "" });
  };

  // -- 3. Mutations (stubs) -----------------------------------------------
  const saveHome = async () => {
    const { name, address } = form;
    if (!name.trim()) return;
    const mutation = editTarget?.homeId
      ? `mutation { updateHome(id:"${editTarget.homeId}", input:{name:"${name}", address:"${address}"}){ id } }`
      : `mutation { createHome(input:{name:"${name}", address:"${address}"}){ id } }`;
    await fetch("/api/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: mutation }),
    });
    closeDialog();
    location.reload(); // simple refetch; replace with SWR revalidation
  };

  const saveZone = async () => {
    const { name, type = "room" } = form;
    const homeId = editTarget?.homeId;
    if (!name.trim() || !homeId) return;
    const mutation = editTarget?.zone
      ? `mutation { updateZone(id:"${editTarget.zone!.id}", input:{name:"${name}", type:"${type}"}){ id } }`
      : `mutation { createZone(homeId:"${homeId}", input:{name:"${name}", type:"${type}"}){ id } }`;
    await fetch("/api/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: mutation }),
    });
    closeDialog();
    location.reload();
  };

  const deleteZone = async (zoneId: string) => {
    if (!confirm("Zone wirklich löschen? Alle Subzonen & Plant-Links werden entfernt.")) return;
    await fetch("/api/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `mutation { deleteZone(id:"${zoneId}") }` }),
    });
    location.reload();
  };

  // -- 4. Render -----------------------------------------------------------
  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold flex gap-2 items-center">
          <HomeIcon className="w-6 h-6" /> Meine Zu‑Hause
        </h1>
        <Button onClick={() => openHomeDialog()} size="sm" className="gap-1">
          <PlusCircle className="w-4 h-4" /> Neues Zuhause
        </Button>
      </div>

      {homes.map((home) => (
        <Card key={home.id} className="mb-4">
          <CardHeader
            onClick={() => toggleExpand(home.id)}
            className="flex flex-row justify-between items-center cursor-pointer"
          >
            <div>
              <CardTitle>{home.name}</CardTitle>
              {home.address && <p className="text-sm text-muted-foreground">{home.address}</p>}
            </div>
            {expanded[home.id] ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </CardHeader>
          <AnimatePresence initial={false}>
            {expanded[home.id] && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <CardContent className="space-y-3">
                  {home.zones.length ? (
                    home.zones.map((z) => (
                      <div
                        key={z.id}
                        className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg p-2"
                      >
                        <span className="font-medium">
                          {z.name} <span className="text-xs text-gray-400">({z.type})</span>
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openZoneDialog(home.id, z)}
                          >
                            ✏️
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteZone(z.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Keine Zonen angelegt.</p>
                  )}

                  <Separator />

                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1"
                    onClick={() => openZoneDialog(home.id)}
                  >
                    <PlusCircle className="w-4 h-4" /> Zone hinzufügen
                  </Button>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      ))}

      {/* Home Dialog */}
      <Dialog open={openDialog === "home"} onOpenChange={(o) => (!o ? closeDialog() : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget?.homeId ? "Zuhause bearbeiten" : "Neues Zuhause"}</DialogTitle>
            <DialogDescription>
              Gib einen Namen (Pflicht) und optional eine Adresse ein.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Name z.B. Wohnung Berlin"
            className="mb-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Adresse (optional)"
            className="mb-4"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDialog}>
              Abbrechen
            </Button>
            <Button onClick={saveHome}>Speichern</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Zone Dialog */}
      <Dialog open={openDialog === "zone"} onOpenChange={(o) => (!o ? closeDialog() : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget?.zone ? "Zone bearbeiten" : "Neue Zone"}</DialogTitle>
            <DialogDescription>
              Benenne deine Zone und wähle einen Typ.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Name der Zone (z.B. Balkon Süd)"
            className="mb-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select
            className="w-full mb-4 border rounded-md p-2 dark:bg-gray-900"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as Zone["type"] })}
          >
            <option value="room">Raum</option>
            <option value="balcony">Balkon</option>
            <option value="garden">Garten</option>
            <option value="greenhouse">Gewächshaus</option>
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDialog}>
              Abbrechen
            </Button>
            <Button onClick={saveZone}>Speichern</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
