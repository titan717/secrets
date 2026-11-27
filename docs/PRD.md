# SECRETS — Master Product Requirements & Engineering Specification

> Your world. Your people. Your space.

Document version: 1.0 · Product: Secrets · Type: Master PRD + Technical Design Specification
Scope: Web, Android, iOS and desktop · Source of truth supplied by the product owner (blueprint PDF + this PRD).

Visual source of truth: `/assets/mockup-secrets-overview.jpg`, `/assets/logo-mark.png`, `/assets/mascot-ghost.png`. Pattern references: `/docs/UX-REFERENCES.md`.

---

## 1. Final product decisions

| Decision         | Final specification           |
| ---------------- | ----------------------------- |
| Product          | Balanced all-in-one ecosystem |
| Audience         | Everyone                      |
| Primary priority | Messaging                     |
| Registration     | Username-first                |
| Privacy          | Everything private, encrypted |
| Calls            | Integrated voice/video        |
| Docks            | Public and private            |
| Platforms        | Web, Android, iOS, desktop    |
| Monetization     | Free-first                    |
| Architecture     | Modular monolith initially    |
| UI direction     | Dark-first, light mode        |
| Development      | Phased, quality-gated         |

### What "everything private" means

- Private conversations: end-to-end encrypted.
- Private group conversations: end-to-end encrypted.
- Private voice and video calls: end-to-end encrypted media.
- Private notes: client-side encrypted.
- Private Vault files: client-side encrypted.
- Private tasks and workspace data: client-side encrypted where practical.
- Public Moments: intentionally public or audience-restricted.
- Public Docks: publicly discoverable, but internal content follows explicit access permissions.
- Private Docks: encrypted content and restricted membership.

The server must not possess the keys needed to decrypt private content.

Qualification: search, collaborative editing, multi-device sync, server-side previews, moderation and account recovery become harder when the server cannot access plaintext. We design around that rather than quietly weakening encryption.

For group calls we use an E2EE-capable WebRTC/SFU architecture. A media server may route encrypted streams but must not become an undeclared plaintext endpoint.

---

# PART I — PRODUCT REQUIREMENTS

## 2. Product overview

### 2.1 Definition
Secrets is a cross-platform communication and collaboration ecosystem combining private messaging, group communication, voice/video calls, communities (Docks), public social content (Moments), personal and collaborative Notes, Tasks, and encrypted file storage (Vault). Unified account, identity, navigation, notifications and cross-feature integration.

### 2.2 Problem statement

| User need               | Existing fragmented experience |
| ----------------------- | ------------------------------ |
| Private conversations   | Messaging application          |
| Community conversations | Community platform             |
| Meetings                | Video conferencing application |
| Public content          | Social media                   |
| Personal notes          | Note-taking application        |
| Project management      | Task management application    |
| File storage            | Cloud storage application      |

### 2.3 Objectives
Primary: exceptionally reliable private messaging; secure communication accessible to ordinary users; a useful community ecosystem; connect communication with productivity; consistent cross-platform experience; trust through transparent security and privacy.

Non-objectives (initial releases): full enterprise ERP; advertising network; unrestricted public video platform; anonymous public file hosting; replacing every third-party productivity tool; proprietary cryptographic protocols.

### 2.4 Personas
- Everyday user — private conversations, calls, file sharing, simple social. Features: Chats, Calls, Moments.
- Community member — organized discussions, events, channels. Features: Docks, Channels, Calls.
- Creator — publish content, build audience, manage community. Features: Moments, Docks, Vault.
- Team collaborator — coordinate conversations, tasks, files, meetings. Features: Docks, Tasks, Notes, Calls.
- Personal productivity user — notes, reminders, files. Features: Notes, Tasks, Vault.

## 3. Functional requirements

Priority: P0 = initial usable release · P1 = complete first product · P2 = post-launch.

### 3.1 Identity and accounts

