# Yjs Collaboration Maintenance

## What Changed This Time

This round changed `/collab1` and Yjs persistence in these areas:

1. Initial Y.Doc restore is now pushed proactively.
   - On WebSocket connection, the server sends a `messageSync = 0` packet containing Yjs `SyncStep2`.
   - This packet carries the current server-side `room.doc` snapshot.
   - Frontend clients should handle it through the normal `syncProtocol.readSyncMessage(...)` path.

2. Online-user push is opt-in.
   - The custom presence packet is `messagePresence = 2`.
   - The server only sends it to clients connected with `presence=1`.
   - Legacy clients that only support Yjs sync/awareness continue to receive only `messageSync = 0` and `messageAwareness = 1`.

3. Online count is maintained by user, not by connection.
   - Multiple tabs from the same user in the same document count as one online user.
   - Presence changes broadcast only when a user's connection count changes `0 -> 1` or `1 -> 0`.

4. Yjs snapshots now support history and rollback.
   - `document_histories` stores restorable Y.Doc snapshots.
   - Snapshot persistence records the last modifying user when the WebSocket origin can be resolved.
   - `edit` history is merged per document/user within a 5 minute window.
   - Rollback writes a new `rollback` history row with `sourceVersion` and actor `user`.
   - Online rollback closes active WebSockets with `4409 document_rolled_back` and discards in-memory rooms.

## Main Files

| File | Purpose |
| --- | --- |
| `src/yjs/yjs.gateway.ts` | Custom `/collab1` WebSocket protocol, in-memory rooms, Yjs sync, awareness, presence push |
| `src/yjs/yjs-persistence.gateway.ts` | `/collab2`, official `y-websocket` based persistence gateway |
| `src/module/yjs-storage/yjs-storage.service.ts` | Y.Doc snapshot encode/decode, document access checks, collaboration session tracking, history, rollback |
| `src/module/yjs-storage/yjs-room-events.service.ts` | In-process room events, currently used for rollback notifications |
| `src/module/document/document.controller.ts` | Document HTTP endpoints, including history list and rollback |
| `docs/yjs-history-rollback.md` | Frontend/backend contract for history and rollback |
| `prisma/schema.prisma` | `documents`, `document_histories`, and `collaboration_sessions` models |

## `/collab1` Message Types

`/collab1` is a binary WebSocket protocol.

```ts
const messageSync = 0;
const messageAwareness = 1;
const messagePresence = 2;
```

Do not send JSON directly over `/collab1`.

`messagePresence = 2` is a project-specific extension. It must stay opt-in because older frontends may only parse `0` and `1`.

## Connection Flow

1. Parse `docId` from query.
2. Verify access token through `verifyWsAccessToken`.
3. Load or create the in-memory room for `docId`.
4. Restore Y.Doc from `documents.content` if the room is new.
5. Track online session through `handleSessionRoom`.
6. Mark socket metadata:
   - `client.roomId`
   - `client.userId`
   - `client.presenceSubscribed = query.presence === '1'`
7. Send initial sync:
   - proactive `SyncStep2` snapshot
   - normal `SyncStep1` handshake
   - current awareness states

## Initial Snapshot Sync

The server sends a proactive snapshot in `sendInitialSync`:

```ts
encoding.writeVarUint(snapshotEncoder, messageSync);
syncProtocol.writeSyncStep2(snapshotEncoder, room.doc);
```

This is intentionally sent before the normal `SyncStep1` handshake.

Reason: some frontends initialize editor state from `ydoc` updates and expect the server to return persisted Y.Doc content immediately. Without this eager `SyncStep2`, those clients may connect successfully but render an empty editor until a later sync response arrives.

Maintenance rule:

- Keep the proactive `SyncStep2`.
- Keep the normal `SyncStep1` after it.
- Frontend should still call `readSyncMessage` for every `messageSync` packet.

## Presence Push

Presence push sends:

```ts
{
  type: 'onlineUsersChanged',
  docId: string,
  count: number,
  users: Array<{
    id: number;
    username: string;
    account: string;
  }>
}
```

Only clients with `presence=1` receive it.

Broadcast points:

- After connection, if `handleSessionRoom` returns `changed: true`.
- After disconnect, if `markSessionDisconnected` returns `changed: true`.

Do not broadcast presence changes for duplicate tabs from the same user unless online user count actually changes.

## Persistence

`room.doc` updates are persisted through `schedulePersist` with a 1 second debounce.

When a Yjs update origin is a WebSocket client, the gateway stores `lastModifiedBy` on the room. The next persisted snapshot uses that user ID to create an `edit` row in `document_histories`.

`documents.content` is still saved on the normal 1 second debounce. History rows are intentionally coarser:

- Same document + same user + `edit` within 5 minutes updates the latest `edit` row.
- The updated row stores the latest full Y.Doc snapshot, latest document version, and latest `createdAt`.
- This reduces history noise without making rollback partial.

On room cleanup:

- pending snapshot is flushed
- awareness is destroyed
- Y.Doc is destroyed
- room is removed from memory

Room cleanup currently waits 30 minutes after the last connection leaves.

## History And Rollback

HTTP endpoints:

```text
POST /document/history/list
POST /document/history/rollback
```

Rules:

- History list requires read access.
- Rollback requires write access.
- `edit` history is merged in a 5 minute per-document/per-user window.
- A rollback updates `documents.content`, increments `documents.version`, and creates a `rollback` history record.
- `rollbackHistory.sourceVersion` is the target version that was restored.
- After rollback, gateways close online clients with close code `4409` and reason `document_rolled_back`.
- Gateways discard the old in-memory Y.Doc without persisting it again.

Frontend flow:

1. Call `POST /document/history/rollback`.
2. Listen for WebSocket close `4409 document_rolled_back`.
3. Destroy the current Tiptap editor and local `Y.Doc`.
4. Create a fresh Tiptap editor / `Y.Doc` and reconnect.
5. The reconnect loads the rollback snapshot from `documents.content`.

## Known Limits

1. In-memory online connection counts are process-local.
   - If the service runs multiple Node instances, move this state to Redis or another shared store.

2. If the process crashes, database `isActive=true` rows can remain stale.
   - Production should add startup cleanup or heartbeat expiry.

3. `/collab2` tracks sessions but does not emit custom presence push.
   - Use `/collab1` for real-time online count.

4. Rollback room invalidation is currently process-local.
   - Multi-instance deployments need Redis Pub/Sub or another broadcast mechanism so every Node instance discards the same document room.

## Verification

Run:

```bash
npm run build
npm test -- yjs-storage.service.spec.ts
```

Manual smoke test:

1. Create or open a document with saved content.
2. Connect to `/collab1?docId=<id>&accessToken=<token>`.
3. Confirm the client receives a `messageSync` packet and `ydoc.getText('document')` becomes the saved content.
4. Connect with `presence=1`.
5. Confirm `onlineUsersChanged` is received only by presence-subscribed clients.
