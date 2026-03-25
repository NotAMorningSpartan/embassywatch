import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../stores/useAuthStore";
import { useFeedStore, type FeedEvent } from "../stores/useFeedStore";

const SOCKET_URL = import.meta.env.VITE_API_URL || "";

let socket: Socket | null = null;

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addEvent = useFeedStore((s) => s.addEvent);
  const addEvents = useFeedStore((s) => s.addEvents);
  const setConnected = useFeedStore((s) => s.setConnected);
  const subscribedRooms = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socket) {
        socket.disconnect();
        socket = null;
        setConnected(false);
      }
      return;
    }

    if (socket?.connected) return;

    socket = io(SOCKET_URL, {
      auth: { token },
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("[Socket] Connected");
      setConnected(true);
      // Re-subscribe to rooms
      subscribedRooms.current.forEach((room) => {
        socket?.emit("subscribe", room);
      });
    });

    socket.on("disconnect", () => {
      console.log("[Socket] Disconnected");
      setConnected(false);
    });

    socket.on("feed:event", (event: FeedEvent) => {
      addEvent(event);
    });

    socket.on("feed:catchup", (events: FeedEvent[]) => {
      addEvents(events);
    });

    socket.on("auth:expired", () => {
      console.warn("[Socket] Auth expired");
      socket?.disconnect();
      setConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.error("[Socket] Connection error:", err.message);
      setConnected(false);
    });

    return () => {
      if (socket) {
        socket.disconnect();
        socket = null;
        setConnected(false);
      }
    };
  }, [isAuthenticated, token]);

  const subscribe = useCallback((room: string) => {
    subscribedRooms.current.add(room);
    socket?.emit("subscribe", room);
  }, []);

  const unsubscribe = useCallback((room: string) => {
    subscribedRooms.current.delete(room);
    socket?.emit("unsubscribe", room);
  }, []);

  return { subscribe, unsubscribe };
}
