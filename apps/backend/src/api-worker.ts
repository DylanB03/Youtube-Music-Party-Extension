import {
  type CreateRoomRequest,
  type CreateRoomResponse,
  type ConnectionTicketResponse,
  type JoinRoomRequest,
  type JoinRoomResponse,
  type ResolveCodeResponse,
  emptyPlayback,
} from "@ytm-party/shared";
import { errorResponse, jsonResponse, parseJson } from "./lib/http";
import {
  expiredInvitePage,
  inviteLandingPage,
} from "./lib/invite-page";
import { generateId, generateInviteCode, generateToken } from "./lib/ids";
import { enforceRateLimit } from "./lib/rate-limit";
import {
  normalizeDisplayName,
  readRoomLimits,
} from "./domain/room-limits";
import type { Env } from "./types";
import { readPositiveInteger } from "./lib/config";

const DEFAULT_INVITE_TTL_SECONDS = 60 * 60 * 24;

export const apiWorker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      const url = new URL(request.url);
      console.error(
        JSON.stringify({
          message: "Unhandled API error",
          method: request.method,
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return errorResponse(error) ?? jsonResponse({ error: "Internal error" }, { status: 500 });
    }
  },
};

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse({ ok: true });
  }

  if (request.method === "GET" && url.pathname.startsWith("/join/")) {
    const inviteCode = url.pathname.split("/").at(-1)?.toUpperCase();
    if (!inviteCode) return new Response("Missing invite code", { status: 400 });
    const roomId = await env.INVITES.get(inviteCode);
    if (!roomId) return expiredInvitePage();
    return inviteLandingPage(inviteCode);
  }

  if (request.method === "POST" && url.pathname === "/rooms") {
    const limited = await enforceRateLimit(request, env, {
      scope: "create-room",
      limit: 10,
      windowSeconds: 60,
    });
    if (limited) return limited;
    return createRoom(request, env);
  }

  if (request.method === "POST" && url.pathname === "/rooms/join") {
    const limited = await enforceRateLimit(request, env, {
      scope: "join-room",
      limit: 30,
      windowSeconds: 60,
    });
    if (limited) return limited;
    return joinRoom(request, env);
  }

  if (request.method === "GET" && url.pathname.startsWith("/rooms/resolve/")) {
    const limited = await enforceRateLimit(request, env, {
      scope: "resolve-room",
      limit: 60,
      windowSeconds: 60,
    });
    if (limited) return limited;
    return resolveInviteCode(url, env);
  }

  const ticketMatch = url.pathname.match(/^\/rooms\/([^/]+)\/tickets$/);
  if (request.method === "POST" && ticketMatch?.[1]) {
    const limited = await enforceRateLimit(request, env, {
      scope: "connection-ticket",
      limit: 60,
      windowSeconds: 60,
    });
    if (limited) return limited;
    return createConnectionTicket(request, env, ticketMatch[1]);
  }

  const leaveMatch = url.pathname.match(/^\/rooms\/([^/]+)\/leave$/);
  if (request.method === "POST" && leaveMatch?.[1]) {
    const limited = await enforceRateLimit(request, env, {
      scope: "leave-room",
      limit: 60,
      windowSeconds: 60,
    });
    if (limited) return limited;
    return leaveRoom(request, env, leaveMatch[1]);
  }

  const connectMatch = url.pathname.match(/^\/rooms\/([^/]+)\/connect$/);
  if (connectMatch?.[1]) {
    const id = env.PARTY_ROOMS.idFromName(connectMatch[1]);
    return env.PARTY_ROOMS.get(id).fetch(request);
  }

  return jsonResponse({ error: "Not found" }, { status: 404 });
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<CreateRoomRequest>(request);
  const limits = readRoomLimits(env);
  const displayName = normalizeDisplayName(
    body.displayName,
    "Host",
    limits.maxDisplayNameLength,
  );
  if (!displayName) {
    return jsonResponse({ error: "Display name is invalid" }, { status: 400 });
  }
  const roomId = generateId("room");
  const participantId = generateId("participant");
  const participantToken = generateToken();
  const inviteCode = generateInviteCode();
  const id = env.PARTY_ROOMS.idFromName(roomId);
  const room = env.PARTY_ROOMS.get(id);
  const nowMs = Date.now();

  await room.fetch("https://party-room.local/initialize", {
    method: "POST",
    body: JSON.stringify({
      roomId,
      inviteCode,
      participantId,
      participantToken,
      displayName,
      initialPlayback: body.initialPlayback ?? emptyPlayback(nowMs),
      nowMs,
    }),
  });

  await env.INVITES.put(inviteCode, roomId, {
    expirationTtl: readPositiveInteger(
      env.INVITE_TTL_SECONDS,
      DEFAULT_INVITE_TTL_SECONDS,
    ),
  });

  const origin = new URL(request.url).origin;
  const response: CreateRoomResponse = {
    roomId,
    inviteCode,
    inviteUrl: `${origin}/join/${inviteCode}`,
    participantId,
    participantToken,
  };
  return jsonResponse(response, { status: 201 });
}

