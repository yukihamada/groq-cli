import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../session-manager';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  const testSessionsDir = path.join(os.tmpdir(), 'groq-test-sessions');

  beforeEach(async () => {
    // Clean up test directory
    await fs.remove(testSessionsDir);
    
    // Mock home directory
    process.env.HOME = os.tmpdir();
    sessionManager = new SessionManager();
  });

  afterEach(async () => {
    // Clean up
    await fs.remove(testSessionsDir);
  });

  it('should create a new session', async () => {
    const session = await sessionManager.createSession('/test/path');
    
    expect(session).toBeDefined();
    expect(session.id).toBeTruthy();
    expect(session.workingDirectory).toBe('/test/path');
    expect(session.messages).toHaveLength(0);
    expect(session.createdAt).toBeInstanceOf(Date);
    expect(session.updatedAt).toBeInstanceOf(Date);
  });

  it('should save and load a session', async () => {
    const session = await sessionManager.createSession('/test/path');
    session.messages.push({
      role: 'user',
      content: 'Test message'
    });
    
    await sessionManager.saveSession(session);
    
    const loadedSession = await sessionManager.loadSession(session.id);
    
    expect(loadedSession).toBeDefined();
    expect(loadedSession?.id).toBe(session.id);
    expect(loadedSession?.messages).toHaveLength(1);
    expect(loadedSession?.messages[0].content).toBe('Test message');
  });

  it('should list sessions', async () => {
    const session1 = await sessionManager.createSession('/test/path1');
    const session2 = await sessionManager.createSession('/test/path2');
    
    const sessions = await sessionManager.listSessions();
    
    expect(sessions).toHaveLength(2);
    expect(sessions.some(s => s.id === session1.id)).toBe(true);
    expect(sessions.some(s => s.id === session2.id)).toBe(true);
  });

  it('should get the last session', async () => {
    const session1 = await sessionManager.createSession('/test/path1');
    await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
    const session2 = await sessionManager.createSession('/test/path2');
    
    const lastSession = await sessionManager.getLastSession();
    
    expect(lastSession).toBeDefined();
    expect(lastSession?.id).toBe(session2.id);
  });

  it('should set session title', async () => {
    const session = await sessionManager.createSession('/test/path');
    const title = 'My Test Session';
    
    const result = await sessionManager.setSessionTitle(session.id, title);
    expect(result).toBe(true);
    
    const updatedSession = await sessionManager.loadSession(session.id);
    expect(updatedSession?.title).toBe(title);
  });

  it('should delete old sessions', async () => {
    const session1 = await sessionManager.createSession('/test/path1');
    const session2 = await sessionManager.createSession('/test/path2');
    
    // Manually set old date for session1
    session1.updatedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
    await sessionManager.saveSession(session1);
    
    const deletedCount = await sessionManager.deleteOldSessions(30);
    
    expect(deletedCount).toBe(1);
    
    const sessions = await sessionManager.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(session2.id);
  });
});