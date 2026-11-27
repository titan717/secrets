# LiveKit research notes (verified 2026-11-27, livekit-server-sdk 2.20.1)

## Access tokens

Source: https://docs.livekit.io/frontends/authentication/tokens/

```ts
import { AccessToken, type VideoGrant } from "livekit-server-sdk";
const at = new AccessToken(apiKey, apiSecret, { identity, name, ttl: "2h", metadata });
at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: [...] } satisfies VideoGrant);
const jwt = await at.toJwt(); // async since v2
```

- `identity` is required for join tokens. LiveKit disconnects an earlier participant who has the same identity.
- `ttl` accepts seconds or a duration string (`"2h"`). The SDK default is 6h.
- `canPublishSources` is `TrackSource[]`: `MICROPHONE`, `CAMERA`, `SCREEN_SHARE`, `SCREEN_SHARE_AUDIO`. In the JWT these appear as `"microphone"`, `"camera"`, `"screen_share"` and `"screen_share_audio"`. When set, it overrides `canPublish`.
- `canPublishData` defaults to true.

## RoomServiceClient

Sources: https://docs.livekit.io/reference/server-sdk-js/classes/RoomServiceClient.html, https://docs.livekit.io/reference/server-sdk-js/interfaces/CreateOptions.html

- `new RoomServiceClient(host, apiKey?, secret?)`. `host` must include the protocol, e.g. `https://<project>.livekit.cloud`. This service derives it from `LIVEKIT_URL` by mapping `wss:` to `https:`.
- `createRoom({ name, emptyTimeout, departureTimeout, maxParticipants, metadata, ... }): Promise<Room>`. It returns the existing room if the name is already taken, so we use it as "ensure".
  - `emptyTimeout`: seconds to keep the room open before anyone joins.
  - `departureTimeout`: seconds to keep the room open after the last participant leaves.
- `listRooms(names?: string[]): Promise<Room[]>`. `Room.numParticipants` gives the participant count.
- `listParticipants(room)` and `deleteRoom(room)` are also available.

## How this service uses it

- Room name: `conv_<conversation_id>`. Room metadata: `{conversation_id, kind}`.
- Token identity is the Secrets user id (`sub` from the session JWT). Any `identity` in the request body is ignored for authenticated callers, which prevents impersonation. Participant `name` is the username, and participant `metadata` is `{user_id, username}`.
- `kind: "voice"` allows microphone and screen share. `kind: "video"` also allows the camera.
- The web client joins with `livekit-client`: `room.connect(url, token)`.
