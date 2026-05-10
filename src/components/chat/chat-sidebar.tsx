"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, Search, UserRound, Users } from "lucide-react";
import { toast } from "sonner";

import {
  createDirectConversationRpc,
  fetchPrimaryPeerPublicBundle,
  listInboxConversations,
  searchProfilesRpc,
  type InboxConversation,
} from "@/lib/conversation-service";
import { createGroupRpc, fetchActiveMemberUserIds, publishGroupEpochKey } from "@/lib/group-service";
import { parsePublicKeyBundleJson } from "@/lib/crypto/session";
import { cn } from "@/lib/utils";
import { useSupabase } from "@/components/providers/supabase-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useCipherSession } from "@/stores/cipher-session";

export function ChatSidebar(props: { userId: string; onNavigate?: () => void }) {
  const supabase = useSupabase();
  const router = useRouter();
  const cipherSession = useCipherSession();
  const cipher = cipherSession.cipher;
  const deviceId = cipherSession.deviceId;

  const [inbox, setInbox] = useState([] as InboxConversation[]);
  const [loading, setLoading] = useState(true);

  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([] as { id: string; username: string; display_name: string }[]);

  const [groupDlgOpen, setGroupDlgOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [groupResults, setGroupResults] = useState([] as { id: string; username: string; display_name: string }[]);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);

  async function reloadSummaries() {
    const rows = await listInboxConversations(supabase, props.userId);
    setInbox(rows);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await reloadSummaries();
      } catch {
        if (!cancelled) toast.error("Unable to load conversations.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on auth user id only
  }, [props.userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("username, display_name, avatar_url").eq("id", props.userId).maybeSingle();
      if (cancelled || !data) return;
      setUsername(String(data.username ?? ""));
      setDisplayName(String(data.display_name ?? ""));
      setAvatarUrl(String(data.avatar_url ?? ""));
    })();
    return () => {
      cancelled = true;
    };
  }, [props.userId, supabase, profileOpen]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const q = query.trim();
      if (q.length < 2) {
        setResults([]);
        return;
      }
      let rows: { id: string; username: string; display_name: string }[] = [];
      try {
        rows = await searchProfilesRpc(supabase, q);
      } catch {
        if (!cancelled) toast.error("Search failed.");
        return;
      }

      if (cancelled) return;
      setResults(rows);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [props.userId, query, supabase]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const q = groupQuery.trim();
      if (!groupDlgOpen || q.length < 2) {
        setGroupResults([]);
        return;
      }
      try {
        const rows = await searchProfilesRpc(supabase, q);
        if (cancelled) return;
        setGroupResults(rows);
      } catch {
        if (!cancelled) toast.error("Search failed.");
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [groupDlgOpen, groupQuery, supabase]);

  const initials = useMemo(() => {
    const basis = displayName || username || "You";
    const parts = basis.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "You";
  }, [displayName, username]);

  async function saveProfile() {
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        username,
        avatar_url: avatarUrl ? avatarUrl : null,
      })
      .eq("id", props.userId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Profile updated.");
    setProfileOpen(false);
    await reloadSummaries();
  }

  async function startChat(peerUserId: string) {
    const bundle = await fetchPrimaryPeerPublicBundle(supabase, peerUserId);
    if (!bundle?.bundleJson) {
      toast.error("That user has not registered a device key yet.");
      return;
    }

    try {
      parsePublicKeyBundleJson(bundle.bundleJson);
    } catch {
      toast.error("That user's device bundle is unreadable.");
      return;
    }

    try {
      const convId = await createDirectConversationRpc(supabase, peerUserId);
      setNewChatOpen(false);
      setQuery("");
      setResults([]);
      await reloadSummaries();
      props.onNavigate?.();
      router.push(`/chat/${convId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start chat.";
      toast.error(msg);
    }
  }

  function togglePeerSelected(userId: string) {
    setSelectedPeers((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function submitNewGroup() {
    const title = groupTitle.trim();
    if (!title) {
      toast.error("Enter a group title.");
      return;
    }
    if (!cipher || !deviceId) {
      toast.error("Unlock keys on this device before creating a group.");
      return;
    }
    try {
      const convId = await createGroupRpc(supabase, title, selectedPeers);
      const members = await fetchActiveMemberUserIds(supabase, convId);
      await publishGroupEpochKey({
        supabase,
        cipher,
        conversationId: convId,
        adminUserId: props.userId,
        adminDeviceId: deviceId,
        memberUserIds: members,
      });
      toast.success("Group created with epoch 1 keys.");
      setGroupDlgOpen(false);
      setGroupTitle("");
      setGroupQuery("");
      setSelectedPeers([]);
      await reloadSummaries();
      props.onNavigate?.();
      router.push(`/chat/${convId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create group.");
    }
  }

  async function signOut() {
    cipherSession.lock();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  const searchActive = query.trim().length >= 2;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border/50 bg-card/40 px-3 py-2.5 text-left outline-none ring-offset-background transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Account menu"
          >
            <Avatar className="size-10 shrink-0 border border-border/50">
              <AvatarFallback className="bg-primary/10 text-sm font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">{displayName || "You"}</p>
              <p className="truncate text-xs text-muted-foreground">@{username || "…"}</p>
            </div>
            <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={() => setProfileOpen(true)}>Edit profile</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            readOnly
            className="h-10 cursor-pointer rounded-xl border-border/60 bg-muted/25 pl-10 text-sm shadow-none"
            placeholder="Search chats & contacts…"
            onClick={() => setNewChatOpen(true)}
            onFocus={() => setNewChatOpen(true)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-4 pb-3">
        <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
          <Button
            className="h-10 w-full rounded-xl font-medium shadow-none"
            variant="secondary"
            type="button"
            onClick={() => setNewChatOpen(true)}
          >
            <MessageSquarePlus className="mr-2 size-4" aria-hidden />
            New chat
          </Button>
          <DialogContent className="gap-0 overflow-hidden border-border/70 p-0 sm:max-w-md">
            <DialogHeader className="border-b border-border/60 px-6 py-5 text-left">
              <DialogTitle className="font-semibold tracking-tight">Find someone</DialogTitle>
              <p className="text-xs text-muted-foreground">Search by username. Only people who finished device setup appear.</p>
            </DialogHeader>
            <div className="space-y-3 px-6 py-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  className="h-11 rounded-xl pl-10"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search @username"
                  autoFocus
                />
              </div>
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/15">
                {!searchActive ? (
                  <p className="px-4 py-12 text-center text-sm text-muted-foreground">Type at least two characters.</p>
                ) : results.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-foreground">No contacts found</p>
                    <p className="mt-1 text-xs text-muted-foreground">Try another username or invite them to CipherSafe.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                        onClick={() => void startChat(r.id)}
                      >
                        <span className="font-medium">{r.username}</span>
                        <span className="truncate text-xs text-muted-foreground">{r.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={groupDlgOpen} onOpenChange={setGroupDlgOpen}>
          <Button
            className="h-10 w-full rounded-xl font-medium shadow-none"
            variant="outline"
            type="button"
            onClick={() => setGroupDlgOpen(true)}
          >
            <Users className="mr-2 size-4" aria-hidden />
            Group
          </Button>
          <DialogContent className="gap-0 overflow-hidden border-border/70 p-0 sm:max-w-md">
            <DialogHeader className="border-b border-border/60 px-6 py-5 text-left">
              <DialogTitle className="font-semibold tracking-tight">New encrypted group</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Symmetric epoch keys are wrapped to each member&apos;s primary device. Not MLS — fine for small MVP groups only.
              </p>
            </DialogHeader>
            <div className="space-y-3 px-6 py-4">
              <Input
                className="rounded-xl"
                placeholder="Group title"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
              />
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  className="h-11 rounded-xl pl-10"
                  value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  placeholder="Search members @username"
                />
              </div>
              <div className="max-h-44 overflow-y-auto rounded-2xl border border-border/60 bg-muted/15">
                {groupQuery.trim().length < 2 ? (
                  <p className="px-4 py-8 text-center text-xs text-muted-foreground">Type two characters to search.</p>
                ) : groupResults.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-muted-foreground">No matches.</p>
                ) : (
                  groupResults.map((r) => (
                    <label
                      key={r.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-border/40 px-4 py-2.5 text-sm last:border-b-0 hover:bg-muted/35"
                    >
                      <input type="checkbox" checked={selectedPeers.includes(r.id)} onChange={() => togglePeerSelected(r.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{r.username}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.display_name}</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <Button className="w-full rounded-xl font-medium" type="button" onClick={() => void submitNewGroup()}>
                Create & distribute epoch 1 key
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Separator className="opacity-60" />

      <ScrollArea className="flex-1 px-2 pt-2">
        <div className="space-y-0.5 pb-4">
          {loading ? (
            <div className="space-y-2 px-2 py-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[72px] rounded-2xl" />
              ))}
            </div>
          ) : inbox.length === 0 ? (
            <div className="mx-2 mt-8 rounded-2xl border border-dashed border-border/70 bg-muted/10 px-6 py-14 text-center animate-in fade-in duration-500">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/8">
                <MessageSquarePlus className="size-6 text-primary/80" aria-hidden />
              </div>
              <p className="text-sm font-semibold tracking-tight">No chats yet</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Start an encrypted conversation — messages are sealed before they sync.
              </p>
              <Button className="mt-6 rounded-xl" variant="secondary" type="button" onClick={() => setNewChatOpen(true)}>
                Compose first message
              </Button>
            </div>
          ) : (
            inbox.map((row) => <SidebarRow key={row.conversationId} row={row} onNavigate={props.onNavigate} />)
          )}
        </div>
      </ScrollArea>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="border-border/70 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-semibold tracking-tight">Your profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Display name</p>
              <Input className="rounded-xl" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Username</p>
              <Input className="rounded-xl" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Avatar URL</p>
              <Input className="rounded-xl" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl" onClick={() => setProfileOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={() => void saveProfile()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SidebarRow(props: { row: InboxConversation; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === `/chat/${props.row.conversationId}`;

  const peerInitials = useMemo(() => {
    if (props.row.kind !== "direct") return "?";
    const basis = props.row.peerDisplayName || props.row.peerUsername;
    const parts = basis.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  }, [props.row]);

  if (props.row.kind === "group") {
    const g = props.row;
    return (
      <Link
        href={`/chat/${g.conversationId}`}
        prefetch={false}
        onClick={() => props.onNavigate?.()}
        className={cn(
          "flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "bg-muted/70 ring-1 ring-border/60" : "hover:bg-muted/45",
        )}
      >
        <Avatar className="size-11 shrink-0 border border-border/50">
          <AvatarFallback className="bg-secondary text-sm font-semibold">
            <Users className="size-5" aria-hidden />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{g.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {g.memberCount} members · {g.myRole}
          </p>
        </div>
      </Link>
    );
  }

  const d = props.row;

  return (
    <Link
      href={`/chat/${d.conversationId}`}
      prefetch={false}
      onClick={() => props.onNavigate?.()}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-muted/70 ring-1 ring-border/60" : "hover:bg-muted/45",
      )}
    >
      <Avatar className="size-11 shrink-0 border border-border/50">
        <AvatarFallback className="bg-secondary text-sm font-semibold">{peerInitials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{d.peerDisplayName}</p>
        <p className="truncate text-xs text-muted-foreground">@{d.peerUsername}</p>
      </div>
    </Link>
  );
}
