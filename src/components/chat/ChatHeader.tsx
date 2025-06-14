
import React from 'react';
import ChatActions from './ChatActions';

const ChatHeader = () => {
  return (
    <div className="flex items-center justify-between p-4 border-b border-white/10">
      <h1 className="text-xl font-bold text-white">Secure Chats</h1>
      <ChatActions />
    </div>
  );
};

export default ChatHeader;
