import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, MessageCircle, Search, Send, Smile, Sparkles, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { LIVE_UI_EVENTS, onLiveUIEvent } from "../lib/liveEvents";
import { relativeDate } from "../lib/format";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import AnimatedPage from "../components/AnimatedPage";
import EmptyState from "../components/EmptyState";

const COPY = {
  ru: {
    title: "Мои чаты",
    subtitle: "Общайтесь с покупателями и продавцами по заказам.",
    searchPlaceholder: "Поиск по чату, товару или имени",
    noChatsTitle: "Чатов пока нет",
    noChatsDescription: "После покупки или начала диалога чат появится здесь.",
    openOrders: "Открыть заказы",
    selectChat: "Выберите чат",
    selectChatHint: "Список чатов слева. Можно начать чат из заказа.",
    messagePlaceholder: "Введите сообщение...",
    send: "Отправить",
    sending: "Отправка...",
    seller: "Продавец",
    buyer: "Покупатель",
    item: "Товар",
    openItem: "Открыть карточку",
    back: "Назад",
    loadError: "Не удалось загрузить чаты",
    loadMessagesError: "Не удалось загрузить сообщения",
    sendError: "Не удалось отправить сообщение",
    emptyMessages: "Пока нет сообщений. Начните диалог первым.",
    deleteChat: "Удалить чат",
    deletingChat: "Удаление...",
    chatDeleted: "Чат удален",
    deleteChatError: "Не удалось удалить чат",
    emojiButton: "Смайлики",
    emojiMore: "Все смайлики",
    typing: "\u041f\u0435\u0447\u0430\u0442\u0430\u0435\u0442...",
    online: "\u041e\u043d\u043b\u0430\u0439\u043d",
    lastSeen: "\u0411\u044b\u043b \u0432 \u0441\u0435\u0442\u0438",
    offline: "\u041d\u0435 \u0432 \u0441\u0435\u0442\u0438",
  },
  en: {
    title: "My chats",
    subtitle: "Talk to buyers and sellers about orders.",
    searchPlaceholder: "Search by chat, item or username",
    noChatsTitle: "No chats yet",
    noChatsDescription: "After a purchase or opening a dialog, chats will appear here.",
    openOrders: "Open orders",
    selectChat: "Pick a chat",
    selectChatHint: "Select one from the list on the left.",
    messagePlaceholder: "Type a message...",
    send: "Send",
    sending: "Sending...",
    seller: "Seller",
    buyer: "Buyer",
    item: "Item",
    openItem: "Open item",
    back: "Back",
    loadError: "Failed to load chats",
    loadMessagesError: "Failed to load messages",
    sendError: "Failed to send message",
    emptyMessages: "No messages yet. Start the conversation.",
    deleteChat: "Delete chat",
    deletingChat: "Deleting...",
    chatDeleted: "Chat deleted",
    deleteChatError: "Failed to delete chat",
    emojiButton: "Emojis",
    emojiMore: "More emojis",
    typing: "Typing...",
    online: "Online",
    lastSeen: "Last seen",
    offline: "Offline",
  },
};

const EMOJI_ITEMS = [
  "😀",
  "😄",
  "😁",
  "😎",
  "🙂",
  "😉",
  "😍",
  "🥳",
  "🤝",
  "👍",
  "👏",
  "🔥",
  "💯",
  "💸",
  "🎁",
  "⭐",
  "⚡",
  "✅",
  "❌",
  "❤️",
  "💙",
  "🤔",
  "😢",
  "😡",
];

const TYPING_IDLE_MS = 1400;
const REMOTE_TYPING_TTL_MS = 2600;

function avatarFallback(label = "?") {
  const text = String(label || "?").trim();
  return text ? text.slice(0, 1).toUpperCase() : "?";
}

