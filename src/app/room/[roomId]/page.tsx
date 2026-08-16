import { RoomClient } from "@/components/RoomClient";
import { isRoomId } from "@/lib/ids";
import { notFound } from "next/navigation";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  if (!isRoomId(roomId)) notFound();
  return <RoomClient roomId={roomId} />;
}
