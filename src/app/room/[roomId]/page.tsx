import { RoomClient } from "@/components/RoomClient";
import { isRoomId } from "@/lib/ids";
import { notFound } from "next/navigation";

export default function RoomPage({ params }: { params: { roomId: string } }) {
  if (!isRoomId(params.roomId)) notFound();
  return <RoomClient roomId={params.roomId} />;
}
