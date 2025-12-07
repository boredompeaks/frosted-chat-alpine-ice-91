import React from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import ChatList from "@/components/chat/ChatList";
import { useIsMobile } from "@/hooks/use-mobile";
import { useParams } from "react-router-dom";
import { GlassContainer } from "@/components/ui/glassmorphism";

const ChatLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isMobile = useIsMobile();
  const { id } = useParams<{ id: string }>();

  if (isMobile) {
    return (
      <div className="h-screen w-screen p-4">
        {id ? <GlassContainer className="h-full w-full">{children}</GlassContainer> : <ChatList />}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen p-4">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full gap-4">
        <ResizablePanel
          defaultSize={25}
          collapsible={true}
          collapsedSize={0}
          minSize={15}
          maxSize={40}
          className="h-full"
        >
          <ChatList />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75} className="h-full">
          <GlassContainer className="h-full w-full">{children}</GlassContainer>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default ChatLayout;
