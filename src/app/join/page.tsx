import type { Metadata } from "next";
import Link from "next/link";
import { JoinRoomForm } from "../rooms/_components/join-room-form";

export const metadata: Metadata = {
  title: "Join a room · Pilot Season",
};

export default function JoinPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Join a room</h1>
        <p className="mt-1 text-sm opacity-70">
          Type the code the host read out. Case, spaces and dashes do not matter.
        </p>
      </div>

      <JoinRoomForm />

      <Link href="/rooms/new" className="text-sm underline opacity-70">
        Or create a room of your own
      </Link>
    </main>
  );
}
