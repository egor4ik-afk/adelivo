// src/app/(app)/manager/orders/[id]/edit/page.tsx
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrderForm } from "@/components/manager/OrderForm";

export const metadata = { title: "Редактирование заказа" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "COURIER") redirect("/courier/routes");

  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) notFound();

  return (
    <OrderForm
      mode="edit"
      orderId={order.id}
      initial={{
        externalId: order.externalId ?? order.crmId,
        address: order.address ?? "",
        deliveryDate: order.deliveryDate ?? "",
        slotFrom: order.slotFrom ?? "",
        slotTo: order.slotTo ?? "",
        name: order.name ?? "",
        recipientPhone: order.recipientPhone ?? "",
        customerName: order.customerName ?? "",
        customerPhone: order.customerPhone ?? "",
        items: order.items ?? "",
        comment: order.comment ?? "",
        opComment: order.opComment ?? "",
        price: order.price != null ? String(order.price) : "",
        shop: order.shop ?? "",
        status: order.status,
        courierId: order.courierId != null ? String(order.courierId) : "",
      }}
    />
  );
}
