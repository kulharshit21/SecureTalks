import { redirect } from "next/navigation";

import { ChatThread } from "@/components/chat/chat-thread";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ConversationPage(props: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await props.params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ChatThread key={conversationId} conversationId={conversationId} userId={user.id} />;
}
