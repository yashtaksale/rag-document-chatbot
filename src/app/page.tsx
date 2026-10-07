'use client';

import { Sidebar } from '../components/sidebar/Sidebar';
import { ChatArea } from '../components/chat/ChatArea';
import { ArtifactPanel } from '../components/chat/ArtifactPanel';

export default function Home() {
  return (
    <main
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      <Sidebar />
      <ChatArea />
      <ArtifactPanel />
    </main>
  );
}