async function joinRoom(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<JoinRoomRequest>(request);
  const inviteCode = body.inviteCode?.toUpperCase();
  if (!inviteCode) {
    return jsonResponse({ error: "Missing invite code" }, { status: 400 });
  }

  const roomId = await env.INVITES.get(inviteCode);
  if (!roomId) {
    return jsonResponse({ error: "Invite code not found" }, { status: 404 });
  }

  const id = env.PARTY_ROOMS.idFromName(roomId);
  const room = env.PARTY_ROOMS.get(id);
  const joinResponse = await room.fetch("https://party-room.local/join", {
    method: "POST",
    body: JSON.stringify({
      inviteCode,
      displayName: body.displayName || "Guest",
      nowMs: Date.now(),
    }),
  });

  if (!joinResponse.ok) {
    if (joinResponse.status === 410) await env.INVITES.delete(inviteCode);
    return joinResponse;
  }
  const response = (await joinResponse.json()) as JoinRoomResponse;
  return jsonResponse(response, { status: 201 });
}

async function resolveInviteCode(url: URL, env: Env): Promise<Response> {
  const inviteCode = url.pathname.split("/").at(-1)?.toUpperCase();
  if (!inviteCode) {
    return jsonResponse({ error: "Missing invite code" }, { status: 400 });
  }

  const roomId = await env.INVITES.get(inviteCode);
  if (!roomId) {
    return jsonResponse({ error: "Invite code not found" }, { status: 404 });
  }

  const response: ResolveCodeResponse = { roomId, inviteCode };
  return jsonResponse(response);
}

async function createConnectionTicket(
  request: Request,
  env: Env,
  roomId: string,
): Promise<Response> {
  const authorization = request.headers.get("Authorization");
  const participantToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const body = await parseJson<{
    participantId: string;
    displayName: string;
  }>(request);
  if (!participantToken || !body.participantId) {
    return jsonResponse({ error: "Missing participant credentials" }, { status: 401 });
  }

  const id = env.PARTY_ROOMS.idFromName(roomId);
  const room = env.PARTY_ROOMS.get(id);
  const ticketResponse = await room.fetch("https://party-room.local/ticket", {
    method: "POST",
    body: JSON.stringify({
      participantId: body.participantId,
      participantToken,
      nowMs: Date.now(),
    }),
  });
  if (!ticketResponse.ok) return ticketResponse;

  const response = (await ticketResponse.json()) as ConnectionTicketResponse;
  return jsonResponse(response, { status: 201 });
}

async function leaveRoom(
  request: Request,
  env: Env,
  roomId: string,
): Promise<Response> {
  const authorization = request.headers.get("Authorization");
  const participantToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const body = await parseJson<{
    participantId: string;
  }>(request);
  if (!participantToken || !body.participantId) {
    return jsonResponse({ error: "Missing participant credentials" }, { status: 401 });
  }

  const id = env.PARTY_ROOMS.idFromName(roomId);
  const room = env.PARTY_ROOMS.get(id);
  return room.fetch("https://party-room.local/leave", {
    method: "POST",
    body: JSON.stringify({
      participantId: body.participantId,
      participantToken,
      nowMs: Date.now(),
    }),
  });
}
