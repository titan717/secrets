import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  CoachMark,
  Composer,
  ConversationListSkeleton,
  ConversationRow,
  DayDivider,
  Dialog,
  EmptyState,
  EncryptionBadge,
  IconButton,
  ListItem,
  MessageBubble,
  NewMessagesDivider,
  QRProfileCard,
  Radio,
  RadioGroup,
  SafetyNumber,
  StoriesRow,
  Tabs,
  TextField,
  Toast,
  ToastProvider,
  Toggle,
  Tooltip,
  UnreadCount,
  useToast,
} from "../src";
import { expectNoAxeViolations } from "./axe";

describe("Button / IconButton", () => {
  it("renders variants and handles clicks", async () => {
    const onClick = vi.fn();
    const { container } = render(
      <div>
        <Button variant="primary" onClick={onClick}>Send</Button>
        <Button variant="danger">Delete</Button>
        <IconButton label="Start call" icon={<span>☎</span>} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Start call" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
  it("loading disables and announces", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const b = screen.getByRole("button", { name: /save/i });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b).toHaveTextContent("Loading");
  });
  it("icon toggle exposes aria-pressed", () => {
    render(<IconButton label="Mute" icon={<span />} pressed />);
    expect(screen.getByRole("button", { name: "Mute" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("TextField", () => {
  it("links label, hint and error", async () => {
    const { container, rerender } = render(<TextField label="Username" hint="3–32 characters" />);
    const input = screen.getByLabelText("Username");
    expect(input).toHaveAccessibleDescription("3–32 characters");
    rerender(<TextField label="Username" error="That username is taken" />);
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("That username is taken");
    await expectNoAxeViolations(container);
  });
});

describe("Avatar / Badge", () => {
  it("names avatar with presence and falls back to initials", async () => {
    const { container } = render(
      <div>
        <Avatar name="Sarah Chen" presence="online" />
        <AvatarGroup people={[{ name: "A B" }, { name: "C D" }, { name: "E F" }, { name: "G H" }]} max={2} />
        <UnreadCount count={120} />
        <Badge tone="accent">Work</Badge>
      </div>,
    );
    expect(screen.getByRole("img", { name: "Sarah Chen, Online" })).toHaveTextContent("SC");
    expect(screen.getByRole("img", { name: "A B, C D and 2 more" })).toHaveTextContent("+2");
    expect(screen.getByText("99+")).toBeInTheDocument();
    expect(screen.getByText("120 unread messages")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
  it("unread count renders nothing at zero", () => {
    const { container } = render(<UnreadCount count={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ConversationRow / ListItem", () => {
  it("shows unread, pinned, muted, draft, group, typing", async () => {
    const onClick = vi.fn();
    const { container } = render(
      <ul>
        <li>
          <ConversationRow
            title="Family Circle"
            avatars={[{ name: "Sarah Chen" }, { name: "David Kim" }]}
            isGroup
            preview="Dinner at 8?"
            time="9:42 AM"
            unread={2}
            pinned
            selected
            onClick={onClick}
          />
        </li>
        <li>
          <ConversationRow title="Sarah Chen" avatars={[{ name: "Sarah Chen", presence: "online" }]} draft="See you" muted unread={3} />
        </li>
        <li>
          <ConversationRow title="Weekend Crew" avatars={[{ name: "A" }, { name: "B" }]} isGroup typing={["Sam"]} />
        </li>
        <li>
          <ListItem title="Linked devices" subtitle="3 devices" />
        </li>
      </ul>,
    );
    const family = screen.getByRole("button", { name: /Family Circle/ });
    expect(family).toHaveAttribute("aria-current", "true");
    expect(within(family).getByText("2 unread messages")).toBeInTheDocument();
    expect(within(family).getByRole("img", { name: "Pinned" })).toBeInTheDocument();
    expect(within(family).getByRole("img", { name: "Group" })).toBeInTheDocument();
    await userEvent.click(family);
    expect(onClick).toHaveBeenCalled();
    const sarah = screen.getByRole("button", { name: /Sarah Chen/ });
    expect(sarah).toHaveTextContent("Draft: See you");
    expect(within(sarah).getByRole("img", { name: "Muted" })).toBeInTheDocument();
    expect(screen.getByText("Sam is typing…")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe("MessageBubble", () => {
  it("renders statuses, edited, reply and reactions", async () => {
    const onReact = vi.fn();
    const onRetry = vi.fn();
    const { container } = render(
      <div>
        <DayDivider label="Today" />
        <MessageBubble direction="in" author="Sarah Chen" position="first" time="9:40 AM">
          Dinner at 8?
        </MessageBubble>
        <NewMessagesDivider />
        <MessageBubble
          direction="out"
          time="9:41 AM"
          status="read"
          edited
          replyTo={{ author: "Sarah Chen", text: "Dinner at 8?" }}
          reactions={[{ emoji: "❤️", count: 4, mine: true }]}
          onReactionClick={onReact}
        >
          Perfect! I&apos;ll book the restaurant.
        </MessageBubble>
        <MessageBubble direction="out" status="failed" onRetry={onRetry}>
          Retry me
        </MessageBubble>
      </div>,
    );
    expect(screen.getByText("Sarah Chen", { selector: ".s-msg__author" })).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("edited")).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "New messages" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "❤️ 4, you reacted" }));
    expect(onReact).toHaveBeenCalledWith("❤️");
    await userEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    await expectNoAxeViolations(container);
  });
  it.each(["sending", "sent", "delivered", "read", "failed"] as const)("status %s has a text label", (status) => {
    render(<MessageBubble direction="out" status={status}>x</MessageBubble>);
    expect(screen.getByText({ sending: "Sending", sent: "Sent", delivered: "Delivered", read: "Read", failed: "Not sent" }[status])).toBeInTheDocument();
  });
  it("hides author on grouped middle bubbles", () => {
    render(<MessageBubble direction="in" author="Sam" position="middle">hi</MessageBubble>);
    expect(screen.queryByText("Sam")).not.toBeInTheDocument();
  });
});

describe("Composer", () => {
  it("sends on Enter, newline on Shift+Enter, clears after send", async () => {
    const onSend = vi.fn();
    const { container } = render(<Composer onSend={onSend} onAttach={() => {}} onEmoji={() => {}} onVoice={() => {}} />);
    const box = screen.getByRole("textbox", { name: "Message" });
    expect(screen.getByRole("button", { name: "Record voice message" })).toBeInTheDocument();
    await userEvent.type(box, "hello{Shift>}{Enter}{/Shift}world");
    expect(box).toHaveValue("hello\nworld");
    await userEvent.type(box, "{Enter}");
    expect(onSend).toHaveBeenCalledWith("hello\nworld");
    expect(box).toHaveValue("");
    await expectNoAxeViolations(container);
  });
  it("does not send whitespace", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    await userEvent.type(screen.getByRole("textbox"), "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});

describe("Tabs", () => {
  it("supports arrow-key navigation", async () => {
    const { container } = render(
      <Tabs
        label="Info"
        items={[
          { id: "members", label: "Members", content: "m" },
          { id: "media", label: "Media", content: "md" },
          { id: "files", label: "Files", content: "f" },
        ]}
      />,
    );
    const first = screen.getByRole("tab", { name: "Members" });
    expect(first).toHaveAttribute("aria-selected", "true");
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Media" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Media" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("f");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Members" })).toHaveFocus();
    await expectNoAxeViolations(container);
  });
});

describe("Toggle / Radio", () => {
  it("toggle is a switch", async () => {
    const onChange = vi.fn();
    const { container } = render(<Toggle label="Read receipts" description="Let people know" onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Read receipts" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(onChange).toHaveBeenCalledWith(true);
    await expectNoAxeViolations(container);
  });
  it("radio group selects", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <RadioGroup label="Theme" defaultValue="dark" onChange={onChange}>
        <Radio value="system" label="System" />
        <Radio value="dark" label="Dark" />
        <Radio value="black" label="Black" description="True black for OLED" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: /Black/ }));
    expect(onChange).toHaveBeenCalledWith("black");
    expect(screen.getByRole("radio", { name: /Black/ })).toBeChecked();
    await expectNoAxeViolations(container);
  });
});

describe("Dialog", () => {
  function Harness({ variant }: { variant?: "modal" | "sheet" }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <Dialog open={open} onClose={() => setOpen(false)} title="New chat" description="Start an encrypted conversation" variant={variant}
          footer={<Button variant="primary">Create</Button>}>
          <TextField label="Search people" />
        </Dialog>
      </>
    );
  }
  it("traps focus, closes on Escape and restores focus", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "New chat" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Start an encrypted conversation");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText("Search people")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Create" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await expectNoAxeViolations(document.body);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
  it("sheet variant renders", async () => {
    render(<Harness variant="sheet" />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog").className).toContain("s-dialog--sheet");
  });
});

describe("Tooltip / CoachMark", () => {
  it("tooltip appears on focus and describes the trigger", async () => {
    render(
      <Tooltip content="Start video call">
        <button type="button">Video</button>
      </Tooltip>,
    );
    await userEvent.tab();
    const btn = screen.getByRole("button", { name: "Video" });
    expect(btn).toHaveAccessibleDescription("Start video call");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
  it("coach mark shows n of m and Got it", async () => {
    const onDismiss = vi.fn();
    const onNext = vi.fn();
    const { container, rerender } = render(
      <CoachMark title="Notes" step={1} total={3} onNext={onNext} onDismiss={onDismiss}>
        Capture ideas privately.
      </CoachMark>,
    );
    expect(screen.getByRole("img", { name: "Tip 1 of 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalled();
    await expectNoAxeViolations(container);
    rerender(
      <CoachMark title="Vault" step={3} total={3} onNext={onNext} onDismiss={onDismiss}>
        Files are encrypted on your device.
      </CoachMark>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe("Toast", () => {
  it("provider shows and dismisses toasts", async () => {
    function Trigger() {
      const t = useToast();
      return <Button onClick={() => t.show({ title: "Message deleted", action: { label: "Undo", onClick: () => {} } })}>Delete</Button>;
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("status")).toHaveTextContent("Message deleted");
    await expectNoAxeViolations(document.body);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Message deleted")).not.toBeInTheDocument();
  });
  it("danger toast is an alert", () => {
    render(<Toast tone="danger" title="Couldn’t send" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t send");
  });
});

describe("Skeleton / EmptyState", () => {
  it("skeleton list is a busy status", async () => {
    const { container } = render(<ConversationListSkeleton rows={3} />);
    expect(screen.getByRole("status", { name: "Loading conversations" })).toHaveAttribute("aria-busy", "true");
    await expectNoAxeViolations(container);
  });
  it("empty state shows the ghost decoratively", async () => {
    const { container } = render(
      <EmptyState title="No chats yet" description="Start a private conversation." action={<Button variant="primary">New chat</Button>} />,
    );
    expect(screen.getByRole("heading", { name: "No chats yet" })).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    await expectNoAxeViolations(container);
  });
});

describe("Encryption / QR / Stories", () => {
  it("encryption badge states", () => {
    render(
      <div>
        <EncryptionBadge state="encrypted" />
        <EncryptionBadge state="verified" compact />
      </div>,
    );
    expect(screen.getByText("End-to-end encrypted")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toHaveClass("s-sr-only");
  });
  it("safety number renders 12 groups and toggles verified", async () => {
    const onToggle = vi.fn();
    const { container } = render(
      <SafetyNumber value={"123456789012".repeat(5)} contactName="Sarah" onToggleVerified={onToggle} />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    await userEvent.click(screen.getByRole("button", { name: "Mark as verified" }));
    expect(onToggle).toHaveBeenCalledWith(true);
    await expectNoAxeViolations(container);
  });
  it("QR card encodes the profile link only", async () => {
    const onCopy = vi.fn();
    const { container } = render(<QRProfileCard displayName="Alex Rivera" username="alex" onCopyLink={onCopy} />);
    expect(screen.getByRole("img", { name: "QR code for https://secrets.app/u/alex" })).toBeInTheDocument();
    expect(container.querySelector("path")?.getAttribute("d")?.length).toBeGreaterThan(100);
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(onCopy).toHaveBeenCalledWith("https://secrets.app/u/alex");
    await expectNoAxeViolations(container);
  });
  it("stories row", async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <StoriesRow
        onSelect={onSelect}
        items={[
          { id: "me", name: "Alex", isSelf: true },
          { id: "f", name: "Family", unseen: true },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Family, new" }));
    expect(onSelect).toHaveBeenCalledWith("f");
    await expectNoAxeViolations(container);
  });
});
