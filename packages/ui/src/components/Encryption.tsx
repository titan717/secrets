import { useState } from "react";
import { Check, Copy, Lock, LockOpen, ShieldAlert, ShieldCheck } from "lucide-react";
import { cx } from "../cx";
import { safetyNumberGroups } from "../shared/format";
import type { EncryptionState } from "../shared/types";
import { Button } from "./Button";

const COPY: Record<EncryptionState, { label: string; Icon: typeof Lock }> = {
  encrypted: { label: "End-to-end encrypted", Icon: Lock },
  verified: { label: "Verified", Icon: ShieldCheck },
  unverified: { label: "Not verified", Icon: ShieldAlert },
  "not-encrypted": { label: "Not encrypted", Icon: LockOpen },
};

export interface EncryptionBadgeProps {
  state: EncryptionState;
  label?: string;
  compact?: boolean;
  className?: string;
}

export function EncryptionBadge({ state, label, compact, className }: EncryptionBadgeProps) {
  const { label: defaultLabel, Icon } = COPY[state];
  const text = label ?? defaultLabel;
  return (
    <span className={cx("s-enc", `is-${state}`, compact && "is-compact", className)}>
      <Icon size={14} aria-hidden="true" />
      {compact ? <span className="s-sr-only">{text}</span> : <span>{text}</span>}
    </span>
  );
}

export interface SafetyNumberProps {
  /** 60 digits (spaces ignored). */
  value: string;
  contactName: string;
  verified?: boolean;
  onToggleVerified?: (next: boolean) => void;
  onCopy?: (value: string) => void;
  className?: string;
}

/** Safety number grid (12 × 5 digits) with copy + mark-as-verified. */
export function SafetyNumber({ value, contactName, verified, onToggleVerified, onCopy, className }: SafetyNumberProps) {
  const groups = safetyNumberGroups(value);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const plain = groups.join(" ");
    try {
      await navigator.clipboard?.writeText(plain);
    } catch {
      /* clipboard unavailable; caller may handle via onCopy */
    }
    onCopy?.(plain);
    setCopied(true);
  };
  return (
    <section className={cx("s-safety", className)} aria-label={`Safety number with ${contactName}`}>
      <div className="s-safety__head">
        <EncryptionBadge state={verified ? "verified" : "unverified"} />
      </div>
      <ol className="s-safety__grid">
        {groups.map((g, i) => (
          <li key={i} className="s-safety__group">
            {g}
          </li>
        ))}
      </ol>
      <p className="s-safety__help">
        Compare these numbers with {contactName} in person or on a call. If they match, your conversation is private.
      </p>
      <div className="s-safety__actions">
        <Button size="sm" variant="secondary" leadingIcon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
        {onToggleVerified && (
          <Button size="sm" variant={verified ? "secondary" : "primary"} onClick={() => onToggleVerified(!verified)}>
            {verified ? "Clear verification" : "Mark as verified"}
          </Button>
        )}
      </div>
    </section>
  );
}
