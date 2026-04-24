"use client";

import { AlertTriangle, Save, LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onSaveDraft: () => void;
  onExitWithoutSaving: () => void;
  onContinue: () => void;
  saving?: boolean;
}

export default function ExitOrderDialog({ open, onSaveDraft, onExitWithoutSaving, onContinue, saving }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onContinue} />

      {/* Dialog */}
      <div className="relative bg-background rounded-2xl border border-border shadow-2xl max-w-sm w-full p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="font-bold text-base text-foreground">Ordine in corso</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Hai un ordine non completato. Vuoi salvarlo come bozza prima di uscire?
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            className="w-full h-10 rounded-xl gap-2 font-semibold"
            onClick={onSaveDraft}
            disabled={saving}
          >
            <Save className="h-4 w-4" />
            Salva bozza e esci
          </Button>
          <Button
            variant="outline"
            className="w-full h-10 rounded-xl gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
            onClick={onExitWithoutSaving}
            disabled={saving}
          >
            <LogOut className="h-4 w-4" />
            Esci senza salvare
          </Button>
          <Button
            variant="ghost"
            className="w-full h-10 rounded-xl gap-2 text-muted-foreground"
            onClick={onContinue}
            disabled={saving}
          >
            <X className="h-4 w-4" />
            Continua a modificare
          </Button>
        </div>
      </div>
    </div>
  );
}
