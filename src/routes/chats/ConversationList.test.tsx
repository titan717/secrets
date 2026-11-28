import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationList } from "./ConversationList";
import { renderAt, resetSettings, signInDemo } from "../../test/utils";
import { useChat } from "../../stores/chat";
import { resetFeatureDB } from "../../api/mock/features";

describe("Chat list (mockup p64 mobile, blueprint p29 empty state)", () => {
  beforeEach(() => {
    resetFeatureDB();
    signInDemo();
    resetSettings();
  });

  it("shows the empty state with Add friends and Share profile", () => {
    useChat.setState({ conversations: {}, convLoaded: true, convError: null } as any);
    renderAt(<ConversationList />);
    expect(screen.getByText("Your chats start here")).toBeInTheDocument();
    expect(screen.getByText("New messages will appear here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add friends/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Share profile/ })).toHaveAttribute("href", "/share");
  });

  it("has a Stories row with Your Story and More", async () => {
    useChat.setState({ conversations: {}, convLoaded: true, convError: null } as any);
    renderAt(<ConversationList />);
    expect(screen.getByRole("heading", { name: "Stories" })).toBeInTheDocument();
    expect(await screen.findByText("Your Story")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
  });

  it("hides the stories row when stories are turned off", () => {
    resetSettings({ storiesEnabled: false });
    useChat.setState({ conversations: {}, convLoaded: true, convError: null } as any);
    renderAt(<ConversationList />);
    expect(screen.queryByText("Your Story")).toBeNull();
  });

  it("filters chats from the search field", async () => {
    await useChat.getState().loadConversations();
    renderAt(<ConversationList />);
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(screen.getByRole("textbox", { name: /Search conversations/ }), "zzzz");
    expect(screen.queryAllByRole("link", { name: /Maya/ })).toHaveLength(0);
  });
});
