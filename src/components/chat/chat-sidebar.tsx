"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MessageSquarePlus, Search, Settings, UserRound, Users } from "lucide-react";
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
import { APP_NAME } from "@/lib/brand";
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

const MotionLink = motion.create(Link);

export function ChatSidebar(props: { userId: string; onNavigate?: () => void }) {
  const supabase = useSupabase();
  const reduceMotion = useReducedMotion();
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
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border/50 bg-card/40 px-3 py-2.5 text-left outline-none ring-offset-background shadow-sm transition-[background-color,box-shadow,border-color] hover:border-border/70 hover:bg-muted/30 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Account menu"
          >
            <Avatar className="size-10 shrink-0 border border-border/50">
              <AvatarFallback className="bg-primary/10 text-sm font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-[15px] font-semibold leading-snug tracking-tight">{displayName || "You"}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground/90">@{username || "username"}</p>
            </div>
            <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={() => setProfileOpen(true)}>Edit profile</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                props.onNavigate?.();
                router.push("/settings/security");
              }}
            >
              Security settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <MotionLink
          href="/settings/security"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/55 bg-muted/20 text-muted-foreground shadow-sm transition-[color,background-color,box-shadow,transform] hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Security settings"
          onClick={() => props.onNavigate?.()}
          whileHover={
            reduceMotion
              ? {}
              : {
                  scale: 1.06,
                  rotate: -4,
                  boxShadow: "0 10px 24px -8px color-mix(in oklab, var(--primary) 22%, transparent)",
                }
          }
          whileTap={reduceMotion ? {} : { scale: 0.96 }}
          transition={{ type: "spring", stiffness: 520, damping: 28 }}
        >
          <Settings className="size-[18px]" aria-hidden />
        </MotionLink>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            readOnly
            className="h-10 cursor-pointer rounded-xl border-border/60 bg-muted/25 pl-10 text-sm shadow-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Search people or chats"
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
                    <p className="mt-1 text-xs text-muted-foreground">Try another username or invite them to {APP_NAME}.</p>
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
            New group
          </Button>
          <DialogContent className="gap-0 overflow-hidden border-border/70 p-0 sm:max-w-md">
            <DialogHeader className="border-b border-border/60 px-6 py-5 text-left">
              <DialogTitle className="font-semibold tracking-tight">New encrypted group</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Symmetric keys are shared with the group — best for small teams, not huge rooms.
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
                Create group
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
            <motion.div
              className="mx-2 mt-8 rounded-2xl border border-dashed border-border/70 bg-muted/10 px-6 py-14 text-center shadow-[0_12px_40px_-18px_rgb(0_0_0/0.35)] backdrop-blur-sm transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-[0_18px_48px_-16px_color-mix(in_oklab,var(--primary)_14%,transparent)]"
              initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <motion.div
                className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20"
                animate={
                  reduceMotion
                    ? undefined
                    : { y: [0, -4, 0], transition: { duration: 4.5, repeat: Infinity, ease: "easeInOut" } }
                }
              >
                <MessageSquarePlus className="size-6 text-primary/85" aria-hidden />
              </motion.div>
              <p className="text-sm font-semibold tracking-tight text-foreground">No conversations yet</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Start your first private chat.</p>
              <motion.div
                className="mt-6 inline-block"
                whileHover={reduceMotion ? {} : { scale: 1.03 }}
                whileTap={reduceMotion ? {} : { scale: 0.98 }}
              >
                <Button className="rounded-xl shadow-sm transition-shadow hover:shadow-md" variant="secondary" type="button" onClick={() => setNewChatOpen(true)}>
                  Start chat
                </Button>
              </motion.div>
            </motion.div>
          ) : (
            inbox.map((row) => (
              <SidebarRow key={row.conversationId} row={row} onNavigate={props.onNavigate} reduceMotion={reduceMotion} />
            ))
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

function SidebarRow(props: { row: InboxConversation; onNavigate?: () => void; reduceMotion: boolean | null }) {
  const pathname = usePathname();
  const active = pathname === `/chat/${props.row.conversationId}`;
  const rowHover = props.reduceMotion
    ? {}
    : {
        y: -2,
        scale: 1.01,
        boxShadow: "0 12px 28px -10px color-mix(in oklab, var(--foreground) 16%, transparent)",
      };

  const peerInitials = useMemo(() => {
    if (props.row.kind !== "direct") return "?";
    const basis = props.row.peerDisplayName || props.row.peerUsername;
    const parts = basis.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  }, [props.row]);

  if (props.row.kind === "group") {
    const g = props.row;
    return (
      <MotionLink
        href={`/chat/${g.conversationId}`}
        prefetch={false}
        onClick={() => props.onNavigate?.()}
        style={{ transformOrigin: "center" }}
        whileHover={rowHover}
        whileTap={props.reduceMotion ? {} : { scale: 0.99 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 transition-[background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "border-border/50 bg-muted/70 shadow-inner ring-1 ring-border/45"
            : "hover:border-border/35 hover:bg-muted/45",
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
      </MotionLink>
    );
  }

  const d = props.row;

  return (
    <MotionLink
      href={`/chat/${d.conversationId}`}
      prefetch={false}
      onClick={() => props.onNavigate?.()}
      style={{ transformOrigin: "center" }}
      whileHover={rowHover}
      whileTap={props.reduceMotion ? {} : { scale: 0.99 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 transition-[background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-border/50 bg-muted/70 shadow-inner ring-1 ring-border/45"
          : "hover:border-border/35 hover:bg-muted/45",
      )}
    >
      <Avatar className="size-11 shrink-0 border border-border/50">
        <AvatarFallback className="bg-secondary text-sm font-semibold">{peerInitials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{d.peerDisplayName}</p>
        <p className="truncate text-xs text-muted-foreground">@{d.peerUsername}</p>
      </div>
    </MotionLink>
  );
}
