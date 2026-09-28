export type StockState = "in_stock" | "partial" | "out_of_stock" | "not_found";

export const findInventoryItem = (inventory: any[], medicationName?: string | null) => {
  if (!medicationName) return undefined;
  const name = medicationName.toLowerCase().trim();
  return (
    inventory.find((i) => i.drug_name?.toLowerCase() === name) ||
    inventory.find(
      (i) =>
        i.drug_name?.toLowerCase().includes(name) ||
        name.includes(i.drug_name?.toLowerCase()) ||
        (i.generic_name && (i.generic_name.toLowerCase().includes(name) || name.includes(i.generic_name.toLowerCase()))),
    )
  );
};

export const remainingQty = (presc: any) =>
  Math.max((presc?.quantity || 0) - (presc?.quantity_dispensed || 0), 0);

export const stockCheck = (inventory: any[], medicationName: string, needed: number) => {
  const item = findInventoryItem(inventory, medicationName);
  if (!item) return { state: "not_found" as StockState, item, available: 0 };
  const available = item.quantity || 0;
  const state: StockState = available <= 0 ? "out_of_stock" : available < needed ? "partial" : "in_stock";
  return { state, item, available };
};

export const STOCK_LABELS: Record<StockState, string> = {
  in_stock: "In stock",
  partial: "Partial stock",
  out_of_stock: "Out of stock",
  not_found: "Not in inventory",
};