function ChatListItem({ chat, active, onClick }) {
  const lastMessageText = chat?.lastMessage?.text || "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-3 py-2 text-left transition ${
        active
          ? "border-cyan-400 bg-cyan-50/90 shadow-sm dark:border-cyan-500/70 dark:bg-cyan-500/10"
          : "border-slate-200 bg-white/80 hover:border-cyan-300 hover:bg-cyan-50/40 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-cyan-700/70 dark:hover:bg-slate-800"
      }`}
    >
      <div className="flex items-center gap-2">
        {chat?.peer?.avatar ? (
          <img src={chat.peer.avatar} alt={chat.peer.username || "User"} className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
            {avatarFallback(chat?.peer?.username)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{chat?.peer?.username || "User"}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {chat?.product?.title || chat?.orderItem?.titleSnapshot || "Item"}
          </p>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{lastMessageText || "..."}</p>
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{relativeDate(chat?.lastMessageAt || chat?.updatedAt)}</p>
    </button>
  );
}

export default function ChatsPage() {
  const { token, user } = useAuthStore();
  const language = useUiStore((state) => state.language);
  const t = COPY[language] || COPY.ru;
  const [searchParams, setSearchParams] = useSearchParams();

  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [presenceByUserId, setPresenceByUserId] = useState({});
  const [typingByChatId, setTypingByChatId] = useState({});

  const messageViewportRef = useRef(null);
  const emojiPanelRef = useRef(null);
  const draftInputRef = useRef(null);
  const typingIdleTimerRef = useRef(null);
  const ownTypingStateRef = useRef({ chatId: "", active: false });
  const remoteTypingTimersRef = useRef(new Map());

  const queryChatId = String(searchParams.get("chat") || "").trim();

  const filteredChats = useMemo(() => {
    const q = String(filter || "").trim().toLowerCase();
    if (!q) {
      return chats;
    }
    return chats.filter((chat) => {
      const text = `${chat?.peer?.username || ""} ${chat?.product?.title || ""} ${chat?.orderItem?.titleSnapshot || ""} ${chat?.lastMessage?.text || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [chats, filter]);
  const quickEmojiItems = useMemo(() => EMOJI_ITEMS.slice(0, 8), []);

  const selectedChat = useMemo(() => chats.find((chat) => chat.id === selectedChatId) || null, [chats, selectedChatId]);
  const selectedPeerId = String(selectedChat?.peer?.id || "").trim();
  const selectedPeerPresence = selectedPeerId ? presenceByUserId[selectedPeerId] : null;
  const selectedPeerOnline = Boolean(selectedPeerPresence?.online ?? selectedChat?.peer?.isOnline);
  const selectedPeerLastSeenAt = selectedPeerPresence?.lastSeenAt || selectedChat?.peer?.lastSeenAt || null;
  const selectedPeerTyping =
    Boolean(selectedChat?.id) && Boolean(selectedPeerId) && Boolean(typingByChatId[selectedChat.id]?.[selectedPeerId]);

  const formatPresenceDate = useCallback(
    (value) => {
      const raw = String(value || "").trim();
      if (!raw) {
        return "";
      }
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) {
        return "";
      }
      return date.toLocaleString(language === "en" ? "en-US" : "ru-RU");
    },
    [language]
  );

  const selectedPeerStatusText = useMemo(() => {
    if (selectedPeerTyping) {
      return t.typing;
    }
    if (selectedPeerOnline) {
      return t.online;
    }
    const at = formatPresenceDate(selectedPeerLastSeenAt);
    if (at) {
      return `${t.lastSeen}: ${at}`;
    }
    return t.offline;
  }, [formatPresenceDate, selectedPeerLastSeenAt, selectedPeerOnline, selectedPeerTyping, t.lastSeen, t.offline, t.online, t.typing]);

  const mergePresenceFromChats = useCallback((chatList) => {
    const updates = {};
    for (const chat of Array.isArray(chatList) ? chatList : []) {
      const peerId = String(chat?.peer?.id || "").trim();
      if (!peerId) {
        continue;
      }
      updates[peerId] = {
        online: Boolean(chat?.peer?.isOnline),
        lastSeenAt: chat?.peer?.lastSeenAt || null,
      };
    }
    if (!Object.keys(updates).length) {
      return;
    }
    setPresenceByUserId((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateTypingFlag = useCallback((chatId, userId, typing) => {
    const safeChatId = String(chatId || "").trim();
    const safeUserId = String(userId || "").trim();
    if (!safeChatId || !safeUserId) {
      return;
    }
    setTypingByChatId((prev) => {
      const chatState = { ...(prev[safeChatId] || {}) };
      if (typing) {
        chatState[safeUserId] = true;
        return { ...prev, [safeChatId]: chatState };
      }
      delete chatState[safeUserId];
      if (Object.keys(chatState).length <= 0) {
        const next = { ...prev };
        delete next[safeChatId];
        return next;
      }
      return { ...prev, [safeChatId]: chatState };
    });
  }, []);

  const sendTypingSignal = useCallback(
    async (chatId, typing) => {
      const safeChatId = String(chatId || "").trim();
      if (!safeChatId || !token) {
        return;
      }
      try {
        await api.post(`/chats/${safeChatId}/typing`, { typing: Boolean(typing) }, token);
      } catch (_err) {
        // Ignore transient network errors for typing signals.
      }
    },
    [token]
  );

  const stopOwnTyping = useCallback(
    (chatId = "") => {
      const current = ownTypingStateRef.current;
      const safeChatId = String(chatId || current.chatId || "").trim();
      if (typingIdleTimerRef.current) {
        clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      const wasActive = Boolean(current.active);
      ownTypingStateRef.current = { chatId: safeChatId, active: false };
      if (wasActive && safeChatId) {
        sendTypingSignal(safeChatId, false);
      }
    },
    [sendTypingSignal]
  );

  const updateSelectedChat = useCallback(
    (chatId) => {
      const id = String(chatId || "").trim();
      setSelectedChatId(id);
      const next = new URLSearchParams(searchParams);
      if (id) {
        next.set("chat", id);
      } else {
        next.delete("chat");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const selectChat = useCallback(
    (chatId) => {
      const id = String(chatId || "").trim();
      if (!id) {
        return;
      }
      updateSelectedChat(id);
    },
    [updateSelectedChat]
  );

  const loadChats = useCallback(
    async (withLoader = true, showError = true) => {
      try {
        if (withLoader) {
          setLoadingChats(true);
        }
        const data = await api.get("/chats?limit=200", token);
        const list = Array.isArray(data?.chats) ? data.chats : [];
        setChats(list);
        mergePresenceFromChats(list);

        const preferred = queryChatId || selectedChatId;
        if (preferred && list.some((chat) => chat.id === preferred)) {
          setSelectedChatId(preferred);
        } else if (!preferred && list.length) {
          updateSelectedChat(list[0].id);
        } else if (!list.length) {
          updateSelectedChat("");
          setMessages([]);
        }
      } catch (err) {
        if (showError) {
          toast.error(err.message || t.loadError);
        }
      } finally {
        if (withLoader) {
          setLoadingChats(false);
        }
      }
    },
    [mergePresenceFromChats, queryChatId, selectedChatId, t.loadError, token, updateSelectedChat]
  );

  const loadMessages = useCallback(
    async (chatId, withLoader = true, showError = true) => {
      const id = String(chatId || "").trim();
      if (!id) {
        setMessages([]);
        return;
      }
      try {
        if (withLoader) {
          setLoadingMessages(true);
        }
        const data = await api.get(`/chats/${id}/messages?limit=400`, token);
        const nextMessages = Array.isArray(data?.messages) ? data.messages : [];
        setMessages(nextMessages);
        if (data?.chat?.id) {
          mergePresenceFromChats([data.chat]);
          setChats((prev) => {
            const exists = prev.some((chat) => chat.id === data.chat.id);
            if (!exists) {
              return [data.chat, ...prev];
            }
            return prev.map((chat) => (chat.id === data.chat.id ? { ...chat, ...data.chat } : chat));
          });
        }
      } catch (err) {
        if (err?.status === 404) {
          setChats((prev) => prev.filter((chat) => chat.id !== id));
          if (selectedChatId === id) {
            setMessages([]);
            updateSelectedChat("");
          }
          return;
        }
        if (showError) {
          toast.error(err.message || t.loadMessagesError);
        }
      } finally {
        if (withLoader) {
          setLoadingMessages(false);
        }
      }
    },
    [mergePresenceFromChats, selectedChatId, t.loadMessagesError, token, updateSelectedChat]
  );

  useEffect(() => {
    loadChats(true, true);
  }, [loadChats]);

  useEffect(() => {
    if (queryChatId && queryChatId !== selectedChatId) {
      setSelectedChatId(queryChatId);
    }
  }, [queryChatId, selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) {
      return;
    }
    loadMessages(selectedChatId, true, true);
  }, [selectedChatId, loadMessages]);

  useEffect(() => {
    const stopChats = onLiveUIEvent(LIVE_UI_EVENTS.CHATS_CHANGED, (event) => {
      const detail = event?.detail || {};
      const changedChatId = String(detail.chatId || "").trim();
      const isDeleted = Boolean(detail.deleted);
      const incomingMessage = detail?.message && typeof detail.message === "object" ? detail.message : null;

      if (isDeleted && changedChatId) {
        setChats((prev) => prev.filter((chat) => chat.id !== changedChatId));
        setTypingByChatId((prev) => {
          const next = { ...prev };
          delete next[changedChatId];
          return next;
        });
        if (changedChatId === selectedChatId) {
          stopOwnTyping(changedChatId);
          setMessages([]);
          updateSelectedChat("");
        }
      }

      if (incomingMessage?.id && changedChatId && changedChatId === selectedChatId) {
        setMessages((prev) => (prev.some((item) => item.id === incomingMessage.id) ? prev : [...prev, incomingMessage]));
      }

      loadChats(false, false);
      if (!isDeleted && (!changedChatId || changedChatId === selectedChatId)) {
        loadMessages(selectedChatId, false, false);
      }
    });

    return () => {
      stopChats();
    };
  }, [loadChats, loadMessages, selectedChatId, stopOwnTyping, updateSelectedChat]);

  useEffect(() => {
    const stopPresence = onLiveUIEvent(LIVE_UI_EVENTS.PRESENCE_CHANGED, (event) => {
      const detail = event?.detail || {};
      const userId = String(detail.userId || "").trim();
      if (!userId) {
        return;
      }
      setPresenceByUserId((prev) => ({
        ...prev,
        [userId]: {
          online: Boolean(detail.online),
          lastSeenAt: detail.lastSeenAt || prev[userId]?.lastSeenAt || null,
        },
      }));
    });

    return () => {
      stopPresence();
    };
  }, []);

  useEffect(() => {
    const selfUserId = String(user?.id || "").trim();
    const stopTyping = onLiveUIEvent(LIVE_UI_EVENTS.CHAT_TYPING, (event) => {
      const detail = event?.detail || {};
      const chatId = String(detail.chatId || "").trim();
      const typingUserId = String(detail.userId || "").trim();
      if (!chatId || !typingUserId || typingUserId === selfUserId) {
        return;
      }

      const key = `${chatId}:${typingUserId}`;
      const prevTimer = remoteTypingTimersRef.current.get(key);
      if (prevTimer) {
        clearTimeout(prevTimer);
        remoteTypingTimersRef.current.delete(key);
      }

      const typing = Boolean(detail.typing);
      updateTypingFlag(chatId, typingUserId, typing);

      if (typing) {
        const timer = setTimeout(() => {
          remoteTypingTimersRef.current.delete(key);
          updateTypingFlag(chatId, typingUserId, false);
        }, REMOTE_TYPING_TTL_MS);
        remoteTypingTimersRef.current.set(key, timer);
      }
    });

    return () => {
      stopTyping();
    };
  }, [updateTypingFlag, user?.id]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      loadChats(false, false);
      if (selectedChatId) {
        loadMessages(selectedChatId, false, false);
      }
    }, 1800);
    return () => clearInterval(timer);
  }, [loadChats, loadMessages, selectedChatId, token]);

  useEffect(() => {
    if (!messageViewportRef.current) {
      return;
    }
    messageViewportRef.current.scrollTop = messageViewportRef.current.scrollHeight;
  }, [messages.length, selectedChatId]);

  useEffect(() => {
    if (!emojiOpen) {
      return undefined;
    }
    const onClickOutside = (event) => {
      if (!emojiPanelRef.current || emojiPanelRef.current.contains(event.target)) {
        return;
      }
      setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [emojiOpen]);

  useEffect(() => {
    const currentChatId = String(selectedChatId || "").trim();
    const draftHasText = String(draft || "").trim().length > 0;
    const state = ownTypingStateRef.current;

    if (!currentChatId) {
      stopOwnTyping();
      ownTypingStateRef.current = { chatId: "", active: false };
      return;
    }

    if (state.chatId && state.chatId !== currentChatId && state.active) {
      sendTypingSignal(state.chatId, false);
      ownTypingStateRef.current = { chatId: currentChatId, active: false };
    } else {
      ownTypingStateRef.current.chatId = currentChatId;
    }

    if (!draftHasText) {
      stopOwnTyping(currentChatId);
      return;
    }

    if (!ownTypingStateRef.current.active) {
      ownTypingStateRef.current.active = true;
      sendTypingSignal(currentChatId, true);
    }

    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = setTimeout(() => {
      const current = ownTypingStateRef.current;
      if (current.chatId !== currentChatId || !current.active) {
        return;
      }
      ownTypingStateRef.current = { chatId: currentChatId, active: false };
      sendTypingSignal(currentChatId, false);
    }, TYPING_IDLE_MS);
  }, [draft, selectedChatId, sendTypingSignal, stopOwnTyping]);

  useEffect(() => {
    return () => {
      stopOwnTyping();
      for (const timer of remoteTypingTimersRef.current.values()) {
        clearTimeout(timer);
      }
      remoteTypingTimersRef.current.clear();
    };
  }, [stopOwnTyping]);

  const sendMessage = async () => {
    const text = String(draft || "").trim();
    if (!selectedChatId || !text || sending) {
      return;
    }

    try {
      stopOwnTyping(selectedChatId);
      setSending(true);
      const data = await api.post(`/chats/${selectedChatId}/messages`, { text }, token);
      const nextMessage = data?.message;
      if (nextMessage?.id) {
        setMessages((prev) => (prev.some((item) => item.id === nextMessage.id) ? prev : [...prev, nextMessage]));
      }
      if (data?.chat?.id) {
        setChats((prev) => {
          const withoutCurrent = prev.filter((chat) => chat.id !== data.chat.id);
          return [data.chat, ...withoutCurrent];
        });
      }
      setEmojiOpen(false);
      setDraft("");
    } catch (err) {
      toast.error(err.message || t.sendError);
    } finally {
      setSending(false);
    }
  };

  const insertEmoji = (emoji) => {
    const value = String(emoji || "");
    if (!value) {
      return;
    }
    const input = draftInputRef.current;
    if (!input) {
      setDraft((prev) => `${prev}${value}`);
      return;
    }
    const start = Number(input.selectionStart ?? draft.length);
    const end = Number(input.selectionEnd ?? draft.length);
    const next = `${draft.slice(0, start)}${value}${draft.slice(end)}`;
    setDraft(next);
    queueMicrotask(() => {
      input.focus();
      const cursor = start + value.length;
      input.setSelectionRange(cursor, cursor);
    });
  };

  const deleteSelectedChat = async () => {
    const chatId = String(selectedChatId || "").trim();
    if (!chatId || deletingChatId) {
      return;
    }
    try {
      setDeletingChatId(chatId);
      await api.delete(`/chats/${chatId}`, token);

      const nextChats = chats.filter((chat) => chat.id !== chatId);
      stopOwnTyping(chatId);
      setChats(nextChats);
      setMessages([]);
      setDraft("");
      setTypingByChatId((prev) => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      updateSelectedChat(nextChats[0]?.id || "");
      toast.success(t.chatDeleted);
    } catch (err) {
      toast.error(err.message || t.deleteChatError);
    } finally {
      setDeletingChatId("");
    }
  };

  const showListOnMobile = !selectedChatId;

  return (
    <AnimatedPage>
      <section className="rounded-3xl border border-slate-200/80 bg-white/85 p-5 dark:border-slate-700/70 dark:bg-slate-900/75">
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100">{t.title}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t.subtitle}</p>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={`${showListOnMobile ? "block" : "hidden"} rounded-2xl border border-slate-200/80 bg-white/85 p-3 dark:border-slate-700/70 dark:bg-slate-900/75 lg:block`}>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
              placeholder={t.searchPlaceholder}
            />
          </div>

          {loadingChats ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : filteredChats.length ? (
            <div className="mt-3 space-y-2">
              {filteredChats.map((chat) => (
                <ChatListItem key={chat.id} chat={chat} active={selectedChatId === chat.id} onClick={() => selectChat(chat.id)} />
              ))}
            </div>
          ) : (
            <EmptyState title={t.noChatsTitle} description={t.noChatsDescription} icon={MessageCircle}>
              <Link
                to="/orders"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600"
              >
                {t.openOrders}
              </Link>
            </EmptyState>
          )}
        </aside>

        <div className={`${showListOnMobile ? "hidden" : "flex"} min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85 dark:border-slate-700/70 dark:bg-slate-900/75 lg:flex`}>
          {selectedChat ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3 dark:border-slate-700/80">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateSelectedChat("")}
                    className="rounded-lg border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
                  >
                    <ArrowLeft size={16} />
                  </button>

                  {selectedChat.peer?.avatar ? (
                    <img
                      src={selectedChat.peer.avatar}
                      alt={selectedChat.peer.username || "User"}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                      {avatarFallback(selectedChat.peer?.username)}
                    </span>
                  )}

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedChat.peer?.username || "User"}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          selectedPeerTyping ? "animate-pulse bg-cyan-500" : selectedPeerOnline ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                      <p
                        className={`truncate text-[11px] ${
                          selectedPeerTyping
                            ? "font-semibold text-cyan-600 dark:text-cyan-300"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {selectedPeerStatusText}
                      </p>
                    </div>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {selectedChat.product?.title || selectedChat.orderItem?.titleSnapshot || "Item"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedChat?.product?.id ? (
                    <Link
                      to={`/product/${selectedChat.product.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-cyan-300 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50 dark:border-cyan-700 dark:text-cyan-300 dark:hover:bg-cyan-900/20"
                    >
                      <Sparkles size={13} />
                      {t.openItem}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={deleteSelectedChat}
                    disabled={deletingChatId === selectedChat.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-70 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20"
                  >
                    <Trash2 size={13} />
                    {deletingChatId === selectedChat.id ? t.deletingChat : t.deleteChat}
                  </button>
                </div>
              </div>

              <div ref={messageViewportRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {loadingMessages ? (
                  Array.from({ length: 7 }).map((_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                  ))
                ) : messages.length ? (
                  messages.map((message) => {
                    const mine = message.senderId === user?.id;
                    return (
                      <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm ${
                            mine
                              ? "bg-cyan-500 text-white"
                              : "border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
                          <p className={`mt-1 text-[11px] ${mine ? "text-cyan-100" : "text-slate-500 dark:text-slate-400"}`}>
                            {message.sender?.username || "User"} • {relativeDate(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t.emptyMessages}</p>
                )}
                {selectedPeerTyping ? (
                  <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-300">
                    {(selectedChat?.peer?.username || "User") + " " + t.typing}
                  </p>
                ) : null}
              </div>

              <div className="border-t border-slate-200/80 px-3 py-3 dark:border-slate-700/80">
                <div className="relative" ref={emojiPanelRef}>
                  {emojiOpen ? (
                    <div className="absolute bottom-14 right-0 z-20 grid max-h-52 w-64 grid-cols-8 gap-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      {EMOJI_ITEMS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => insertEmoji(emoji)}
                          className="rounded-lg p-1.5 text-lg transition hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mb-2 flex items-center gap-1 overflow-x-auto pb-1">
                    {quickEmojiItems.map((emoji) => (
                      <button
                        key={`quick-${emoji}`}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-base leading-none transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                        aria-label={`${t.emojiButton} ${emoji}`}
                        title={`${t.emojiButton} ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEmojiOpen((prev) => !prev)}
                      className="ml-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      aria-label={t.emojiMore}
                      title={t.emojiMore}
                    >
                      <Smile size={14} />
                      {t.emojiMore}
                    </button>
                  </div>
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={draftInputRef}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
                      rows={2}
                      className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                      placeholder={t.messagePlaceholder}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          sendMessage();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={!String(draft || "").trim() || sending}
                      className="inline-flex h-11 items-center gap-1 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-70"
                    >
                      <Send size={15} />
                      {sending ? t.sending : t.send}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center px-6 py-10 text-center">
              <div>
                <MessageCircle className="mx-auto text-cyan-500" />
                <p className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">{t.selectChat}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.selectChatHint}</p>
                <button
                  type="button"
                  onClick={() => updateSelectedChat("")}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
                >
                  <ArrowLeft size={14} />
                  {t.back}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </AnimatedPage>
  );
}