| ID     | Requirement                                | Priority |
| ------ | ------------------------------------------ | -------- |
| ID-001 | Register using a unique username           | P0       |
| ID-002 | Username validation and availability check | P0       |
| ID-003 | Secure authentication                      | P0       |
| ID-004 | User profile creation                      | P0       |
| ID-005 | Profile picture and display name           | P0       |
| ID-006 | Device registration                        | P0       |
| ID-007 | Device and session management              | P0       |
| ID-008 | Passkey authentication                     | P1       |
| ID-009 | Optional verified recovery email/phone     | P0       |
| ID-010 | Account recovery process                   | P0       |
| ID-011 | Account export and deletion                | P1       |
| ID-012 | Username change with cooldown              | P1       |

Username-first does not mean passwordless or recovery-free. Registration flow: choose username → check availability → create credential → create display profile → register device → generate device encryption identity → create recovery mechanism → enter Secrets. Recovery email/phone is optional but users must be warned about losing devices and recovery material. Username enumeration and discovery must be rate-limited and privacy-controlled.

### 3.2 Messaging

| ID      | Requirement                     | Priority |
| ------- | ------------------------------- | -------- |
| MSG-001 | One-to-one conversations        | P0       |
| MSG-002 | End-to-end encryption           | P0       |
| MSG-003 | Real-time messaging             | P0       |
| MSG-004 | Message history synchronization | P0       |
| MSG-005 | Message delivery receipts       | P0       |
| MSG-006 | Offline message delivery        | P0       |
| MSG-007 | Multi-device synchronization    | P0       |
| MSG-008 | Replies and reactions           | P0       |
| MSG-009 | Message editing                 | P1       |
| MSG-010 | Message deletion                | P1       |
| MSG-011 | Media attachments               | P0       |
| MSG-012 | Voice messages                  | P1       |
| MSG-013 | Typing indicators               | P1       |
| MSG-014 | Read receipts controls          | P1       |
| MSG-015 | Disappearing messages           | P1       |
| MSG-016 | Scheduled messages              | P2       |
| MSG-017 | Message bookmarks               | P1       |
| MSG-018 | Local encrypted search          | P1       |
| MSG-019 | Chat folders                    | P2       |
| MSG-020 | Spam and abuse controls         | P0       |

Rules: deterministic ordering; retried requests must not create duplicate visible messages; deletion syncs across authorized devices; edits retain revision metadata; expiring messages have defined semantics across offline devices; attachments have independent encryption keys and access policies.

### 3.3 Groups
Creation, invitations, member removal, admin roles, group identity/profile, encrypted group key distribution, member changes and key rotation, announcements, pinned messages, media galleries, group calls. A membership change is a cryptographic event; removed members must not receive future group keys.

### 3.4 Calls and meetings

| ID       | Requirement               | Priority |
| -------- | ------------------------- | -------- |
| CALL-001 | One-to-one voice calls    | P0       |
| CALL-002 | One-to-one video calls    | P0       |
| CALL-003 | Call invitation from chat | P0       |
| CALL-004 | Incoming call handling    | P0       |
| CALL-005 | Mute and camera controls  | P0       |
| CALL-006 | Call history              | P1       |
| CALL-007 | Group voice calls         | P1       |
| CALL-008 | Group video calls         | P1       |
| CALL-009 | Screen sharing            | P1       |
| CALL-010 | Meeting links             | P1       |
| CALL-011 | Scheduled meetings        | P2       |
| CALL-012 | Recording with consent    | P2       |

### 3.5 Docks

| ID      | Requirement               | Priority |
| ------- | ------------------------- | -------- |
| DOC-001 | Create Dock               | P0       |
| DOC-002 | Public/private visibility | P0       |
| DOC-003 | Custom name and branding  | P0       |
| DOC-004 | Invite members            | P0       |
| DOC-005 | Text channels             | P0       |
| DOC-006 | Roles and permissions     | P0       |
| DOC-007 | Channel-level permissions | P1       |
| DOC-008 | Moderation                | P0       |
| DOC-009 | Voice channels            | P1       |
| DOC-010 | Shared Notes              | P1       |
| DOC-011 | Shared Tasks              | P1       |
| DOC-012 | Shared Vault              | P1       |
| DOC-013 | Community discovery       | P1       |
| DOC-014 | Events                    | P2       |

Public listing, membership and channel visibility are independent permission dimensions.

