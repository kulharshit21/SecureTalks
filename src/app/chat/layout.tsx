import { redirect } from "next/navigation";

import { ChatShell } from "@/components/chat/chat-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ChatLayout(props: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ChatShell userId={user.id}>{props.children}</ChatShell>;
}
