// src/lib/constants.ts
export interface Order {
    id: string; crmId: string; externalId: string | null; status: string;
    address: string | null; lat: number | null; lng: number | null;
    price: number | null; courier: string | null; comment: string | null;
    opComment: string | null; items: string | null;
    slotFrom: string | null; slotTo: string | null; slotRaw: string | null;
    deliveryType: string | null; deliveryDate: string | null;
    isInvalid: boolean; invalidReason: string | null;
    crmCreatedAt: string | null; updatedAt?: string;
  }
  
  export const SLOTS = [
    { label: "10–12", from: "10:00", to: "12:00", color: "#1a9e5c" },
    { label: "12–14", from: "12:00", to: "14:00", color: "#4a7aff" },
    { label: "14–16", from: "14:00", to: "16:00", color: "#7c4dff" },
    { label: "16–18", from: "16:00", to: "18:00", color: "#c8780a" },
    { label: "18–20", from: "18:00", to: "20:00", color: "#d94040" },
    { label: "20–22", from: "20:00", to: "22:00", color: "#e0548a" },
  ];
  
  export const STATUS_OPTIONS = [
    { value: "ALL", label: "Все статусы" },
    { value: "NEW", label: "Новый" }, { value: "ASSIGNED", label: "Назначен" },
    { value: "IN_DELIVERY", label: "В пути" }, { value: "DELIVERED", label: "Доставлен" },
    { value: "RETURNED", label: "Возврат" }, { value: "CANCELLED", label: "Отменён" },
  ];
  
  export const STATUS_LABELS: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o.label]));
  
  export function slotColor(o: Order): string {
    if (o.isInvalid) return "#d94040";
    return SLOTS.find(s => s.from === o.slotFrom && s.to === o.slotTo)?.color ?? "#4a7aff";
  }