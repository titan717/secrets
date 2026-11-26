// Minimal Node round-trip: vodozemac (Olm 1:1 per-device + Megolm group) via @kinsh/vodozemac-wasm
import { Account, GroupSession, InboundGroupSession } from "@kinsh/vodozemac-wasm";
import assert from "node:assert/strict";

// --- devices (each device = its own Olm Account; server only stores PUBLIC keys) ---
const alice = new Account();
const bobPhone = new Account();
const bobLaptop = new Account(); // second device of Bob
const publish = (acct) => { acct.generateOneTimeKeys(5); const b = { id: JSON.parse(acct.identityKeys()), otks: JSON.parse(acct.oneTimeKeys()) }; acct.markKeysAsPublished(); return b; };
const bundles = { bobPhone: publish(bobPhone), bobLaptop: publish(bobLaptop) };
const firstOtk = (b) => Object.values(b.otks.curve25519 ?? b.otks)[0];

// --- Alice fans out to every Bob device (per-device Olm sessions) ---
const sessions = {};
for (const [dev, b] of Object.entries(bundles)) sessions[dev] = alice.createOutboundSession(b.id.curve25519, firstOtk(b));
const wire = Object.fromEntries(Object.entries(sessions).map(([d, s]) => [d, JSON.parse(s.encrypt("hi bob"))]));
console.log("wire sample:", JSON.stringify(wire.bobPhone).slice(0, 90) + "…");

const aliceCurve = JSON.parse(alice.identityKeys()).curve25519;
const bobSessions = {};
for (const [dev, acct] of [["bobPhone", bobPhone], ["bobLaptop", bobLaptop]]) {
  const r = acct.createInboundSession(wire[dev].body ?? wire[dev].ciphertext);
  assert.equal(r.plaintext, "hi bob"); assert.equal(r.senderIdentityKey, aliceCurve);
  bobSessions[dev] = r.takeSession();
  console.log(`${dev} decrypted:`, r.plaintext);
}
// reply (ratchet continues) Bob laptop -> Alice
const reply = JSON.parse(bobSessions.bobLaptop.encrypt("hey alice, from laptop"));
assert.equal(sessions.bobLaptop.decrypt(reply.type ?? reply.message_type, reply.body ?? reply.ciphertext), "hey alice, from laptop");
console.log("alice decrypted reply OK");

// --- Group (Megolm): Alice's outbound group session, key distributed over Olm ---
let g = new GroupSession();
const share = (gs) => { const inb = {}; for (const d of Object.keys(sessions)) { const m = JSON.parse(sessions[d].encrypt(gs.sessionKey())); inb[d] = new InboundGroupSession(bobSessions[d].decrypt(m.type ?? m.message_type, m.body ?? m.ciphertext)); } return inb; };
let inbound = share(g);
const gm = g.encrypt("group hello");
for (const d of Object.keys(inbound)) assert.equal(JSON.parse(inbound[d].decrypt(gm)).plaintext, "group hello");
console.log("megolm group decrypt OK on both bob devices");

// --- Member removal: rotate -> new GroupSession shared only with remaining devices ---
g = new GroupSession();
const remaining = { bobPhone: inbound.bobPhone }; // pretend laptop removed
const k = JSON.parse(sessions.bobPhone.encrypt(g.sessionKey()));
remaining.bobPhone = new InboundGroupSession(bobSessions.bobPhone.decrypt(k.type ?? k.message_type, k.body ?? k.ciphertext));
const gm2 = g.encrypt("after rotation");
assert.throws(() => inbound.bobLaptop.decrypt(gm2)); // removed device can't read
console.log("rotation OK: removed device cannot decrypt; remaining:", JSON.parse(remaining.bobPhone.decrypt(gm2)).plaintext);

// --- persistence: pickle round-trip ---
const re = Account.fromPickle(alice.pickle()); assert.equal(re.identityKeys(), alice.identityKeys());
console.log("pickle restore OK. ALL PASS");
