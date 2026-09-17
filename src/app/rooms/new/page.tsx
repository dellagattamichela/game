import type { Metadata } from "next";
import Link from "next/link";
import { CreateRoomForm } from "../_components/create-room-form";

export const metadata: Metadata = {
  title: "Create a room · Pilot Season",
};

export default function NewRoomPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Create a room</h1>
        <p className="mt-1 text-sm opacity-70">
          You get an invite code to read out. Everyone else types it in.
        </p>
      </div>

      <CreateRoomForm />

      <Link href="/" className="text-sm underline opacity-70">
        Back to the single-browser prototype
      </Link>
    </main>
  );
}