### 3.6 Moments
Text/image/video posts; audience selection; following; likes and reactions; comments and replies; reposting; bookmarking; reporting; blocking; user profiles; discover feed; community feed; content moderation; user-controlled privacy.

### 3.7 Notes
Create/edit/delete; rich text; Markdown; folders and tags; private notes; shared notes; Dock-linked notes; version history; search; offline access; conflict resolution; export.

### 3.8 Tasks
Personal tasks; shared Dock tasks; assignees; due dates; priority; subtasks; comments; labels; status; list, board and calendar views; reminders; activity history; message-to-task conversion.

### 3.9 Vault
Upload/download; folders; personal and shared Vaults; file encryption; previews on authorized clients; versioning; storage quota; secure sharing; offline access; deletion and retention; resumable uploads.

## 4. Acceptance criteria

A feature is not complete just because its interface works. Messaging is accepted only when:

- Two users can exchange encrypted messages.
- Messages arrive in correct order.
- Offline recipients receive messages after reconnecting.
- Reconnection does not produce duplicate messages.
- Multiple authorized devices synchronize.
- Unregistered devices cannot retrieve messages.
- Removed devices cannot obtain future encryption keys.
- Message content is not exposed in server logs.
- Database backups do not contain plaintext message bodies.
- Security tests pass.

The same acceptance-first approach applies to every module.

---

# PART II — UX SPECIFICATION

## 5. Navigation

### 5.1 Desktop
Sidebar: SECRETS · MAIN: Home, Messages, Calls, Docks, Moments, Explore · WORKSPACE: Notes, Tasks, Vault · Notifications, Settings.

Rules: collapsible primary sidebar; contextual secondary sidebar; main content area; optional right info panel; global search everywhere; keyboard shortcuts; resizable panels where useful; consistent navigation history. Notes, Vault and Moments must not feel like separate apps.

### 5.2 Mobile
Product-owner decision (orchestrator brief, overrides PRD 5.2 list): bottom nav **Home, Calls, + (compose), Docks, Profile** — as in the mockup. Messages live on Home (stories row + chats); Moments, Notes, Tasks, Vault are reachable from Home and the + sheet.

### 5.3 Screen inventory

| Screen       | Web/Desktop         | Mobile             |
| ------------ | ------------------- | ------------------ |
| Onboarding   | Full page           | Full page          |
| Home         | Dashboard           | Compact dashboard  |
| Messages     | Multi-panel         | Conversation-first |
| Conversation | Three-panel         | Full screen        |
| Calls        | Floating/dedicated  | Full screen        |
| Docks        | Multi-panel         | Dock switcher      |
| Moments      | Multi-column feed   | Vertical feed      |
| Notes        | Full editor         | Compact editor     |
| Tasks        | Board/list/calendar | List-first         |
| Vault        | File manager        | Folder-first       |
| Settings     | Sidebar             | Nested pages       |

## 6. Screens

### Screen 01 — Welcome and registration
Elements: logo, short product statement, username input, password or passkey setup, availability feedback, terms/privacy links, optional recovery setup, sign-in link.

| State               | Behaviour                     |
| ------------------- | ----------------------------- |
| Empty               | Show username prompt          |
| Invalid             | Explain validation issue      |
| Unavailable         | Suggest alternative usernames |
| Available           | Allow continuation            |
| Credential creation | Show secure setup             |
| Recovery setup      | Explain recovery options      |
| Complete            | Enter onboarding              |

Username rules: 3–30 chars; case-insensitive uniqueness; explicit Unicode policy; reserved system names blocked; rate-limited checks; controlled changes. Usernames are not cryptographic identities — every account has a stable internal ID.

### Screen 02 — Onboarding
Optional, short: display name → profile picture → privacy preferences → notifications → optional contacts → review recovery → enter app. Skip always available on optional steps.

### Screen 03 — Home
Welcome, recent conversations, upcoming calls/meetings, recent Dock activity, pending tasks, recent notes, storage summary, relevant Moments. Customizable. Not a cluttered analytics dashboard.

### Screen 04 — Messages inbox
Search, recent conversations, unread filter, pinned chats, group/individual indicators, presence, draft indicators, chat folders, new conversation action. Predictable, configurable sorting.
