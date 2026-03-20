import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateCrmOrder } from "@/lib/crm";
import { notify } from "@/lib/notifications";
import { OrderStatus } from "@prisma/client";
import { z } from "zod";

const patchSchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  courier: z.string().optional(),
  opComment: z.string().optional(),
  isInvalid: z.boolean().optional(),
  invalidReason: z.string().optional(),
  address: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(order);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const data = patchSchema.parse(body);

  const prev = await prisma.order.findUnique({ where: { id } });
  if (!prev) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Обход кэша TS для нового поля
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courierUpdate: any = {};
  if (data.courier !== undefined) {
    courierUpdate.courierManual = data.courier.trim().length > 0;
  }

  const order = await prisma.order.update({
    where: { id },
    data: {
      ...data,
      courier: data.courier !== undefined ? (data.courier.trim() || null) : undefined,
      ...courierUpdate,
    },
  });

  if (order.crmId && (data.status !== undefined || data.courier !== undefined)) {
    updateCrmOrder(order.crmId, {
      ...(data.status !== undefined && { status: data.status }),
      ...(data.courier !== undefined && { courier: data.courier }),
    }).catch(console.error);
  }

  if (data.status && prev.status !== data.status) {
    notify({ type: "order.updated", order, previousStatus: prev.status }).catch(console.error);
  }

  return NextResponse.json(order);
}