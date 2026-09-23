"use client";

import { forwardRef } from "react";
import SearchField from "@/components/SearchField";
import { Switch } from "@/components/ui/switch";
import { useOrderStore } from "@/lib/useOrderStore";
import { useQuotationStore } from "@/lib/useQuotationStore";

interface Props {
  autoFocus?: boolean;
  store?: "order" | "quotation";
}

const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar({ autoFocus = false, store = "order" }, ref) {
  const orderSearchQuery = useOrderStore((s) => s.searchQuery);
  const orderSetSearchQuery = useOrderStore((s) => s.setSearchQuery);
  const orderShowObsolete = useOrderStore((s) => s.showObsolete);
  const orderSetShowObsolete = useOrderStore((s) => s.setShowObsolete);
  const quotationSearchQuery = useQuotationStore((s) => s.searchQuery);
  const quotationSetSearchQuery = useQuotationStore((s) => s.setSearchQuery);
  const quotationShowObsolete = useQuotationStore((s) => s.showObsolete);
  const quotationSetShowObsolete = useQuotationStore((s) => s.setShowObsolete);

  const searchQuery = store === "quotation" ? quotationSearchQuery : orderSearchQuery;
  const setSearchQuery = store === "quotation" ? quotationSetSearchQuery : orderSetSearchQuery;
  const showObsolete = store === "quotation" ? quotationShowObsolete : orderShowObsolete;
  const setShowObsolete = store === "quotation" ? quotationSetShowObsolete : orderSetShowObsolete;
  const switchId = `show-obsolete-${store}`;

  return (
    <div className="flex items-center gap-3">
      <SearchField
        ref={ref}
        className="min-w-0 flex-1"
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Codice o descrizione"
        ariaLabel="Cerca articoli"
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && searchQuery.length === 0) {
            e.stopPropagation();
          }
        }}
      />
      <div className="flex shrink-0 items-center gap-2 select-none">
        <Switch
          id={switchId}
          checked={showObsolete}
          onCheckedChange={(checked) => setShowObsolete(checked === true)}
        />
        <label htmlFor={switchId} className="cursor-pointer text-[13px] font-semibold text-muted-foreground">
          Obsoleti
        </label>
      </div>
    </div>
  );
});

export default SearchBar;
